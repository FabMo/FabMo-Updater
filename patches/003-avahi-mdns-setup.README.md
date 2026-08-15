# Avahi mDNS Setup for FabMo

## Overview
This patch (003) sets up Avahi daemon to provide mDNS (multicast DNS) resolution for `fabmo.local`, making FabMo accessible without knowing the IP address.

## Problem Solved
**Issue 1: Static IP PCs cannot connect to FabMo**
- Corporate/educational PCs often have manually configured static IPs (e.g., 10.0.1.50/24)
- These PCs ignore DHCP offers from FabMo's dnsmasq server
- Traffic to 192.168.44.1 gets dropped because it's on a different subnet

**Solution:** With Avahi, users can access `http://fabmo.local` instead of `http://192.168.44.1`. mDNS resolution works via link-local multicast, bypassing subnet routing issues.

## How It Works
1. Avahi daemon advertises the hostname `fabmo` on the local network
2. Client devices can resolve `fabmo.local` to the actual IP address (192.168.44.1, 192.168.42.1, or LAN IP)
3. Works on:
   - **macOS/iOS**: Native mDNS support (Bonjour)
   - **Linux**: Avahi client (usually pre-installed)
   - **Windows 10+**: Native mDNS support
   - **Android**: mDNS support via network service discovery

## Files Installed
- `/etc/avahi/avahi-daemon.conf` - Main Avahi configuration
- `/etc/avahi/services/fabmo.service` - HTTP service advertisement

## Resources
Source files located in:
```
/fabmo_image_builder/resources/avahi/
├── avahi-daemon.conf
└── fabmo.service
```

## Patch Behavior
- **Idempotent**: Safe to run multiple times
- **Conditional**: Skips if resources directory not present
- **Package Installation**: Automatically installs `avahi-daemon` if needed
- **Service Management**: Enables and starts avahi-daemon
- **Verification**: Tests that fabmo.local resolves after installation

## Testing
After applying patch:
```bash
# On the Raspberry Pi
sudo avahi-resolve -n fabmo.local
# Should output: fabmo.local    192.168.44.1 (or current IP)

# From client PC (Linux/Mac)
ping fabmo.local

# From any device
# Open browser to: http://fabmo.local
```

## Compatibility
- Works in all network modes (LAN, Direct, AP)
- Does NOT replace IP-based access (both work)
- Fallback: If mDNS fails, IP addresses still work

## Related Changes
This patch complements:
- Patch 002: Network connection restoration
- Mobile-optimized dnsmasq configuration
- Captive portal handling for mobile devices

## Image Builder Integration
✅ **COMPLETED** - Avahi is now integrated into `/fabmo_image_builder/build-fabmo-image.sh`:

**Package installation** (in `install_packages_and_configure()`):
```bash
apt-get install -y ... avahi-daemon avahi-utils
```

**Configuration files** (in `copy_all_files()`):
```bash
# Avahi mDNS Configuration for fabmo.local access
install_file "$RESOURCE_DIR/avahi/avahi-daemon.conf" "/etc/avahi/avahi-daemon.conf"
install_file "$RESOURCE_DIR/avahi/fabmo.service" "/etc/avahi/services/fabmo.service"
```

**Service enablement** (in `load_and_initialize_systemd_services()`):
```bash
systemctl enable avahi-daemon.service
```

This means:
- **New SD card images**: Include Avahi pre-configured and ready
- **Existing SD cards**: Get Avahi via this patch during updater startup
- **Complete coverage**: All systems (new and existing) will have fabmo.local support

## Troubleshooting
**fabmo.local doesn't resolve:**
- Check service: `systemctl status avahi-daemon`
- Check network: `avahi-browse -a` (shows all advertised services)
- Restart: `sudo systemctl restart avahi-daemon`

**Works on some devices but not others:**
- Windows: Ensure "DNS Client" service is running
- Android: Some apps don't support mDNS (use IP as fallback)
- Check firewall: mDNS uses UDP port 5353

## User Documentation
Tell users they can now access FabMo using either:
- **By hostname**: `http://fabmo.local` (works with any network configuration)
- **By IP**: `http://192.168.44.1` (direct), `http://192.168.42.1` (AP), or LAN IP
