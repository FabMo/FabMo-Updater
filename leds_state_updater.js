var ledsPatterns = require("./leds_patterns.js");
var io = require("socket.io-client");
var socket = io("http://localhost:80");


var engineState = undefined;
var ledLockedByUpdater = false; // give priority to the updater for led control.


socket.on('connect', function(){
    socket.emit('status'); // initial status request
});

socket.on('status', function(status){
    console.log(status.state);
    if(status.state!==engineState){
        engineState= status.state;
        updateLedsState();
    }
});

socket.on('disconnect', function(){
    console.log("disconnected !");
});

var updateLedsState = function(){
    switch (engineState) {
        case 'idle':
            ledsPatterns.goGreen();
            break;
        case 'running':
            ledsPatterns.fadeRed(10);
            break;
        case 'manual':
            ledsPatterns.goBlue();
            break;
        case 'paused':
            ledsPatterns.goYellow();
            break;
        case 'dead':
            ledsPatterns.blinkRandomly(10);
            break;
        case 'armed':
            ledsPatterns.blinkRandomlyRed(10);
            break;
        default:
            ledsPatterns.fadeWhite(10);
            break;
    }
}

updateLedsState();
