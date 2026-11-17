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
    run(['status'], STOP_TIMEOUT_MS, callback);
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
