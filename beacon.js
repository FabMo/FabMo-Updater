var config = require('./config')
var engine = require('./engine')
var hooks = require('./hooks')
var log = require('./log').logger('beacon')

var request = require('request')
var Q = require('q');

var Beacon = function(options) {
	var options = options || {}
	this.url = options.url 
	if(!this.url) { throw new Error('Beacon needs a URL.'); }
	this.interval = options.interval || 1*60*60*1000;
	this._timer = null;
	this.running = false;
}

function setURL(url) { this.set('url', url); }
function setInterval(interval) { this.set('interval', interval); }

// Changing any of the options provokes a new beacon report
Beacon.prototype.set = function(key, value) {
	var wasRunning = this.running;
	this.stop();
	this[key] = value;
	if(wasRunning) { this.run(); }	
}

// Start reporting with the beacon
Beacon.prototype.start = function() {
	this.running = true;
	this.run();
}

// Function called at intervals to report to the beacon
Beacon.prototype.run = function() {
	this.report()
		.catch(function(err) {
			log.warn('Could not send a beacon message: ' + err);
		})
		.finally(function() {
			this._timer = setTimeout(this.run.bind(this), this.interval);
		}.bind(this));
}

// Stops further beacon reports. Reports can be restarted with start()
Beacon.prototype.stop = function() {
	this.running = false;
	if(this._timer) {
		clearTimeout(this._timer);
	}
}

Beacon.prototype.once = function() {
	var wasRunning = this.running;
	this.stop();
	this.start();
}

// Return a promise that fulfills with the beacon message to be sent
Beacon.prototype.createMessage = function() {
	var msg = {
		id : config.updater.get('id'),
		name : config.updater.get('name'),
		os : config.platform,
		platform : config.updater.get('platform'),
		os_version : config.updater.get('os_version')
	}

	deferred = Q.defer()
	try {
		engine.getVersion(function(err, version) {
			msg.engine_version = version
			require('./updater').getVersion(function(err, version) {
				msg.updater_version = version
				deferred.resolve(msg);
			})
		})		
	} catch(e) {
		deferred.reject(e)
	}
	return deferred.promise
}

// Return a promise that resolves when the beacon server has been contacted
Beacon.prototype.report = function() {
	deferred = Q.defer()
	if(this.url) {
		log.info('Sending beacon report')
		return this.createMessage()
		.then(function(message) {
			request({uri : this.url, json : true,body : message}, function(err, body) {
				if(err) {
					deferred.reject(err);
					log.warn('Could not send message to beacon server: ' + err);
				} else {
					deferred.resolve();
					log.info('Post to beacon server successful.')
				}
			});
		}.bind(this)).catch(function(err){
			log.error(err)
			deferred.reject(err);
		}.bind(this))
	} else {
		deferred.resolve();
	}

	return deferred.promise()
}

module.exports = Beacon