// Global Vars
var globals = {
    floorseed: null,
    ghost: null,
    targetFPS: 60,
//    timeStep: 1.0 / this.targetFPS,

//    box2dfps: targetFPS,
//    screenfps: targetFPS/2,

    debugbox: document.getElementById("debug"),

    canvas: document.getElementById("mainbox"),
//    ctx: canvas.getContext("2d"),
    leadercanvas_el: document.getElementById("leadercanvas"),
//    leadercanvas : leadercanvas_el.getContext("2d"),

    cameraspeed: 0.5,
    camera_y: 0,
    camera_x: 0,
    camera_target: -1, // which car should we follow? -1: leade,
    minimapcamera: document.getElementById("minimapcamera").style,

    graphcanvas: document.getElementById("graphcanvas"),
//    graphctx: graphcanvas.getContext("2d"),
    graphheight: 250,
    graphwidth: 400,

    minimapcanvas: document.getElementById("minimap"),
//    minimapctx: minimapcanvas.getContext("2d"),
    minimapscale: 3,

    cw_carArray: new Array(),
    cw_carScores: new Array(),
    cw_graphTop: new Array(),
    cw_graphElite: new Array(),
    cw_graphAverage: new Array(),

    gen_champions: 1,
    breeding_option: 'random',
    cw_lambda: 0.5,
    gen_parentality: 0.2,
    gen_mutation: 0.05,
    mutation_range: 1,
    nWheels: 2,
//    nAttributes: 9 + 3 * nWheels, // change this when genome change,

//    gravity: new b2Vec2(0.0, -9.81),
    // calculate only moving bodies
    doSleep: true,

    world: new b2World(9, true),

    mutable_floor: true,

    maxFloorTiles: 200,
    last_drawn_tile: 0,

    groundPieceWidth: 1.5,
    groundPieceHeight: 0.15,

    chassisMaxAxis: 1.8,
    chassisMinAxis: 0.01,
    chassisMinDensity: 30,
    chassisMaxDensity: 3000,

    wheelMaxRadius: 0.8,
    wheelMinRadius: 0.2,
    wheelMaxDensity: 300,
    wheelMinDensity: 40,

    velocityIndex: 0,
    deathSpeed: 0.1,
//    max_car_health: box2dfps * 10,

    motorSpeed: 30,

    swapPoint1: 0,
    swapPoint2: 0,

    cw_ghostReplayInterval: null,

    distanceMeter: null,

    leader: null
};
console.log( globals );
export default globals;