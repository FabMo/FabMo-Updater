#!/bin/bash

set -e

echo "Stopping the engine..."
systemctl stop fabmo

echo "Remounting root partition read-write"
mount -w -o remount /

# DANGER ZONE

echo "Fetching new versions..."
cd /fabmo/engine
git reset --hard HEAD
git fetch origin --tags
git checkout master
git fetch origin release:release
git fetch origin rc:rc
git pull

echo "Updating to version $1..."
git checkout $1
sync

echo "Installing dependencies..."
npm install --production
sync

echo "Saving version information..."
set +e
git describe
INVALID_VERSION=$?
set -e
if [ $INVALID_VERSION -eq 0 ]; then
	VERSION=`git describe`
	echo "{\"number\" : \"$VERSION\" }" > /fabmo/engine/version.json
else
	rm /fabmo/engine/version.json || true
fi
sync

echo "Remounting root partition read only"
mount -r -o remount /

# END DANGER ZONE

echo "Clearing the approot..."
rm -rf /opt/fabmo/approot
sync

echo "Restarting the engine..."
systemctl start fabmo

sleep 10
