#!/bin/bash

# 定义允许的参数列表
allowed_commands=("z" "b")

# 检查是否有参数传入
if [ $# -eq 0 ]; then
    echo -e "Error:缺少参数\n脚本支持以下参数:\n1 创建今日数据\n2 筛选昨日数据\n3 筛选前日数据,并提交推送至远程仓库\n"
    exit 1
fi
cd /root/workspace/stockB

# $0 是脚本名
# $1, $2, ... 是位置参数
if [ "$1" == "1" ]; then
    /root/workspace/myenv/bin/python3 Getfundflow0.py
elif [ "$1" == "2" ]; then
    /root/workspace/myenv/bin/python3 Getfundflow1.py
elif [ "$1" == "3" ]; then
    /root/workspace/myenv/bin/python3 Getfundflow2.py
    git add .
    git commit -m "$(date)"
    git push
    /root/workspace/myenv/bin/python3 Backtest.py
    cp /root/workspace/stockB/Backtest_Result.png /root/workspace/WebServer/root/StrategyB/
fi