var GenericNetworkManager = function() {
	this.platform = '???';
	this.os = '???';
}

GenericNetworkManager.prototype.init = function() {}

GenericNetworkManager.prototype.getAvailableWifiNetworks = function(callback) {
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.connectToAWifiNetwork= function(ssid,key,callback) {
	  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiOn=function(callback){
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiOff=function(callback){
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiHotspotOn=function(callback){
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.turnWifiHotspotOff=function(callback){
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.setName=function(name, callback){
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

GenericNetworkManager.prototype.setPassword=function(password, callback){
  callback(new Error('Function unavailable on ' + this.os + '/' + this.platform));
}

exports.NetworkManager = GenericNetworkManager;