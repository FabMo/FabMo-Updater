# Patch 002: Network Connection Restoration and Protection

## Purpose

This patch ensures that critical NetworkManager connection profiles are:
1. **Present** - Restores missing connection files
2. **Correct** - Verifies content matches expected configuration
3. **Protected** - Sets immutable flags to prevent accidental deletion

## Background

During testing, it was discovered that users with desktop access can accidentally delete network connections through the NetworkManager UI. This breaks FabMo's multi-mode networking system, which requires three specific connection profiles:

- **lan-connection** - DHCP client for LAN networks
- **direct-connection** - Static IP (192.168.44.1) for direct PC connection
- **wlan0_ap** - Access Point mode (192.168.42.1)

Without these connections, the tool may become unreachable and require manual SD card recovery.

## What This Patch Does

### Detection (check function)
The patch checks for:
- Missing connection files
- Incorrect file content (compared to source)
- Missing immutable protection flags
- Missing dnsmasq configurations
- Availability of source files (patch skips if image builder not present)

### Restoration (apply function)
When needed, the patch:
1. **Backs up** existing files to `/tmp/fabmo-network-backup-[timestamp]`
2. **Removes** temporary immutable flags (to allow updates)
3. **Restores** all connection profiles from `/fabmo_image_builder/resources/`
4. **Restores** dnsmasq configurations (ap-only.conf, direct-mode.conf)
5. **Sets** proper permissions (600 for connections, 644 for dnsmasq)
6. **Applies** immutable flags to protect connections
7. **Reloads** NetworkManager and dnsmasq services
8. **Disables** standalone hostapd (NetworkManager manages the AP)

### Immutable Flag Protection

After restoration, connection files are protected with the Linux immutable flag (`chattr +i`). This means:
- ✅ NetworkManager can still read and use the connections
- ✅ NetworkManager can modify connection settings (passwords, IP addresses, etc.)
- ❌ Files cannot be deleted (even by root) without first removing the flag
- ❌ Files cannot be renamed or moved

To manually modify a protected connection:
```bash
sudo chattr -i /etc/NetworkManager/system-connections/lan-connection
# make changes
sudo chattr +i /etc/NetworkManager/system-connections/lan-connection
```

## When This Patch Runs

### Automatic Application
- **First boot** after updater installation (if connections are missing)
- **After any update** that includes this patch
- **On demand** if connections become corrupted or deleted

### Conditions for Skipping
The patch will skip if:
- Source directory `/fabmo_image_builder/resources/` doesn't exist
- All connections are present, correct, and protected
- Not running on a Raspberry Pi platform

## Reboot Requirement

This patch sets `requiresReboot: true` because:
- NetworkManager connection changes require service restart
- Some network interfaces may need re-initialization
- Ensures clean state for all networking components

Users will see a reboot recommendation in the updater logs and UI.

## Testing This Patch

### Simulate the Problem
```bash
# Remove a connection (simulates accidental deletion)
sudo chattr -i /etc/NetworkManager/system-connections/lan-connection
sudo rm /etc/NetworkManager/system-connections/lan-connection

# Restart the updater to trigger patch
sudo systemctl restart fabmo-updater
```

### Verify Restoration
```bash
# Check if connection is back
ls -la /etc/NetworkManager/system-connections/

# Verify immutable flag is set
lsattr /etc/NetworkManager/system-connections/lan-connection
# Should show: ----i--------e------- (note the 'i' flag)

# Check patch was applied
curl http://localhost:9876/system/patches | json_pp
```

### Manual Testing
You can also test the patch directly:
```bash
cd /fabmo-updater
node -e "var p = require('./patches/002-network-connections-restore.js'); \
         p.check().then(function(needs) { \
             console.log('Needs applying:', needs); \
             if (needs) return p.apply(); \
         }).then(function(result) { \
             console.log('Result:', result); \
         }).catch(console.error);"
```

## Related Files

- **Image Builder**: `/fabmo_image_builder/restore-network-config.sh` - Standalone recovery script
- **Resources**: `/fabmo_image_builder/resources/NetworkManager/` - Source connection files
- **Resources**: `/fabmo_image_builder/resources/dnsmasq/` - Source dnsmasq configs

## Integration with Image Builder

The image builder now also sets immutable flags during initial SD card creation (see `build-fabmo-image.sh`). This means:
- **New SD cards**: Start with protected connections
- **Existing SD cards**: Get protection via this patch during update

This dual approach ensures all systems are protected, regardless of when they were created.

## Maintenance

If you need to update a connection profile:

1. **In Image Builder** (for new SD cards):
   - Update file in `/fabmo_image_builder/resources/NetworkManager/system-connections/`
   - Rebuild SD card image

2. **In Updater Patch** (for existing systems):
   - The patch automatically detects content changes via hash comparison
   - When users update, the patch will restore the new version
   - No code changes needed - just update the source files

## Support Documentation

For end users who encounter this issue, provide these instructions:

**If you can still access the tool via ethernet:**
```bash
sudo /fabmo_image_builder/restore-network-config.sh
```

**If completely locked out:**
- Remove SD card
- Mount on another Linux system
- Run the restoration script or manually copy files
- Reinsert and boot

## Future Enhancements

Possible improvements for future versions:
- Dashboard notification when connections are missing
- Recovery button in the network manager UI
- Log monitoring to detect when connections disappear
- Periodic health checks (e.g., daily via cron)
