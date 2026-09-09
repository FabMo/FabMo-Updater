/*
 * Patch 002: Restore and Protect NetworkManager Connection Profiles
 *
 * Checks that the three required NM connections (lan-connection, direct-connection,
 * wlan0_ap) exist. Creates any that are missing using nmcli — no external resource
 * files needed because the IP addresses are universal across all FabMo tools:
 *   192.168.44.1  direct ethernet connection
 *   192.168.42.1  AP mode
 *
 * Also applies immutable flags to the two static ethernet connections to prevent
 * accidental deletion via the NM UI, and ensures dnsmasq configs and the
 * NM dispatcher script are present.
 *
 * Only acts on missing/unprotected items — never replaces existing content.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-002');
var exec = require('child_process').execSync;
var path = require('path');

var PATCH_ID = '002-network-connections-restore';
var PATCH_DESCRIPTION = 'Restore and protect NetworkManager connection profiles';
var PATCH_VERSION = '2026-08-18';

var RESOURCE_DIR = path.join(__dirname, 'resources', '002-network');
var NM_DIR = '/etc/NetworkManager';
var NM_CONNECTIONS_DIR = path.join(NM_DIR, 'system-connections');
var DNSMASQ_DIR = '/etc/dnsmasq.d';

var REQUIRED_CONNECTIONS = ['lan-connection', 'direct-connection', 'wlan0_ap'];

// wlan0_ap is excluded — ip-reporting.py rewrites its SSID frequently
var STATIC_CONNECTIONS = ['lan-connection', 'direct-connection'];

var REQUIRED_DNSMASQ_CONFIGS = ['ap-only.conf', 'direct-mode.conf'];
var REQUIRED_DISPATCHER_SCRIPTS = ['99-sync-ap-channel'];

function connectionExists(name) {
    try {
        exec('nmcli connection show "' + name + '" >/dev/null 2>&1');
        return true;
    } catch (err) {
        return false;
    }
}

function isImmutable(filePath) {
    try {
        return exec('lsattr "' + filePath + '" 2>/dev/null', {stdio: 'pipe'}).toString().includes('----i-');
    } catch (err) {
        return false;
    }
}

function check() {
    try {
        var needsApplying = false;

        for (var i = 0; i < REQUIRED_CONNECTIONS.length; i++) {
            if (!connectionExists(REQUIRED_CONNECTIONS[i])) {
                log.info('  Missing NM connection: ' + REQUIRED_CONNECTIONS[i]);
                needsApplying = true;
            }
        }

        for (var j = 0; j < STATIC_CONNECTIONS.length; j++) {
            var connFile = path.join(NM_CONNECTIONS_DIR, STATIC_CONNECTIONS[j]);
            if (fs.existsSync(connFile) && !isImmutable(connFile)) {
                log.info('  Static connection not immutable-protected: ' + STATIC_CONNECTIONS[j]);
                needsApplying = true;
            }
        }

        for (var k = 0; k < REQUIRED_DNSMASQ_CONFIGS.length; k++) {
            var dnsPath = path.join(DNSMASQ_DIR, REQUIRED_DNSMASQ_CONFIGS[k]);
            if (!fs.existsSync(dnsPath)) {
                log.info('  Missing dnsmasq config: ' + REQUIRED_DNSMASQ_CONFIGS[k]);
                needsApplying = true;
            } else if (REQUIRED_DNSMASQ_CONFIGS[k] === 'direct-mode.conf') {
                var content = fs.readFileSync(dnsPath, 'utf8');
                if (!content.includes('bind-interfaces')) {
                    log.info('  direct-mode.conf missing bind-interfaces (rogue DHCP fix)');
                    needsApplying = true;
                }
            }
        }

        if (!fs.existsSync(path.join(DNSMASQ_DIR, 'active-mode.conf'))) {
            log.info('  Missing active-mode.conf symlink');
            needsApplying = true;
        } else {
            var target = null;
            try { target = fs.readlinkSync(path.join(DNSMASQ_DIR, 'active-mode.conf')); } catch(e) {}
            if (target !== path.join(DNSMASQ_DIR, 'ap-only.conf')) {
                log.info('  active-mode.conf points to wrong target: ' + target);
                needsApplying = true;
            }
        }

        for (var m = 0; m < REQUIRED_DISPATCHER_SCRIPTS.length; m++) {
            if (!fs.existsSync(path.join(NM_DIR, 'dispatcher.d', REQUIRED_DISPATCHER_SCRIPTS[m]))) {
                log.info('  Missing NM dispatcher script: ' + REQUIRED_DISPATCHER_SCRIPTS[m]);
                needsApplying = true;
            }
        }

        return needsApplying;

    } catch (err) {
        log.warn('  Error during check: ' + err.message);
        return true; // safer to attempt apply if check fails
    }
}

function apply() {
    return new Promise(function(resolve, reject) {
        try {
            var connectionsChanged = false;

            // --- Recreate missing NM connections via nmcli ---

            if (!connectionExists('lan-connection')) {
                log.info('  Creating lan-connection (DHCP ethernet)...');
                exec('nmcli connection add' +
                    ' type ethernet' +
                    ' con-name lan-connection' +
                    ' ifname eth0' +
                    ' ipv4.method auto' +
                    ' ipv6.method disabled' +
                    ' connection.autoconnect yes',
                    {stdio: 'pipe'});
                log.info('  \u2713 Created lan-connection');
                connectionsChanged = true;
            }

            if (!connectionExists('direct-connection')) {
                log.info('  Creating direct-connection (192.168.44.1 static)...');
                // Lower autoconnect-priority so lan-connection wins on LAN-attached boot
                exec('nmcli connection add' +
                    ' type ethernet' +
                    ' con-name direct-connection' +
                    ' ifname eth0' +
                    ' ipv4.method manual' +
                    ' ipv4.addresses 192.168.44.1/24' +
                    ' ipv6.method disabled' +
                    ' connection.autoconnect yes' +
                    ' connection.autoconnect-priority -1',
                    {stdio: 'pipe'});
                log.info('  \u2713 Created direct-connection');
                connectionsChanged = true;
            }

            if (!connectionExists('wlan0_ap')) {
                log.info('  Creating wlan0_ap (AP mode 192.168.42.1)...');
                // SSID is a placeholder; ip-reporting.py updates it on first run
                exec('nmcli connection add' +
                    ' type wifi' +
                    ' ifname wlan0' +
                    ' con-name wlan0_ap' +
                    ' ssid FabMo-setup' +
                    ' 802-11-wireless.mode ap' +
                    ' 802-11-wireless.band bg' +
                    ' 802-11-wireless.channel 6' +
                    ' ipv4.method manual' +
                    ' ipv4.addresses 192.168.42.1/24' +
                    ' ipv6.method disabled' +
                    ' connection.autoconnect yes',
                    {stdio: 'pipe'});
                log.info('  \u2713 Created wlan0_ap');
                connectionsChanged = true;
            }

            // --- Apply immutable flags to existing static connections ---

            for (var i = 0; i < STATIC_CONNECTIONS.length; i++) {
                var connFile = path.join(NM_CONNECTIONS_DIR, STATIC_CONNECTIONS[i]);
                if (fs.existsSync(connFile) && !isImmutable(connFile)) {
                    try {
                        exec('chattr +i "' + connFile + '"', {stdio: 'pipe'});
                        log.info('  \u2713 Immutable flag set: ' + STATIC_CONNECTIONS[i]);
                    } catch (err) {
                        log.warn('  Could not set immutable flag on ' + STATIC_CONNECTIONS[i] + ': ' + err.message);
                    }
                }
            }

            // --- Install missing dnsmasq configs ---

            fs.ensureDirSync(DNSMASQ_DIR);
            for (var j = 0; j < REQUIRED_DNSMASQ_CONFIGS.length; j++) {
                var configName = REQUIRED_DNSMASQ_CONFIGS[j];
                var dnsTarget = path.join(DNSMASQ_DIR, configName);
                var dnsSource = path.join(RESOURCE_DIR, 'dnsmasq', configName);
                var needsInstall = !fs.existsSync(dnsTarget);
                if (!needsInstall && configName === 'direct-mode.conf') {
                    var existing = fs.readFileSync(dnsTarget, 'utf8');
                    if (!existing.includes('bind-interfaces')) needsInstall = true;
                }
                if (needsInstall) {
                    log.info('  Installing dnsmasq config: ' + configName);
                    fs.copySync(dnsSource, dnsTarget);
                    fs.chmodSync(dnsTarget, 0o644);
                }
            }

            // active-mode.conf must point to ap-only at boot; network-monitor.sh switches it if needed
            var apOnlyConf = path.join(DNSMASQ_DIR, 'ap-only.conf');
            var activeModeLink = path.join(DNSMASQ_DIR, 'active-mode.conf');
            var currentTarget = null;
            try { currentTarget = fs.readlinkSync(activeModeLink); } catch(e) {}
            if (currentTarget !== apOnlyConf) {
                log.info('  Setting active-mode.conf -> ap-only.conf (was: ' + (currentTarget || 'missing') + ')');
                try { fs.unlinkSync(activeModeLink); } catch(e) {}
                fs.symlinkSync(apOnlyConf, activeModeLink);
            }

            // --- Install missing NM dispatcher scripts ---

            var dispatcherDir = path.join(NM_DIR, 'dispatcher.d');
            fs.ensureDirSync(dispatcherDir);
            for (var k = 0; k < REQUIRED_DISPATCHER_SCRIPTS.length; k++) {
                var scriptName = REQUIRED_DISPATCHER_SCRIPTS[k];
                var scriptTarget = path.join(dispatcherDir, scriptName);
                if (!fs.existsSync(scriptTarget)) {
                    log.info('  Installing dispatcher script: ' + scriptName);
                    fs.copySync(path.join(RESOURCE_DIR, 'NetworkManager/dispatcher.d', scriptName), scriptTarget);
                    fs.chmodSync(scriptTarget, 0o755);
                }
            }

            // --- Reload services ---

            if (connectionsChanged) {
                try {
                    exec('systemctl reload NetworkManager 2>/dev/null || systemctl restart NetworkManager', {stdio: 'pipe'});
                    log.info('  \u2713 NetworkManager reloaded');
                } catch (err) {
                    log.warn('  Could not reload NetworkManager: ' + err.message);
                }
            }

            try {
                exec('systemctl restart dnsmasq 2>/dev/null || true', {stdio: 'pipe'});
            } catch (err) {
                log.debug('  Note: dnsmasq restart skipped');
            }

            resolve({ requiresReboot: connectionsChanged });

        } catch (err) {
            log.error('  Error applying patch: ' + err.message);
            reject(err);
        }
    });
}

module.exports = {
    id: PATCH_ID,
    description: PATCH_DESCRIPTION,
    version: PATCH_VERSION,
    requiresReboot: false,
    check: check,
    apply: apply
};
