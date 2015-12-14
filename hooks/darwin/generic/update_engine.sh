#!/bin/bash -v

cd /fabmo/engine
git fetch origin
git checkout $1
npm install
rm -rf /opt/fabmo/approot
