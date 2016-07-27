var ledsPatterns = require("./leds_patterns.js");
var io = require("socket.io-client");
var socket = io("http://localhost:80");
var config = require ("./config");

var updaterState = 'ap';

var engineState = undefined;
var ledsLockedByUpdater = false; // give priority to the updater for led control.

setTimeout(function(){
    network_config = config.updater.get('network');
    if(network_config.mode!==updaterState){
        updaterState = network_config.mode;
	ledsLockedByUpdater = true;        
    }
},1000);

socket.on('connect', function(){
    console.log('engine connected !');
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
    engineState = undefined;
    ledsPatterns.fadeWhite(2);
});

var updateLedsState = function(){
    if(!ledsLockedByUpdater){
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
    }else{
        switch(updaterState){
            case 'ap':
                break;
            case 'station':
                break;
            default:
                break;  
        }
    }
}

updateLedsState();
