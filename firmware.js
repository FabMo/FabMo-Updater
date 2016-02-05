var fs = require('fs');
var obj = JSON.parse(fs.readFileSync('/opt/fabmo/config/engine.json', 'utf8'));

var port = obj.control_port_osx;

var SerialPort = require("serialport").SerialPort
var serialPort = new SerialPort(port, {
  baudrate: 1200
}, false);

serialPort.open(function (error) {
  if ( error ) {
    console.log('failed to open: '+error);
  } else {
    console.log('Opened serial port');
    setTimeout(function() {
      console.log('Closing serial port');
      serialPort.close(function(err) {
        console.log('Closed.  System should now be in the bootloader');
      });
    }, 1000);
  }
});

