#!/bin/bash

# 定义允许的参数列表
allowed_commands=("z" "b" "l" "u" "c" "y")

# 检查是否有参数传入
if [ $# -eq 0 ]; then
    echo -e "Error:缺少参数\n脚本支持以下参数:\nz 创建今日数据\nb 更新昨日涨跌数据"
    exit 1
fi
cd /root/workspace/stockB

# $0 是脚本名
# $1, $2, ... 是位置参数
if [ "$1" == "z" ]; then
    /root/workspace/myenv/bin/python3 Getfundflow.py
elif [ "$1" == "b" ]; then
    /root/workspace/myenv/bin/python3 Yesterdayfunflow.py
    git add .
    git commit -m "$(date)"
fi