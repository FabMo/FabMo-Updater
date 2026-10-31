#!/bin/bash

# Update the FabMo updater in /fabmo-updater to a ref from GitHub (typically 'master')
# Usage: update_updater.sh <ref> [repo_url]
#
# The updater cannot rework its own tree while running from it, so this stages a
# complete, verified copy at /fabmo-updater-staging and only swaps it in once it
# is known good. The swap + restart runs in a transient systemd unit
# (systemd-run) because this script is a child of fabmo-updater.service -
# stopping the service directly would kill the script mid-swap. The previous
# install is kept at /fabmo-updater.old for manual rollback.

REF="${1:-master}"
REPO="${2:-https://github.com/FabMo/FabMo-Updater.git}"
STAGING=/fabmo-updater-staging
CURRENT=/fabmo-updater

function fail
{
	echo "UPDATER UPDATE FAILED: $1" 1>&2
	rm -rf "$STAGING"
	exit 1
}

echo "Updating the FabMo updater to '$REF' from $REPO"

# This script runs as root but git refuses repos owned by other users unless whitelisted
git config --global --get-all safe.directory 2> /dev/null | grep -qx "$STAGING" || \
	git config --global --add safe.directory "$STAGING" || fail "Could not mark $STAGING as a safe git directory"

rm -rf "$STAGING"

echo "Cloning '$REF'..."
git clone --branch "$REF" "$REPO" "$STAGING" || fail "Could not clone '$REF' from $REPO (is the tool online?)"

cd "$STAGING" || fail "No staging directory"

# Reuse the installed node_modules and only run npm install if dependencies changed
# (the updater has no build step, so production dependencies are all it needs)
if [ -d "$CURRENT/node_modules" ]; then
	echo "Copying current node_modules into staging..."
	cp -a "$CURRENT/node_modules" "$STAGING/node_modules" || fail "Could not copy node_modules into staging"
fi
if [ ! -d "$STAGING/node_modules" ] || ! cmp -s "$CURRENT/package-lock.json" "$STAGING/package-lock.json"; then
	echo "Installing dependencies (this can take several minutes)..."
	npm install --production --unsafe-perm || fail "Could not install dependencies with npm"
else
	echo "Dependencies unchanged - reusing current node_modules"
fi
sync

echo "Checking the staged updater..."
node --check server.js || fail "Staged server.js failed its syntax check"
node --check updater.js || fail "Staged updater.js failed its syntax check"

echo "Saving version information..."
VERSION=`git describe 2> /dev/null`
if [ -z "$VERSION" ]; then
	VERSION="$REF-`git rev-parse --short HEAD`"
fi
DATE=`date -u +%Y-%m-%dT%H:%M:%S.000Z`
echo "{\"type\":\"dev\", \"date\":\"$DATE\", \"number\":\"$VERSION\"}" > version.json
sync

echo "Swapping in the new updater and restarting it (this page will disconnect briefly)..."
systemctl reset-failed fabmo-updater-swap 2> /dev/null
systemd-run --collect --unit=fabmo-updater-swap bash -c "\
	systemctl stop fabmo-updater; \
	rm -rf $CURRENT.old; \
	mv $CURRENT $CURRENT.old && \
	{ mv $STAGING $CURRENT || mv $CURRENT.old $CURRENT; }; \
	sync; \
	systemctl start fabmo-updater" || fail "Could not schedule the updater swap"

echo "Update to $VERSION staged successfully. Restarting the updater now."
