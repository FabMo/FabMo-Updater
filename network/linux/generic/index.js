var log = require('../../../log').logger('network');
var doshell = require('../../../util').doshell
var config = require('../../../config');

var util = require('util');
var NetworkManager = require('../../manager').NetworkManager;

var LinuxGenericNetworkManager = function() {
  this.networks = [];
}
util.inherits(LinuxGenericNetworkManager, NetworkManager);

LinuxGenericNetworkManager.prototype.isOnline = function(callback) {
  callback(null, true);
}

LinuxGenericNetworkManager.prototype.setIdentity = function(identity, callback) {
  if(identity.name) {
    config.updater.set('name', identity.name)
  }
  typeof callback === 'function' && callback(null, this);
}

LinuxGenericNetworkManager.prototype.getAvailableWifiNetworks = function(callback) {
	return callback(null, [])
}

LinuxGenericNetworkManager.prototype.init = function() {
	this.emit('network', {'mode' : 'station'});
}

exports.NetworkManager = LinuxGenericNetworkManager;
