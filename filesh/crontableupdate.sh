#!/bin/bash

# 先清空现有 crontab
crontab -r 2>/dev/null

# 定义新任务（可多条）
TASKS=(
"40,50 09,10,13,14 * * 1-5 bash /root/workspace/planb.sh z"
"35 11 * * 1-5 bash /root/workspace/planb.sh z"
"05 15 * * 1-5 bash /root/workspace/planb.sh b"
"10 15 * * 1-5 bash /root/workspace/planb.sh l"
"15 15 * * 1-5 bash /root/workspace/webserver.sh"
)

# 逐条写入
for job in "${TASKS[@]}"; do
    (crontab -l 2>/dev/null; echo "$job") | crontab -
done

echo "新的 crontab 已更新"
