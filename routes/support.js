/*
 * routes/support.js
 *
 * Routes for remote-support sessions (see support.js, support/README.md)
 *
 *   GET  /support/status   -> {active, level, address, name, started, expires}
 *   POST /support/start    {key, level: "dashboard"|"system", minutes}
 *   POST /support/stop
 */
var log = require('../log').logger('routes');
var support = require('../support');

function remoteAddress(req) {
    return (req.connection && req.connection.remoteAddress) || '';
}

function answer(res, err, data) {
    if (err) {
        res.json({ status: 'error', message: err.message });
    } else {
        res.json({ status: 'success', data: data });
    }
}

var getStatus = function(req, res, next) {
    support.status(function(err, data) {
        if (data) { data.viaTunnel = support.isTunnelAddress(remoteAddress(req)); }
        answer(res, err, data);
    });
};

// Only the customer's side may open (or widen) a session. Someone already
// connected over the tunnel must not be able to start one or raise its level.
var start = function(req, res, next) {
    if (support.isTunnelAddress(remoteAddress(req))) {
        log.warn('Refused a support/start request that came in over the support tunnel');
        return answer(res, new Error('A support session can only be started from the machine\'s own network.'));
    }
    var body = req.body && typeof req.body === 'object' ? req.body : req.params || {};
    support.start({ key: body.key, level: body.level, minutes: body.minutes }, function(err, data) {
        answer(res, err, data);
    });
};

// Anyone may end a session, from either side.
var stop = function(req, res, next) {
    support.stop(function(err, data) {
        answer(res, err, data);
    });
};

module.exports = function(server) {
    server.get('/support/status', getStatus);
    server.post('/support/start', start);
    server.post('/support/stop', stop);
};
