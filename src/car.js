/* ========================================================================= */
/* === Car ================================================================= */
class Car {

  constructor( world, chassisBounds, wheelBounds, vitalBounds, scoreboard, motorSpeed, gravity ) {
    this.cB = chassisBounds;
    this.wB = wheelBounds;
    this.chassis = null;
    this.wheels = new Array();
    this.world = world;
    this.max_health = vitalBounds.max_health
    this.health = this.max_health;
    this.deathSpeed = vitalBounds.deathSpeed;
    this.scoreboard = scoreboard;
    this.motorSpeed = motorSpeed;
    this.gravity = gravity;
  }

  randomize (index) {
    var car_def = new Object();
    car_def.index = index;

    // make car chassis
    car_def.chassis_density = Math.random()*this.cB.maxDensity+this.cB.minDensity

    car_def.vertex_list = new Array();
    car_def.vertex_list.push(new b2Vec2(   Math.random().toFixed(4)*this.cB.maxAxis + this.cB.minAxis,0));
    car_def.vertex_list.push(new b2Vec2(   Math.random().toFixed(4)*this.cB.maxAxis + this.cB.minAxis, Math.random().toFixed(4)*this.cB.maxAxis + this.cB.minAxis));
    car_def.vertex_list.push(new b2Vec2(0, Math.random().toFixed(4)*this.cB.maxAxis + this.cB.minAxis));
    car_def.vertex_list.push(new b2Vec2(  -Math.random().toFixed(4)*this.cB.maxAxis - this.cB.minAxis, Math.random().toFixed(4)*this.cB.maxAxis + this.cB.minAxis));
    car_def.vertex_list.push(new b2Vec2(  -Math.random().toFixed(4)*this.cB.maxAxis - this.cB.minAxis,0));
    car_def.vertex_list.push(new b2Vec2(  -Math.random().toFixed(4)*this.cB.maxAxis - this.cB.minAxis,-Math.random().toFixed(4)*this.cB.maxAxis - this.cB.minAxis));
    car_def.vertex_list.push(new b2Vec2(0,-Math.random().toFixed(4)*this.cB.maxAxis - this.cB.minAxis));
    car_def.vertex_list.push(new b2Vec2(   Math.random().toFixed(4)*this.cB.maxAxis + this.cB.minAxis,-Math.random().toFixed(4)*this.cB.maxAxis - this.cB.minAxis));

    // make the wheels
    car_def.wheels = _.map( _.range(this.wB.num),
      _.bind(function() {
        return {
          radius:  Math.random().toFixed(4) * this.wB.maxRadius  + this.wB.minRadius,
          density: Math.random().toFixed(4) * this.wB.maxDensity + this.wB.minDensity
        };
      },this)
    );

    // decide which wheel goes on which vertex
    // pick random vertex-indizes
    var wheel_vertices = _.sampleSize(_.range(car_def.vertex_list.length), car_def.wheels.length);
    // put each picked vertex on a wheel
    _.map( car_def.wheels, function( wheel, index ) {
      wheel.vertex = wheel_vertices[ index ];
    });
    this.init(car_def);
    return this;
  }

  init(car_def) {
    this.velocityIndex = 0;
    this.maxPosition = 0;
    this.maxPositiony = 0;
    this.minPositiony = 0;
    this.frames = 0;
    this.car_def = car_def
    this.alive = true;
    this.is_elite = car_def.is_elite;
    this.healthBar = {width:0};
    this.minimapmarker = document.getElementById("bar"+car_def.index).style;


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
      var torque = carmass * -this.gravity.y / wheel_def.radius;
      var wheelvertex = that.chassis.vertex_list[wheel_def.vertex];
      joint_def.localAnchorA.Set(wheelvertex.x, wheelvertex.y);
      joint_def.localAnchorB.Set(0, 0);
      joint_def.maxMotorTorque = torque;
      joint_def.motorSpeed = -this.motorSpeed;
      joint_def.enableMotor = true;
      joint_def.bodyA = that.chassis;
      joint_def.bodyB = that.wheels[wheel_index];
      this.world.CreateJoint(joint_def);
    },this));
    return this;
  }

  getPosition() {
    return this.chassis.GetPosition();
  }

  kill() {
    this.scoreboard.add(this);
    this.world.DestroyBody(this.chassis);
    _.map(this.wheels,_.bind(this.world.DestroyBody,this.world));
    this.alive = false;
  }

  checkDeath() {
    // check health
    var position = this.getPosition();
    if(position.y > this.maxPositiony) {
      this.maxPositiony = position.y;
    }
    if(position .y < this.minPositiony) {
      this.minPositiony = position.y;
    }

    if(position.x > this.maxPosition + 0.02 && position.y > -300 ) {
      this.health = this.max_health;
      this.maxPosition = position.x;
    } else {
      if(position.x > this.maxPosition) {
        this.maxPosition = position.x;
      }
      if(Math.abs(this.chassis.GetLinearVelocity().x) < this.deathSpeed) {
        this.health -= 5;
      }
      this.health--;
      if(position .y < -300) this.health = 0; // fell off the track
      if(this.health <= 0) {
        this.healthBar.width = "0";
        return true;
      }
    }
  }

  createChassisPart(body, vertex1, vertex2, density) {
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

  createChassis(vertex_list, density) {
    var body_def = new b2BodyDef();
    body_def.type = b2Body.b2_dynamicBody;
    body_def.position.Set(0.0, 4.0);

    var body = this.world.CreateBody(body_def);

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

  createWheel(radius, density) {
    var body_def = new b2BodyDef();
    body_def.type = b2Body.b2_dynamicBody;
    body_def.position.Set(0, 0);

    var body = this.world.CreateBody(body_def);

    var fix_def = new b2FixtureDef();
    fix_def.shape = new b2CircleShape(radius);
    fix_def.density = density;
    fix_def.friction = 1;
    fix_def.restitution = 0.2;
    fix_def.filter.groupIndex = -1;

    body.CreateFixture(fix_def);
    return body;
  }

  draw(canvas) {
    canvas.ctx.strokeStyle = "#444";
    canvas.ctx.lineWidth = 1/canvas.zoom;

    _.each(this.wheels,_.bind(function(wheel){
      for (f = wheel.GetFixtureList(); f; f = f.m_next) {
        var s = f.GetShape();
        var color = Math.round(255 - (255 * (f.m_density - this.wB.minDensity)) / this.wB.maxDensity).toString();
        var rgbcolor = "rgb("+color+","+color+","+color+")";
        cw_drawCircle(wheel, s.m_p, s.m_radius, wheel.m_sweep.a, rgbcolor, canvas.ctx);
      }
    },this));

    var densitycolor = Math.round(100 - (70 * ((this.car_def.chassis_density - this.cB.minDensity) / this.cB.maxDensity))).toString() + "%";
    if(this.is_elite) {
      canvas.ctx.strokeStyle = "#44c";
      //canvas.ctx.fillStyle = "#ddf";
      canvas.ctx.fillStyle = "hsl(240,50%,"+densitycolor+")";
    } else {
      canvas.ctx.strokeStyle = "#c44";
      //canvas.ctx.fillStyle = "#fdd";
      canvas.ctx.fillStyle = "hsl(0,50%,"+densitycolor+")";
    }
    canvas.ctx.beginPath();
    var b = this.chassis;
    for (var f = b.GetFixtureList(); f; f = f.m_next) {
      var s = f.GetShape();
      cw_drawVirtualPoly(b, s.m_vertices, s.m_vertexCount, canvas.ctx);
    }
    canvas.ctx.fill();
    canvas.ctx.stroke();
  }
}

