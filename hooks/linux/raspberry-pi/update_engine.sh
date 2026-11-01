#!/bin/bash

# Update the FabMo engine in /fabmo to a ref from GitHub (typically 'master')
# Usage: update_engine.sh <ref> [repo_url]
#
# Modern .fmp deploys replace the whole /fabmo tree and strip its .git, so this
# script re-attaches a git repository in place before checking out the ref.
# Unlike .fmp packages (which ship node_modules and a built dashboard), a git
# checkout contains neither, so this script runs npm install and the webpack
# dashboard build as needed. Machine settings live in /opt/fabmo and /fabmo-def
# and are not touched.

REF="${1:-master}"
REPO="${2:-https://github.com/FabMo/FabMo-Engine.git}"

function fail
{
	echo "UPDATE FAILED: $1" 1>&2
	sync
	systemctl start fabmo
	exit 1
}

echo "Updating FabMo to '$REF' from $REPO"

echo "Stopping the engine..."
systemctl stop fabmo

cd /fabmo || fail "No /fabmo directory"

# This script runs as root but /fabmo may be owned by another user (dev units);
# git refuses to touch such a repo ("dubious ownership") unless it is whitelisted
git config --global --get-all safe.directory 2> /dev/null | grep -qx /fabmo || \
	git config --global --add safe.directory /fabmo || fail "Could not mark /fabmo as a safe git directory"

# Re-attach git if a package deploy wiped it
if [ ! -d .git ]; then
	echo "No git repository in /fabmo - reattaching..."
	git init -b master . || fail "Could not initialize a git repository in /fabmo"
fi

if git remote get-url origin > /dev/null 2>&1; then
	git remote set-url origin "$REPO"
else
	git remote add origin "$REPO" || fail "Could not add the origin remote"
fi

# Remember the dependency state so npm install can be skipped if nothing changed
LOCK_BEFORE=""
if [ -f package-lock.json ]; then
	LOCK_BEFORE=`md5sum package-lock.json | cut -d' ' -f1`
fi

echo "Fetching '$REF'..."
git fetch --tags origin "$REF" || fail "Could not fetch '$REF' from $REPO (is the tool online?)"

echo "Checking out '$REF'..."
git checkout -f -B "$REF" FETCH_HEAD || fail "Could not check out '$REF'"
sync

LOCK_AFTER=""
if [ -f package-lock.json ]; then
	LOCK_AFTER=`md5sum package-lock.json | cut -d' ' -f1`
fi

# webpack is a devDependency; deployed units only have production node_modules,
# so the build tooling check matters even when the lockfile didn't change
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ] || [ ! -d node_modules/webpack ]; then
	echo "Installing dependencies (this can take several minutes)..."
	npm install --unsafe-perm || fail "Could not install dependencies with npm"
	sync
else
	echo "Dependencies unchanged - skipping npm install"
fi

echo "Building the dashboard..."
npm run build || fail "Could not build the dashboard"
sync

echo "Saving version information..."
VERSION=`git describe 2> /dev/null`
if [ -z "$VERSION" ]; then
	VERSION="$REF-`git rev-parse --short HEAD`"
fi
echo "{\"number\" : \"$VERSION\" }" > /fabmo/version.json

echo "Clearing the approot so system apps refresh..."
rm -rf /opt/fabmo/approot
sync

echo "Reload Systemd Services..."
systemctl daemon-reload

echo "Starting FabMo ..."
systemctl start fabmo

echo "Update to $VERSION complete."
sleep 5
