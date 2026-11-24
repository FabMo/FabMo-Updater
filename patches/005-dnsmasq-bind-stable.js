/*
 * Patch 005: Stop patches 002 and 004 from undoing each other
 *
 * On every updater start, on every tool:
 *   - 002's check looks for the text "bind-interfaces" anywhere in
 *     /etc/dnsmasq.d/direct-mode.conf. 004 removed that text, so 002 copies
 *     its old file back (with the bind-interfaces directive) and restarts
 *     dnsmasq, which then fails to start whenever 192.168.44.1 is not
 *     assigned (LAN and AP-only use).
 *   - 004 then sees the bind-interfaces directive and swaps it for
 *     bind-dynamic again, without restarting dnsmasq.
 * The tool recovers only because something else restarts dnsmasq afterwards.
 *
 * Shipped patches are not edited, so this patch leaves direct-mode.conf in a
 * form both of their checks accept:
 *   - the directive is bind-dynamic (what 004 wants; 004 only matches a line
 *     that is exactly "bind-interfaces")
 *   - a comment line mentions bind-interfaces (all 002 looks for)
 * The file is edited in place; nothing else in it is touched, so a later patch
 * that changes other lines will not fight with this one.
 *
 * Order within one updater start is 002, 004, 005 (sorted by filename). On the
 * first start with this patch 002 and 004 fight one last time and 005 then
 * adds the comment; from the next start on all three checks pass.
 *
 * Not handled here: 002 also re-applies (and restarts dnsmasq) whenever
 * active-mode.conf does not point at ap-only.conf, e.g. an updater start while
 * the tool is in direct-connect mode.
 */

var fs = require('fs-extra');
var log = require('../log').logger('patch-005');
var execSync = require('child_process').execSync;

var PATCH_ID = '005-dnsmasq-bind-stable';
var PATCH_DESCRIPTION = 'Keep bind-dynamic in direct-mode.conf in a form patches 002 and 004 both accept';

var DIRECT_MODE_CONF = '/etc/dnsmasq.d/direct-mode.conf';

// Must contain the text "bind-interfaces" (for 002) and must not start with
// "# Prevent rogue DHCP:" (004 deletes a line that starts that way).
var MARKER_COMMENT = '# Use bind-dynamic here, not bind-interfaces: dnsmasq must be able to start before 192.168.44.1 is assigned.';

var RE_BIND_INTERFACES = /^bind-interfaces\s*$/m;
var RE_BIND_DYNAMIC = /^bind-dynamic\s*$/m;

function readConf() {
    try {
        return fs.readFileSync(DIRECT_MODE_CONF, 'utf8');
    } catch (e) {
        return null;
    }
}

function isStable(content) {
    return !RE_BIND_INTERFACES.test(content) &&
           RE_BIND_DYNAMIC.test(content) &&
           content.indexOf('bind-interfaces') !== -1;
}

function dnsmasqIsActive() {
    try {
        execSync('systemctl is-active --quiet dnsmasq', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    id: PATCH_ID,
    description: PATCH_DESCRIPTION,
    requiresReboot: false,

    check: function () {
        var content = readConf();
        if (content === null) {
            // 002 owns creating the file; nothing to do until it exists
            return false;
        }
        return !isStable(content);
    },

    apply: function () {
        var content = readConf();
        if (content === null) {
            return;
        }

        // 1. The directive: bind-dynamic, never bind-interfaces
        if (RE_BIND_INTERFACES.test(content)) {
            content = content.replace(RE_BIND_INTERFACES, 'bind-dynamic');
            log.info('Replaced bind-interfaces with bind-dynamic in ' + DIRECT_MODE_CONF);
        }
        if (!RE_BIND_DYNAMIC.test(content)) {
            if (content.length && content.charAt(content.length - 1) !== '\n') {
                content += '\n';
            }
            content += 'bind-dynamic\n';
            log.info('Added bind-dynamic to ' + DIRECT_MODE_CONF);
        }

        // 2. The comment 002 looks for, placed directly above the directive
        if (content.indexOf('bind-interfaces') === -1) {
            content = content.replace(RE_BIND_DYNAMIC, MARKER_COMMENT + '\nbind-dynamic');
            log.info('Added bind-interfaces marker comment to ' + DIRECT_MODE_CONF);
        }

        fs.writeFileSync(DIRECT_MODE_CONF, content, 'utf8');

        // 3. 002 may have left dnsmasq failed earlier in this same run. The
        //    file is now startable, so bring dnsmasq back if it is down.
        //    A running dnsmasq is left alone (the edit does not change behavior).
        if (!dnsmasqIsActive()) {
            try {
                execSync('systemctl reset-failed dnsmasq 2>/dev/null; systemctl start dnsmasq', { stdio: 'ignore' });
                log.info('dnsmasq was not running; started it');
            } catch (e) {
                log.warn('Could not start dnsmasq: ' + e.message);
            }
        }
    }
};
