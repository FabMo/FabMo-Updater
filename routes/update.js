var log = require('../log').logger('routes');
var updater = require('../updater');
var upload = require('./upload').upload;

var getVersions = function(req, res, next) {
    updater.getVersions(function(err, versions) {
	  if(err) {
	  	res.json({status : 'error', message : err})
	  }
	  else {
	  var answer = {
	      status : "success",
	      data : {'versions' : versions }
	    };
	    res.json(answer);
	  }
    });
};

var updateEngine = function(req, res, next) {
    updater.updateEngine(req.params.version, function(err, data) {
	  if(err) {
	  	res.json({status : 'error', message : err});
		} else {
			var answer = {
			    status : "success",
			   	  data : {'task' : data}
			};
		res.json(answer);			
		}
    });
};

var updateUpdater = function(req, res, next) {
    updater.updateUpdater(req.params.version, function(err, data) {
	  if(err) {
	  	res.json({status : 'error', message : err});
		} else {
			var answer = {
			    status : "success",
			   	  data : null //{'task' : data}
			};
		res.json(answer);			
		}
    });
};

var installEngine = function(req, res, next) {
    updater.installEngine(req.params.version, function(err, data) {
	  if(err) {
	  	res.json({status : 'error', message : err});
		} else {
			var answer = {
			    status : "success",
			   	  data : {'task' : data}
			};
		res.json(answer);			
		}
    });
};

var updateFirmware = function(req, res, next) {
    updater.updateFirmware(function(err, data) {
	  if(err) {
	  	res.json({status : 'error', message : err});
		} else {
			var answer = {
			    status : "success",
			   	  data : {'task' : data}
			};
		res.json(answer);			
		}
    });
};

var factoryReset = function(req, res, next) {
    updater.factoryReset(function(err, data) {
	  if(err) {
	  	res.json({status : 'error', message : err});
		} else {
			var answer = {
			    status : "success",
			   	  data : null /*{'task' : data}*/
			};
			res.json(answer);			
		}
    });	
}

var getTasks = function(req, res, next) {
	res.json({
		status : "success",
		data : {"tasks" : updater.tasks}
 	});
}

var doFMU = function(req, res, next) {
	log.info("Doing FMU");
	upload(req, res, next, function(err, upload) {
        log.info("Upload complete");
        var uploads = upload.files

        if(uploads.length > 1) {
            log.warn("Got an upload of " + uploads.length + ' files for a submitted job when only one is allowed.')
        }       
        res.json( {
        	status : 'success',
        	data : {
        		status : 'complete'
        	}
        });
        console.log(upload.files[0].file.path)
        updater.doFMU(upload.files[0].file.path);
    });
}

module.exports = function(server) {
  server.get('/update/versions', getVersions);
  server.get('/tasks', getTasks);
  server.post('/update/engine', updateEngine);
  server.post('/update/updater', updateUpdater);
  server.post('/update/firmware', updateFirmware);
  server.post('/install/engine', installEngine);
  server.post('/update/factory', factoryReset);

  server.post('/update/fmu', doFMU);
};
