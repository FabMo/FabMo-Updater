#!/bin/bash 
set -e

echo "Clearing settings..."
rm -rf /opt/fabmo

echo "Uninstalling engine..."
rm -rf /fabmo

echo "Cloning new copy of the engine..."
git clone $1 /fabmo
cd /fabmo
git fetch origin --tags
git pull

echo "Updating to version $2..."
git checkout $2
sync

echo "Installing dependencies..."
npm install --production
sync
