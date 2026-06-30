# ShrimpGuard 选股数据 Web 服务器

## 项目概述

基于 **Nginx + Docker** 的 A 股市场数据分析仪表盘，提供三大选股策略的每日更新 HTML 报告，同时作为多后端服务的 **反向代理网关**。

- **StrategyA**：个股主力资金流入排行（2024‑10 ~ 2025‑03，已归档）
- **StrategyB**：板块、概念主力资金流入分析（持续更新中）
- **StrategyC**：沪深主板连板数据追踪（2024‑10 ~ 2025‑06，已归档）

| 服务 | 端口 | 说明 |
|------|------|------|
| 选股主站 | 8080 (HTTPS) | 三大策略报告，由 ShrimpGuard 密码保护 |
| 作业管理 | 80 (HTTP) | 作业提交追踪工具（无认证） |
| NoVNC | 81 (HTTPS) | 远程桌面，基于 VNC + websockify |
| OpenClaw | 82 (HTTPS) | 反向代理游戏服务 |
| code-server | 83 (HTTPS) | VS Code Web 版 |
| antigravity | 84 (HTTPS) | 反向代理 antigravity 服务 |
| NextChat | 85 (HTTPS) | ChatGPT Web UI |
| v2raya | 86 (HTTPS) | VPN / 代理客户端 Web 管理面板 |

所有 HTTPS 服务使用自签名证书。

---

## 技术架构

### 容器化
- **docker‑compose.yml** 管理两个容器：
  - `nginx` — 官方 nginx 镜像，映射端口 80~86 + 8080，挂载配置、SSL 证书、站点根目录、错误页面
  - `guard` — Node.js 授权网关（ShrimpGuard），运行在 3000 端口，和 nginx 共用 `shrimp‑net` 桥接网络

### 前端
- 纯 **HTML5 / CSS3 / JavaScript**，无框架依赖
- CSS 自定义属性实现 **亮/暗主题切换**
- 响应式布局支持桌面和移动端
- **反菱 UI**（glassmorphism）设计风格（2026 年新版报告）

### 后端代理 / 网关
- **Nginx**：静态文件服务 + 反向代理 + SSL 终端
- **ShrimpGuard**（node:20‑alpine）：密码认证守卫，通过 `auth_request` 验证 Cookie 令牌避免重复登录
- **Shell 脚本**：数据流水线编排 + VNC 管理 + 版本控制

### 自动化流水线
- **Crontab** 驱动整条数据流程：
  - 交易时段（9:40~14:50 工作日）多次调用 `planb.sh` 抓取板块资金流向
  - 11:35~11:40 盘中数据刷新
  - 15:15 收盘后最终过滤 + 回测 + git 提交推送
- 每日 15:15 自动 `git commit -m "$(date)"` + `git push`

---

## 项目结构

```
WebServer/
├── docker-compose.yml               # Docker Compose 编排（nginx + guard）
├── .gitignore                       # Git 忽略规则
├── README.md                        # 本文件
├── GoogleAccount.md                 # Google 账号凭据（VNC / Chrome 自动化用）
│
├── root/                            # Web 站点根目录（nginx 挂载）
│   ├── index.html                   # 主入口页面，展示策略导航卡片
│   ├── SubPageList.js               # 文章列表数据（仅 StrategyB 活跃）
│   ├── sys_status.html              # 系统监控仪表盘（CPU/内存/磁盘/运行时间）
│   ├── sys_data.json                # 实时系统指标，每 3s 由 sys_monitor.sh 写入
│   ├── icon.png                     # 网站图标
│   ├── HomeworkManagement.html      # 作业管理工具（基于 XLSX.js 的 Excel 处理）
│   ├── StrategyA/                   # 个股主力资金流入策略
│   │   ├── PageMasterStrategyA.html # StrategyA 主索引页
│   │   └── YYYY_MM_DD.html          # 每日分析报告（2024‑10 ~ 2025‑03）
│   ├── StrategyB/                   # 板块概念主力资金流入策略
│   │   ├── PageMasterStrategyB.html # StrategyB 主索引页
│   │   ├── SubPageList.js           # 策略 B 文章列表（60+ 条目）
│   │   ├── Backtest_Result.html     # 回测结果页
│   │   ├── Backtest_Result.png      # 回测图表
│   │   ├── Transaction_Record.html  # 交易记录
│   │   └── YYYY_MM_DD.html          # 每日分析报告（2024‑10 ~ 至今）
│   └── StrategyC/                   # 沪深主板连板数据策略
│       ├── PageMasterStrategyC.html # StrategyC 主索引页
│       └── YYYY_MM_DD.html          # 每日分析报告（2024‑10 ~ 2025‑06）
│
├── nginx/                           # Nginx 配置与辅助服务
│   ├── default.conf                 # Nginx 主配置 —— 7 个 server block
│   ├── ssl/
│   │   ├── atm.crt                  # 自签名 SSL 证书
│   │   └── atm.key                  # 私钥
│   ├── error-pages/                 # 各服务自定义 50x 错误页面
│   │   ├── antigravity_error.html
│   │   ├── code_error.html
│   │   ├── homework_error.html
│   │   ├── nextchat_error.html
│   │   ├── novnc_error.html
│   │   ├── openclaw_error.html
│   │   ├── stock_error.html
│   │   └── v2raya_error.html
│   └── guard/                       # ShrimpGuard 授权网关
│       ├── Dockerfile               # 基于 node:20-alpine 构建
│       ├── package.json             # express + cookie-parser
│       ├── config.json              # 密码 & 令牌密钥配置
│       ├── server.js                # Node.js 认证服务器
│       └── public/login.html        # 登录页面（"ShrimpGuard" / "Shrimp Guardian"）
│
├── filesh/                          # 自动化 Shell 脚本
│   ├── webserver.sh                 # git add/commit/push，信息为当日日期
│   ├── crontableupdate.sh           # 更新系统 crontab（数据任务 + sys_monitor）
│   ├── planb.sh                     # StrategyB 数据流水线
│   ├── planc.sh                     # StrategyC 数据流水线
│   ├── vncstart.sh                  # 安装配置 VNC + NoVNC（XFCE，端口 5900/5901）
│   └── vncstop.sh                   # 启动 v2raya 容器后重启服务器
│
├── sys_monitor.sh                   # 持续采集 CPU/内存/磁盘/运行时间（每 3s）
├── sys_monitor_start.sh             # 后台启动系统监控脚本（nohup）
└── restart_monitor.sh               # 杀死并重启系统监控脚本
```

---

## ShrimpGuard 认证机制

网关模块 `nginx/guard/` 基于 Node.js / Express 实现轻量密码认证：

1. 用户访问 HTTPS 选股主站（端口 8080），Nginx 通过 `auth_request` 向 guard 发送子请求验证 Cookie
2. 未认证 → HTTP 401 → Nginx 内部重定向至登录页 `login.html`
3. 登录页 POST 密码 → guard 校验 → 设置 `shrimp_auth` 令牌 Cookie（7 天有效，httpOnly）
4. 此后子请求均返回 200，Nginx 放行访问站点内容

**默认密码**：`cdk991014`

---

## 数据流水线

| 时间（工作日） | 脚本 | 动作 |
|---------------|------|------|
| 9:40 / 11:25 / 13:00 / 14:00 / 14:50 | `planb.sh 1` | 获取当日板块资金流向 |
| 11:35 ~ 11:40 | `planb.sh mid` | 获取盘中数据 |
| 14:00 | `planb.sh 2` | 过滤数据 |
| 15:05 ~ 15:15 | `planb.sh 3` | 最终过滤 + 回测 + git 推送 |
| 15:15 | `webserver.sh` | 提交所有更改并推送远程仓库 |

策略 A / C 的生成脚本位于 `/home/lighthouse/workspace/stockB/` 和 `stockC/`，不在本仓库中。

---

## 运维与维护

### Docker 部署
```bash
docker compose up -d       # 启动所有服务
docker compose stop        # 停止服务
docker compose restart     # 重启服务
```

### Nginx 配置修改后生效
```bash
docker compose exec nginx nginx -s reload
```

### 日志查看
```bash
docker compose logs -f nginx      # Nginx 日志
docker compose logs -f guard      # 网关日志
```

### 登录容器
```bash
docker compose exec nginx sh
docker compose exec guard sh
```

### 系统监控
- `sys_status.html` 提供实时 Web 仪表盘（自动每 3s 刷新数据）
- 运行 `bash restart_monitor.sh` 重启监控进程

### 更新 Crontab
```bash
bash filesh/crontableupdate.sh
```

---

## 安全注意事项

- HTTPS 使用自签名证书，浏览器访问会提示不安全，可点击"高级 → 继续前往"
- 密码和令牌密钥存储在 `nginx/guard/config.json` 中
- Google 账号凭据记录在 `GoogleAccount.md`（未纳入版本控制忽略）
- `sys_data.json` 已被 `.gitignore` 排除，避免实时数据被提交
- 前端页面均已添加 `no-cache` 头，防止浏览器缓存旧版本

---

## 故障排除

| 现象 | 排查方法 |
|------|----------|
| 页面无法访问 | `docker compose ps` 检查容器状态 |
| Nginx 配置错误 | `docker compose exec nginx nginx -t` |
| 页面显示旧内容 | 强制刷新（Ctrl+F5）或清除浏览器缓存 |
| 脚本执行失败 | 检查执行权限 `chmod +x filesh/*.sh` |
| 数据未更新 | 检查 crontab: `crontab -l` |

---

## 联系方式

如有问题或建议，请联系：**1769248893@qq.com**

---

> **最后更新**：2026‑06‑30  
> **项目状态**：正常运行，每日更新  
> **部署环境**：腾讯云 Lighthouse（Ubuntu 22.04）  
> **数据规模**：StrategyA 236 篇 / StrategyB 320+ 篇（持续更新） / StrategyC 322 篇
