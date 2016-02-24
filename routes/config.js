var log = require('../log').logger('routes');
var config = require('../config')

var getStatus = function(req, res, next) {
  var updater = require('../updater');
  var answer = {
      status : "success",
      data : {'status':updater.status}
    };
    res.json(answer);
};

var getConfig = function(req, res, next) {
  var cfg = {'config':config.updater.getData()}
  try {
	  delete cfg.config.password
  } catch(e) {}

  res.json({
  	status : 'success',
  	data : cfg
  })
};

module.exports = function(server) {
  server.get('/status', getStatus);
  server.get('/config', getConfig)
};
