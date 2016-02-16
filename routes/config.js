var log = require('../log').logger('routes');

var get_status = function(req, res, next) {
  var updater = require('../updater');
  var answer = {
      status : "success",
      data : {'status':updater.status}
    };
    res.json(answer);
};

module.exports = function(server) {
  server.get('/status', get_status);     //OK
};
