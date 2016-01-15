var PING_TIMEOUT = 1000;

var UpdaterAPI = function(base_url) {
	this.events = {
		'status' : [],
		'disconnect' : [],
		'connect' : [],
		'log' : []
	};
	var url = window.location.origin;
	this.base_url = url.replace(/\/$/,'');

	this.status = {};
	this._initializeWebsocket();
}

UpdaterAPI.prototype._initializeWebsocket = function() {
	localStorage.debug = false
	try {
		this.socket = io(this.base_url);
	} catch(e) {
		this.socket = null;
		console.error('connection to the engine via websocket failed : '+ e.message);		
	}

	if(this.socket) {
		this.socket.on('log', function(msg) {
			this.emit('log', msg);
		}.bind(this));

		this.socket.on('connect', function() {
			console.info("Websocket connected");
			this.emit('connect');
		}.bind(this));

		this.socket.on('disconnect', function() {
			console.info("Websocket disconnected");
			this.emit('disconnect');
		}.bind(this));

		this.socket.on('status', function(status) {
			this._setStatus(status);
			this.emit('status', status)
		}.bind(this));
	}
}

UpdaterAPI.prototype.emit = function(evt, data) {
	var handlers = this.events[evt];
	if(handlers) {
		for(var i=0; i<handlers.length; i++) {
			handlers[i](data);
		}
	}
}

UpdaterAPI.prototype.on = function(message, func) {
	if(message in this.events) {
		this.events[message].push(func);
	}
}

UpdaterAPI.prototype._setStatus = function(status) {
	this.status = status;
}

UpdaterAPI.prototype.ping = function(callback) {
	if(this.socket) {
		var start = Date.now();

		var fail = setTimeout(function() {
			callback(new Error('Timeout waiting for ping response.'), null);
		}, PING_TIMEOUT);

		this.socket.once('pong', function() {
			clearTimeout(fail);
			callback(null, Date.now()-start);
		});
		this.socket.emit('ping');
	}
}


UpdaterAPI.prototype._setStatus = function(status) {
	this.status = status;
}

// Status
UpdaterAPI.prototype.getStatus = function(callback) {
	this._get('/status', callback, callback, 'status');
}
UpdaterAPI.prototype.requestStatus = function() {
	this.socket.emit('status');
}

// Updates
UpdaterAPI.prototype.getVersions = function(callback) {
	this._get('/update/versions', callback, callback, 'versions');
}
UpdaterAPI.prototype.updateEngine = function(version, callback) {
	this._post('/update/engine', {'version' : version}, callback, callback);
}
UpdaterAPI.prototype.installEngine = function(version, callback) {
	this._post('/install/engine', {'version' : version}, callback, callback);
}


// Engine management
UpdaterAPI.prototype.startEngine = function(callback) {
	this._post('/engine/start', {}, callback, callback);
}
UpdaterAPI.prototype.stopEngine = function(callback) {
	this._post('/engine/stop', {}, callback, callback);
}
UpdaterAPI.prototype.restartEngine = function(callback) {
	this._post('/engine/restart', {}, callback, callback);
}

// System management
UpdaterAPI.prototype.shutdown = function(callback) {
	this._post('/system/shutdown', {}, callback, callback);
}
UpdaterAPI.prototype.reboot = function(callback) {
	this._post('/system/reboot', {}, callback, callback);
}

// Network management
UpdaterAPI.prototype.connectToWifi = function(ssid, key, callback) {
	var data = {'ssid' : ssid, 'key' : key};
	this._post('/network/wifi/connect', data, callback, callback);
}

UpdaterAPI.prototype.disconnectFromWifi = function(callback) {
	this._post('/network/wifi/disconnect', {}, callback, callback);
}

UpdaterAPI.prototype.enableWifi = function(callback) {
	var data = {'enabled' : true};
	this._post('/network/wifi/state', data, callback, callback);
}

UpdaterAPI.prototype.disableWifi = function(callback) {
	var data = {'enabled' : false};
	this._post('/network/wifi/state', data, callback, callback);
}

UpdaterAPI.prototype.enableHotspot = function(callback) {
	var data = {'enabled' : true};
	this._post('/network/hotspot/state', data, callback, callback);
}

UpdaterAPI.prototype.disableHotspot = function(callback) {
	var data = {'enabled' : false};
	this._post('/network/hotspot/state', data, callback, callback);
}

function makeFormData(obj, default_name, default_type) {
	if (obj instanceof jQuery){ //if it's a form
		var file = (obj.find('input:file'))[0].files[0];
		// Create a new FormData object.
		var formData = new FormData();
		formData.append('file', file, file.name);
	}
	else if (obj instanceof FormData) {
		var formData = obj;
	} 
	else {
		var content = obj.data || '';
		var description = obj.config.description || 'No Description'
		var filename = obj.config.filename;
		var name = obj.config.name || filename
		var formData = new FormData();
		var type = default_type || null;
		if(!filename) {
			throw new Error('No filename specified');
		}
		if(!type) {
			throw new Error('No MIME type specified')
		}
		var file = new Blob([content], {'type' : type});
		formData.append('file', file, filename);
		formData.append('name', name || filename);
		formData.append('description', description);
	}
	return formData;
}

UpdaterAPI.prototype._url = function(path) { return this.base_url + '/' + path.replace(/^\//,''); }

UpdaterAPI.prototype._get = function(url, errback, callback, key) {
	var url = this._url(url);
	var callback = callback || function() {}
	var errback = errback || function() {}

	$.ajax({
		url: url,
		type: "GET",
		dataType : 'json', 
		success: function(result){
			if(result.status === "success") {
				if(key) {
					callback(null, result.data[key]);					
				} else {
					callback(null, result.data);										
				}
			} else if(result.status==="fail") {
				errback(result.data);
			}	else {
				errback(result.message);
			}
		},
		error: function( data, err ){
			 errback(err);
		}
	});
}

UpdaterAPI.prototype._post = function(url, data, errback, callback, key) {
	var url = this._url(url);
	var callback = callback || function() {};
	var errback = errback || function() {};
	var processData = true;
	var contentType = true;

	if(data instanceof FormData) {
		processData = false;
		contentType = false;
	} else {
		contentType = 'application/x-www-form-urlencoded; charset=UTF-8'
		processData = true;
	}

	$.ajax({
		url: url,
		type: "POST",
		processData : processData,
		contentType : contentType,
		dataType : 'json',
		'data' : data, 
		success: function(result){
			if(data.status === "success") {
				if(key) {
					callback(null,result.data[key]);					
				} else {
					callback(null,result.data);										
				}
			} else if(data.status==="fail") {
				errback(result.data);
			}	else {
				errback(result.message);
			}
		},
		error: function( data, err ){
			 errback(err);
		}
	});
}

UpdaterAPI.prototype._del = function(url, data, errback, callback, key) {
	var url = this._url(url);
	var callback = callback || function() {};
	var errback = errback || function() {};
	$.ajax({
		url: url,
		type: "DELETE",
		dataType : 'json',
		'data' : data, 
		success: function(result){
			if(data.status === "success") {
				if(key) {
					callback(null, result.data.key);
				} else {
					callback(null,result.data);					
				}
			} else if(data.status==="fail") {
				errback(result.data);
			} else {
				errback(result.message);
			}
		},
		error: function( data, err ){
			 errback(err);
		}
	});
}
