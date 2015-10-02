#!/bin/bash -e 

echo "Stopping the engine..."
systemctl stop fabmo

echo "Fetching new versions..."
cd /fabmo/engine
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

echo "Clearing the approot..."
rm -rf /opt/fabmo/approot
sync

echo "Restarting the engine..."
systemctl start fabmo
