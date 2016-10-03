var log = require('../log').logger('manager');
var util = require('util');
var events = require('events');

var GenericNetworkManager = function(platform, os) {
	this.platform = platform || '???';
	this.os = os || '???';
}
util.inherits(GenericNetworkManager, events.EventEmitter);

function fail(instance, callback) {
    callback(new Error('Function unavailable on ' + instance.os + '/' + instance.platform));
}

GenericNetworkManager.prototype.init = function() {}

GenericNetworkManager.prototype.getAvailableWifiNetworks = function(callback) {
  log.warn('Unimplemented: getAvailableWifiNetworks');
  fail(this, callback);
}

GenericNetworkManager.prototype.connectToAWifiNetwork= function(ssid,key,callback) {
  log.warn('Unimplemented: connectToAWifiNetwork(' + ssid + ',' + key + ')');
  fail(this, callback);

}

GenericNetworkManager.prototype.turnWifiOn=function(callback){
  log.warn('Unimplemented: turnWifiOn');
  fail(this, callback);
}

GenericNetworkManager.prototype.turnWifiOff=function(callback){
  log.warn('Unimplemented: turnWifiOff');
  fail(this, callback);
}

GenericNetworkManager.prototype.turnWifiHotspotOn=function(callback){
  log.warn('Unimplemented: turnWIfiHotspotOn');
  fail(this, callback);
}

GenericNetworkManager.prototype.turnWifiHotspotOff=function(callback){
  log.warn('Unimplemented: turnWIfiHotspotOff');
  fail(this, callback);
}

GenericNetworkManager.prototype.getWifiHistory=function(callback){
  log.warn('Unimplemented: getWifiHistory');
  fail(this, callback);
}

GenericNetworkManager.prototype.setIdentity=function(identity, callback){
  log.warn('Unimplemented: setIdentity(' + JSON.stringify(identity) + ')');
  fail(this, callback);
}

GenericNetworkManager.prototype.isOnline=function(callback) {
  log.warn('Unimplemented: isOnline()');
  fail(this, callback);
}

GenericNetworkManager.prototype.getStatus=function(callback) {
  log.warn('Unimplemented: getStatus()');
  fail(this, callback);
}

exports.NetworkManager = GenericNetworkManager;
