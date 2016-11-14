var log = require('../log').logger('network');
var config =  require('../config');

scan = function(req, res, next) {
    var network = require('../updater').networkManager;
    network.getAvailableWifiNetworks(function(err, data) {
        if (err) {
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
	log.warn('Not joining a network because no SSID provided.');
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

setNetworkIdentity = function(req,res,next){
    var name = req.params.name;
    var password = req.params.password;

    var network = require('../updater').networkManager;
    network.setIdentity({'name' : name, 'password' : password}, function(err, data) {
        if(err) {
            return res.json({'status':'error', 'message' : err.message});                            
        }
        res.json({'status':'success'});                    
    });
}

getNetworkIdentity = function(req, res, next) {
    res.json({
        status : 'success',
        data : {name : config.updater.get('name'), id : config.updater.get('id')}
    });
}

getWifiHistory = function(req, res, next) {
    var network = require('../updater').networkManager;
    network.getWifiHistory(function(err, data) {
        if(err) {
            return res.json({'status':'error', 'message' : err.message });
        }
        res.json({
            status : 'success',
            data : {history : data}
        });
    });
}

isOnline = function(req, res, next) {
    var network = require('../updater').networkManager;
    network.isOnline(function(err, online) {
        if(err) {
            return res.json({'status':'error', 'message' : err.message });
        }
        return res.json({'status':'success', 'data':{'online' : online}});
    });
}

getStatus = function(req, res, next) {
    var network = require('../updater').networkManager;

    network.getStatus(function(err, status) {
        if(err) {
            return res.json({'status':'error', 'message' : err.message });
        }
        return res.json({'status':'success', 'data':{'status' : status}});
    });
}

module.exports = function(server) {
    server.post('/network/wifi/state',wifiState);
    server.post('/network/hotspot/state',hotspotState);
    server.get('/network/wifi/scan',scan);
    server.post('/network/wifi/connect', connectWifi);
    server.post('/network/wifi/disconnect',disconnectWifi);
    server.post('/network/wifi/forget',forgetWifi);
    server.get('/network/wifi/history', getWifiHistory);
    server.get('/network/identity',getNetworkIdentity);
    server.post('/network/identity',setNetworkIdentity);
    server.get('/network/online', isOnline);
};
