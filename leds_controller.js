
var mraa = require("mraa")
spi = new mraa.Spi(0);
spi.mode(0);
spi.frequency(10000);


LedStrip = function(spi,ledCount){
  this.spi = spi;
  this.ledCount = ledCount;
  this.init = new Buffer(4);
  this.init[0]=0x00;
  this.init[1]=0x00;
  this.init[2]=0x00;
  this.init[3]=0x00;
  this.end = Buffer(4);
  this.end[0]=0xff;
  this.end[1]=0xff;
  this.end[2]=0xff;
  this.end[3]=0xff;

  this.buf = new Buffer(ledCount*4);//

  this.flush();
}

LedStrip.prototype.refresh = function(){
  result = Buffer.concat([this.init, this.buf, this.end]);
  resultLength = this.init.length+this.buf.length+this.end.length;
  this.spi.write(result);
}

LedStrip.prototype.flush = function(){
  this.buf.fill(0);
  for(i=0;i<4*this.ledCount;i+=4){
    this.buf[i]=0xc0; // brightness = 0
  }
  this.refresh();
}


LedStrip.prototype.setOne = function(position,brightness,r,g,b){
  if(!position&&position!==0)position=0;

  if(!brightness&&brightness!==0)brightness=31;
  else if(brightness>31)brightness=31;
  else if(brightness<0)brightness=0;

  if(!r&&r!==0)r=0;
  else if(r>255)r=255;
  else if(r<0)r=0;

  if(!g&&g!==0)g=0;
  else if(g>255)g=255;
  else if(g<0)g=0;

  if(!b&&b!==0)b=0;
  else if(b>255)b=255;
  else if(b<0)b=0;

  this.buf[position*4]=0xc0 + brightness; // brightness
  this.buf[position*4+1]=b;
  this.buf[position*4+2]=g;
  this.buf[position*4+3]=r;
  this.refresh();
}

LedStrip.prototype.setMany = function(list){
  /*
  list format :
  {
    0 : {brightness:31, r:255, g:255, b:255},
    1 : {brightness:31, r:0, g:255, b:255},
    5 : {brightness:31, r:255, g:0, b:0},
    7 : {brightness:31, r:255, g:0, b:255},
    59 : {brightness:31, r:255, g:128, b:0},
    ...
  }
  */

  for (var position in list) {
    brightness= list[position].brightness;
    r= list[position].r;
    g= list[position].g;
    b= list[position].b;
    if(!position&&position!==0)position=0;

    if(!brightness&&brightness!==0)brightness=31;
    else if(brightness>31)brightness=31;
    else if(brightness<0)brightness=0;

    if(!r&&r!==0)r=0;
    else if(r>255)r=255;
    else if(r<0)r=0;

    if(!g&&g!==0)g=0;
    else if(g>255)g=255;
    else if(g<0)g=0;

    if(!b&&b!==0)b=0;
    else if(b>255)b=255;
    else if(b<0)b=0;

    this.buf[position*4]=0xc0 + brightness; // brightness
    this.buf[position*4+1]=b;
    this.buf[position*4+2]=g;
    this.buf[position*4+3]=r;
  }
  this.refresh();

}

LedStrip.prototype.setAll = function(brightness,r,g,b){
  if(!brightness&&brightness!==0)brightness=31;
  else if(brightness>31)brightness=31;
  else if(brightness<0)brightness=0;

  if(!r&&r!==0)r=0;
  else if(r>255)r=255;
  else if(r<0)r=0;

  if(!g&&g!==0)g=0;
  else if(g>255)g=255;
  else if(g<0)g=0;

  if(!b&&b!==0)b=0;
  else if(b>255)b=255;
  else if(b<0)b=0;

  for(i=0;i<4*this.ledCount;i+=4){
    this.buf[i]=0xc0 + brightness; // brightness
    this.buf[i+1]=b;
    this.buf[i+2]=g;
    this.buf[i+3]=r;
  }
  this.refresh();
}

exports.ledStrip = new LedStrip(spi,12);
//ledStrip.setAll(31,255,0,0);
