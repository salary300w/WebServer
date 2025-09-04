#!/bin/bash

# 定义允许的参数列表
allowed_commands=("z" "b" "l" "u" "c" "y")

# 检查是否有参数传入
if [ $# -eq 0 ]; then
    echo -e "Error:缺少参数\n脚本支持以下参数:\nz 创建今日数据 做占位使用\nb 爬取今日收盘前可买数据\nl 爬取今日收盘后可买数据\nu 创建今日数据\nc 筛选昨日数据\ny 更新昨日可买票的涨跌数据"
    exit 1
fi
cd /root/workspace/stockA

# $0 是脚本名
# $1, $2, ... 是位置参数
if [ "$1" == "z" ]; then
    /root/workspace/myenv/bin/python3 CreateTemplate.py
elif [ "$1" == "b" ]; then
    /root/workspace/myenv/bin/python3 TodayDataBuy.py
    git checkout .
elif [ "$1" == "l" ]; then
    /root/workspace/myenv/bin/python3 TodayDataBuy.py
elif [ "$1" == "u" ]; then
    /root/workspace/myenv/bin/python3 TodayData.py
elif [ "$1" == "c" ]; then
    /root/workspace/myenv/bin/python3 YesterdayData.py
else
    /root/workspace/myenv/bin/python3 YesterdayDataSell.py
    git add .
    git commit -m "$(date)"
fi
