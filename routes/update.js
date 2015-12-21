var log = require('../log').logger('routes');
var updater = require('../updater');

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
			   	  data : {}
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
			   	  data : {}
			};
		res.json(answer);			
		}
    });
};

module.exports = function(server) {
  server.get('/update/versions', getVersions);
  server.post('/update/engine', updateEngine);
  server.post('/install/engine', installEngine);
};
