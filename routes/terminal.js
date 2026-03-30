/*
 * routes/terminal.js
 *
 * Provides an interactive terminal (PTY) over Socket.IO, plus routes
 * to serve the xterm.js client-side assets from node_modules.
 */
var fs = require('fs');
var path = require('path');
var log = require('../log').logger('terminal');

// Resolve paths to xterm assets in node_modules
var XTERM_CSS = path.join(__dirname, '..', 'node_modules', 'xterm', 'css', 'xterm.css');
var XTERM_JS  = path.join(__dirname, '..', 'node_modules', 'xterm', 'lib', 'xterm.js');
var FIT_JS    = path.join(__dirname, '..', 'node_modules', 'xterm-addon-fit', 'lib', 'xterm-addon-fit.js');

// Serve a static file with the given content type
function serveFile(filePath, contentType, req, res, next) {
    fs.readFile(filePath, function(err, data) {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return next(false);
        }
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400'
        });
        res.end(data);
        return next(false);
    });
}

// Try to load node-pty (requires native compilation — may not be available)
var pty;
try {
    pty = require('node-pty');
} catch(e) {
    log.warn('node-pty not available: ' + e.message);
    log.warn('Interactive terminal will be disabled.');
}

module.exports = function(server) {

    // Routes to serve xterm assets from node_modules
    server.get('/xterm/xterm.css', function(req, res, next) {
        serveFile(XTERM_CSS, 'text/css', req, res, next);
    });
    server.get('/xterm/xterm.js', function(req, res, next) {
        serveFile(XTERM_JS, 'application/javascript', req, res, next);
    });
    server.get('/xterm/xterm-addon-fit.js', function(req, res, next) {
        serveFile(FIT_JS, 'application/javascript', req, res, next);
    });

    // REST endpoint so the client can check if the terminal backend is available
    server.get('/terminal/status', function(req, res, next) {
        res.json({ available: !!pty });
        return next();
    });

    // -----------------------------------------------------------------------
    // Socket.IO  /terminal  namespace — one PTY per connected client
    // -----------------------------------------------------------------------
    if (!pty) { return; }

    var terminalNs = server.io.of('/terminal');

    terminalNs.on('connection', function(socket) {
        log.info('Terminal client connected: ' + socket.id);

        var term = null;

        // Start (or restart) a PTY session
        socket.on('terminal:start', function(data) {
            // Kill a previous session if one exists
            if (term) {
                try { term.kill(); } catch(e) { /* ignore */ }
                term = null;
            }

            var cols  = (data && data.cols)  || 80;
            var rows  = (data && data.rows)  || 24;
            var shell = process.env.SHELL || '/bin/bash';

            try {
                term = pty.spawn(shell, [], {
                    name: 'xterm-256color',
                    cols: cols,
                    rows: rows,
                    cwd: process.env.HOME || '/root',
                    env: Object.assign({}, process.env, { TERM: 'xterm-256color' })
                });
            } catch(e) {
                log.error('Failed to spawn PTY: ' + e.message);
                socket.emit('terminal:error', 'Failed to start terminal: ' + e.message);
                return;
            }

            log.info('PTY spawned (pid ' + term.pid + ') for ' + socket.id);

            term.onData(function(data) {
                socket.emit('terminal:output', data);
            });

            term.onExit(function(exitInfo) {
                log.info('PTY exited (pid ' + term.pid + ') code=' + exitInfo.exitCode);
                socket.emit('terminal:exit', exitInfo);
                term = null;
            });
        });

        // Data from the browser → PTY stdin
        socket.on('terminal:input', function(data) {
            if (term) { term.write(data); }
        });

        // Browser terminal resized
        socket.on('terminal:resize', function(data) {
            if (term && data && data.cols && data.rows) {
                try { term.resize(Math.max(data.cols, 1), Math.max(data.rows, 1)); }
                catch(e) { /* ignore resize errors */ }
            }
        });

        // Client disconnected — clean up the PTY
        socket.on('disconnect', function() {
            log.info('Terminal client disconnected: ' + socket.id);
            if (term) {
                try { term.kill(); } catch(e) { /* ignore */ }
                term = null;
            }
        });
    });
};
