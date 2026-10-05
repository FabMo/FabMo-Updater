/*
 * routes/network.js
 *
 * Routes related to network management.  Provides functions for
 * setting up wifi, ethernet, getting network status, etc.
 */
var log = require('../log').logger('network');
var config =  require('../config');
var util =  require('../util');
var fs = require('fs');

var ENGINE_CONFIG_PATH = '/opt/fabmo/config/engine.json';
var FABMO_DEF_PATH = '/fabmo-def/fabmo-def.json';

// Record the machine_name in fabmo-def.json so that it survives updates (the engine
// re-applies it to engine.json on startup). A blank name clears it. Other keys in the
// file are preserved. Best-effort: failures are logged and passed to the callback only.
function writeDefMachineName(name, callback) {
  fs.readFile(FABMO_DEF_PATH, 'utf8', function(err, data) {
    var def = {};
    if (!err) {
      try {
        def = JSON.parse(data);
      } catch(e) {
        log.warn('fabmo-def.json is unreadable; not recording machine_name: ' + e.message);
        return callback(e);
      }
    } else if (!name) {
      return callback(null);  // nothing there to clear
    }
    def.machine_name = name;
    var tmp = FABMO_DEF_PATH + '.updater.tmp';
    fs.writeFile(tmp, JSON.stringify(def, null, 2), function(writeErr) {
      if (writeErr) {
        log.warn('Could not write fabmo-def.json: ' + writeErr.message);
        return callback(writeErr);
      }
      fs.rename(tmp, FABMO_DEF_PATH, function(renameErr) {
        if (renameErr) { log.warn('Could not rename fabmo-def.json: ' + renameErr.message); }
        callback(renameErr);
      });
    });
  });
}

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

// Set machine_name and/or password in the engine config. Both fields are optional;
// only non-blank values are written - except that a name sent explicitly as blank ('')
// resets machine_name to the default (machine_id) and clears it from fabmo-def.json.
setNetworkIdentity = function(req, res, next) {
  var has_name = typeof req.params.name === 'string';
  var machine_name = (req.params.name || '').trim();
  var reset_name = has_name && !machine_name;
  var password = (req.params.password || '').trim();
  if (!has_name && !password) {
    return res.json({status: 'error', message: 'No name or password provided'});
  }
  fs.readFile(ENGINE_CONFIG_PATH, 'utf8', function(err, data) {
    var engineConfig = {};
    if (!err) {
      try { engineConfig = JSON.parse(data); } catch(e) {}
    }
    if (machine_name) { engineConfig.machine_name = machine_name; }
    // On a reset with no machine_id on file, the engine re-defaults the name at its next start
    if (reset_name)   { engineConfig.machine_name = engineConfig.machine_id || null; }
    if (password)     { engineConfig.password = password; }
    // The name that hostname/Avahi should now follow (blank if the name is not changing)
    var effective_name = reset_name ? (engineConfig.machine_id || '') : machine_name;
    fs.writeFile(ENGINE_CONFIG_PATH, JSON.stringify(engineConfig, null, 4), function(writeErr) {
      if (writeErr) {
        log.error('Failed to write identity: ' + writeErr.message);
        return res.json({status: 'error', message: writeErr.message});
      }
      log.info('Identity updated' + (machine_name ? '; machine_name=' + machine_name : '') + (reset_name ? '; machine_name reset to default' : ''));

      // Order matters here: fabmo-def.json is written BEFORE the engine is notified. The
      // engine writes the same value to fabmo-def.json when it handles the notification, so
      // doing these one after the other keeps the two writers from overlapping.
      var record = has_name ? writeDefMachineName : function(name, cb) { cb(null); };
      record(machine_name, function(defErr) {
        // Notify the running FabMo engine so its in-memory config and SSID update immediately.
        // This is non-fatal: if FabMo is not running or rejects the call, the file writes above
        // still took effect and will be picked up on the next FabMo restart.
        var axios = require('axios');
        var enginePort = config.updater.get('engine_server_port') || 80;
        var payload = {};
        if (has_name) payload.name = machine_name;   // '' tells the engine to reset the name
        if (password) payload.password = password;
        axios.post('http://127.0.0.1:' + enginePort + '/network/identity', payload, { timeout: 5000 })
          .then(function(resp) {
            log.info('FabMo engine notified of identity change (' + resp.status + ')');
          })
          .catch(function(e) {
            log.warn('Could not notify FabMo engine of identity change (may not be running): ' + (e.message || e));
          });

        // Also update hostname and Avahi immediately so .local resolves without waiting for ip-reporting.py
        if (effective_name) {
          var exec = require('child_process').exec;
          var hostname = effective_name.toLowerCase()
            .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'fabmo';
          exec('hostnamectl set-hostname ' + hostname, function(e) {
            if (e) log.warn('Could not set hostname: ' + e.message);
          });
          exec('sed -i "s|^host-name=.*|host-name=' + hostname + '|" /etc/avahi/avahi-daemon.conf', function(e) {
            if (e) log.warn('Could not update avahi-daemon.conf: ' + e.message);
          });
          exec('systemctl restart avahi-daemon', function(e) {
            if (e) log.warn('Could not restart avahi-daemon: ' + e.message);
          });
        }
        res.json({status: 'success'});
      });
    });
  });
}

// Retrieve machine_name, machine_id, and engine_id from the engine config
getNetworkIdentity = function(req, res, next) {
  fs.readFile(ENGINE_CONFIG_PATH, 'utf8', function(err, data) {
    if (err) {
      return res.json({status: 'error', message: err.message});
    }
    try {
      var engineConfig = JSON.parse(data);
      res.json({
        status: 'success',
        data: {
          machine_name: engineConfig.machine_name || '',
          machine_id: engineConfig.machine_id || '',
          engine_id: engineConfig.engine_id || ''
        }
      });
    } catch(e) {
      res.json({status: 'error', message: 'Could not parse engine config'});
    }
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
