#!/bin/bash -e 

echo "Stopping the engine..."
systemctl stop fabmo

echo "Clearing settings..."
rm -rf /opt/fabmo

echo "Remounting the root partition as read-write"
mount -w -o remount /

# DANGER ZONE

echo "Uninstalling engine..."
rm -rf /fabmo

echo "Cloning new copy of the engine..."
git clone $1 /fabmo
cd /fabmo
git fetch origin --tags
git fetch origin release:release
git fetch origin rc:rc
git pull

echo "Updating to version $2..."
git checkout $2
sync

echo "Installing dependencies..."
npm install --production

echo "Synchronizing filesystem..."
sync

echo "Remounting the root partition as read only"
mount -r -o remount /
#echo u > /proc/sysrq-trigger
#sleep 1
#mount -w -o remount /home

echo "Restarting the engine..."
systemctl start fabmo
