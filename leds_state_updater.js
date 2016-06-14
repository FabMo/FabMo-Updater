var ledsPatterns = require("./leds_patterns.js");
var io = require("socket.io-client");
var socket = io("http://localhost:80");
var config = require ("./config");

var updaterState = undefined;

var engineState = undefined;
var ledsLockedByUpdater = false; // give priority to the updater for led control.
setInterval(function(){
    try{
        network_config = config.updater.get('network');
        if(network_config.mode!==updaterState){
            updaterState = network_config.mode;
	    ledsLockedByUpdater = true;
            updateLedsState();        
        }
    }catch(ex){
        console.log(ex);
    }
},2000);

socket.on('connect', function(){
    //console.log('engine connected !');
    socket.emit('status'); // initial status request
});

socket.on('status', function(status){
    //console.log(status.state);
    if(status.state!==engineState){
        engineState= status.state;
        updateLedsState();
    }
});

socket.on('disconnect', function(){
    //console.log("disconnected !");
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
            ledsPatterns.fadeRed(30);
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
            ledsPatterns.fadeWhite(30);
            break;
    }
    }else{
	//console.log(updaterState);
        switch(updaterState){
            case 'ap':
		setTimeout(function(){ 
                    ledsLockedByUpdater = false;
                    updateLedsState();                    
                },3000);
		ledsPatterns.flashWhite(100);
                break;
            case 'station':
		setTimeout(function(){ 
                    ledsLockedByUpdater = false;
                    updateLedsState();                    
                },3000);
		ledsPatterns.waveWhite(100);
                break;
            default:
                break;  
        }
    }
}

updateLedsState();
