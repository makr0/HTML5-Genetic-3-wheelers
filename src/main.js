import Vue from 'vue';
import KeenUI from 'keen-ui';
import _ from 'lodash';

import Path from './path';
import Car from './car';
import Scoreboard from './scoreboard';

Vue.use(KeenUI);

// global vars moved to viewModel
var vm = new Vue({
  el: '#vmroot',
  data: {
    cars: cw_carArray,
    camera: {
      x: 0,
      y: 0,
      speed: 0.5,
      target: -1 // which car should we follow? -1 = leader
    },
    deadCars: 0,
    doDraw: true,
    gen_champions:'1',
    gen_champions_options: _.range(1,10).map(_.toString),
    gen_counter: 0,
    generationSize: cw_generationSize,
    gravityValue: {label:'Earth', value:'9.81'},
    mutable_floor: true,
    mutationrangeValue: {label:'100%', value:'1'},
    mutationrateValue:  {label:'5%', value:'0.05'},
    paused: true,
    selectedBreedingOption: {value:'random', label:'Default Random'},
    top10Scores: new Array(),
    topScores: new Array(),
    zoom: 40,
  },
  computed: {
    breeding: function() {
      return this.selectedBreedingOption.value;
    },
    gravity: function() {
      return new b2Vec2(0.0, -parseFloat(this.gravityValue.value));
    },
    mutationrange: function() {
      return parseFloat(this.mutationrangeValue.value);
    },
    mutationrate: function()  {
      return parseFloat(this.mutationrateValue.value);
    },
    gravityOptions: function() {
      return _('Jupiter-25|Neptune-11|Saturn-10|Earth-9.81|Venus-8.9|Uranus-8.7|Mars-3.7|Mercury-3.7|Moon-1.6')
      .split('|').map((a)=>{
        var n=_(a).split('-').first(), k=_(a).split('-').last();
        return {value: k, label: n + ' ('+k+')' }
      }).value();
    },
    breedingOptions: function() {
      return [
        {value:'random', label:'Default Random'},
        {value:'exp', label:'Exponential Probability'}
      ];
    },
    mutationrateOptions: function() {
      return        _.range(0,0.06,0.01)
            .concat(_.range(0.1,0.60,0.1))
            .concat([0.75,1])
            .map(function(k){ k=Math.round(k*100); return {'value': k/100, 'label': k+'%'};} );
    },
    mutationrangeOptions: function() {
      return this. mutationrateOptions;
    }
  },
  methods: {
    setCameraTarget: function(i) {
      this.camera.target = i;
    },
    zoomIn: function() {
      this.zoom = this.zoom * 1.4;
    },
    zoomOut: function() {
      this.zoom = this.zoom / 1.4;
    },
    resetPopulation: function() {
      cw_clearGraphics();
      cw_carArray = new Array();
      scoreboard.reset();
      vm.topScores = new Array();
      swapPoint1 = 0;
      swapPoint2 = 0;
      cw_generationZero();
    }
  },
  watch: {
    doDraw: function(val) {
      if(this.paused) return;
      if(!val) {
        vm.camera.speed = 1;
        cw_stopSimulation();
        cw_runningInterval = setInterval(function(){
          var i = 0;
          for(i=0;i<1000;i++) simulationStep();
        } , 1); // simulate 100 steps a time
        cw_drawInterval = setInterval(cw_drawScreen, 2000);
      } else {
        clearInterval(cw_runningInterval);
        clearInterval(cw_drawInterval);
        cw_startSimulation();
      }
    },
    gen_champions: function(newVal){
      scoreboard.setEliteSize(parseInt(newVal));
    }
  }
});

// Global Vars
var targetFPS = 60;
var timeStep = 1.0 / targetFPS;

var box2dfps = targetFPS;
var screenfps = targetFPS/2;

var debugbox = document.getElementById("debug");

var canvas = {
  el: document.getElementById("mainbox"),
  ctx: null,
  zoom: vm.zoom
}
canvas.ctx = canvas.el.getContext("2d");

var leadercanvas = {
  el: document.getElementById("leadercanvas"),
  ctx: null,
  zoom: vm.zoom,
  rotation:0
}
leadercanvas.ctx= leadercanvas.el.getContext("2d");

var minimapcamera = document.getElementById("minimapcamera").style;

var minimapcanvas = {
  el: document.getElementById("minimap"),
  ctx: null,
  zoom: 3
}

minimapcanvas.ctx = minimapcanvas.el.getContext("2d");


var cw_lambda = 0.5;
var gen_parentality = 0.2;
var nWheels = 2;
var nAttributes = 9 + 3 * nWheels; // change this when genome changes

// calculate only moving bodies
var doSleep = true;

var world;

var maxFloorTiles = 200;
var last_drawn_tile = 0;

var cw_runningInterval;
var cw_drawInterval;
var cw_carArray = new Array();
var scoreboard = new Scoreboard();
scoreboard.setEliteSize(vm.gen_champions);

var chassisBounds = {
  maxAxis: 1.8,
  minAxis: 0.01,
  minDensity: 30,
  maxDensity: 3000
}

var wheelBounds = {
  maxRadius: 0.8,
  minRadius: 0.2,
  maxDensity: 300,
  minDensity: 40,
  num: nWheels
}

var groundPieceBounds = {
  width: 1.5,
  height: 0.15
}

var velocityIndex = 0;
var vitalBounds = {
  max_health: box2dfps * 10,
  deathSpeed: 0.1
}

var motorSpeed = 30;

var swapPoint1 = 0;
var swapPoint2 = 0;

var distanceMeter = document.getElementById("distancemeter");

var leader;
var floorseed;

var Floor;

minimapcamera.width = 12*minimapcanvas.zoom+"px";
minimapcamera.height = 6*minimapcanvas.zoom+"px";

function carFactory(car_def) {
  var car = new Car(world, chassisBounds, wheelBounds, vitalBounds, scoreboard, motorSpeed, vm.gravity);
  if(!_.isUndefined(car_def)) {
    car.init(car_def);
  }
  return car;
}

function floorFactory() {
  return new Path(world, maxFloorTiles, vm.mutable_floor, floorseed, groundPieceBounds);
}

/* ========================================================================= */
/* ==== Generation ========================================================= */

function cw_generationZero() {
  for(var k = 0; k < vm.generationSize; k++) {
    cw_carArray.push(carFactory().randomize(k));
  }
  vm.gen_counter = 0;
  vm.deadCars = 0;
  vm.generation = 0;
  leader = cw_carArray[0];
}

function cw_nextGeneration() {
  var newGeneration = new Array();
  var newborn;
  vm.topScores.push(_.extend({gen:vm.gen_counter}, scoreboard.getBest()));
  vm.topScores = _.reverse(_.sortBy(vm.topScores, function(a){ return a.s; }));
  plot_graphs(scoreboard.getAll());
  var elites = scoreboard.getElite();
  // copy elite cars
  _.map(scoreboard.getElite(), function(champion){
    newGeneration.push( carFactory(champion.car_def) );
  });
  // breed new cars with the others
  for(var k = vm.gen_champions; k < vm.generationSize; k++) {
    var parent1 = cw_getParents();
    var parent2 = parent1;
    while(parent2 == parent1) {
      parent2 = cw_getParents();
    }
    newborn = cw_makeChild(scoreboard.getNth(parent1).car_def,
                           scoreboard.getNth(parent2).car_def);
    newborn = cw_mutate(newborn);
    newborn.is_elite = false;
    newborn.index = k;
    newGeneration.push(carFactory(newborn));
  }
  scoreboard.reset();
  cw_carArray = newGeneration;
  vm.gen_counter++;
  vm.deadCars = 0;
  leader = cw_carArray[0];
  vm.top10Scores = _.slice(vm.topScores,0,10);
  document.getElementById("cars").innerHTML = "";
}

function cw_getParents() {
  if(vm.breeding == 'random'){
    var r = Math.random();
    return Math.floor(r * vm.generationSize) % vm.generationSize;
  } else if(vm.breeding == 'exp'){
   var r = Math.random();
   var x = Math.log(1-r)/(-1*cw_lambda);
   if (x >= vm.generationSize - 1)
       return (vm.generationSize -1);
   else
       return Math.floor(x);
  }
}

function cw_makeChild(car_def1, car_def2) {
  var newCarDef = new Object();
  // decide where to take properties from
  // we make up 2 points
  swapPoint1 = Math.round(Math.random()*(nAttributes-1));
  swapPoint2 = swapPoint1;
  while(swapPoint2 == swapPoint1) {
    swapPoint2 = Math.round(Math.random()*(nAttributes-1));
  }
  var parents = [car_def1, car_def2];
  var curparent = 0;

  // wheels
  newCarDef.wheels = _.map( _.range(nWheels),
    function(current_wheel) {
      var localparent = {
        'radius':  0,
        'vertex':  0,
        'density': 0
      }
      curparent = cw_chooseParent(curparent,current_wheel * 3);
      localparent.radius = curparent;
      curparent = cw_chooseParent(curparent,current_wheel * 3 + 1);
      localparent.vertex = curparent;
      curparent = cw_chooseParent(curparent,current_wheel * 3 + 2);
      localparent.density = curparent;

      return {
        radius:  parents[localparent.radius ].wheels[current_wheel].radius,
        vertex:  parents[localparent.vertex ].wheels[current_wheel].vertex,
        density: parents[localparent.density].wheels[current_wheel].density
      };
   });
  // example for 5 wheels
  // wheel 0     1     2     3       4
  // point 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14

  newCarDef.vertex_list = new Array();                          // index with 5 wheels --v
  curparent = cw_chooseParent(curparent,nAttributes - 9);                            // 15
  newCarDef.vertex_list[0] = parents[curparent].vertex_list[0];
  curparent = cw_chooseParent(curparent,nAttributes - 8);                            // 16
  newCarDef.vertex_list[1] = parents[curparent].vertex_list[1];
  curparent = cw_chooseParent(curparent,nAttributes - 7);                            // 17
  newCarDef.vertex_list[2] = parents[curparent].vertex_list[2];
  curparent = cw_chooseParent(curparent,nAttributes - 6);                            // 18
  newCarDef.vertex_list[3] = parents[curparent].vertex_list[3];
  curparent = cw_chooseParent(curparent,nAttributes - 5);                            // 19
  newCarDef.vertex_list[4] = parents[curparent].vertex_list[4];
  curparent = cw_chooseParent(curparent,nAttributes - 4);                            // 20
  newCarDef.vertex_list[5] = parents[curparent].vertex_list[5];
  curparent = cw_chooseParent(curparent,nAttributes - 3);                            // 21
  newCarDef.vertex_list[6] = parents[curparent].vertex_list[6];
  curparent = cw_chooseParent(curparent,nAttributes - 2);                            // 22
  newCarDef.vertex_list[7] = parents[curparent].vertex_list[7];
  curparent = cw_chooseParent(curparent,nAttributes - 1 );                           // 23
  newCarDef.chassis_density = parents[curparent].chassis_density;
  return newCarDef;
}


function cw_mutate1(old, min, range) {
    var span = range * vm.mutationrange;
    var base = old - 0.5 * span;
    if (base < min)
        base = min;
    if (base > min + (range - span))
        base = min + (range - span);
    return base + span * Math.random();
}

function cw_mutatev(car_def, n, xfact, yfact) {
    if (Math.random() >= vm.mutationrate)
        return;

    var v = car_def.vertex_list[n];
    var x = 0;
    var y = 0;
    if (xfact != 0)
        x = xfact * cw_mutate1(xfact * v.x, chassisBounds.minAxis, chassisBounds.maxAxis);
    if (yfact != 0)
        y = yfact * cw_mutate1(yfact * v.y, chassisBounds.minAxis, chassisBounds.maxAxis);
    car_def.vertex_list.splice(n, 1, new b2Vec2(x, y));
}


function cw_mutate(car_def) {
  var wheel_m_rate = vm.mutationrange < vm.mutationrate
        ? vm.mutationrange : vm.mutationrate;

  _.map(car_def.wheels,function(wheel){
    if(Math.random() < vm.mutationrate)
      wheel.radius = cw_mutate1( wheel.radius, wheelBounds.minRadius, wheelBounds.maxRadius);
    if(Math.random() < wheel_m_rate)
      wheel.vertex =  _.sample(_.range(car_def.vertex_list.length));
    if(Math.random() < vm.mutationrate)
      wheel.density = cw_mutate1( wheel.density, wheelBounds.minDensity, wheelBounds.maxDensity );
  });

  cw_mutatev(car_def, 0, 1, 0);
  cw_mutatev(car_def, 1, 1, 1);
  cw_mutatev(car_def, 2, 0, 1);
  cw_mutatev(car_def, 3, -1, 1);
  cw_mutatev(car_def, 4, -1, 0);
  cw_mutatev(car_def, 5, -1, -1);
  cw_mutatev(car_def, 6, 0, -1);
  cw_mutatev(car_def, 7, 1, -1);

  return car_def;
}

function cw_chooseParent(curparent, attributeIndex) {
  if((swapPoint1 == attributeIndex) || (swapPoint2 == attributeIndex)) {
    return curparent == 1 ? 0 : 1;
  } else {
    return curparent;
  }
}


/* ==== END Genration ====================================================== */
/* ========================================================================= */

/* ========================================================================= */
/* ==== Drawing ============================================================ */

function cw_drawScreen() {
  canvas.ctx.clearRect(0,0,canvas.el.width,canvas.el.height);
  canvas.ctx.save();
  cw_setCameraPosition();
  canvas.ctx.translate(200-(vm.camera.x*vm.zoom), 200+(vm.camera.y*vm.zoom));
  canvas.ctx.scale(vm.zoom, -vm.zoom);

  Floor.draw(canvas, vm.camera);
  cw_drawCars();
  canvas.ctx.restore();
  drawLeader();
}

function drawLeader() {
  var targetCar = getTargetCar();
  leadercanvas.ctx.clearRect(0,0,leadercanvas.el.width,leadercanvas.el.height);
  leadercanvas.ctx.save();
  leadercanvas.ctx.translate(leadercanvas.el.width/2, leadercanvas.el.width/2);
  leadercanvas.ctx.rotate( targetCar.getDrivingAngle() );
  leadercanvas.ctx.translate(-leadercanvas.el.width/2, -leadercanvas.el.width/2);
  var cam = targetCar.getPosition();
  leadercanvas.ctx.translate(100-(cam.x*vm.zoom), 100+(cam.y*vm.zoom));
  leadercanvas.ctx.scale(vm.zoom, -vm.zoom);
  targetCar.draw( leadercanvas );
  leadercanvas.ctx.restore();
}

function cw_minimapCamera(x, y) {
  minimapcamera.left = Math.round((2+vm.camera.x) * minimapcanvas.zoom) + "px";
  minimapcamera.top = Math.round((31-vm.camera.y) * minimapcanvas.zoom) + "px";
}

function cw_setCameraTarget(k) {
  vm.camera.target = k;
}
function getTargetCar(){
  if(vm.camera.target >= 0) {
    return cw_carArray[vm.camera.target];
  } else {
    return leader;
  }
}

function cw_setCameraPosition() {
  var cameraTargetPosition = getTargetCar().getPosition();
  var diff_y = vm.camera.y - cameraTargetPosition.y;
  var diff_x = vm.camera.x - cameraTargetPosition.x;
  vm.camera.y -= vm.camera.speed * diff_y;
  vm.camera.x -= vm.camera.speed * diff_x;
  cw_minimapCamera(vm.camera.x, vm.camera.y);
}


function cw_drawCars() {
  _.filter(cw_carArray,function(car) {return car.alive;})
   .map(function(car) { car.draw( canvas ) } );
}

function cw_drawMiniMap() {
  minimapcanvas.el.width = minimapcanvas.el.width;
  minimapcanvas.ctx.strokeStyle = "#000";
  minimapcanvas.ctx.beginPath();
  minimapcanvas.ctx.moveTo(0,35 * minimapcanvas.zoom);
  Floor.drawSimple(minimapcanvas);
  minimapcanvas.ctx.stroke();
}

/* ==== END Drawing ======================================================== */
/* ========================================================================= */


function simulationStep() {
  world.Step(1/box2dfps, /* velocityIterations */ 10, /* positionIterations */ 10);
  var viewCars = new Array();
  var justDied = false;
  for(var k = 0; k < vm.generationSize; k++) {
    viewCars.push({
      index:cw_carArray[k].car_def.index,
      health: Math.round((cw_carArray[k].health/vitalBounds.max_health)*100) + "%",
      is_elite: cw_carArray[k].is_elite
    });
    if(!cw_carArray[k].alive) {
      continue;
    } else {
      justDied = cw_carArray[k].step();
      if(justDied) {
        vm.deadCars++;
        if(leader == cw_carArray[k] ) {
          // leader just died, find new leader
          leader = cw_findLeader();
        }
        continue;
      }
    }
    cw_carArray[k].minimapmarker.left = Math.round((cw_carArray[k].getPosition().x+5) * minimapcanvas.zoom) + "px";
    // current car is faster than leader, make it the new leader
    if(cw_carArray[k].getPosition().x > leader.getPosition().x) {
      leader = cw_carArray[k];
    }
  }
  if(vm.deadCars >= vm.generationSize) {
    cw_newRound();
  }
  vm.cars = viewCars;
}

function cw_findLeader() {
  var aliveCars = _.filter(cw_carArray, function(car) {return car.alive;});

  return _(aliveCars)
   .reduce(function(max, car) {
      if( max === 0 ) return car;
      if( car.getPosition().x > max.getPosition().x )  return car;
      return max;
   },aliveCars[0]);
}

function cw_newRound() {
  if (vm.mutable_floor) {
    floorseed = Math.seedrandom();

    world = new b2World(vm.gravity, doSleep);
    Floor = floorFactory()
    cw_drawMiniMap();
  } else {
    // CHECK GRAVITY CHANGES
    if (world.GetGravity().y != vm.gravity.y) {
      world.SetGravity(vm.gravity);
    }
  }

  cw_nextGeneration();
  vm.camera.x = vm.camera.y = 0;
  cw_setCameraTarget(-1);
  leadercanvas.rotation = 0;
}

function cw_startSimulation() {
  cw_runningInterval = setInterval(simulationStep, Math.round(1000/box2dfps));
  cw_drawInterval = setInterval(cw_drawScreen, Math.round(1000/screenfps));
}

function cw_stopSimulation() {
  clearInterval(cw_runningInterval);
  clearInterval(cw_drawInterval);
}


function cw_resetWorld() {
  vm.doDraw = true;
  cw_stopSimulation();
  for (b = world.m_bodyList; b; b = b.m_next) {
    world.DestroyBody(b);
  }
  floorseed = document.getElementById("newseed").value;
  Math.seedrandom(floorseed);
  Floor = floorFactory()
  cw_drawMiniMap();
  Math.seedrandom();
  cw_resetPopulation();
  cw_startSimulation();
}

// initial stuff, only called once (hopefully)
function cw_init() {
  var mmm  = document.getElementsByName('minimapmarker')[0];

  for(var k = 0; k < vm.generationSize; k++) {

    // minimap markers
    var newbar = mmm.cloneNode(true);
    newbar.id = "bar"+k;
    newbar.style.paddingTop = k*9+"px";
    minimapholder.appendChild(newbar);
  }
  mmm.parentNode.removeChild(mmm);
  floorseed = Math.seedrandom();
  world = new b2World(vm.gravity, doSleep);
  Floor = floorFactory()
  cw_drawMiniMap();
  cw_generationZero();
  cw_runningInterval = setInterval(simulationStep, Math.round(1000/box2dfps));
  cw_drawInterval    = setInterval(cw_drawScreen,  Math.round(1000/screenfps));
  vm.paused=false;
}

cw_init();
