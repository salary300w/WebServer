# Hermes WebServer

Nginx + Docker 反向代理网关，承载多服务统一接入与 Hermes 状态监控。

| 服务 | 端口 | 说明 |
|------|------|------|
| 选股主站 | 8080 (HTTPS) | 三大策略报告，密码保护 |
| 作业管理 | 80 (HTTP) | 作业提交追踪工具（无认证） |
| NoVNC | 81 (HTTPS) | 远程桌面 |
| **Hermes 状态** | **82 (HTTPS)** | **Hermes Agent 实时监控面板** |
| code-server | 83 (HTTPS) | VS Code Web 版 |
| antigravity | 84 (HTTPS) | 反向代理 |
| NextChat | 85 (HTTPS) | ChatGPT Web UI |
| v2raya | 86 (HTTPS) | VPN 管理面板 |

所有 HTTPS 使用自签名证书。

---

## 技术架构

### 容器化
- **docker-compose.yml** 管理两个容器：
  - `nginx` — 官方 nginx 镜像，映射端口 80~86 + 8080，多目录挂载
  - `guard` — Node.js 授权网关，运行在 3000 端口，与 nginx 共用 `shrimp-net` 桥接网络

### 前端
- 纯 HTML5 / CSS3 / JavaScript，无框架依赖
- 深色主题，Inter 字体，CSS 自定义属性
- 响应式布局

### 后端代理 / 网关
- **Nginx**：静态文件服务 + 反向代理 + SSL 终端
- **guard**（node:20-alpine）：密码认证守卫，通过 `auth_request` 验证 Cookie 令牌
- 内置 Hermes 状态 API（系统资源 + Agent 信息 + DeepSeek 余额缓存）

---

## 项目结构

```
WebServer/
├── docker-compose.yml           # Docker Compose 编排（nginx + guard）
├── .gitignore
├── README.md
├── GoogleAccount.md             # Google 账号凭据（VNC 用）
│
├── nginx/
│   ├── default.conf             # Nginx 主配置 —— 多 server block
│   ├── ssl/
│   │   ├── atm.crt              # 自签名 SSL 证书
│   │   └── atm.key
│   ├── error-pages/             # 各服务自定义 50x 页面
│   │   ├── homework_error.html
│   │   ├── stock_error.html
│   │   └── ...
│   ├── homework/                # [port 80] 作业管理
│   │   └── index.html
│   ├── hermes-dashboard/        # [port 82] Hermes 状态面板
│   │   ├── index.html           # 监控仪表盘（CPU/内存/磁盘/Agent 状态/余额）
│   │   ├── hermes_icon.ico      # Favicon
│   │   └── hermes_logo.png      # 导航 Logo
│   └── guard/                   # 授权网关
│       ├── Dockerfile
│       ├── package.json
│       ├── config.json          # 密码 & 令牌密钥
│       ├── server.js            # Node.js 认证 + 状态 API 服务器
│       └── public/
│           ├── login.html       # 登录页（Hermes 守卫）
│           ├── hermes_logo.png  # 页面 Logo
│           └── hermes_icon.ico  # 页面 Favicon
│
├── root/                        # [port 8080] 选股主站根目录
│   ├── index.html               # 策略导航页
│   ├── SubPageList.js
│   ├── icon.png
│   ├── StrategyA/               # 个股主力资金流入（已归档）
│   ├── StrategyB/               # 板块概念资金流入（持续更新）
│   └── StrategyC/               # 连板数据追踪（已归档）
│
└── filesh/                      # 自动化 Shell 脚本
    ├── webserver.sh             # git add/commit/push
    ├── crontableupdate.sh       # 更新 crontab
    ├── planb.sh                 # StrategyB 数据流水线
    ├── planc.sh                 # StrategyC 数据流水线
    ├── vncstart.sh              # VNC + NoVNC 配置
    └── vncstop.sh
```

---

## Hermes 状态面板 (port 82)

实时监控仪表盘，展示：

| 卡片 | 内容 |
|------|------|
| 系统资源 | CPU / 内存 / 磁盘仪表盘 + 运行时间 + 系统版本 |
| Agent 状态 | Gateway 状态、运行时长、模型、提供商、**API 余额** |
| 技能 & 内存 | 技能数、分类数、定时任务、记忆空间用量 |

- 每 3 秒自动刷新系统资源
- 每 10 秒刷新 Agent 信息
- 余额通过 DeepSeek API 获取，**服务端 5 分钟缓存**，前台 15ms 秒出

---

## 认证机制

网关模块 `nginx/guard/` 基于 Node.js / Express 实现轻量密码认证：

1. 访问 HTTPS 选股主站（端口 8080），Nginx 通过 `auth_request` 验证 Cookie
2. 未认证 → HTTP 401 → 重定向至 `login.html`
3. 登录 POST 密码 → guard 校验 → 设置 `shrimp_auth` 令牌 Cookie（7 天，httpOnly）
4. 此后子请求均返回 200，Nginx 放行

**默认密码**：`cdk991014`

---

## 数据流水线

| 时间（工作日） | 脚本 | 动作 |
|---------------|------|------|
| 9:40 / 11:25 / 13:00 / 14:00 / 14:50 | `planb.sh 1` | 获取板块资金流向 |
| 11:35 ~ 11:40 | `planb.sh mid` | 盘中数据 |
| 15:05 ~ 15:15 | `planb.sh 3` | 最终过滤 + 回测 + git 推送 |

---

## 运维

```bash
docker compose up -d            # 启动所有服务
docker compose restart           # 重启
docker compose exec nginx nginx -s reload   # 重载 Nginx 配置
docker compose logs -f nginx     # Nginx 日志
docker compose logs -f guard     # 网关日志
```

---

## 安全注意事项

- HTTPS 使用自签名证书，浏览器会提示"不安全"，点击"高级 → 继续前往"
- 密码和令牌密钥存储在 `nginx/guard/config.json`
- Google 账号凭据在 `GoogleAccount.md`（已 `.gitignore`）
- 前端页面均已添加 `no-cache` 头

---

> **最后更新**：2026-07-08  
> **项目状态**：正常运行，每日更新  
> **部署环境**：腾讯云 Lighthouse（Ubuntu 22.04）  
