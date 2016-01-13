var log = require('../../../log').logger('network');
var doshell = require('../../../util').doshell
var parseString = require('xml2js').parseString;

var AIRPORT = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'

var wifi;
var WIFI_SCAN_INTERVAL = 5000;
var WIFI_SCAN_RETRIES = 3;

var DarwinNetworkManager = function() {
  this.networks = [];
}

DarwinNetworkManager.prototype._scan = function(callback) {
  doshell(AIRPORT + ' -s -x', function(result) {
    parseString(result, function (err, result) {
      var networks = [];
      if(result) {
        var data = result.plist.array[0].dict
        for(var i in data) {
              var ssid = data[i].string[1];
              var found = false;
              for(var j in this.networks) {
                  if(this.networks[j].ssid === ssid) {
                      found = true;
                      break;
                  }
              }
             if(!found) {
                 this.networks.push({'ssid':ssid});
             }
        } 
      }
    }.bind(this));
    callback();
  }.bind(this));
}

DarwinNetworkManager.prototype.run = function() {
  this._scan(function() {
    setTimeout(this.run.bind(this), WIFI_SCAN_INTERVAL)
  }.bind(this))
}

/*
 * PUBLIC API BELOW HERE
 */
DarwinNetworkManager.prototype.init = function() {
	this.run();
}

DarwinNetworkManager.prototype.getAvailableWifiNetworks = function(callback) {
  callback(null, this.networks);
}

DarwinNetworkManager.prototype.connectToAWifiNetwork= function(ssid,key,callback) {
  callback(new Error('Function not available on the darwin wifi manager.'));
}

DarwinNetworkManager.prototype.turnWifiOn=function(callback){
  callback(new Error('Function not available on the darwin wifi manager.'));
}

DarwinNetworkManager.prototype.turnWifiOff=function(callback){
  callback(new Error('Function not available on the darwin wifi manager.'));
}

DarwinNetworkManager.prototype.turnWifiHotspotOn=function(callback){
  callback(new Error('Function not available on the darwin wifi manager.'));
}

DarwinNetworkManager.prototype.turnWifiHotspotOff=function(callback){
  callback(new Error('Function not available on the darwin wifi manager.'));
}


exports.NetworkManager = DarwinNetworkManager;
