#!/bin/bash

set -e

echo "Stopping the updater..."
systemctl stop fabmo-updater

echo "Remounting root partition read-write"
mount -w -o remount /

# DANGER ZONE

echo "Fetching new versions..."
cd /fabmo/updater
git reset --hard HEAD
git fetch origin --tags
git checkout master
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
	echo "{\"number\" : \"$VERSION\" }" > /fabmo/updater/version.json
else
	rm /fabmo/updater/version.json || true
fi
sync

echo "Remounting root partition read only"
mount -r -o remount /

# END DANGER ZONE

echo "Restarting the updater..."
systemctl start fabmo-updater
