var leds = require('./led_controller.js').ledStrip;

var interval;

red_fading = function(leds,timer){
  clearInterval(interval);
  var i=127;
  interval = setInterval(function(){
    leds.setAll(31,i,0,0);
    i-=8;
    if(i<0)i=127;
  },timer);
}

go_green = function(leds){
  clearInterval(interval);
  leds.setAll(31,0,255,0);
}

go_red = function(leds){
  clearInterval(interval);
  leds.setAll(31,255,0,0);
}

red_random_pattern = function(leds,timer){
  clearInterval(interval);
  interval = setInterval(function(){
    leds.flush();
    led_num1 = Math.round((Math.random()*leds.led_count)%leds.led_count)-1;
    led_num2 = Math.round((Math.random()*leds.led_count)%leds.led_count)-1;
    led_num3 = Math.round((Math.random()*leds.led_count)%leds.led_count)-1;
    
    cmd = {};
    cmd[led_num1]={brightness:31,r:255,g:0,b:0};
    cmd[led_num2]={brightness:8,r:255,g:0,b:0};
    cmd[led_num3]={brightness:2,r:255,g:0,b:0};
    leds.setMany(cmd);

  },timer);

}


exports.red_fading=red_fading;
exports.red_random_pattern=red_random_pattern;
exports.go_red=go_red;
exports.go_green=go_green;
