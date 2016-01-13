var log = require('../log').logger('network');
var config =  require('../config');

scan = function(req, res, next) {
    var network = require('../updater').networkManager;
    network.getAvailableWifiNetworks(function(err, data) {
        if (err) {
            log.error(err);
            res.json({'status':'error', 'message':err.message});
        } else {
            res.json({'status':'success','data':{'wifi':data}});
        }
    });
};

connectWifi = function(req, res, next) {
    ssid = req.params.ssid
    key = req.params.key
        var network = require('../updater').networkManager;

    if(ssid) {
        network.connectToAWifiNetwork(ssid,key,function(err, data){
            if(err) {
                res.json({'status':'error', 'message' : err.message});
            } else {
                res.json({'status':'success'})
            }
        });
    } else {
        res.json({'status':'error', 'message':'No SSID provided'});
    }
}

disconnectWifi = function(req, res, next) {
    state=req.params.disconnect;
    var network = require('../updater').networkManager;
    if(state===true){
        network.disconnectFromAWifiNetwork(function(err, data){
            if(err) {
                res.json({'status':'error', 'message' : err.message});
            } else {
                res.json({'status':'success'})
            }
             res.json({'status':'success'});
        });
    }else{
       res.json({'status':'error', 'message' : 'wrong POST command sent !'}); 
    }
   
}

forgetWifi  = function(req,res,next){
    ssid = req.params.ssid
        var network = require('../updater').networkManager;

    if(ssid) {
        network.forgetAWifiNetwork(ssid,function(err,data){
            if(err) {
                res.json({'status':'error', 'message' : err.message});
            } else {
                res.json({'status':'success'});
            }
        });
    } else {
        res.json({'status':'error', 'message':'No SSID provided'});
    }
}

wifiState = function(req,res,next){
    state = req.params.enabled;

        var network = require('../updater').networkManager;

    if(state===true){
        network.turnWifiOn(function(err){
            if(err) {
                res.json({'status':'error', 'message' : err.message});
            } else {
                res.json({'status':'success'});
            }
        });
    }else if(state===false){
        network.turnWifiOff(function(err){
        if(err) {
            res.json({'status':'error', 'message' : err.message});
        } else {
            res.json({'status':'success'});
        }
    }); 
    }else{
       res.json({'status':'error', 'message' : 'wrong POST command sent !'}); 
    }
}


hotspotState = function(req,res,next){
    state = req.params.enabled;
        var network = require('../updater').networkManager;

    if(state===true || state === 'true'){
        network.turnWifiHotspotOn(function(err){
            if(err) {
                res.json({'status':'error', 'message' : err.message});
            } else {
                res.json({'status':'success'});
            }
        });
    }else if(state===false || state === 'false'){
        network.turnWifiHotspotOff(function(err){
        if(err) {
            res.json({'status':'error', 'message' : err.message});
        } else {
            res.json({'status':'success'});
        }
    }); 
    }else{
       res.json({'status':'error', 'message' : 'wrong POST command sent !'}); 
    }
}

networkGateKeeper = function(req,res,next){
    var updater = require('../updater');
        var network = require('../updater').networkManager;


    if(updater.networkManager) {
        return next();
    }
    res.json({'status' : 'error', 'message' : 'Network manager is not supported.'});
}


module.exports = function(server) {
    //server.get(/network\/.*/, networkGateKeeper);
    //server.post(/network\/.*/, networkGateKeeper);
    //server.put(/network\/.*/, networkGateKeeper);
    //server.del(/network\/.*/, networkGateKeeper);

    server.post('/network/wifi/state',wifiState); //OK
    server.post('/network/hotspot/state',hotspotState); //OK
    server.get('/network/wifi/scan',scan); //OK
    server.post('/network/wifi/connect', connectWifi) // OK
    server.post('/network/wifi/disconnect',disconnectWifi); //OK
    server.post('/network/wifi/forget',forgetWifi); //OK
};
