var log = require('../log').logger('manager');
//var isOnline = require('is-online');

var GenericNetworkManager = function() {
	this.platform = '???';
	this.os = '???';
}

GenericNetworkManager.prototype.init = function() {}

GenericNetworkManager.prototype.getAvailableWifiNetworks = function(callback) {
  log.warn('Unimplemented: getAvailableWifiNetworks');
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.connectToAWifiNetwork= function(ssid,key,callback) {
    log.warn('Unimplemented: connectToAWifiNetwork(' + ssid + ',' + key + ')');
	  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiOn=function(callback){
  log.warn('Unimplemented: turnWifiOn');
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiOff=function(callback){
  log.warn('Unimplemented: turnWifiOff');
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiHotspotOn=function(callback){
  log.warn('Unimplemented: turnWIfiHotspotOn');
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiHotspotOff=function(callback){
  log.warn('Unimplemented: turnWIfiHotspotOff');
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.setIdentity=function(identity, callback){
  log.warn('Unimplemented: setIdentity(' + JSON.stringify(identity) + ')');
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.isOnline=function(callback) {
//  isOnline(callback);
}

GenericNetworkManager.prototype.getStatus=function(callback) {
  log.warn('Unimplemented: getStatus()');
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

exports.NetworkManager = GenericNetworkManager;
