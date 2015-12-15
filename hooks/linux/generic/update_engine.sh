#!/bin/bash 

echo "Stopping the engine..."
systemctl stop fabmo

echo "Fetching new versions..."
cd /fabmo/engine
git fetch origin --tags
git checkout master
git pull

echo "Updating to version $1..."
git checkout $1

echo "Installing dependencies..."
npm install --production

echo "Clearing the approot..."
rm -rf /opt/fabmo/approot

echo "Restarting the engine..."
systemctl start fabmo
