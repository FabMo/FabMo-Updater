#!/bin/sh

echo "Starting here service $1"
#start the service with start_service.sh
systemctl daemon-reload
systemctl start $1