var _=require('lodash');

class Scoreboard {

  constructor( ) {
    this.reset();
    this.eliteSize=1;
  }

  add( car ) {
    var avgspeed = (car.maxPosition / car.frames);
    var position = car.maxPosition;
    this.scores.push({
        car_def: car.car_def,
            s: position + avgspeed,
            v: avgspeed,
            x: position
        }
    );
    this.findAndMarkElite();
    this.scores = _.reverse(_.sortBy(this.scores, this._orderFunction ));
  }
  getAll() {
    return this.scores;
  }
  getBest() {
    return _.last(this.scores);
  }
  getNth(n) {
    return this.scores[n];
  }
  reset(){
    this.scores = new Array();
  }
  setEliteSize(num){
    this.eliteSize = num;
    this.findAndMarkElite();
  }
  findAndMarkElite(){
    var eliteSize = this.eliteSize;
    this.scores = _.map(this.scores,function(score, k){
        score.car_def.is_elite = k < eliteSize;
        score.car_def.index = k;
        return score;
    });
  }
  getElite() {
    return _.filter(this.scores, function(s) {return s.car_def.is_elite} );
  }

  _orderFunction(a) {
    return a.s;
  }
}

export default Scoreboard;