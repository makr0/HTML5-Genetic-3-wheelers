// Global Vars
var ghost;
var targetFPS = 60;
var updateDom_every_n_frame = 30;
var needDom_update = updateDom_every_n_frame;
var timeStep = 1.0 / targetFPS;

var doDraw = true;
var cw_paused = false;

var box2dfps = targetFPS;
var screenfps = targetFPS/2;

var debugbox = document.getElementById("debug");

var canvas = document.getElementById("mainbox");
var ctx = canvas.getContext("2d");

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

var generationSize = 16;
var cw_carGeneration = new Array();
var cw_carScores = new Array();
var cw_topScores = new Array();
var cw_graphTop = new Array();
var cw_graphElite = new Array();
var cw_graphAverage = new Array();

var gen_champions = 1;
var breeding_option = 'random';
var cw_lambda = 0.5;
var gen_parentality = 0.2;
var gen_mutation = 0.05;
var mutation_range = 1;
var gen_counter = 0;
var nWheels = 6;
var nAttributes = 9 + 3 * nWheels; // change this when genome changes

var gravity = new b2Vec2(0.0, -9.81);
// calculate only moving bodies
var doSleep = true;

var world;

var zoom = 50;

var mutable_floor = false;

var maxFloorTiles = 200;
var cw_floorTiles = new Array();
var last_drawn_tile = 0;

var groundPieceWidth = 1.5;
var groundPieceHeight = 0.15;

var chassisMaxAxis = 1.5;
var chassisMinAxis = 0.1;
var chassisMinDensity = 30;
var chassisMaxDensity = 300;

var wheelMaxRadius = 0.6;
var wheelMinRadius = 0.2;
var wheelMaxDensity = 100;
var wheelMinDensity = 40;

var velocityIndex = 0;
var deathSpeed = 0.1;
var max_car_health = box2dfps * 10;
var car_health = max_car_health;

var motorSpeed = 20;

var swapPoint1 = 0;
var swapPoint2 = 0;

var cw_ghostReplayInterval = null;

var distanceMeter = document.getElementById("distancemeter");

var leaderPosition = new Object();
leaderPosition.x = 0;
leaderPosition.y = 0;

minimapcamera.width = 12*minimapscale+"px";
minimapcamera.height = 6*minimapscale+"px";

function debug(str, clear) {
  if(clear) {
    debugbox.innerHTML = "";
  }
  debugbox.innerHTML += str+"<br />";
}

function showDistance(distance, height) {
  distanceMeter.innerHTML = distance+" meters<br />";
  distanceMeter.innerHTML += height+" meters";
}

/* ========================================================================= */
/* === Car ================================================================= */
var cw_Car = function() {
  this.__constructor.apply(this, arguments);
}

cw_Car.prototype.chassis = null;
cw_Car.prototype.wheels = new Array();

cw_Car.prototype.__constructor = function(car_def) {
  this.velocityIndex = 0;
  this.health = max_car_health;
  this.maxPosition = 0;
  this.maxPositiony = 0;
  this.minPositiony = 0;
  this.frames = 0;
  this.car_def = car_def
  this.alive = true;
  this.is_elite = car_def.is_elite;
  this.healthBar = document.getElementById("health"+car_def.index).style;
  this.healthBarText = document.getElementById("health"+car_def.index).nextSibling.nextSibling;
  this.healthBarText.innerHTML = car_def.index;
  this.minimapmarker = document.getElementById("bar"+car_def.index).style;

  if(this.is_elite) {
    this.healthBar.backgroundColor = "#44c";
    document.getElementById("bar"+car_def.index).style.borderLeft = "1px solid #44c";
    document.getElementById("bar"+car_def.index).innerHTML = car_def.index;
  } else {
    this.healthBar.backgroundColor = "#c44";
    document.getElementById("bar"+car_def.index).style.borderLeft = "1px solid #c44";
    document.getElementById("bar"+car_def.index).innerHTML = car_def.index;
  }

  this.chassis = cw_createChassis(car_def.vertex_list, car_def.chassis_density);
  this.wheels = new Array();
  var that = this;
  var joint_def = new b2RevoluteJointDef();
  var carmass = this.chassis.GetMass();
  _.map(car_def.wheels,function(wheel_def){
    var wheel = cw_createWheel(wheel_def.radius, wheel_def.density);
    that.wheels.push( wheel );
    carmass += wheel.GetMass();
  });

  _.map(car_def.wheels,function(wheel_def, wheel_index){
    var torque = carmass * -gravity.y / wheel_def.radius;
    var wheelvertex = that.chassis.vertex_list[wheel_def.vertex];
    joint_def.localAnchorA.Set(wheelvertex.x, wheelvertex.y);
    joint_def.localAnchorB.Set(0, 0);
    joint_def.maxMotorTorque = torque;
    joint_def.motorSpeed = -motorSpeed;
    joint_def.enableMotor = true;
    joint_def.bodyA = that.chassis;
    joint_def.bodyB = that.wheels[wheel_index];
    world.CreateJoint(joint_def);
  });

  this.replay = ghost_create_replay();
  ghost_add_replay_frame(this.replay, this);
}

cw_Car.prototype.getPosition = function() {
  return this.chassis.GetPosition();
}

cw_Car.prototype.kill = function() {
  var avgspeed = (this.maxPosition / this.frames) * box2dfps;
  var position = this.maxPosition;
  var score = position + avgspeed;
  ghost_compare_to_replay(this.replay, ghost, score);
  cw_carScores.push({ car_def:this.car_def, v:score, s: avgspeed, x:position, y:this.maxPositiony, y2:this.minPositiony });
  world.DestroyBody(this.chassis);
  _.map(this.wheels,_.bind(world.DestroyBody,world));
  this.alive = false;
}

cw_Car.prototype.checkDeath = function() {
  // check health
  var position = this.getPosition();
  if(position.y > this.maxPositiony) {
    this.maxPositiony = position.y;
  }
  if(position .y < this.minPositiony) {
    this.minPositiony = position.y;
  }

  if(position.x > this.maxPosition + 0.02 && position.y > -500 ) {
    this.health = max_car_health;
    this.maxPosition = position.x;
  } else {
    if(position.x > this.maxPosition) {
      this.maxPosition = position.x;
    }
    if(Math.abs(this.chassis.GetLinearVelocity().x) < 0.001) {
      this.health -= 5;
    }
    this.health--;
    if(position .y < -500) this.health = 0; // fell off the track
    if(this.health <= 0) {
      this.healthBarText.innerHTML = "&#8708;";
      this.healthBar.width = "0";
      return true;
    }
  }
}

function cw_createChassisPart(body, vertex1, vertex2, density) {
  var vertex_list = new Array();
  vertex_list.push(vertex1);
  vertex_list.push(vertex2);
  vertex_list.push(b2Vec2.Make(0,0));
  var fix_def = new b2FixtureDef();
  fix_def.shape = new b2PolygonShape();
  fix_def.density = density;
  fix_def.friction = 10;
  fix_def.restitution = 0.2;
  fix_def.filter.groupIndex = -1;
  fix_def.shape.SetAsArray(vertex_list,3);

  body.CreateFixture(fix_def);
}

function cw_createChassis(vertex_list, density) {
  var body_def = new b2BodyDef();
  body_def.type = b2Body.b2_dynamicBody;
  body_def.position.Set(0.0, 4.0);

  var body = world.CreateBody(body_def);

  cw_createChassisPart(body, vertex_list[0],vertex_list[1], density);
  cw_createChassisPart(body, vertex_list[1],vertex_list[2], density);
  cw_createChassisPart(body, vertex_list[2],vertex_list[3], density);
  cw_createChassisPart(body, vertex_list[3],vertex_list[4], density);
  cw_createChassisPart(body, vertex_list[4],vertex_list[5], density);
  cw_createChassisPart(body, vertex_list[5],vertex_list[6], density);
  cw_createChassisPart(body, vertex_list[6],vertex_list[7], density);
  cw_createChassisPart(body, vertex_list[7],vertex_list[0], density);

  body.vertex_list = vertex_list;

  return body;
}

function cw_createWheel(radius, density) {
  var body_def = new b2BodyDef();
  body_def.type = b2Body.b2_dynamicBody;
  body_def.position.Set(0, 0);

  var body = world.CreateBody(body_def);

  var fix_def = new b2FixtureDef();
  fix_def.shape = new b2CircleShape(radius);
  fix_def.density = density;
  fix_def.friction = 1;
  fix_def.restitution = 0.2;
  fix_def.filter.groupIndex = -1;

  body.CreateFixture(fix_def);
  return body;
}

function cw_createRandomCar() {
  var v2;
  var car_def = new Object();

  // make car chassis
  car_def.chassis_density = Math.random()*chassisMaxDensity+chassisMinDensity

  car_def.vertex_list = new Array();
  car_def.vertex_list.push(new b2Vec2(Math.random().toFixed(4)*chassisMaxAxis + chassisMinAxis,0));
  car_def.vertex_list.push(new b2Vec2(Math.random().toFixed(4)*chassisMaxAxis + chassisMinAxis,Math.random().toFixed(4)*chassisMaxAxis + chassisMinAxis));
  car_def.vertex_list.push(new b2Vec2(0,Math.random().toFixed(4)*chassisMaxAxis + chassisMinAxis));
  car_def.vertex_list.push(new b2Vec2(-Math.random().toFixed(4)*chassisMaxAxis - chassisMinAxis,Math.random().toFixed(4)*chassisMaxAxis + chassisMinAxis));
  car_def.vertex_list.push(new b2Vec2(-Math.random().toFixed(4)*chassisMaxAxis - chassisMinAxis,0));
  car_def.vertex_list.push(new b2Vec2(-Math.random().toFixed(4)*chassisMaxAxis - chassisMinAxis,-Math.random().toFixed(4)*chassisMaxAxis - chassisMinAxis));
  car_def.vertex_list.push(new b2Vec2(0,-Math.random().toFixed(4)*chassisMaxAxis - chassisMinAxis));
  car_def.vertex_list.push(new b2Vec2(Math.random().toFixed(4)*chassisMaxAxis + chassisMinAxis,-Math.random().toFixed(4)*chassisMaxAxis - chassisMinAxis));

  // make the wheels
  car_def.wheels = _.map( _.range(nWheels),
    function() {
      return {
        radius:  Math.random().toFixed(4) * wheelMaxRadius  + wheelMinRadius,
        density: Math.random().toFixed(4) * wheelMaxDensity + wheelMinDensity
      };
    }
  );

  // decide which wheel goes on which vertex
  // pick random vertex-indizes
  var wheel_vertices = _.sampleSize(_.range(car_def.vertex_list.length), car_def.wheels.length);
  // put each picked vertex on a wheel
  _.map( car_def.wheels, function( wheel, index ) {
    wheel.vertex = wheel_vertices[ index ];
  });

  // console.log(car_def);
  //console.log(JSON.stringify(car_def));

  return car_def;
}

/* === END Car ============================================================= */
/* ========================================================================= */


/* ========================================================================= */
/* ==== Generation ========================================================= */

function cw_generationZero() {
  for(var k = 0; k < generationSize; k++) {
    var car_def = cw_createRandomCar();
    car_def.index = k;
    cw_carGeneration.push(car_def);
  }
  gen_counter = 0;
  cw_deadCars = 0;
  leaderPosition = new Object();
  leaderPosition.x = 0;
  leaderPosition.y = 0;
  cw_materializeGeneration();
  document.getElementById("generation").innerHTML = 0;
  document.getElementById("population").innerHTML = generationSize;
  ghost = ghost_create_ghost();
}

function cw_materializeGeneration() {
  cw_carArray = new Array();
  for(var k = 0; k < generationSize; k++) {
    cw_carArray.push(new cw_Car(cw_carGeneration[k]));
  }
}

function cw_nextGeneration() {
  var newGeneration = new Array();
  var newborn;
  cw_getChampions();
  cw_topScores.push({i:gen_counter,v:cw_carScores[0].v,x:cw_carScores[0].x,y:cw_carScores[0].y,y2:cw_carScores[0].y2});
  plot_graphs();
  for(var k = 0; k < gen_champions; k++) {
    cw_carScores[k].car_def.is_elite = true;
    cw_carScores[k].car_def.index = k;
    newGeneration.push(cw_carScores[k].car_def);
  }
  for(k = gen_champions; k < generationSize; k++) {
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
    newGeneration.push(newborn);
  }
  cw_carScores = new Array();
  cw_carGeneration = newGeneration;
  gen_counter++;
  cw_materializeGeneration();
  cw_deadCars = 0;
  leaderPosition = new Object();
  leaderPosition.x = 0;
  leaderPosition.y = 0;
  document.getElementById("generation").innerHTML = gen_counter;
  document.getElementById("cars").innerHTML = "";
  document.getElementById("population").innerHTML = generationSize;
}

function cw_getChampions() {
  var ret = new Array();
  cw_carScores.sort(function(a,b) {if(a.v > b.v) {return -1} else {return 1}});
  for(var k = 0; k < generationSize; k++) {
    ret.push(cw_carScores[k].i);
  }
  return ret;
}

function cw_getParents() {
  if(breeding_option == 'random'){
    var r = Math.random();
    return Math.floor(r * generationSize) % generationSize;
  } else if(breeding_option == 'exp'){
   var r = Math.random();
   var x = Math.log(1-r)/(-1*cw_lambda);
   if (x >= generationSize - 1)
       return (generationSize -1);
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
  ctx.translate(200-(camera_x*zoom), 200+(camera_y*zoom));
  ctx.scale(zoom, -zoom);
  cw_drawFloor();
  ghost_draw_frame(ctx, ghost);
  cw_drawCars();
  ctx.restore();
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
    var cameraTargetPosition = leaderPosition;
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
  showDistance(Math.round(carPosition.x*100)/100, Math.round(carPosition.y*100)/100);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(200-(carPosition.x*zoom), 200+(carPosition.y*zoom));
  ctx.scale(zoom, -zoom);
  ghost_draw_frame(ctx, ghost);
  ghost_move_frame(ghost);
  cw_drawFloor();
  ctx.restore();
}


function cw_drawCars() {
  for(var k = (cw_carArray.length-1); k >= 0; k--) {
    myCar = cw_carArray[k];
    if(!myCar.alive) {
      continue;
    }
    myCarPos = myCar.getPosition();

    if(myCarPos.x < (camera_x - 5)) {
      // too far behind, don't draw
      continue;
    }

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1/zoom;

    _.each(myCar.wheels,function(wheel){
      for (f = wheel.GetFixtureList(); f; f = f.m_next) {
        var s = f.GetShape();
        var color = Math.round(255 - (255 * (f.m_density - wheelMinDensity)) / wheelMaxDensity).toString();
        var rgbcolor = "rgb("+color+","+color+","+color+")";
        cw_drawCircle(wheel, s.m_p, s.m_radius, wheel.m_sweep.a, rgbcolor);
      }
    });

    var densitycolor = Math.round(100 - (70 * ((myCar.car_def.chassis_density - chassisMinDensity) / chassisMaxDensity))).toString() + "%";
    if(myCar.is_elite) {
      ctx.strokeStyle = "#44c";
      //ctx.fillStyle = "#ddf";
      ctx.fillStyle = "hsl(240,50%,"+densitycolor+")";
    } else {
      ctx.strokeStyle = "#c44";
      //ctx.fillStyle = "#fdd";
      ctx.fillStyle = "hsl(0,50%,"+densitycolor+")";
    }
    ctx.beginPath();
    var b = myCar.chassis;
    for (f = b.GetFixtureList(); f; f = f.m_next) {
      var s = f.GetShape();
      cw_drawVirtualPoly(b, s.m_vertices, s.m_vertexCount);
    }
    ctx.fill();
    ctx.stroke();
  }
}

function toggleDisplay() {
  if(cw_paused) {
    return;
  }
  canvas.width = canvas.width;
  if(doDraw) {
    doDraw = false;
    cw_stopSimulation();
    cw_runningInterval = setInterval(simulationStep, 1); // simulate 1000x per second when not drawing
  } else {
    doDraw = true;
    clearInterval(cw_runningInterval);
    cw_startSimulation();
  }
}

function cw_drawVirtualPoly(body, vtx, n_vtx) {
  // set strokestyle and fillstyle before call
  // call beginPath before call

  var p0 = body.GetWorldPoint(vtx[0]);
  ctx.moveTo(p0.x, p0.y);
  for (var i = 1; i < n_vtx; i++) {
    p = body.GetWorldPoint(vtx[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.lineTo(p0.x, p0.y);
}

function cw_drawPoly(body, vtx, n_vtx) {
  // set strokestyle and fillstyle before call
  ctx.beginPath();

  var p0 = body.GetWorldPoint(vtx[0]);
  ctx.moveTo(p0.x, p0.y);
  for (var i = 1; i < n_vtx; i++) {
    p = body.GetWorldPoint(vtx[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.lineTo(p0.x, p0.y);

  ctx.fill();
  ctx.stroke();
}

function cw_drawCircle(body, center, radius, angle, color) {
  var p = body.GetWorldPoint(center);
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, 2*Math.PI, true);

  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + radius*Math.cos(angle), p.y + radius*Math.sin(angle));

  ctx.fill();
  ctx.stroke();
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
  needDom_update = needDom_update - 1;
  for(var k = 0; k < generationSize; k++) {
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
      cw_deadCars++;
      document.getElementById("population").innerHTML = + (generationSize-cw_deadCars);
      if(cw_deadCars >= generationSize) {
        cw_newRound();
      }
      if(leaderPosition.leader == k) {
        // leader is dead, find new leader
        cw_findLeader();
      }
      continue;
    }
    if(position.x > leaderPosition.x) {
      leaderPosition = position;
      leaderPosition.leader = k;
    }
  }
  if( needDom_update == 0) {
    showDistance(Math.round(leaderPosition.x*100)/100, Math.round(leaderPosition.y*100)/100);
  }
  if( needDom_update == 0) needDom_update = updateDom_every_n_frame;

}

function cw_findLeader() {
  var lead = 0;
  for(var k = 0; k < cw_carArray.length; k++) {
    if(!cw_carArray[k].alive) {
      continue;
    }
    position = cw_carArray[k].getPosition();
    if(position.x > lead) {
      leaderPosition = position;
      leaderPosition.leader = k;
    }
  }
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

function cw_kill() {
  var avgspeed = (myCar.maxPosition / myCar.frames) * box2dfps;
  var position = myCar.maxPosition;
  var score = position + avgspeed;
  document.getElementById("cars").innerHTML += Math.round(position*100)/100 + "m + " +" "+Math.round(avgspeed*100)/100+" m/s = "+ Math.round(score*100)/100 +"pts<br />";
  ghost_compare_to_replay(replay, ghost, score);
  cw_carScores.push({ i:current_car_index, v:score, s: avgspeed, x:position, y:myCar.maxPositiony, y2:myCar.minPositiony });
  current_car_index++;
  cw_killCar();
  if(current_car_index >= generationSize) {
    cw_nextGeneration();
    current_car_index = 0;
  }
  myCar = cw_createNextCar();
  last_drawn_tile = 0;
}

function cw_resetPopulation() {
  document.getElementById("generation").innerHTML = "";
  document.getElementById("cars").innerHTML = "";
  document.getElementById("topscores").innerHTML = "";
  cw_clearGraphics();
  cw_carArray = new Array();
  cw_carGeneration = new Array();
  cw_carScores = new Array();
  cw_topScores = new Array();
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
  doDraw = true;
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
  cw_paused = true;
  clearInterval(cw_runningInterval);
  clearInterval(cw_drawInterval);
  old_last_drawn_tile = last_drawn_tile;
  last_drawn_tile = 0;
  ghost_pause(ghost);
}

function cw_resumeSimulation() {
  cw_paused = false;
  ghost_resume(ghost);
  last_drawn_tile = old_last_drawn_tile;
  cw_runningInterval = setInterval(simulationStep, Math.round(1000/box2dfps));
  cw_drawInterval = setInterval(cw_drawScreen, Math.round(1000/screenfps));
}

function cw_startGhostReplay() {
  if(!doDraw) {
    toggleDisplay();
  }
  cw_pauseSimulation();
  cw_ghostReplayInterval = setInterval(cw_drawGhostReplay,Math.round(1000/screenfps));
}

function cw_stopGhostReplay() {
  clearInterval(cw_ghostReplayInterval);
  cw_ghostReplayInterval = null;
  cw_findLeader();
  camera_x = leaderPosition.x;
  camera_y = leaderPosition.y;
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

  for(var k = 0; k < generationSize; k++) {

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
