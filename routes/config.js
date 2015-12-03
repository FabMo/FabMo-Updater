var log = require('../log').logger('routes');

/**
 * @api {get} /status Engine status
 * @apiGroup Status
 * @apiDescription Get a system status report, which includes tool position, IO states, current job, progress, etc.
 * @apiSuccess {String} status `success`
 * @apiSuccess {Object} data Response data
 * @apiSuccess {Object} data.status Status info

 */
var get_status = function(req, res, next) {
  var answer = {
      status : "success",
      data : {'status':'OK'}
    };
    res.json(answer);
};

module.exports = function(server) {
  server.get('/status', get_status);     //OK
};
