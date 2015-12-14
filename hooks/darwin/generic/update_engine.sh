#!/bin/bash

cd /fabmo/engine
echo "Fetching updates..."
git fetch origin
echo "Updating to version at $1"
git checkout $1
echo "Installing dependencies..."
npm install --loglevel error
echo "Clearing approot..."
rm -rvf /opt/fabmo/approot
