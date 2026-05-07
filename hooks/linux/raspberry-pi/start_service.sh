#!/bin/sh

echo "Starting here service $1"
#start the service with start_service.sh
systemctl daemon-reload
systemctl start $1

# After FabMo restarts during an update, refresh AP-mode IP reporting.
if [ "$1" = "fabmo" ]; then
	systemctl restart fabmo-ip-reporting.service >/dev/null 2>&1 || true
fi