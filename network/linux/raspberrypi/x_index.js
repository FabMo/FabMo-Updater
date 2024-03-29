/*
 * network/linux/edison/index.js
 *
 * Network manager for the intel edison
 */
var log = require('../../../log').logger('network');
var os = require('os');
var config = require('../../../config')
var async = require('async');
var fs = require('fs');
var doshell = require('../../../util').doshell;
var util = require('util');
var NetworkManager = require('../../manager').NetworkManager;
var events = require('events');

//in edison ver
 var ifconfig = require('wireless-tools/ifconfig');
 var iwconfig = require('wireless-tools/iwconfig');
 var iwlist = require('wireless-tools/iwlist');
 var wpa_cli = require('wireless-tools/wpa_cli');
 var udhcpc = require('wireless-tools/udhcpc');
 var udhcpd = require('wireless-tools/udhcpd');

var wifi;
var WIFI_SCAN_INTERVAL = 5000;
var WIFI_SCAN_RETRIES = 3;

//in edison ver
// var wifiInterface = 'wlan0';
// var ethernetInterface = "enp0s17u1u1";
// var apModeGateway= '192.168.42.1';
// var tmpPath = os.tmpdir() + '/';

// This function calls an external network management script called `jedison` which is a 
// fork of the management script provided by intel for the edison that accepts all of its commands
// and prints all of its outputs in JSON format.  It is located in the /scripts directory.
// TODO : Thanks to `wpa_cli` - this function (and the script it calls) might be obsolete?  Good riddance if so.
function jedison(cmdline, callback) {
    var callback = callback || function() {}
    doshell('./network/linux/raspberry-pi/jedison ' + cmdline, function(s) {
        try {
            j = JSON.parse(s)
            if(j.status == 'success') {
                callback(null, j.data || {})
            } else {
                callback(j.message)
            }
        } catch(e) {
            log.error(e)
            log.error('jedison ' + cmdline);
            callback(e);
        }
    });
}

var EdisonNetworkManager = function() {
  this.mode = 'unknown';
  this.wifiState = 'idle';
  this.ethernetState = 'idle';
  //this.state = 'idle';
  this.networks = [];
  this.command = null;
  this.network_health_retries = 5;
  this.network_history = {};
  this.networkInfo = {
    wireless: null,
    wired : null
  };
}
util.inherits(EdisonNetworkManager, NetworkManager);

// return an object containing {ipaddress:'',mode:''}
//   interface - Interface name to get the info for
//    callback - Called back with the info or error if there was an error
EdisonNetworkManager.prototype.getInfo = function(callback) {
//  jedison('get wifi-info', callback);
  ifconfig.status(interface,function(err,ifstatus){
      if(err)return callback(err);
      iwconfig.status(interface,function(err,iwstatus){
        if(err)return callback(err);
        callback(null,{ssid : (iwstatus.ssid || '<Unknown>'), ipaddress:ifstatus.ipv4_address,mode:iwstatus.mode})
      })
  })
}

EdisonNetworkManager.prototype.getNetworks = function(callback) {
  jedison('get networks', callback);
}

EdisonNetworkManager.prototype.scan = function(callback) {
  jedison('scan', callback);
}

EdisonNetworkManager.prototype.run = function() {
  if(this.command) {
  switch(this.command.cmd) {
    case 'join':
      var ssid = this.command.ssid;
      var pw = this.command.password;
      this.command = null;
      this.state = 'idle';
      this.mode = 'unknown';
      this._joinWifi(ssid,pw,function(err, data) {
        this.run();
      }.bind(this));
      break;

    case 'ap':
      this.command=null;
      this.state = 'idle'
      this.mode = 'unknown'
      this._joinAP(function(err, data) {
        this.run();
      }.bind(this));
      break;
    case 'noap':
      this.command = null;
      this.state = 'idle'
      this.mode = 'unknown'
      this._unjoinAP(function(err, data) {
        this.run();
      }.bind(this));
      break;
  }
  return;
} 
  switch(this.mode) {
    case 'ap':
      this.runAP();
      break;

    case 'station':
      this.runStation();
      break;

    default:
      this.state = 'idle';
      this.getInfo(function(err, data) {
        if(!err) {
         var old_mode = this.mode;
         log.info("Wireless mode is '" + data.mode + "'"); 
         log.debug(JSON.stringify(data)); 
         if(data.mode == 'managed') {this.mode = 'station';}
         else if(data.mode == 'master') { this.mode = 'ap';}
         else { log.warn('Unknown network mode: ' + data.mode)}
          if(this.mode != old_mode) {
            setImmediate(this.run.bind(this));
          } else {
        setTimeout(this.run.bind(this), 5000);
    }
  } else {
        setTimeout(this.run.bind(this), 5000);
}

      }.bind(this));
      break;
  }
}

EdisonNetworkManager.prototype.runStation = function() {
  switch(this.state) {
    case 'idle':
      this.scan_retries = WIFI_SCAN_RETRIES;
      // Fall through
    case 'scan':  
      this.scan(function(err, data) {
        this.state = 'done_scanning';
        setTimeout(this.run.bind(this), WIFI_SCAN_INTERVAL);        
      }.bind(this));
      break;

    case 'done_scanning':
      this.getNetworks(function(err, data) {
        if(!err) {
          var new_networks = 0;
          var new_network_names = [];
          for(var i in data) {
            var ssid = data[i].ssid;
            var found = false;
            for(var j in this.networks) {
                if(this.networks[j].ssid === ssid) {
                    found = true;
                    break;
                }
            }
            if(!found) {
              new_networks += 1;
              new_network_names.push(ssid);
              this.networks.push(data[i]);
             }
          }
          if(new_networks > 0) {
              log.info('Found ' + new_networks + ' new networks. (' + new_network_names.join(',') + ')')
          }
        } else {
          log.warn(err);
        }
        if(data.length === 0 && this.scan_retries > 0) {
          log.warn("No networks?!  Retrying...");
          this.state = 'scan'
          this.scan_retries--;
        } else {
          this.state = 'check_network';
          this.network_health_retries = 5;
        }
        setImmediate(this.run.bind(this));
      }.bind(this));
      break;

    case 'check_network':
      this.getInfo(function(err, data) {
        var networkOK = true;
        if(!err) {
          if(data.ipaddress === '?') {
            networkOK = false;
          }
          if(data.mode === 'master') {
            log.info("In master mode..."); 
            this.mode = 'ap';
            this.state = 'idle';
            this.emit('network', {'mode' : 'ap'})
            setImmediate(this.run.bind(this));
          }
        } else {
          networkOK = false;
        }
        if(networkOK) {
          this.state = 'idle';          
          this.network_history[data.ssid] = {
            ssid : data.ssid,
            ipaddress : data.ipaddress,
            last_seen : Date.now()
          }
          setImmediate(this.run.bind(this));
        } else {
          log.warn("Network health in question...");
          if(this.network_health_retries == 0) {
              log.error("Network is down.  Going to AP mode.");
              this.network_health_retries = 5;
              this.joinAP();
              setImmediate(this.run.bind(this)); 
    } else {
             this.network_health_retries--;
             setTimeout(this.run.bind(this),1000);
    }
  }
      }.bind(this));
      break;
  }
}

EdisonNetworkManager.prototype.runAP = function() {
  switch(this.state) {
    default:
      this.getInfo(function(err, data) {
        if(!err) {
          if(data.mode === 'managed') { this.mode = 'station'; }
          else if(data.mode === 'master') { this.mode = 'ap'; }
          else { log.warn('Unknown network mode: ' + data.mode)}
        }
        setTimeout(this.run.bind(this), 5000);
      }.bind(this));
      break;
  }
}


EdisonNetworkManager.prototype.joinAP = function() {
  this.command = {
    'cmd' : 'ap',
  }
}

EdisonNetworkManager.prototype._joinAP = function(callback) {
  log.info("Entering AP mode..."); 
  var network_config = config.updater.get('network');
  network_config.mode = 'ap';
  config.updater.set('network', network_config);
  jedison('join ap', function(err, result) {
    if(!err) {
      log.info("Entered AP mode.");
    }
    callback(err, result);
  });
}

EdisonNetworkManager.prototype.joinWifi = function(ssid, password) {
  this.command = {
    'cmd' : 'join',
    'ssid' : ssid,
    'password' : password
  }
}

EdisonNetworkManager.prototype._joinWifi = function(ssid, password, callback) {
  log.info("Attempting to join wifi network: " + ssid + " with password: " + password); 
  var network_config = config.updater.get('network');
  network_config.mode = 'station';
  network_config.wifi_networks = [{'ssid' : ssid, 'password' : password}];
  config.updater.set('network', network_config);
  jedison('join wifi --ssid="' + ssid + '" --password="' + password + '"', function(err, result) {
    if(err) {
        log.error(err);
    }
    doshell('route add default gw 192.168.42.1', function(s) {
        this.emit('network', {'mode' : 'station'});
        callback(err, result);
    }.bind(this));
  }.bind(this));
}

EdisonNetworkManager.prototype.unjoinAP = function() {
  this.command = {
    'cmd' : 'noap'
  }
}

EdisonNetworkManager.prototype._unjoinAP = function(callback) {
  jedison('unjoin', function(err, result) {
    if(err) {
      log.error(err);
    }
    callback(err, result);
  });
}

EdisonNetworkManager.prototype.applyNetworkConfig = function() {
  var network_config = config.updater.get('network');
  switch(network_config.mode) {
    case 'ap':
      this.unjoinAP();
      break;
    case 'station':
      if(network_config.wifi_networks.length > 0) {
        var network = network_config.wifi_networks[0];
        this.joinWifi(network.ssid, network.password);
      } else {
        log.warn("No wifi networks defined.");
      }
      break;
  }
}

/*
 * PUBLIC API BELOW HERE
 */

EdisonNetworkManager.prototype.init = function() {
  jedison("init --name='" + config.updater.get('name') + "' --password='" + config.updater.get('password') + "'", function(err, data) {
    this.applyNetworkConfig();
    this.run();
  }.bind(this));
}

EdisonNetworkManager.prototype.getAvailableWifiNetworks = function(callback) {
  callback(null, this.networks);
}

EdisonNetworkManager.prototype.connectToAWifiNetwork= function(ssid,key,callback) {
  this.joinWifi(ssid, key, callback);
}

EdisonNetworkManager.prototype.turnWifiOn=function(callback){
  callback(new Error('Not available on the edison wifi manager.'));
}

EdisonNetworkManager.prototype.turnWifiOff=function(callback){
  callback(new Error('Not available on the edison wifi manager.'));
}

EdisonNetworkManager.prototype.getWifiHistory=function(callback){
  callback(null, this.network_history);
}

EdisonNetworkManager.prototype.turnWifiHotspotOn=function(callback){
  log.info("Entering AP mode...")
  this.joinAP();
  callback(null);
}

EdisonNetworkManager.prototype.getStatus = function(callback) {
  var status = {'wifi' : {}}
}

EdisonNetworkManager.prototype.setIdentity = function(identity, callback) {
      async.series([
        function set_name(callback) {
          if(identity.name) {
            log.info("Setting network name to " + identity.name);
            jedison("set name '" + identity.name + "'", callback);
          } else {
            callback(null);
          }
        }.bind(this),

        function set_name_config(callback) {
          if(identity.name) {
            config.updater.set('name', identity.name, callback);
          } else {
            callback(null);
          }
        }.bind(this),

        function set_password(callback) {
          if(identity.password) {
            log.info("Setting network password to " + identity.password);
            jedison("set password '" + identity.password + "'", callback);
          } else {
            callback(null);
          }
        }.bind(this),

        function set_password_config(callback) {
          if(identity.password) {
            config.updater.set('password', identity.password, callback);
          } else {
            callback(null);
          }
        }.bind(this)

        ],

        function(err, results) {
            if(err) {
                log.error(err);
                typeof callback === 'function' && callback(err);
            } else {
                typeof callback === 'function' && callback(null, this);
            }
        }.bind(this)
    );
}

EdisonNetworkManager.prototype.isOnline = function(callback) {
  setImmediate(callback, null, this.mode === 'station');
}

exports.NetworkManager = EdisonNetworkManager;
