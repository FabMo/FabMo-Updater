#!/bin/bash
 
set -e

cd /fabmo/engine
echo "Fetching updates..."
git fetch origin
echo "Updating to version '$1'"
git checkout $1
echo "Installing dependencies..."
npm install --loglevel error
echo "Clearing approot..."
rm -rvf /opt/fabmo/approot

echo "Saving version information..."
set +e
git describe
INVALID_VERSION=$?
set -e
if [ $INVALID_VERSION -eq 0 ]; then
	VERSION=`git describe`
	echo "{\"version\" : \"$VERSION\" }" > /fabmo/engine/version.json
else
	rm /fabmo/engine/version.json || true
fi

echo "Update completed successfully."

