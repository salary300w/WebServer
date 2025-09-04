#!/bin/bash

# 先清空现有 crontab
crontab -r 2>/dev/null

# 定义新任务（可多条）
TASKS=(
"00 10 * * 1-5 bash /root/workspace/planc.sh z"
"32 11 * * 1-5 bash /root/workspace/planc.sh b"
"53 14 * * 1-5 bash /root/workspace/planc.sh b"
"03 15 * * 1-5 bash /root/workspace/planc.sh l"
"10 15 * * 1-5 bash /root/workspace/planc.sh u"
"25 15 * * 1-5 bash /root/workspace/planc.sh c"
"40 15 * * 1-5 bash /root/workspace/planc.sh y"
"05 10 * * 1-5 bash /root/workspace/plana.sh z"
"48 14 * * 1-5 bash /root/workspace/plana.sh b"
"07 15 * * 1-5 bash /root/workspace/plana.sh l"
"15 15 * * 1-5 bash /root/workspace/plana.sh u"
"30 15 * * 1-5 bash /root/workspace/plana.sh c"
"50 15 * * 1-5 bash /root/workspace/plana.sh y"
"00 16 * * 1-5 /root/workspace/myenv/bin/python3 /root/workspace/stockB/getfundflow.py"
"30 16 * * 1-5 bash /root/workspace/webserver.sh"
)

# 逐条写入
for job in "${TASKS[@]}"; do
    (crontab -l 2>/dev/null; echo "$job") | crontab -
done

echo "新的 crontab 已更新"
