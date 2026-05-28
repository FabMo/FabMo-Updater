# FabMo-Updater System Patches

## Overview

The system patches mechanism allows the FabMo-Updater to apply OS-level fixes, configuration updates, and other system modifications that would otherwise require a new SD card image. This provides a way to deploy critical fixes quickly without waiting for a full image rebuild.

## How It Works

1. **During Startup**: The updater runs all patches early in the initialization sequence (after configuration is loaded, before starting the web server)

2. **Tracking**: Applied patches are tracked in `/opt/patches/patches-applied.json` with timestamps (note: this is outside `/opt/fabmo/` so it survives updater reinstalls)

3. **Idempotency**: Each patch can be run multiple times safely. The `check()` function determines if the patch needs to be applied

4. **Sequential Execution**: Patches run in alphabetical order by filename

## Creating a New Patch

### 1. File Naming Convention

Name your patch file with a numeric prefix for ordering:
- `001-description.js`
- `002-another-patch.js`
- etc.

### 2. Patch Module Structure

Each patch is a Node.js module that exports the following:

```javascript
module.exports = {
    // Unique identifier for this patch (typically matches filename without .js)
    id: '001-udev-rules-usb',
    
    // Human-readable description of what this patch does
    description: 'Update udev rules for USB device management',
    
    // Version/date when this patch was added (for documentation)
    version: '2026-05-27',
    
    // Optional: Set to true if this patch requires a system reboot to take full effect
    requiresReboot: true,
    
    // Function that checks if the patch needs to be applied
    // Returns: true if patch should be applied, false if already applied
    check: function() {
        // Your check logic here
        // Example: check if a file exists or has certain content
        return needsToBeApplied;
    },
    
    // Function that applies the patch
    // Returns: Promise that resolves when complete, rejects on error
    apply: function() {
        // Your patch logic here
        // Example: modify files, run commands, etc.
        return Promise.resolve();
    }
};
```

### 3. Best Practices

**Check Function:**
- Should be fast and non-destructive
- Return `true` only if the patch genuinely needs to be applied
- Handle missing files/directories gracefully
- Use file hashing to detect content changes

**Apply Function:**
- Should be idempotent (safe to run multiple times)
- Create backups before modifying existing files
- Use detailed logging (`log.info()`, `log.error()`, etc.)
- Handle errors gracefully and return rejected promises on failure
- Consider whether the system needs a reboot/restart

**Reboot Flag:**
- Set `requiresReboot: true` if changes require a system restart to take full effect
- Examples: udev rules, kernel modules, system services, network configuration
- The system will log a prominent warning and set a status flag
- The UI can use this to prompt the user for a reboot

**Error Handling:**
- If a patch fails, other patches will still run
- Failed patches are logged but don't stop the updater from starting
- Test your patches thoroughly before deploying

### 4. Example Patch

See [001-udev-rules-usb.js](./001-udev-rules-usb.js) for a complete working example that:
- Checks if a system file needs updating
- Backs up the existing file
- Writes new content
- Reloads the affected system service (udev)

## Testing Patches

### Local Testing

1. Add your patch file to the `/patches` directory
2. Restart the updater
3. Check logs for patch execution: `tail -f /var/log/fabmo.log | grep patches`
4. Verify the patch was applied: `curl http://localhost:9876/system/patches`3. Check tracking file: `cat /opt/patches/patches-applied.json`
### Manual Execution

You can test a patch module directly in Node.js:

```javascript
var patch = require('./patches/001-my-patch.js');

patch.check().then(function(needsApplying) {
    console.log('Needs applying:', needsApplying);
    if (needsApplying) {
        return patch.apply();
    }
}).then(function() {
    console.log('Success!');
}).catch(function(err) {
    console.error('Error:', err);
});
```

## API Endpoint

Check patch status via HTTP:

```bash
GET /system/patches
```

Returns:
```json
{
  "status": "success",
  "data": {
    "patches": [
      {
        "id": "001-udev-rules-usb",
        "description": "Update udev rules for USB device management",
        "version": "2026-05-27",
        "applied": "2026-05-27T10:30:45.123Z",
        "requiresReboot": true
      }
    ],
    "rebootRequired": true
  }
}
```

The `rebootRequired` field at the top level indicates whether any applied patches require a system reboot.

### Using Reboot Status in the UI

The updater's frontend can check for reboot requirements and prompt the user:

```javascript
// Check patch status
fetch('/system/patches')
  .then(res => res.json())
  .then(data => {
    if (data.data.rebootRequired) {
      // Show a notification or modal prompting the user to reboot
      showRebootPrompt();
    }
  });
```

You can also check the updater's status object which includes the `rebootRequired` flag after patches are applied during startup.

## Patch Lifecycle

### When to Add a Patch

- System configuration needs updating across all devices
- OS-level fix is required urgently
- Networking or hardware configuration changes
- Security updates to system files
- udev rules, systemd services, or other system modifications

### Reboot Requirements

Some patches require a system reboot to take full effect:
- **udev rules**: While rules can be reloaded, a reboot ensures all USB devices are properly re-enumerated
- **Kernel modules**: Loading new modules or module parameters
- **System services**: Some systemd service changes
- **Network configuration**: Major networking stack changes

When a patch with `requiresReboot: true` is applied:
1. A prominent warning is logged to the console
2. The updater status includes `rebootRequired: true`
3. The API endpoint shows which patches require reboots
4. The UI should prompt the user to reboot when convenient

### When to Remove a Patch

- A new SD card image has been released that includes the fix
- All active devices have been updated to the new image
- The patch is no longer relevant (deprecated hardware, etc.)

To remove a patch:
1. Delete the patch file from `/patches/`
2. The tracking file will retain the record that it was applied, but it won't run again
3. Consider leaving it for one release cycle to ensure all devices receive it

## Security Considerations

⚠️ **Important**: Patches run with the same privileges as the updater (typically root on embedded systems).

- Review patch code carefully before deploying
- Only modify files that are necessary
- Validate input and file paths
- Use `fs.existsSync()` before operations
- Prefer atomic operations when possible
- Log all actions for auditing

## Troubleshooting

### Patch Isn't Running

1. Check filename ends with `.js` and follows naming convention
2. Verify module exports all required properties
3. Check logs for error messages during startup
4. Ensure `/opt/patches/` directory is writable

### Patch Runs Every Time

- Your `check()` function is returning `true` every time
- Verify that `check()` properly detects the applied state
- Consider using file hashes or version markers

### Patch Fails Silently

- Check `/var/log/fabmo.log` for error messages
- Ensure `apply()` function returns a Promise
- Add more logging within your patch

### Need to Force Re-apply

1. Edit `/opt/patches/patches-applied.json`
2. Remove the entry for your patch ID
3. Restart the updater

## Examples

### File Replacement Patch

```javascript
var fs = require('fs-extra');
var TARGET = '/etc/some-config.conf';
var NEW_CONTENT = '...';

function check() {
    if (!fs.existsSync(TARGET)) return true;
    var current = fs.readFileSync(TARGET, 'utf8');
    return current !== NEW_CONTENT;
}

function apply() {
    if (fs.existsSync(TARGET)) {
        fs.copySync(TARGET, TARGET + '.backup');
    }
    fs.writeFileSync(TARGET, NEW_CONTENT);
    return Promise.resolve();
}
```

### Command Execution Patch

```javascript
var exec = require('child_process').execSync;

function check() {
    try {
        var output = exec('some-command --version').toString();
        return !output.includes('expected-version');
    } catch(e) {
        return true; // Command failed, needs update
    }
}

function apply() {
    exec('apt-get update');
    exec('apt-get install -y some-package');
    return Promise.resolve();
}
```

### Conditional Patch (Platform-Specific)

```javascript
function check() {
    var config = require('../config');
    var platform = config.updater.get('platform');
    
    // Only apply on Raspberry Pi
    if (platform !== 'raspberry-pi') {
        return false;
    }
    
    // Check if patch is needed
    return needsToBeApplied;
}
```

## Questions?

For more information about the FabMo-Updater architecture, see the main README or refer to the code in [updater.js](../updater.js).
