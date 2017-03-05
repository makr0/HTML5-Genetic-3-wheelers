/* ========================================================================= */
/* ==== Floor ============================================================== */

class Path {

  constructor( world, maxTiles, mutable, seed, groundPieceBounds ) {
    this.world = world;
    this.maxTiles = maxTiles;
    this.mutable = mutable;
    this.seed = seed;
    this.tiles = new Array();
    this.gpB = groundPieceBounds;
    this.roughness = mutable ? 1.2 : 1.5;
    this.createPath();
  }
  createPath() {
    var last_tile = null;
    var tile_position = new b2Vec2(-5,0);
    this.tiles = new Array();
    Math.seedrandom(this.seed);
    for(var k = 0; k < this.maxTiles; k++) {
      last_tile = this.createPathTile(tile_position, (Math.random()*3 - 1.5) * this.roughness*k/this.maxTiles);

      // last_tile = this.createPathTile(tile_position, 0);
      this.tiles.push(last_tile);
      var last_fixture = last_tile.GetFixtureList();
      var last_world_coords = last_tile.GetWorldPoint(last_fixture.GetShape().m_vertices[3]);
      tile_position = last_world_coords;
    }
  }
  createPathTile(position, angle) {
    var body_def = new b2BodyDef();

    body_def.position.Set(position.x, position.y);
    var body = this.world.CreateBody(body_def);
    var fix_def = new b2FixtureDef();
    fix_def.shape = new b2PolygonShape();
    fix_def.friction = 0.5;

    var coords = new Array();
    coords.push(new b2Vec2(0,0));
    coords.push(new b2Vec2(0,-this.gpB.height));
    coords.push(new b2Vec2(this.gpB.width,-this.gpB.height));
    coords.push(new b2Vec2(this.gpB.width,0));

    var center = new b2Vec2(0,0);

    var newcoords = this.rotateTiles(coords, center, angle);

    fix_def.shape.SetAsArray(newcoords);

    body.CreateFixture(fix_def);
    return body;
  }
  rotateTiles(coords, center, angle) {
    var newcoords = new Array();
    for(var k = 0; k < coords.length; k++) {
      var nc = new Object();
      nc.x = Math.cos(angle)*(coords[k].x - center.x) - Math.sin(angle)*(coords[k].y - center.y) + center.x;
      nc.y = Math.sin(angle)*(coords[k].x - center.x) + Math.cos(angle)*(coords[k].y - center.y) + center.y;
      newcoords.push(nc);
    }
    return newcoords;
  }
  getLength() {
    return this.tiles.length;
  }
  draw(canvas, camera) {

    canvas.ctx.strokeStyle = "#000";
    canvas.ctx.fillStyle = "#666";
    canvas.ctx.lineWidth = 1/canvas.zoom;
    canvas.ctx.beginPath();
    var z = 1;
    var clip_l = camera.x - (canvas.el.width * z);
    var clip_r = camera.x + (canvas.el.width * z);
    var last_drawn_tile = 0;
    outer_loop:
    for(var k = Math.max(0,last_drawn_tile-20); k < this.tiles.length; k++) {
      var b = this.tiles[k];
      for (var f = b.GetFixtureList(); f; f = f.m_next) {
        var s = f.GetShape();
        var shapePosition = b.GetWorldPoint(s.m_vertices[0]).x;
        if((shapePosition > clip_l) && (shapePosition < clip_r)) {
          cw_drawVirtualPoly(b, s.m_vertices, s.m_vertexCount, canvas.ctx);
        }
        if(shapePosition > clip_r ) {
          last_drawn_tile = k;
          break outer_loop;
        }
      }
    }
    canvas.ctx.fill();
    canvas.ctx.stroke();
  }
  drawSimple(canvas) {
    var tile_position = new b2Vec2(-5,0);
    var last_tile = 0;
    var last_fixture = null;
    var last_world_coords = null;
    for(var k = 0; k < this.tiles.length; k++) {
      last_tile = this.tiles[k];
      last_fixture = last_tile.GetFixtureList();
      last_world_coords = last_tile.GetWorldPoint(last_fixture.GetShape().m_vertices[3]);
      tile_position = last_world_coords;
      canvas.ctx.lineTo((tile_position.x + 5) * canvas.zoom, (-tile_position.y + 35) * canvas.zoom);
    }
  }
}

export default Path;