/*
 * routes/support.js
 *
 * Routes for remote-support sessions (see support.js, support/README.md)
 *
 *   GET  /support/status   -> {active, level, address, name, started, expires}
 *   POST /support/request  {level, minutes}  -> {code, ...}  (the normal way in)
 *   POST /support/cancel
 *   POST /support/start    {key, level: "dashboard"|"system", minutes}  (key in hand)
 *   POST /support/elevate  (dashboard session -> full system access; local side only)
 *   POST /support/stop
 *   GET  /support/whois/<tunnel address> -> {user, device}
 */
var log = require('../log').logger('routes');
var support = require('../support');

function remoteAddress(req) {
    return (req.connection && req.connection.remoteAddress) || '';
}

// The customer-only actions: refuse them from the support tunnel and from web
// pages on other sites. Answers the request and returns true if refused.
function refusedAsNotLocal(req, res, message) {
    if (support.isTunnelAddress(remoteAddress(req))) {
        log.warn('Refused ' + req.url + ' from the support tunnel');
        answer(res, new Error(message));
        return true;
    }
    if (support.fromAnotherSite(req)) {
        log.warn('Refused ' + req.url + ' sent by a page on another site (' + req.headers.origin + ')');
        answer(res, new Error('That request did not come from this machine\'s own pages.'));
        return true;
    }
    return false;
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
    if (refusedAsNotLocal(req, res, 'A support session can only be started from the machine\'s own network.')) { return; }
    var body = req.body && typeof req.body === 'object' ? req.body : req.params || {};
    support.start({ key: body.key, level: body.level, minutes: body.minutes }, function(err, data) {
        answer(res, err, data);
    });
};

// Ask for a code to read to the technician. Same rule as start: only from
// the customer's side.
var request = function(req, res, next) {
    if (refusedAsNotLocal(req, res, 'A support session can only be started from the machine\'s own network.')) { return; }
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

// Raise the running session to full system access. Only the customer's side
// may do this: a tech must never be able to widen their own access.
var elevate = function(req, res, next) {
    if (refusedAsNotLocal(req, res, 'Full access can only be granted from the machine\'s own network.')) { return; }
    support.elevate(function(err, data) {
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
    server.post('/support/elevate', elevate);
    server.post('/support/stop', stop);
    server.get('/support/whois/:address', whois);
};
