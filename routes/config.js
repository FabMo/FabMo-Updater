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

var postConfig = function(req, res, next) {
  config.updater.update(req.params);
  res.json({
    status : 'success',
    data : null
  });
};

module.exports = function(server) {
  server.get('/status', getStatus);
  server.get('/config', getConfig);
  server.post('/config', postConfig);
};
