leds = require('./leds_controller.js').ledStrip;

var interval;

fadeRed = function(timer){
  clearInterval(interval);
  var i=127;
  interval = setInterval(function(){
    leds.setAll(31,i,0,0);
    i-=8;
    if(i<0)i=127;
  },timer);
}

goGreen = function(){
  clearInterval(interval);
  leds.setAll(31,0,255,0);
}

goRed = function(){
  clearInterval(interval);
  leds.setAll(31,255,0,0);
}

blinkRandomlyRed = function(timer){
  clearInterval(interval);
  interval = setInterval(function(){
    leds.flush();
    ledNum1 = Math.round((Math.random()*leds.ledCount)%leds.ledCount)-1;
    ledNum2 = Math.round((Math.random()*leds.ledCount)%leds.ledCount)-1;
    ledNum3 = Math.round((Math.random()*leds.ledCount)%leds.ledCount)-1;

    cmd = {};
    cmd[ledNum1]={brightness:31,r:255,g:0,b:0};
    cmd[ledNum2]={brightness:8,r:255,g:0,b:0};
    cmd[ledNum3]={brightness:2,r:255,g:0,b:0};
    leds.setMany(cmd);

  },timer);

}

goBlue = function(){
    clearInterval(interval);
    leds.setAll(31,0,0,255);
};

goYellow = function(){
    clearInterval(interval);
    leds.setAll(31,255,255,0);
};

blinkRandomly = function(timer){
    clearInterval(interval);
    interval = setInterval(function(){
      leds.flush();
      ledNum1 = Math.round((Math.random()*leds.ledCount)%leds.ledCount)-1;
      ledNum2 = Math.round((Math.random()*leds.ledCount)%leds.ledCount)-1;
      ledNum3 = Math.round((Math.random()*leds.ledCount)%leds.ledCount)-1;

      randomOctet = function(){return  Math.round((Math.random()*256)%256)-1;}

      cmd = {};
      cmd[ledNum1]={brightness:31,r:randomOctet(),g:randomOctet(),b:randomOctet()};
      cmd[ledNum2]={brightness:8,r:randomOctet(),g:randomOctet(),b:randomOctet()};
      cmd[ledNum3]={brightness:2,r:randomOctet(),g:randomOctet(),b:randomOctet()};
      leds.setMany(cmd);

    },timer);
};

fadeWhite = function(timer){
    clearInterval(interval);
    var i=127;
    interval = setInterval(function(){
      leds.setAll(31,i,i,i);
      i-=8;
      if(i<0)i=127;
    },timer);
};


exports.fadeRed = fadeRed;
exports.blinkRandomlyRed = blinkRandomlyRed ;
exports.goRed = goRed;
exports.goGreen = goGreen;

exports.goBlue = goBlue;
exports.goYellow = goYellow;
exports.blinkRandomly = blinkRandomly;
exports.fadeWhite = fadeWhite;
