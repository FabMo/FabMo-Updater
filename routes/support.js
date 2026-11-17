/*
 * routes/support.js
 *
 * Routes for remote-support sessions (see support.js, support/README.md)
 *
 *   GET  /support/status   -> {active, level, address, name, started, expires}
 *   POST /support/request  {level, minutes}  -> {code, ...}  (the normal way in)
 *   POST /support/cancel
 *   POST /support/start    {key, level: "dashboard"|"system", minutes}  (key in hand)
 *   POST /support/stop
 *   GET  /support/whois/<tunnel address> -> {user, device}
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

// Ask for a code to read to the technician. Same rule as start: only from
// the customer's side.
var request = function(req, res, next) {
    if (support.isTunnelAddress(remoteAddress(req))) {
        log.warn('Refused a support/request that came in over the support tunnel');
        return answer(res, new Error('A support session can only be started from the machine\'s own network.'));
    }
    var body = req.body && typeof req.body === 'object' ? req.body : req.params || {};
    support.request({ level: body.level, minutes: body.minutes, version: body.version }, function(err, data) {
        answer(res, err, data);
    });
};

var cancel = function(req, res, next) {
    support.cancel(function(err, data) {
        answer(res, err, data);
    });
};

// Anyone may end a session, from either side.
var stop = function(req, res, next) {
    support.stop(function(err, data) {
        answer(res, err, data);
    });
};

// Used by the engine to put a name to a tunnel address in its audit log
var whois = function(req, res, next) {
    support.whois(req.params.address, function(err, data) {
        answer(res, err, data);
    });
};

module.exports = function(server) {
    server.get('/support/status', getStatus);
    server.post('/support/request', request);
    server.post('/support/cancel', cancel);
    server.post('/support/start', start);
    server.post('/support/stop', stop);
    server.get('/support/whois/:address', whois);
};
