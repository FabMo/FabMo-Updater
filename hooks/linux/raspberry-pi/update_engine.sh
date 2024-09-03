#!/bin/bash

function fail
{
	#cd /fabmo
	cd /fabmo
	git reset --hard HEAD
	sync
	mount -r -o remount /
	systemctl start fabmo
	echo "$1" 1>&2
	exit 1
}

function save_version_info
{
	echo "Saving version information..."
	#cd /fabmo
	cd /fabmo
	set +e
	git describe
	INVALID_VERSION=$?
	set -e
	if [ $INVALID_VERSION -eq 0 ]; then
		VERSION=`git describe`
		#echo "{\"number\" : \"$VERSION\" }" > /fabmo/version.json
		echo "{\"number\" : \"$VERSION\" }" > /fabmo/version.json
	else
		#rm /fabmo/version.json || true
		rm /fabmo/version.json || true
	fi
	sync
}

set -e

echo "Stopping the engine..."
systemctl stop fabmo

echo "Remounting root partition read-write"
mount -w -o remount /

# DANGER ZONE

echo "Resetting..."
#cd /fabmo
cd /fabmo
git reset --hard HEAD || fail "Could not reset the repository"

echo "Checking out master..."
git checkout master || fail "Could not checkout master"

echo "Pulling master branch and tags..."
git pull origin --tags || "Could not get remote tags"

echo "Fetching release branches..."
git fetch origin release:release || fail "Could not get remote releases"
git fetch origin rc:rc || fail "Could not get release candidate branch"

echo "Updating to version $1..."
git checkout $1 || fail "Could not checkout version [$1]"
sync

echo "Installing dependencies..."
npm install --production --unsafe-perm || fail "Could not install dependencies with npm"
sync

save_version_info

sleep 3
echo "Remounting root partition read only"
mount -r -o remount / || shutdown
#echo u > /proc/sysrq-trigger
#sleep 1
#mount -w -o remount /home

# END DANGER ZONE

echo "Clearing the approot..."
rm -rf /opt/fabmo/approot
sync

echo "Reload Systemd Services..."
systemctl daemon-reload

echo "Restarting the engine..."
systemctl start fabmo

sleep 15
