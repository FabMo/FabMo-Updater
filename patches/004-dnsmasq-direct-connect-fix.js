/*
 * Patch 004: Fix dnsmasq direct-connect boot race
 *
 * direct-mode.conf used bind-interfaces, which causes dnsmasq to fail at
 * boot when the active-mode.conf symlink still points to direct-mode.conf
 * from the previous session and 192.168.44.1 isn't assigned to eth0 yet.
 * Replacing bind-interfaces with bind-dynamic lets dnsmasq start and wait
 * for the address to appear — the listen-address directives still enforce
 * the same rogue-DHCP protection. A Restart=on-failure drop-in provides
 * belt-and-suspenders recovery for any other transient start failure.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-004');
var path = require('path');

var PATCH_ID = '004-dnsmasq-direct-connect-fix';
var PATCH_DESCRIPTION = 'Replace bind-interfaces with bind-dynamic in direct-mode.conf and add dnsmasq Restart=on-failure';

var DIRECT_MODE_CONF  = '/etc/dnsmasq.d/direct-mode.conf';
var DNSMASQ_DROPIN_DIR  = '/etc/systemd/system/dnsmasq.service.d';
var DNSMASQ_DROPIN_FILE = path.join(DNSMASQ_DROPIN_DIR, 'fabmo-restart.conf');

var DROPIN_CONTENT = [
    '[Service]',
    'Restart=on-failure',
    'RestartSec=3',
    ''
].join('\n');

function hasBoundInterfaces() {
    try {
        var content = fs.readFileSync(DIRECT_MODE_CONF, 'utf8');
        return /^bind-interfaces\s*$/m.test(content);
    } catch (e) {
        return false;
    }
}

function hasDropin() {
    try {
        var content = fs.readFileSync(DNSMASQ_DROPIN_FILE, 'utf8');
        return content.indexOf('Restart=on-failure') !== -1;
    } catch (e) {
        return false;
    }
}

module.exports = {
    id: PATCH_ID,
    description: PATCH_DESCRIPTION,
    requiresReboot: false,

    check: function () {
        return hasBoundInterfaces() || !hasDropin();
    },

    apply: function () {
        var errors = [];

        // Fix direct-mode.conf: swap bind-interfaces for bind-dynamic
        if (hasBoundInterfaces()) {
            try {
                var content = fs.readFileSync(DIRECT_MODE_CONF, 'utf8');
                // Replace the bind-interfaces line (and its preceding comment if present)
                content = content
                    .replace(/^# Prevent rogue DHCP:.*\n/m, '')
                    .replace(/^bind-interfaces\s*$/m, 'bind-dynamic');
                fs.writeFileSync(DIRECT_MODE_CONF, content, 'utf8');
                log.info('Replaced bind-interfaces with bind-dynamic in ' + DIRECT_MODE_CONF);
            } catch (e) {
                log.error('Failed to update ' + DIRECT_MODE_CONF + ': ' + e.message);
                errors.push(e.message);
            }
        }

        // Install systemd drop-in for Restart=on-failure
        if (!hasDropin()) {
            try {
                fs.ensureDirSync(DNSMASQ_DROPIN_DIR);
                fs.writeFileSync(DNSMASQ_DROPIN_FILE, DROPIN_CONTENT, 'utf8');
                var execSync = require('child_process').execSync;
                execSync('systemctl daemon-reload', { stdio: 'ignore' });
                log.info('Installed dnsmasq Restart=on-failure drop-in');
            } catch (e) {
                log.error('Failed to install dnsmasq drop-in: ' + e.message);
                errors.push(e.message);
            }
        }

        if (errors.length > 0) {
            throw new Error('Patch 004 partial failure: ' + errors.join('; '));
        }
    }
};
