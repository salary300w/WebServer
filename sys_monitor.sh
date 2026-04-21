#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TARGET="${SCRIPT_DIR}/root/sys_data.json"

HOST_NAME=$(hostname)
OS_NAME=$(grep -E "^PRETTY_NAME" /etc/os-release | cut -d= -f2 | tr -d '"')
if [ -z "$OS_NAME" ]; then OS_NAME=$(uname -s); fi

while true; do
    MEM=$(free -m | awk 'NR==2{printf "%.1f", $3*100/$2}')
    DISK=$(df -h / | awk '$NF=="/"{print $5}' | sed 's/%//')
    CPU=$(vmstat 1 2 | tail -1 | awk '{print 100 - $15}')
    
    # 获取运行时间并转换为中文格式
    U_SEC=$(awk '{print int($1)}' /proc/uptime)
    D=$((U_SEC/86400))
    H=$(((U_SEC%86400)/3600))
    M=$(((U_SEC%3600)/60))
    
    if [ "$D" -gt 0 ]; then
        UPTIME_STR="${D}天${H}小时"
    else
        UPTIME_STR="${H}小时${M}分钟"
    fi

    cat <<JSON > "$TARGET.tmp"
{
  "memory": "$MEM",
  "disk": "$DISK",
  "cpu": "$CPU",
  "uptime": "$UPTIME_STR",
  "hostname": "$HOST_NAME",
  "os": "$OS_NAME"
}
JSON
    mv "$TARGET.tmp" "$TARGET"
    sleep 3
done
