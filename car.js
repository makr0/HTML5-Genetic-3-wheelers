/* ========================================================================= */
/* === Car ================================================================= */
var Car = function() {
  this.__constructor.apply(this, arguments);
}

Car.prototype.chassis = null;
Car.prototype.wheels = new Array();

Car.prototype.__constructor = function(car_def) {
  if (!_.isUndefined(car_def)) this.init(car_def);
}

Car.prototype.randomize = function(index) {
  var car_def = new Object();
  car_def.index = index;

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
  this.init(car_def);
}
Car.prototype.init = function(car_def) {
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

  this.chassis = this.createChassis(car_def.vertex_list, car_def.chassis_density);
  this.wheels = new Array();
  var that = this;
  var joint_def = new b2RevoluteJointDef();
  var carmass = this.chassis.GetMass();
  _.map(car_def.wheels,_.bind(function(wheel_def){
    var wheel = this.createWheel(wheel_def.radius, wheel_def.density);
    that.wheels.push( wheel );
    carmass += wheel.GetMass();
  },this));

  _.map(car_def.wheels,_.bind(function(wheel_def, wheel_index){
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
  },this));
  this.replay = ghost_create_replay();
  ghost_add_replay_frame(this.replay, this);
}

Car.prototype.getPosition = function() {
  return this.chassis.GetPosition();
}

Car.prototype.kill = function() {
  var avgspeed = (this.maxPosition / this.frames) * box2dfps;
  var position = this.maxPosition;

  var score = {
car_def: this.car_def,
      s: position + avgspeed,
      v: avgspeed,
      x: position
  }
  ghost_compare_to_replay(this.replay, ghost, score.s);
  cw_carScores.push(score);
  world.DestroyBody(this.chassis);
  _.map(this.wheels,_.bind(world.DestroyBody,world));
  this.alive = false;
}

Car.prototype.checkDeath = function() {
  // check health
  var position = this.getPosition();
  if(position.y > this.maxPositiony) {
    this.maxPositiony = position.y;
  }
  if(position .y < this.minPositiony) {
    this.minPositiony = position.y;
  }

  if(position.x > this.maxPosition + 0.02 && position.y > -300 ) {
    this.health = max_car_health;
    this.maxPosition = position.x;
  } else {
    if(position.x > this.maxPosition) {
      this.maxPosition = position.x;
    }
    if(Math.abs(this.chassis.GetLinearVelocity().x) < deathSpeed) {
      this.health -= 5;
    }
    this.health--;
    if(position .y < -300) this.health = 0; // fell off the track
    if(this.health <= 0) {
      this.healthBarText.innerHTML = "&#8708;";
      this.healthBar.width = "0";
      return true;
    }
  }
}

Car.prototype.createChassisPart = function(body, vertex1, vertex2, density) {
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

Car.prototype.createChassis = function(vertex_list, density) {
  var body_def = new b2BodyDef();
  body_def.type = b2Body.b2_dynamicBody;
  body_def.position.Set(0.0, 4.0);

  var body = world.CreateBody(body_def);

  this.createChassisPart(body, vertex_list[0],vertex_list[1], density);
  this.createChassisPart(body, vertex_list[1],vertex_list[2], density);
  this.createChassisPart(body, vertex_list[2],vertex_list[3], density);
  this.createChassisPart(body, vertex_list[3],vertex_list[4], density);
  this.createChassisPart(body, vertex_list[4],vertex_list[5], density);
  this.createChassisPart(body, vertex_list[5],vertex_list[6], density);
  this.createChassisPart(body, vertex_list[6],vertex_list[7], density);
  this.createChassisPart(body, vertex_list[7],vertex_list[0], density);

  body.vertex_list = vertex_list;

  return body;
}

Car.prototype.createWheel = function(radius, density) {
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

Car.prototype.drawOnCanvas = function(canvas) {
    canvas.strokeStyle = "#444";
    canvas.lineWidth = 1/vm.zoom;

    _.each(this.wheels,function(wheel){
      for (f = wheel.GetFixtureList(); f; f = f.m_next) {
        var s = f.GetShape();
        var color = Math.round(255 - (255 * (f.m_density - wheelMinDensity)) / wheelMaxDensity).toString();
        var rgbcolor = "rgb("+color+","+color+","+color+")";
        cw_drawCircle(wheel, s.m_p, s.m_radius, wheel.m_sweep.a, rgbcolor, canvas);
      }
    });

    var densitycolor = Math.round(100 - (70 * ((this.car_def.chassis_density - chassisMinDensity) / chassisMaxDensity))).toString() + "%";
    if(this.is_elite) {
      canvas.strokeStyle = "#44c";
      //canvas.fillStyle = "#ddf";
      canvas.fillStyle = "hsl(240,50%,"+densitycolor+")";
    } else {
      canvas.strokeStyle = "#c44";
      //canvas.fillStyle = "#fdd";
      canvas.fillStyle = "hsl(0,50%,"+densitycolor+")";
    }
    canvas.beginPath();
    var b = this.chassis;
    for (f = b.GetFixtureList(); f; f = f.m_next) {
      var s = f.GetShape();
      cw_drawVirtualPoly(b, s.m_vertices, s.m_vertexCount, canvas);
    }
    canvas.fill();
    canvas.stroke();
}

