// global vars moved to viewModel
var vm = new Vue({
  el: '#vmroot',
  data: {
    gen_counter: 0,
    deadCars: 0,
    generationSize: 10,
    zoom: 40,
    doDraw: true,
    paused: false,
    topScores: new Array(),
    top10Scores: new Array()
  },
  methods: {
    zoomIn: function() {
      this.zoom = this.zoom * 1.4;
    },
    zoomOut: function() {
      this.zoom = this.zoom / 1.4;
    }
  },
  watch: {
    doDraw: function(val) {
      if(this.paused) return;
      if(!val) {
        cameraspeed = 1;
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
    }
  }

});

// Global Vars
var ghost;
var targetFPS = 60;
var timeStep = 1.0 / targetFPS;

var box2dfps = targetFPS;
var screenfps = targetFPS/2;

var debugbox = document.getElementById("debug");

var canvas = document.getElementById("mainbox");
var ctx = canvas.getContext("2d");
var leadercanvas_el = document.getElementById("leadercanvas");
var leadercanvas  = leadercanvas_el.getContext("2d");

var cameraspeed = 0.5;
var camera_y = 0;
var camera_x = 0;
var camera_target = -1; // which car should we follow? -1 = leader
var minimapcamera = document.getElementById("minimapcamera").style;

var graphcanvas = document.getElementById("graphcanvas");
var graphctx = graphcanvas.getContext("2d");
var graphheight = 250;
var graphwidth = 400;

var minimapcanvas = document.getElementById("minimap");
var minimapctx = minimapcanvas.getContext("2d");
var minimapscale = 3;

var cw_carArray = new Array();
var cw_carScores = new Array();
var cw_graphTop = new Array();
var cw_graphElite = new Array();
var cw_graphAverage = new Array();

var gen_champions = 1;
var breeding_option = 'random';
var cw_lambda = 0.5;
var gen_parentality = 0.2;
var gen_mutation = 0.05;
var mutation_range = 1;
var nWheels = 2;
var nAttributes = 9 + 3 * nWheels; // change this when genome changes

var gravity = new b2Vec2(0.0, -9.81);
// calculate only moving bodies
var doSleep = true;

var world;

var mutable_floor = true;

var maxFloorTiles = 200;
var cw_floorTiles = new Array();
var last_drawn_tile = 0;

var groundPieceWidth = 1.5;
var groundPieceHeight = 0.15;

var chassisMaxAxis = 1.8;
var chassisMinAxis = 0.01;
var chassisMinDensity = 30;
var chassisMaxDensity = 3000;

var wheelMaxRadius = 0.8;
var wheelMinRadius = 0.2;
var wheelMaxDensity = 300;
var wheelMinDensity = 40;

var velocityIndex = 0;
var deathSpeed = 0.1;
var max_car_health = box2dfps * 10;

var motorSpeed = 30;

var swapPoint1 = 0;
var swapPoint2 = 0;

var cw_ghostReplayInterval = null;

var distanceMeter = document.getElementById("distancemeter");

var leader;

minimapcamera.width = 12*minimapscale+"px";
minimapcamera.height = 6*minimapscale+"px";



/* ========================================================================= */
/* ==== Generation ========================================================= */

function cw_generationZero() {
  var car;
  for(var k = 0; k < vm.generationSize; k++) {
    car = new Car();
    car.randomize(k);
    cw_carArray.push(car);
  }
  vm.gen_counter = 0;
  vm.deadCars = 0;
  vm.generation = 0;
  leader = cw_carArray[0];
  ghost = ghost_create_ghost();
}

function cw_nextGeneration() {
  var newGeneration = new Array();
  var newborn;
  cw_carScores = _.reverse(_.sortBy(cw_carScores, function(a){ return a.s; }));
  vm.topScores.push(_.extend({gen:vm.gen_counter}, cw_carScores[0]));
  vm.topScores = _.reverse(_.sortBy(vm.topScores, function(a){ return a.s; }));
  plot_graphs();
  for(var k = 0; k < gen_champions; k++) {
    cw_carScores[k].car_def.is_elite = true;
    cw_carScores[k].car_def.index = k;
    newGeneration.push(new Car(cw_carScores[k].car_def));
  }
  for(k = gen_champions; k < vm.generationSize; k++) {
    var parent1 = cw_getParents();
    var parent2 = parent1;
    while(parent2 == parent1) {
      parent2 = cw_getParents();
    }
    newborn = cw_makeChild(cw_carScores[parent1].car_def,
                           cw_carScores[parent2].car_def);
    newborn = cw_mutate(newborn);
    newborn.is_elite = false;
    newborn.index = k;
    newGeneration.push(new Car(newborn));
  }
  cw_carScores = new Array();
  cw_carArray = newGeneration;
  vm.gen_counter++;
  vm.deadCars = 0;
  leader = cw_carArray[0];
  vm.top10Scores = _.slice(vm.topScores,0,10);
  document.getElementById("cars").innerHTML = "";
}

function cw_getParents() {
  if(breeding_option == 'random'){
    var r = Math.random();
    return Math.floor(r * vm.generationSize) % vm.generationSize;
  } else if(breeding_option == 'exp'){
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
    var span = range * mutation_range;
    var base = old - 0.5 * span;
    if (base < min)
        base = min;
    if (base > min + (range - span))
        base = min + (range - span);
    return base + span * Math.random();
}

function cw_mutatev(car_def, n, xfact, yfact) {
    if (Math.random() >= gen_mutation)
        return;

    var v = car_def.vertex_list[n];
    var x = 0;
    var y = 0;
    if (xfact != 0)
        x = xfact * cw_mutate1(xfact * v.x, chassisMinAxis, chassisMaxAxis);
    if (yfact != 0)
        y = yfact * cw_mutate1(yfact * v.y, chassisMinAxis, chassisMaxAxis);
    car_def.vertex_list.splice(n, 1, new b2Vec2(x, y));
}


function cw_mutate(car_def) {
  var wheel_m_rate = mutation_range < gen_mutation
        ? mutation_range : gen_mutation;

  _.map(car_def.wheels,function(wheel){
    if(Math.random() < gen_mutation)
      wheel.radius = cw_mutate1( wheel.radius, wheelMinRadius, wheelMaxRadius);
    if(Math.random() < wheel_m_rate)
      wheel.vertex =  _.sample(_.range(car_def.vertex_list.length));
    if(Math.random() < gen_mutation)
      wheel.density = cw_mutate1( wheel.density, wheelMinDensity, wheelMaxDensity );
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

function cw_setMutation(mutation) {
  gen_mutation = parseFloat(mutation);
}

function cw_setMutationRange(range) {
  mutation_range = parseFloat(range);
}

function cw_setMutableFloor(choice) {
  mutable_floor = (choice==1);
}

function cw_setGravity(choice) {
  gravity = new b2Vec2(0.0, -parseFloat(choice));
}

function cw_setEliteSize(clones) {
  gen_champions = parseInt(clones, 10);
}

function cw_setBreedingOption(choice) {
  breeding_option = choice;
}

/* ==== END Genration ====================================================== */
/* ========================================================================= */

/* ========================================================================= */
/* ==== Drawing ============================================================ */

function cw_drawScreen() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  cw_setCameraPosition();
  ctx.translate(200-(camera_x*vm.zoom), 200+(camera_y*vm.zoom));
  ctx.scale(vm.zoom, -vm.zoom);

  cw_drawFloor();
  ghost_draw_frame(ctx, ghost);
  cw_drawCars();
  ctx.restore();
  drawLeader();
}

function drawLeader() {
  leadercanvas.clearRect(0,0,leadercanvas_el.width,leadercanvas_el.height);
  leadercanvas.save();
  var cam = leader.getPosition();
  leadercanvas.translate(100-(cam.x*vm.zoom), 100+(cam.y*vm.zoom));
  leadercanvas.scale(vm.zoom, -vm.zoom);
  leader.drawOnCanvas( leadercanvas );
  leadercanvas.restore();
}

function cw_minimapCamera(x, y) {
  minimapcamera.left = Math.round((2+camera_x) * minimapscale) + "px";
  minimapcamera.top = Math.round((31-camera_y) * minimapscale) + "px";
}

function cw_setCameraTarget(k) {
  camera_target = k;
}

function cw_setCameraPosition() {
  if(camera_target >= 0) {
    var cameraTargetPosition = cw_carArray[camera_target].getPosition();
  } else {
    var cameraTargetPosition = leader.getPosition();
  }
  var diff_y = camera_y - cameraTargetPosition.y;
  var diff_x = camera_x - cameraTargetPosition.x;
  camera_y -= cameraspeed * diff_y;
  camera_x -= cameraspeed * diff_x;
  cw_minimapCamera(camera_x, camera_y);
}

function cw_drawGhostReplay() {
  carPosition = ghost_get_position(ghost);
  camera_x = carPosition.x;
  camera_y = carPosition.y;
  cw_minimapCamera(camera_x, camera_y);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(200-(carPosition.x*vm.zoom), 200+(carPosition.y*vm.zoom));
  ctx.scale(vm.zoom, -vm.zoom);
  ghost_draw_frame(ctx, ghost);
  ghost_move_frame(ghost);
  cw_drawFloor();
  ctx.restore();
}


function cw_drawCars() {
  _(cw_carArray)
   .filter(function(car) {return car.alive;})
   .map(function(car) { car.drawOnCanvas( ctx ) } )
   .commit();
}


function cw_drawVirtualPoly(body, vtx, n_vtx, canvas) {
  // set strokestyle and fillstyle before call
  // call beginPath before call

  var p0 = body.GetWorldPoint(vtx[0]);
  canvas.moveTo(p0.x, p0.y);
  for (var i = 1; i < n_vtx; i++) {
    p = body.GetWorldPoint(vtx[i]);
    canvas.lineTo(p.x, p.y);
  }
  canvas.lineTo(p0.x, p0.y);
}

function cw_drawPoly(body, vtx, n_vtx, canvas) {
  // set strokestyle and fillstyle before call
  canvas.beginPath();

  var p0 = body.GetWorldPoint(vtx[0]);
  canvas.moveTo(p0.x, p0.y);
  for (var i = 1; i < n_vtx; i++) {
    p = body.GetWorldPoint(vtx[i]);
    canvas.lineTo(p.x, p.y);
  }
  canvas.lineTo(p0.x, p0.y);

  canvas.fill();
  canvas.stroke();
}

function cw_drawCircle(body, center, radius, angle, color, canvas) {
  var p = body.GetWorldPoint(center);
  canvas.fillStyle = color;

  canvas.beginPath();
  canvas.arc(p.x, p.y, radius, 0, 2*Math.PI, true);

//  canvas.moveTo(p.x, p.y);
//  canvas.lineTo(p.x + radius*Math.cos(angle), p.y + radius*Math.sin(angle));

  canvas.fill();
  canvas.stroke();
}

function cw_drawMiniMap() {
  var last_tile = null;
  var tile_position = new b2Vec2(-5,0);
  minimapcanvas.width = minimapcanvas.width;
  minimapctx.strokeStyle = "#000";
  minimapctx.beginPath();
  minimapctx.moveTo(0,35 * minimapscale);
  for(var k = 0; k < cw_floorTiles.length; k++) {
    last_tile = cw_floorTiles[k];
    last_fixture = last_tile.GetFixtureList();
    last_world_coords = last_tile.GetWorldPoint(last_fixture.GetShape().m_vertices[3]);
    tile_position = last_world_coords;
    minimapctx.lineTo((tile_position.x + 5) * minimapscale, (-tile_position.y + 35) * minimapscale);
  }
  minimapctx.stroke();
}

/* ==== END Drawing ======================================================== */
/* ========================================================================= */


function simulationStep() {
  world.Step(1/box2dfps, 20, 20);
  ghost_move_frame(ghost);
  for(var k = 0; k < vm.generationSize; k++) {
    if(!cw_carArray[k].alive) {
      continue;
    }
    ghost_add_replay_frame(cw_carArray[k].replay, cw_carArray[k]);
    cw_carArray[k].frames++;
    position = cw_carArray[k].getPosition();
    cw_carArray[k].minimapmarker.left = Math.round((position.x+5) * minimapscale) + "px";
    cw_carArray[k].healthBar.width = Math.round((cw_carArray[k].health/max_car_health)*100) + "%";
    if(cw_carArray[k].checkDeath()) {
      cw_carArray[k].kill();
      vm.deadCars++;
      if(vm.deadCars >= vm.generationSize) {
        cw_newRound();
      }
      if(leader == cw_carArray[k] ) {
        console.log('leader was killed');
        // leader is dead, find new leader
        leader = cw_findLeader();
      }
      continue;
    }
    // current car is faster than leader, make it the new leader
    if(position.x > leader.getPosition().x) {
      leader = cw_carArray[k];
    }
  }
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
  if (mutable_floor) {
    // GHOST DISABLED
    ghost = null;
    floorseed = Math.seedrandom();

    world = new b2World(gravity, doSleep);
    cw_createFloor();
    cw_drawMiniMap();
  } else {
    // RE-ENABLE GHOST
    ghost_reset_ghost(ghost);

    // CHECK GRAVITY CHANGES
    if (world.GetGravity().y != gravity.y) {
      world.SetGravity(gravity);
    }
  }

  cw_nextGeneration();
  camera_x = camera_y = 0;
  cw_setCameraTarget(-1);
}

function cw_startSimulation() {
  cw_runningInterval = setInterval(simulationStep, Math.round(1000/box2dfps));
  cw_drawInterval = setInterval(cw_drawScreen, Math.round(1000/screenfps));
}

function cw_stopSimulation() {
  clearInterval(cw_runningInterval);
  clearInterval(cw_drawInterval);
}

function cw_resetPopulation() {
  document.getElementById("generation").innerHTML = "";
  document.getElementById("cars").innerHTML = "";
  cw_clearGraphics();
  cw_carArray = new Array();
  cw_carScores = new Array();
  vm.topScores = new Array();
  cw_graphTop = new Array();
  cw_graphElite = new Array();
  cw_graphAverage = new Array();
  lastmax = 0;
  lastaverage = 0;
  lasteliteaverage = 0;
  swapPoint1 = 0;
  swapPoint2 = 0;
  cw_generationZero();
}

function cw_resetWorld() {
  vm.doDraw = true;
  cw_stopSimulation();
  for (b = world.m_bodyList; b; b = b.m_next) {
    world.DestroyBody(b);
  }
  floorseed = document.getElementById("newseed").value;
  Math.seedrandom(floorseed);
  cw_createFloor();
  cw_drawMiniMap();
  Math.seedrandom();
  cw_resetPopulation();
  cw_startSimulation();
}

function cw_confirmResetWorld() {
  if(confirm('Really reset world?')) {
    cw_resetWorld();
  } else {
    return false;
  }
}

// ghost replay stuff

function cw_pauseSimulation() {
  vm.paused = true;
  clearInterval(cw_runningInterval);
  clearInterval(cw_drawInterval);
  old_last_drawn_tile = last_drawn_tile;
  last_drawn_tile = 0;
  ghost_pause(ghost);
}

function cw_resumeSimulation() {
  vm.paused = false;
  ghost_resume(ghost);
  last_drawn_tile = old_last_drawn_tile;
  cw_runningInterval = setInterval(simulationStep, Math.round(1000/box2dfps));
  cw_drawInterval = setInterval(cw_drawScreen, Math.round(1000/screenfps));
}

function cw_startGhostReplay() {
  if(!vm.doDraw) {
    toggleDisplay();
  }
  cw_pauseSimulation();
  cw_ghostReplayInterval = setInterval(cw_drawGhostReplay,Math.round(1000/screenfps));
}

function cw_stopGhostReplay() {
  clearInterval(cw_ghostReplayInterval);
  cw_ghostReplayInterval = null;
  leader = cw_findLeader();
  cw_setCameraPosition();
  cw_resumeSimulation();
}

function cw_toggleGhostReplay(button) {
  if(cw_ghostReplayInterval == null) {
    cw_startGhostReplay();
    button.value = "Resume simulation";
  } else {
    cw_stopGhostReplay();
    button.value = "View top replay";
  }
}
// ghost replay stuff END

// initial stuff, only called once (hopefully)
function cw_init() {
  // clone silver dot and health bar
  var mmm  = document.getElementsByName('minimapmarker')[0];
  var hbar = document.getElementsByName('healthbar')[0];

  for(var k = 0; k < vm.generationSize; k++) {

    // minimap markers
    var newbar = mmm.cloneNode(true);
    newbar.id = "bar"+k;
    newbar.style.paddingTop = k*9+"px";
    minimapholder.appendChild(newbar);

    // health bars
    var newhealth = hbar.cloneNode(true);
    newhealth.getElementsByTagName("DIV")[0].id = "health"+k;
    newhealth.car_index = k;
    document.getElementById("health").appendChild(newhealth);
  }
  mmm.parentNode.removeChild(mmm);
  hbar.parentNode.removeChild(hbar);
  floorseed = Math.seedrandom();
  world = new b2World(gravity, doSleep);
  cw_createFloor();
  cw_drawMiniMap();
  cw_generationZero();
  cw_runningInterval = setInterval(simulationStep, Math.round(1000/box2dfps));
  cw_drawInterval    = setInterval(cw_drawScreen,  Math.round(1000/screenfps));
}

cw_init();
