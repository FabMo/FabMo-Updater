var log = require('../log').logger('routes');
var hooks = require('../hooks');

var startEngine = function(req, res, next) {
    hooks.startEngine(function(err, data) {
	  if(err) {
	  	log.error(err);

	  	res.json({status : 'error', message : err})
	  }
	  else {
	  var answer = {
	      status : "success",
	      data : {}
	    };
	    res.json(answer);
	  }
    });
};

var stopEngine = function(req, res, next) {
    hooks.stopEngine(function(err, data) {
	  if(err) {
	  		  	log.error(err);

	  	res.json({status : 'error', message : err})
	  }
	  else {
	  var answer = {
	      status : "success",
	      data : {}
	    };
	    res.json(answer);
	  }
    });
};

var restartEngine = function(req, res, next) {
    hooks.restartEngine(function(err, data) {
	  if(err) {
	  	log.error(err);
	  	res.json({status : 'error', message : err})
	  }
	  else {
	  var answer = {
	      status : "success",
	      data : {}
	    };
	    res.json(answer);
	  }
    });
};

module.exports = function(server) {
  server.post('/engine/start', startEngine);
  server.post('/engine/stop', stopEngine);
  server.post('/engine/restart', restartEngine);
};
