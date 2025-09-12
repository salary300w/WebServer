#!/bin/bash

# 定义允许的参数列表
allowed_commands=("z" "b" "l")

# 检查是否有参数传入
if [ $# -eq 0 ]; then
    echo -e "Error:缺少参数\n脚本支持以下参数:\nz 创建今日数据\nb 筛选昨日数据\nl 筛选前日数据\n"
    exit 1
fi
cd /root/workspace/stockC

# $0 是脚本名
# $1, $2, ... 是位置参数
if [ "$1" == "z" ]; then
    /root/workspace/myenv/bin/python3 Gettripleboard0.py
elif [ "$1" == "b" ]; then
    /root/workspace/myenv/bin/python3 Gettripleboard1.py
elif [ "$1" == "l" ]; then
    /root/workspace/myenv/bin/python3 Gettripleboard2.py
    git add .
    git commit -m "$(date)"
fi
