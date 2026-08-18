#!/bin/bash
#
# diagnose-avahi.sh
# 
# Comprehensive diagnostic for Avahi mDNS setup
# Run with: sudo bash diagnose-avahi.sh

echo "========================================"
echo "FabMo Avahi mDNS Diagnostic"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ ERROR: Must run as root (use sudo)"
    exit 1
fi

UPDATER_RESOURCE_DIR="/fabmo-updater/patches/resources/003-avahi"
echo "1. Checking resource files (bundled in updater)..."
if [ -d "$UPDATER_RESOURCE_DIR" ]; then
    echo "   ✓ Resource directory exists: $UPDATER_RESOURCE_DIR"
    if [ -f "$UPDATER_RESOURCE_DIR/avahi-daemon.conf" ]; then
        echo "   ✓ Source file exists: avahi-daemon.conf"
        echo "     $(wc -l < "$UPDATER_RESOURCE_DIR/avahi-daemon.conf") lines"
    else
        echo "   ❌ Missing: avahi-daemon.conf"
    fi
    
    if [ -f "$UPDATER_RESOURCE_DIR/fabmo.service" ]; then
        echo "   ✓ Source file exists: fabmo.service"
        echo "     $(wc -l < "$UPDATER_RESOURCE_DIR/fabmo.service") lines"
    else
        echo "   ❌ Missing: fabmo.service"
    fi
else
    echo "   ❌ Resource directory not found: $UPDATER_RESOURCE_DIR"
    echo "      Updater package is incomplete - patch will skip"
fi

echo ""
echo "2. Checking Avahi installation..."
if command -v avahi-daemon &> /dev/null; then
    echo "   ✓ avahi-daemon is installed"
    echo "     Version: $(avahi-daemon --version | head -1)"
else
    echo "   ❌ avahi-daemon is NOT installed"
    echo "      Install with: sudo apt-get install avahi-daemon avahi-utils"
fi

if command -v avahi-resolve &> /dev/null; then
    echo "   ✓ avahi-utils is installed"
else
    echo "   ⚠  avahi-utils is NOT installed (needed for testing)"
fi

echo ""
echo "3. Checking target files..."
if [ -f "/etc/avahi/avahi-daemon.conf" ]; then
    echo "   ✓ /etc/avahi/avahi-daemon.conf exists"
    
    # Check if it has the FabMo customization
    if grep -q "host-name=fabmo" /etc/avahi/avahi-daemon.conf; then
        echo "     ✓ Contains 'host-name=fabmo' (FabMo config)"
    else
        echo "     ❌ Does NOT contain 'host-name=fabmo' (default config)"
        echo "        This file needs to be replaced by patch"
    fi
else
    echo "   ❌ /etc/avahi/avahi-daemon.conf does NOT exist"
fi

if [ -f "/etc/avahi/services/fabmo.service" ]; then
    echo "   ✓ /etc/avahi/services/fabmo.service exists"
else
    echo "   ❌ /etc/avahi/services/fabmo.service does NOT exist"
    echo "      This file MUST be created by patch"
fi

echo ""
echo "4. Checking Avahi daemon service..."
if systemctl is-enabled avahi-daemon &> /dev/null; then
    echo "   ✓ avahi-daemon is enabled"
else
    echo "   ⚠  avahi-daemon is NOT enabled"
fi

if systemctl is-active avahi-daemon &> /dev/null; then
    echo "   ✓ avahi-daemon is running"
else
    echo "   ❌ avahi-daemon is NOT running"
    echo "      Start with: sudo systemctl start avahi-daemon"
fi

echo ""
echo "5. Checking patch tracking..."
if [ -f "/opt/patches/patches-applied.json" ]; then
    echo "   ✓ Patches tracking file exists"
    if grep -q "003-avahi-mdns-setup" /opt/patches/patches-applied.json; then
        echo "     ✓ Patch 003 is recorded as applied"
        grep "003-avahi-mdns-setup" /opt/patches/patches-applied.json
    else
        echo "     ❌ Patch 003 NOT in tracking file"
        echo "        This means the patch has never been applied"
    fi
else
    echo "   ⚠  Patches tracking file does not exist"
    echo "      Location: /opt/patches/patches-applied.json"
    echo "      Will be created when first patch runs"
fi

echo ""
echo "6. Testing mDNS resolution..."
if command -v avahi-resolve &> /dev/null; then
    if avahi-resolve -n fabmo.local &> /dev/null; then
        echo "   ✓ fabmo.local RESOLVES!"
        avahi-resolve -n fabmo.local
    else
        echo "   ❌ fabmo.local does NOT resolve"
    fi
else
    echo "   ⚠  Cannot test (avahi-utils not installed)"
fi

echo ""
echo "7. Checking updater logs..."
if [ -f "/var/log/fabmo.log" ]; then
    echo "   Recent patch-related log entries:"
    grep -i "patch\|avahi" /var/log/fabmo.log | tail -20
else
    echo "   ⚠  Log file not found: /var/log/fabmo.log"
fi

echo ""
echo "========================================"
echo "Diagnostic complete"
echo "========================================"
echo ""
echo "Quick fixes:"
echo "  - If resources missing: Clone/update fabmo_image_builder repo"
echo "  - If avahi not installed: sudo apt-get install avahi-daemon avahi-utils"
echo "  - If patch not applied: Restart updater (sudo systemctl restart fabmo-updater)"
echo "  - Manual test: cd /fabmo-updater && sudo node test-avahi-patch.js"
echo ""
