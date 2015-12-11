var log = require('../log').logger('routes');
var hooks = require('../hooks');

var getVersions = function(req, res, next) {
    hooks.getVersions(function(err, versions) {
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
    hooks.updateEngine(req.params.version);
	var answer = {
	    status : "success",
	      data : {}
	    };
	res.json(answer);
};

module.exports = function(server) {
  server.get('/update/versions', getVersions);
  server.post('/update/engine', updateEngine);

};
