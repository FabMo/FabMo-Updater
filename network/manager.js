var log = require('../log').logger('manager');

var GenericNetworkManager = function() {
	this.platform = '???';
	this.os = '???';
}

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

//Ethernet section
GenericNetworkManager.prototype.turnEthernetOn=function(callback) {
  log.warn('Unimplemented: turnEthernetOn()');
  fail(this, callback);
}

GenericNetworkManager.prototype.turnEthernetOff=function(callback) {
  log.warn('Unimplemented: turnEthernetOff()');
  fail(this, callback);
}

// interface specific - static addressing
GenericNetworkManager.prototype.enableDHCP=function(interface, callback) {
  log.warn('Unimplemented: enableDHCP()');
  fail(this, callback);
}

GenericNetworkManager.prototype.disableDHCP=function(interface, callback) {
  log.warn('Unimplemented: disableDHCP()');
  fail(this, callback);
}

GenericNetworkManager.prototype.setIpAddress=function(interface, ip, callback) {
  log.warn('Unimplemented: setIpAddress()');
  fail(this, callback);
}

GenericNetworkManager.prototype.setNetmask=function(interface, netmask, callback) {
  log.warn('Unimplemented: setNetmask()');
  fail(this, callback);
}

GenericNetworkManager.prototype.setGateway=function(gateway, callback) {
  log.warn('Unimplemented: setGateway()');
  fail(this, callback);
}

exports.NetworkManager = GenericNetworkManager;
