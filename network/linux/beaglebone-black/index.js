var log = require('../../../log').logger('network');
var doshell = require('../../../util').doshell
var config = require('../../../config');

var util = require('util');
var NetworkManager = require('../../manager').NetworkManager;

var BeagleboneNetworkManager = function() {
  this.networks = [];
}
util.inherits(BeagleboneNetworkManager, NetworkManager);

BeagleboneNetworkManager.prototype.isOnline = function(callback) {
  callback(null, true);
}

BeagleboneNetworkManager.prototype.setIdentity = function(identity, callback) {
  if(identity.name) {
    config.updater.set('name', identity.name)
  }
  typeof callback === 'function' && callback(null, this);
}

exports.NetworkManager = BeagleboneNetworkManager;
