#!/bin/sh

# This is a consolidated update script (shim) targeted
# at pre-2.0 updaters with a more primitive update system
# It does most of the heavy lifting itself, with some of
# the scripts that come with the new updater picking up once
# that code is down.

# Write mount the disk
mount -w -o remount /

# Kill the running services
systemctl stop fabmo fabmo-updater

sleep 3

# Expand consolidated update package
mkdir /tmp/consolidated-update
cd /tmp/consolidated-update
tar -xvzf /tmp/consolidated.fmp 

# Obliterate and recreate the engine/updater directories
rm -rf /fabmo/updater /fabmo/engine
mkdir /fabmo/updater /fabmo/engine

# Lay down the engine and updater
cd /fabmo/updater
tar -xvzf /tmp/consolidated-update/updater.tar.gz

cd /fabmo/engine
tar -xvzf /tmp/consolidated-update/engine.tar.gz

# Flush to disk
sync

# Update the G2 firmware
/fabmo/updater/hooks/linux/edison/update_firmware.sh /fabmo/engine/firmware/g2.bin

# Mark done
touch /fabmo/engine/install_token
touch /fabmo/updater/install_token

# Clear the app root
rm -rf /opt/fabmo/approot
sync

# Re-lock the disk
mount -r -o remount /

# Start everyhting back up
systemctl restart fabmo fabmo-updater