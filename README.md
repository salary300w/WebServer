# 选股数据 Web 服务器

## 项目概述

这是一个展示股票市场数据分析结果的Web服务器项目，提供三大选股策略模块：
- StrategyA: 主力资金流入排行个股数据
- StrategyB: 板块、概念主力资金流入数据
- StrategyC: 沪深主板连板数据

## 缓存问题解决方案

### 问题描述
当新增HTML网页时，用户需要强制刷新或清除浏览器缓存才能看到新内容。

### 解决方案
本项目采用了双层缓存控制机制：

1. **HTML文件缓存控制**：
   - 在所有HTML文件的`<head>`部分添加了缓存控制meta标签
   - 告诉浏览器不要缓存HTML文件，确保每次都从服务器获取最新内容

2. **Nginx服务器缓存控制**：
   - 创建了自定义的`nginx.conf`配置文件
   - 为HTML文件设置了严格的缓存控制头
   - 为静态资源（JS、CSS、图片）设置了较短的缓存时间（1小时）

## Docker部署

### 构建镜像
```bash
cd /root/workspace/WebServer
docker build -t stock-data-webserver .
```

### 运行容器
```bash
docker run -d -p 80:80 --name stock-data-web stock-data-webserver
```

### 访问方式
在浏览器中访问：`http://localhost`

## 项目结构

```
WebServer/
├── root/                  # 网站根目录
│   ├── index.html         # 首页
│   ├── SubPageList.js     # 子页面列表管理
│   ├── StrategyA/         # 个股资金流入策略
│   ├── StrategyB/         # 板块资金流入策略
│   └── StrategyC/         # 连板数据策略
├── filesh/                # 脚本文件目录
├── nginx.conf             # Nginx配置文件
├── Dockerfile             # Docker构建文件
└── README.md              # 项目说明文档
```

## 缓存控制说明

### 缓存控制头详解
- `Cache-Control: no-cache, no-store, must-revalidate` - 告诉浏览器不要缓存，每次都重新验证
- `Pragma: no-cache` - 兼容HTTP/1.0
- `Expires: 0` - 设置过期时间为立即过期

### 静态资源缓存
- JS、CSS、图片等静态资源设置了1小时的缓存时间
- 这平衡了性能和新鲜度，既保证了页面加载速度，又确保了资源会定期更新

## 注意事项

1. 当添加新的HTML文件时，无需任何特殊操作，浏览器会自动获取最新版本
2. 对于静态资源（JS、CSS、图片），修改后最多需要1小时才能在所有用户浏览器中生效
3. 如果需要立即更新静态资源，可以修改文件名或在URL后添加版本参数（如 `script.js?v=1.1`）

## 联系方式

如果有任何问题或建议，请通过电子邮件1769248893@qq.com联系我们。