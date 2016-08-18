var PING_TIMEOUT = 1000;

var UpdaterAPI = function() {
	this.events = {
		'status' : [],
		'disconnect' : [],
		'connect' : [],
		'log' : []
	};
	var url = window.location.origin;
	var port = location.port || (location.protocol === 'https:' ? '443' : '80');
	
	this.base_url = url.replace(/\/$/,'');
	this.engine_url = location.protocol + '//' + location.hostname + ":" +  (port-1)

	this.status = {};
	this._initializeWebsocket();
}

UpdaterAPI.prototype.getEngineURL = function() {
	return this.engine_url;
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

		this.socket.on('connect_error', function() {
			console.info("Websocket disconnected");
			this.emit('disconnect');
		});

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
UpdaterAPI.prototype.getTasks = function(callback) {
	this._get('/tasks', callback, callback, 'tasks');
}

UpdaterAPI.prototype.getConfig = function(callback) {
	this._get('/config', callback, callback, 'config');
}

UpdaterAPI.prototype.getEngineInfo = function(callback) {
	this._get('/info', callback, callback, 'info', true); // Engine
}

UpdaterAPI.prototype.getEngineStatus = function(callback) {
	this._get('/status', callback, callback, 'status', true); // Engine
}

UpdaterAPI.prototype.submitFMU = function(fmu, options, callback, progress) {
	this._postUpload('/update/fmu', fmu, {}, callback, callback, null, progress);
}

// Updates
UpdaterAPI.prototype.getVersions = function(callback) {
	this._get('/update/versions', callback, callback, 'versions');
}
UpdaterAPI.prototype.updateEngine = function(version, callback) {
	this._post('/update/engine', {'version' : version}, callback, callback);
}
UpdaterAPI.prototype.updateUpdater = function(version, callback) {
	this._post('/update/updater', {'version' : version}, callback, callback);
}
UpdaterAPI.prototype.updateFirmware = function(version, callback) {
	this._post('/update/firmware', {'version' : version}, callback, callback);
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
UpdaterAPI.prototype.getWifiNetworks = function(callback) {
	this._get('/network/wifi/scan', callback, callback, 'wifi');
}
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

UpdaterAPI.prototype.setNetworkIdentity = function(id, callback) {
	this._post('/network/identity', id, callback, callback);
}

UpdaterAPI.prototype.getNetworkIdentity = function(callback) {
	this._get('/network/identity', callback, callback);
}

// Factory Reset
UpdaterAPI.prototype.factoryReset = function(callback) {
	this._post('/update/factory', {}, callback, callback);
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
UpdaterAPI.prototype._engine_url = function(path) { return this.engine_url + '/' + path.replace(/^\//,''); }

UpdaterAPI.prototype._postUpload = function(url, data, metadata, errback, callback, key, progress) {
	//var url = this._url(url);
	var callback = callback || function() {};
	var errback = errback || function() {};

	// The POST Upload is done in two pieces.  First is a metadata post which transmits
	// an array of json objects that describe the files in question.
	// Following the metadata is a multipart request for each uploaded file.
	// So for N files, you have N+1 requests, the first for the metadata, and then N remaining for the files themselves.
	if(!Array.isArray(data)) {
		data = [data];
	}
	var meta = {
		files : [],
		meta : metadata
	}

	var files = [];
	data.forEach(function(item) {
		files.push(item.file);
		delete item.file;
		meta.files.push(item);
	});

	var onMetaDataUploadComplete = function(err, k) {
		if(err) {
			return errback(err);
		}
		var requests = [];
		var countdown = files.length;
		files.forEach(function(file, index) {
			var fd = new FormData();
			fd.append('key', k);
			fd.append('index', index);
			fd.append('file', file);
			var onFileUploadComplete = function(err, data) {
				if(err) {
					// Bail out here too - fail on any one file upload failure
					requests.forEach(function(req) {
						req.abort();
					});
					return errback(err);
				}
				console.log(data);
				if(data.status === 'complete') {
					if(key) {
						callback(null, data.data[key]);						
					} else {
						callback(null, data.data);
					}
				}
			}.bind(this);
			var request = this._postup(url, fd, onFileUploadComplete, onFileUploadComplete, null, null, progress);
			requests.push(request);
		}.bind(this));
	}.bind(this);
	this._post(url, meta, onMetaDataUploadComplete, onMetaDataUploadComplete, 'key');
}


UpdaterAPI.prototype._postup = function(url, formdata, errback, callback, key, redirect, progback) {
	if(!redirect) {
		var url = this._url(url);		
	}
	var callback = callback || function() {};
	var errback = errback || function() {};

	var xhr = new XMLHttpRequest();
	xhr.open('POST', url);

	xhr.upload.addEventListener('progress', function(evt) {
		progback(evt.loaded/evt.total);
	});
    xhr.addEventListener('readystatechange', function(e) {
      if( this.readyState === 4 ) {
        // the transfer has completed and the server closed the connection.
      }
    });

	xhr.addEventListener('readystatechange', function(evt) {
		  if( xhr.readyState != 4 ) {
		  	return;
		  }
		console.log(xhr.status)
		console.log(xhr)
		console.log(evt)
		switch(xhr.status) {
			case 200:
				console.log(xhr);
				var response = JSON.parse(xhr.responseText);
				console.log(response);
				switch(response.status) {
					case 'success':
					console.log("calling BACK")
						if(key) {
							callback(null, response.data[key]);
						} else {
							callback(null, response.data);
						}
						break;

					case 'fail':
						if(key) {
							errback(response.data[key]);
						} else {
							errback(response.data);
						}
						break;
					default:
						errback(response.message);
						break;
				}
			break;

			case 300:
				// TODO infinite loop issue here?
				try {
					var response = JSON.parse(xhr.responseText);
					if(response.url) {
						this._post(response.url, formdata, errback, callback, key, true);
					} else {
						console.error("Bad redirect in FabMo API");
					}
				} catch(e) {
					console.error(e);
				}
				break;

			default:
			console.log(xhr);
				console.error("Got a bad response from server: " + xhr.status);
				break;
		}
    }.bind(this));

	xhr.send(formdata);
	return xhr;
}
UpdaterAPI.prototype._post = function(url, data, errback, callback, key) {
	var url = this._url(url);
	var callback = callback || function() {};
	var errback = errback || function() {};

	var xhr = new XMLHttpRequest();
	xhr.open('POST', url);

	if(!(data instanceof FormData)) {
		xhr.setRequestHeader('Content-Type', 'application/json');
		data = JSON.stringify(data);
	}

	xhr.onload = function() {
		switch(xhr.status) {
			case 200:
				var response = JSON.parse(xhr.responseText);
				switch(response.status) {
					case 'success':
						if(key) {
							callback(null, response.data[key]);
						} else {
							callback(null, response.data);
						}
						break;

					case 'fail':
						if(key) {
							errback(response.data[key]);
						} else {
							errback(response.data);
						}
						break;
					default:
						errback(response.message);
						break;
				}
			break;

			case 301:
			case 302:
			case 307:
				console.log("GOT REDIRECTED FOR A POST");
				console.log(xhr.status);
				break;

			default:
				console.error("Got a bad response from server: " + xhr.status);
				break;
		}
    }
	xhr.send(data);
	return xhr;
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


UpdaterAPI.prototype._get = function(url, errback, callback, key, engine) {
	var url = engine ? this._engine_url(url) : this._url(url);
	console.log(url)
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


