#!/bin/bash

# 先清空现有 crontab
crontab -r 2>/dev/null

# 定义新任务（可多条）
TASKS=(
"40,50 09 * * 1-5 bash /root/workspace/planb.sh z"
"*/10 10,11,13,14 * * 1-5 bash /root/workspace/planb.sh z"
"05 15 * * 1-5 bash /root/workspace/planc.sh z"
"10 15 * * 1-5 bash /root/workspace/planc.sh b"
"15 15 * * 1-5 bash /root/workspace/planc.sh l"
"20 15 * * 1-5 bash /root/workspace/plana.sh z"
"25 15 * * 1-5 bash /root/workspace/plana.sh z"
"30 15 * * 1-5 bash /root/workspace/plana.sh b"
"35 15 * * 1-5 bash /root/workspace/planb.sh b"
"40 15 * * 1-5 bash /root/workspace/planb.sh l"
"00 16 * * 1-5 bash /root/workspace/webserver.sh"
)

# 逐条写入
for job in "${TASKS[@]}"; do
    (crontab -l 2>/dev/null; echo "$job") | crontab -
done

echo "新的 crontab 已更新"
