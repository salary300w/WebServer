#!/bin/bash
pkill -f sys_monitor.sh
nohup /root/workspace/WebServer/sys_monitor.sh > /dev/null 2>&1 &
