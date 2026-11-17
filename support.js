/*
 * support.js
 *
 * Remote-support sessions: lets the customer open a time-limited connection
 * so a ShopBot support tech can reach this machine's dashboard and updater.
 *
 * All of the real work (and all of the safety rules) is in the shell script
 * support/fabmo-support - this module only runs it. It lives in the updater,
 * not the engine, so that support can be reached when the engine is down.
 * See support/README.md.
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var execFile = require('child_process').execFile;
var log = require('./log').logger('support');

var SCRIPT = path.join(__dirname, 'support', 'fabmo-support');
var RUN_DIR = '/run/fabmo-support';
var SESSION_FILE = path.join(RUN_DIR, 'session.json');

// A first start downloads the support software, so allow for a slow link
var START_TIMEOUT_MS = 7 * 60 * 1000;
var STOP_TIMEOUT_MS = 60 * 1000;

var KEY_PATTERN = /^tskey-auth-[A-Za-z0-9_-]{10,200}$/;

var busy = false;

// ---------------------------------------------------------------------------
// The broker: a ShopBot-run service that pairs the short code shown on this
// machine with a signed-in support tech, and only then issues the single-use
// key the session needs. Nobody at the machine handles a key.
//
// The address is not a security boundary: whatever the broker hands back,
// the script still refuses a key that is not for the ShopBot support network
// and the customer-machine tag.
// ---------------------------------------------------------------------------
var BROKER_URL = 'https://labs.shopbottools.com/support-broker';
var BROKER_URL_FILE = '/opt/fabmo-support/broker-url';   // development override
var PENDING_FILE = path.join(RUN_DIR, 'pending.json');
var POLL_MS = 3000;

var pending = null;     // { code, secret, level, minutes, expires, state, tech, error }
var pollTimer = null;

function brokerUrl() {
    if (process.env.FABMO_SUPPORT_BROKER) { return process.env.FABMO_SUPPORT_BROKER; }
    try {
        var fromFile = fs.readFileSync(BROKER_URL_FILE, 'utf8').trim();
        if (fromFile) { return fromFile; }
    } catch (e) { /* no override */ }
    return BROKER_URL;
}

// callback(err, statusCode, body)
function brokerCall(method, urlPath, body, secret, callback) {
    var target;
    try {
        // the broker may sit under a path (.../support-broker), so join, do not resolve
        target = new URL(brokerUrl().replace(/\/+$/, '') + urlPath);
    } catch (e) {
        return callback(new Error('Remote support by code is not set up on this machine yet.'));
    }
    var lib = target.protocol === 'https:' ? require('https') : require('http');
    var payload = body ? JSON.stringify(body) : null;
    var headers = {};
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (secret) { headers['Authorization'] = 'Bearer ' + secret; }
    var finished = false;
    function finish(err, status, data) {
        if (finished) { return; }
        finished = true;
        callback(err, status, data);
    }
    var req = lib.request(target, { method: method, headers: headers, timeout: 15000 }, function(res) {
        var chunks = [];
        res.on('data', function(c) { chunks.push(c); });
        res.on('end', function() {
            var data = {};
            try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { /* not JSON */ }
            finish(null, res.statusCode, data);
        });
    });
    req.on('timeout', function() { req.destroy(new Error('timed out')); });
    req.on('error', function() {
        finish(new Error('Could not reach the ShopBot support service. Is the machine connected to the internet?'));
    });
    if (payload) { req.write(payload); }
    req.end();
}

// What the dashboard may know about a pending request (never the secret)
function pendingView() {
    if (!pending) { return null; }
    return {
        code: pending.code, level: pending.level, minutes: pending.minutes,
        expires: pending.expires, state: pending.state, tech: pending.tech || null,
        error: pending.error || null
    };
}

// The engine watches this file so the dashboard hears about each step
function writePending() {
    try {
        if (pending) {
            fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
            fs.writeFileSync(PENDING_FILE, JSON.stringify(pendingView()) + '\n');
        } else {
            fs.unlinkSync(PENDING_FILE);
        }
    } catch (e) { /* nothing to remove */ }
}

function clearPending() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    pending = null;
    writePending();
}

function failPending(message) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (!pending) { return; }
    pending.state = 'failed';
    pending.error = message;
    writePending();
    log.warn('Remote-support request failed: ' + message);
}

function pollBroker() {
    if (!pending || pending.state !== 'waiting') { return; }
    var mine = pending;
    if (Date.now() / 1000 > mine.expires) {
        return failPending('Nobody used the code in time. Ask for a new one when your technician is ready.');
    }
    brokerCall('GET', '/v1/session/' + mine.code, null, mine.secret, function(err, status, data) {
        if (pending !== mine || mine.state !== 'waiting') { return; }
        if (err) { return; }                       // a blip; try again next tick
        if (status === 404) { return failPending('The code has expired. Ask for a new one.'); }
        if (status !== 200 || data.state !== 'claimed' || !data.key) { return; }

        // A tech claimed the code: the broker has handed over the key.
        clearInterval(pollTimer); pollTimer = null;
        mine.state = 'connecting';
        mine.tech = data.tech || null;
        writePending();
        log.info('Support code claimed by ' + (mine.tech || 'a technician') + '; joining the support network');
        exports.start({ key: data.key, level: mine.level, minutes: mine.minutes }, function(startErr, session) {
            if (pending !== mine) { return; }
            if (startErr) { return failPending(startErr.message); }
            brokerCall('POST', '/v1/session/' + mine.code + '/joined', { address: session.address }, mine.secret, function() {
                /* telling the tech where we are is a courtesy; the session is up either way */
            });
            clearPending();
        });
    });
}

// Ask the broker for a code to read to the technician.
// options: { level: "dashboard" | "system", minutes: N }
// callback(err, {code, level, minutes, expires, state})
exports.request = function(options, callback) {
    options = options || {};
    if (busy) { return callback(new Error('A support session is already being started.')); }
    if (pending && (pending.state === 'waiting' || pending.state === 'connecting')) {
        return callback(null, pendingView());
    }
    exports.status(function(err, current) {
        if (!err && current && current.active) {
            return callback(new Error('A support session is already running.'));
        }
        var level = options.level === 'system' ? 'system' : 'dashboard';
        var minutes = parseInt(options.minutes, 10) > 0 ? parseInt(options.minutes, 10) : 120;
        brokerCall('POST', '/v1/session', {
            level: level, minutes: minutes, name: require('os').hostname(), version: options.version || ''
        }, null, function(callErr, status, data) {
            if (callErr) { return callback(callErr); }
            if (status !== 201 || !data.code || !data.secret) {
                return callback(new Error(data.error || 'The ShopBot support service did not give a code.'));
            }
            clearPending();
            pending = {
                code: data.code, secret: data.secret, level: level, minutes: minutes,
                expires: Math.floor(Date.now() / 1000) + (data.expiresIn || 600), state: 'waiting'
            };
            writePending();
            pollTimer = setInterval(pollBroker, POLL_MS);
            log.info('Remote-support code issued; waiting for a technician to use it');
            callback(null, pendingView());
        });
    });
};

// Give up on a code that has not been used (or clear a failed one).
exports.cancel = function(callback) {
    var mine = pending;
    if (mine && mine.state === 'connecting') {
        return callback(new Error('The technician is already connecting.'));
    }
    clearPending();
    if (mine) {
        brokerCall('DELETE', '/v1/session/' + mine.code, null, mine.secret, function() { /* best effort */ });
    }
    callback(null, { pending: null });
};

exports.pending = pendingView;

// Run the script; hand back its parsed JSON output, or an Error carrying the
// one-line reason it printed.
function run(args, timeout, callback) {
    execFile(SCRIPT, args, { timeout: timeout }, function(err, stdout, stderr) {
        if (err) {
            var why = String(stderr || '').trim().split('\n').pop() || err.message;
            return callback(new Error(why));
        }
        try {
            callback(null, JSON.parse(stdout));
        } catch (e) {
            callback(new Error('Unexpected answer from the support script'));
        }
    });
}

// callback(err, {active, level, address, name, started, expires})
exports.status = function(callback) {
    run(['status'], STOP_TIMEOUT_MS, function(err, data) {
        if (data) {
            data.pending = pendingView();
            data.byCode = !!brokerUrl();
        }
        callback(err, data);
    });
};

// The level of the running session ("dashboard" | "system"), or null.
// Synchronous, for use in request gates.
exports.currentLevel = function() {
    try {
        return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).level || null;
    } catch (e) {
        return null;
    }
};

// options: { key: <single-use join key>, level: "dashboard" | "system", minutes: N }
exports.start = function(options, callback) {
    options = options || {};
    var key = String(options.key || '').trim();
    if (!KEY_PATTERN.test(key)) {
        return callback(new Error('That does not look like a support key.'));
    }
    var level = options.level === 'system' ? 'system' : 'dashboard';
    var minutes = parseInt(options.minutes, 10);
    if (busy) {
        return callback(new Error('A support session is already being started.'));
    }
    busy = true;

    // The key goes to the script in a root-only file, never on a command line
    var keyFile = path.join(RUN_DIR, 'key.' + crypto.randomBytes(6).toString('hex'));
    function done(err, data) {
        try { fs.unlinkSync(keyFile); } catch (e) { /* already gone */ }
        busy = false;
        callback(err, data);
    }
    try {
        fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(keyFile, key + '\n', { mode: 0o600 });
    } catch (e) {
        return done(e);
    }
    var args = ['start', '--key-file', keyFile];
    if (minutes > 0) { args.push('--minutes', String(minutes)); }
    if (level === 'system') { args.push('--ssh'); }
    log.info('Starting a remote-support session (level: ' + level + ')');
    run(args, START_TIMEOUT_MS, function(err, data) {
        if (err) {
            log.warn('Remote-support session did not start: ' + err.message);
        } else {
            log.info('Remote-support session started as ' + data.name + ' (' + data.address + ')');
        }
        done(err, data);
    });
};

// Raise the running session to full system access. No new key or code.
exports.elevate = function(callback) {
    log.info('Granting full system access for the remote-support session');
    run(['elevate'], STOP_TIMEOUT_MS, callback);
};

exports.stop = function(callback) {
    log.info('Ending the remote-support session');
    run(['stop'], STOP_TIMEOUT_MS, callback);
};

// Who is behind a tunnel address: callback(err, {user, device})
exports.whois = function(address, callback) {
    var a = String(address || '').replace(/^::ffff:/, '');
    if (!exports.isTunnelAddress(a)) {
        return callback(new Error('Not a support-network address'));
    }
    run(['whois', a], STOP_TIMEOUT_MS, function(err, data) {
        if (err) { return callback(err); }
        var user = (data.UserProfile && (data.UserProfile.DisplayName || data.UserProfile.LoginName)) || '';
        var device = (data.Node && (data.Node.ComputedName || data.Node.Name || '')) || '';
        callback(null, { user: user, device: String(device).split('.')[0] });
    });
};

// True when a request came in over the support tunnel rather than from the
// customer's own network (Tailscale's address ranges).
exports.isTunnelAddress = function(address) {
    var a = String(address || '').toLowerCase().replace(/^::ffff:/, '');
    if (a.indexOf('fd7a:115c:a1e0:') === 0) { return true; }
    var m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(a);
    if (!m) { return false; }
    var first = parseInt(m[1], 10), second = parseInt(m[2], 10);
    return first === 100 && second >= 64 && second <= 127;   // 100.64.0.0/10
};
