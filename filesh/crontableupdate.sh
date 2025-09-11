#!/bin/bash

# 先清空现有 crontab
crontab -r 2>/dev/null

# 定义新任务（可多条）
TASKS=(
"40,45,50,55 09 * * 1-5 bash /root/workspace/planb.sh z"
"5,20,35,50 10,11,13,14 * * 1-5 bash /root/workspace/planb.sh z"
"00 10 * * 1-5 bash /root/workspace/planc.sh z"
"40 11 * * 1-5 bash /root/workspace/planc.sh b"
"53 14 * * 1-5 bash /root/workspace/planc.sh b"
"10 15 * * 1-5 bash /root/workspace/planc.sh l"
"20 15 * * 1-5 bash /root/workspace/planc.sh u"
"30 15 * * 1-5 bash /root/workspace/planc.sh c"
"40 15 * * 1-5 bash /root/workspace/planc.sh y"
"05 10 * * 1-5 bash /root/workspace/plana.sh z"
"50 14 * * 1-5 bash /root/workspace/plana.sh b"
"15 15 * * 1-5 bash /root/workspace/plana.sh l"
"25 15 * * 1-5 bash /root/workspace/plana.sh u"
"35 15 * * 1-5 bash /root/workspace/plana.sh c"
"45 15 * * 1-5 bash /root/workspace/plana.sh y"
"50 15 * * 1-5 bash /root/workspace/planb.sh z"
"00 16 * * 1-5 bash /root/workspace/planb.sh b"
"10 16 * * 1-5 bash /root/workspace/webserver.sh"
)

# 逐条写入
for job in "${TASKS[@]}"; do
    (crontab -l 2>/dev/null; echo "$job") | crontab -
done

echo "新的 crontab 已更新"
