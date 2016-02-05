var log = require('../../../log').logger('network');
var config = require('../../../config')
var async = require('async');
var fs = require('fs');
var doshell = require('../../../util').doshell;
var util = require('util');
var NetworkManager = require('../../manager').NetworkManager;
var async = require('async');

var wifi;
var WIFI_SCAN_INTERVAL = 5000;
var WIFI_SCAN_RETRIES = 3;

function jedison(cmdline, callback) {
    var callback = callback || function() {}
    doshell('./scripts/jedison ' + cmdline, function(s) {
        try {
            j = JSON.parse(s)
            if(j.status == 'success') {
                callback(null, j.data || {})
            } else {
                callback(j.message)
            }
        } catch(e) {
            log.error('jedison ' + cmdline);
	    callback(e);
        }
    });
}

var EdisonNetworkManager = function() {
  this.mode = 'unknown';
  this.state = 'idle';
  this.networks = [];
  this.command = null;
  this.network_health_retries = 5;
}
util.inherits(EdisonNetworkManager, NetworkManager);

EdisonNetworkManager.prototype.getInfo = function(callback) {
  jedison('get wifi-info', callback);
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
          console.warn(err);
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
             setImmediate(this.run.bind(this));
          }
        } else {
          networkOK = false;
        }
        if(networkOK) {
          this.state = 'idle';          
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
  jedison('join wifi --ssid=' + ssid + ' --password=' + password , function(err, result) {
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
			this.joinAP();
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

EdisonNetworkManager.prototype.turnWifiHotspotOn=function(callback){
  log.info("Entering AP mode...")
  this.joinAP();
  callback(null);
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

exports.NetworkManager = EdisonNetworkManager;