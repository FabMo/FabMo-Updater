/*
 * routes/network.js
 *
 * Routes related to network management.  Provides functions for
 * setting up wifi, ethernet, getting network status, etc.
 */
var log = require('../log').logger('network');
var config =  require('../config');
var util =  require('../util');

// Return a list of wifi networks that are currently visible.
// TODO - This is a bad route name, because retrieving it doesn't actually trigger a scan
var scan = function(req, res, next) {
////## network stuff not in updater now
  // var network = require('../updater').networkManager;
  // network.getAvailableWifiNetworks(function(err, data) {
  //   if (err) {
  //     log.error(err);
  //     res.json({'status':'error', 'message':err.message});
  //   } else {
  //     res.json({'status':'success','data':{'wifi':data}});
  //   }
  // });
};

// Connect to the wifi network specified in the request body
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
    log.error('Not joining a network because no SSID provided.');
    res.json({'status':'error', 'message':'No SSID provided'});
  }
}

// Disconnect from the current wifi network
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
    // TODO this could be more informative
    res.json({'status':'error', 'message' : 'wrong POST command sent !'});
  }

}

// Forget the wifi network with the SSID provided in the post body
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

// Enable or disable the wifi, depending on the value of the `enabled` attribute in the POST body
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
    // TODO this could be more informative
    res.json({'status':'error', 'message' : 'wrong POST command sent !'});
  }
}

// Enable or disable AP mode, depending on the value of the `enabled` attribute in the POST body
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

// Set the network ID name and password
// This is the AP SSID/Hostname
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

// Retrieve the network ID (but only return the name, not password)
// This is the AP SSID/Hostname
getNetworkIdentity = function(req, res, next) {
  res.json({
    status : 'success',
    data : {name : config.updater.get('name'), id : config.updater.get('id')}
  });
}

// Retrieve the history of joined networks
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

// Return true if this machine can see the internet, false otherwise
isOnline = function(req, res, next) {
  var network = require('../updater').networkManager;
  network.isOnline(function(err, online) {
    if(err) {
      return res.json({'status':'error', 'message' : err.message });
    }
    return res.json({'status':'success', 'data':{'online' : online}});
  });
}

// Get network status (???)
// TODO : What actually is the network status
getStatus = function(req, res, next) {
  var network = require('../updater').networkManager;

  network.getStatus(function(err, status) {
    if(err) {
      return res.json({'status':'error', 'message' : err.message });
    }
    return res.json({'status':'success', 'data':{'status' : status}});
  });
}

// Set the ethernet configuration to params provided in the POST body
setEthernetConfig = function(req,res,next){
  var network = require('../updater').networkManager;
  var netConfig = config.updater.get('network');
  var ethernetConfig = netConfig.ethernet;
  var newEthernetConfig = req.params;
  util.extend(ethernetConfig,newEthernetConfig);
  netConfig.ethernet = ethernetConfig;
  config.updater.set('network',netConfig);
  network.applyEthernetConfig();
  res.json({
    status : 'success',
    data : config.updater.get('network').ethernet
  });
}

// Retrieve the ethernet config
getEthernetConfig = function(req,res,next){
  var netConfig = config.updater.get('network');
  var ethernetConfig = netConfig.ethernet;
  res.json({
    status : 'success',
    data : ethernetConfig
  });
}

// Set the wifi configuration to params provided in the POST body
setWifiConfig = function(req,res,next){
  var network = require('../updater').networkManager;
  var netConfig = config.updater.get('network');
  var wifiConfig = netConfig.wifi;
  var newWifiConfig = req.params;
  util.extend(wifiConfig,newWifiConfig);
  netConfig.wifi = wifiConfig;
  config.updater.set('network',netConfig);
  network.applyWifiConfig();
  res.json({
    status : 'success',
    data : config.updater.get('network').wifi
  });
}

// Retrieve the ethernet config
getWifiConfig = function(req,res,next){
  var netConfig = config.updater.get('network');
  var wifiConfig = netConfig.wifi;
  res.json({
    status : 'success',
    data : wifiConfig
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
  server.post('/network/ethernet/config',setEthernetConfig);
  server.post('/network/wifi/config',setWifiConfig);
  server.get('/network/ethernet/config',getEthernetConfig);
  server.get('/network/wifi/config',getWifiConfig);
}
