const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const app = express();
const port = 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

// ── In-memory cache ──
const cache = { balance: null, balanceCurrency: 'CNY', balanceAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchBalance() {
    const now = Date.now();
    if (cache.balance !== null && (now - cache.balanceAt) < CACHE_TTL) {
        return; // fresh enough
    }
    try {
        const HOME = '/hostroot/home/lighthouse/.hermes';
        const envPath = HOME + '/.env';
        if (!fs.existsSync(envPath)) return;
        const envRaw = fs.readFileSync(envPath, 'utf8');
        const keyMatch = envRaw.match(/^DEEPSEEK_API_KEY=(.+)$/m);
        if (!keyMatch) return;
        const resp = await fetch('https://api.deepseek.com/user/balance', {
            headers: { 'Authorization': 'Bearer ' + keyMatch[1].trim() }
        });
        if (resp.ok) {
            const balData = await resp.json();
            if (balData && balData.balance_infos && balData.balance_infos.length > 0) {
                cache.balance = balData.balance_infos[0].total_balance;
                cache.balanceCurrency = balData.balance_infos[0].currency || 'CNY';
                cache.balanceAt = now;
            }
        }
    } catch (e) {
        console.error('获取余额失败:', e.message);
    }
}

// Pre-warm cache on startup
fetchBalance();
// Keep cache fresh in background every 5 min
setInterval(fetchBalance, CACHE_TTL);

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// 实时读取“本子”里的密码
function getConfig() {
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('读取本子失败，使用应急保底配置:', err);
        return { password: 'atm', token_secret: 'emergency_fallback_888' };
    }
}

app.get('/verify', (req, res) => {
    const config = getConfig();
    if (req.cookies.hermes_auth === config.token_secret) {
        res.status(200).send('OK');
    } else {
        res.status(401).send('Unauthorized');
    }
});

app.post('/do-login', (req, res) => {
    const { password } = req.body;
    const config = getConfig();
    
    if (password === config.password) {
        res.cookie('hermes_auth', config.token_secret, { 
            maxAge: 604800000, 
            httpOnly: true, 
            path: '/',
            sameSite: 'Lax'
        });
        res.redirect('/index.html');
    } else {
        res.redirect('/login.html?error=1');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('hermes_auth');
    res.redirect('/login.html');
});

// === 系统状态 API ===

function parseCpuLine(data) {
    const line = data.split('\n').find(l => l.startsWith('cpu '));
    if (!line) return null;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    return { user: parts[0], nice: parts[1], system: parts[2], idle: parts[3], iowait: parts[4], irq: parts[5], softirq: parts[6] };
}

function parseMemValue(data, key) {
    const m = data.match(new RegExp('^' + key + ':\\s+(\\d+)', 'm'));
    return m ? parseInt(m[1]) : 0;
}

function formatUptime(data) {
    const sec = parseInt(data.split(' ')[0]) || 0;
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return d > 0 ? d + '天' + h + '小时' : h + '小时' + m + '分钟';
}

app.get('/api/status', (req, res) => {
    try {
        const stat1 = fs.readFileSync('/host/proc/stat', 'utf8');
        const cpu1 = parseCpuLine(stat1);

        setTimeout(() => {
            try {
                const stat2 = fs.readFileSync('/host/proc/stat', 'utf8');
                const cpu2 = parseCpuLine(stat2);

                const totalDelta = (cpu2.user - cpu1.user) + (cpu2.nice - cpu1.nice)
                    + (cpu2.system - cpu1.system) + (cpu2.idle - cpu1.idle)
                    + (cpu2.iowait - cpu1.iowait) + (cpu2.irq - cpu1.irq)
                    + (cpu2.softirq - cpu1.softirq);
                const idleDelta = cpu2.idle - cpu1.idle;
                const cpu = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta * 100).toFixed(1) : '0';

                const memInfo = fs.readFileSync('/host/proc/meminfo', 'utf8');
                const memTotal = parseMemValue(memInfo, 'MemTotal');
                const memAvail = parseMemValue(memInfo, 'MemAvailable');
                const memory = memTotal > 0 ? ((memTotal - memAvail) / memTotal * 100).toFixed(1) : '0';

                const uptime = formatUptime(fs.readFileSync('/host/proc/uptime', 'utf8'));

                const dfOut = execSync('df /hostroot', { encoding: 'utf8', timeout: 3000 });
                const dfLast = dfOut.trim().split('\n').pop().split(/\s+/);
                const disk = dfLast[4] ? dfLast[4].replace('%', '') : '0';

                let hostname = 'unknown';
                try { hostname = fs.readFileSync('/hostroot/etc/hostname', 'utf8').trim(); } catch (e) {}

                let osName = 'Linux';
                try {
                    const osData = fs.readFileSync('/hostroot/etc/os-release', 'utf8');
                    const m = osData.match(/PRETTY_NAME="([^"]+)"/);
                    if (m) osName = m[1];
                } catch (e) {}

                res.json({ cpu, memory, disk, uptime, hostname, os: osName });
            } catch (err) {
                console.error('状态采集失败:', err);
                res.status(500).json({ error: '采集失败' });
            }
        }, 200);
    } catch (err) {
        console.error('状态采集失败:', err);
        res.status(500).json({ error: '采集失败' });
    }
});

// === Hermes 信息 API ===

function calcElapsed(startTicks) {
    const clkTck = 100;
    try {
        const uptimeSec = parseFloat(fs.readFileSync('/host/proc/uptime', 'utf8').split(' ')[0]);
        const runningSec = uptimeSec - (startTicks / clkTck);
        if (runningSec < 0) return '刚刚';
        const d = Math.floor(runningSec / 86400);
        const h = Math.floor((runningSec % 86400) / 3600);
        const m = Math.floor((runningSec % 3600) / 60);
        return d > 0 ? d + '天' + h + '小时' : h + '小时' + m + '分钟';
    } catch (e) { return '--'; }
}

app.get('/api/hermes/info', async (req, res) => {
    const BASE = '/hostroot/home/lighthouse/.hermes';
    // 探测当前活跃 profile（切换 soul 后会变化）
    let activeProfile = 'default';
    try {
        const ap = fs.readFileSync(BASE + '/active_profile', 'utf8').trim();
        if (ap && ap !== 'default') activeProfile = ap;
    } catch (e) {}
    const HOME = activeProfile === 'default'
        ? BASE
        : BASE + '/profiles/' + activeProfile;

    try {
        // 1. Config
        let model = 'unknown', provider = 'unknown';
        try {
            const cfg = fs.readFileSync(HOME + '/config.yaml', 'utf8');
            const mm = cfg.match(/^\s{2}default:\s*(\S+)/m);
            const pm = cfg.match(/^\s{2}provider:\s*(\S+)/m);
            if (mm) model = mm[1];
            if (pm) provider = pm[1];
        } catch (e) {}

        // 2. Gateway process — scan host processes directly, not dependent on containers
        let gatewayRunning = false, gatewayUptime = '--';
        try {
            const pids = fs.readdirSync('/hostroot/proc').filter(p => /^\d+$/.test(p));
            for (const pid of pids) {
                try {
                    const cmdline = fs.readFileSync('/hostroot/proc/' + pid + '/cmdline', 'utf8').replace(/\0/g, ' ').trim();
                    if (cmdline.includes('gateway') && cmdline.includes('hermes') && !cmdline.includes('guard')) {
                        const procStat = fs.readFileSync('/hostroot/proc/' + pid + '/stat', 'utf8');
                        const closeParen = procStat.lastIndexOf(')');
                        if (closeParen !== -1) {
                            const after = procStat.substring(closeParen + 2).split(' ');
                            const startTicks = parseInt(after[19]);
                            gatewayUptime = calcElapsed(startTicks);
                            gatewayRunning = true;
                        }
                        break;
                    }
                } catch (e) { /* skip */ }
            }
        } catch (e) {}

        // 3. Skills
        let skillCount = 0;
        let skillCategories = [];
        try {
            const cats = fs.readdirSync(HOME + '/skills/');
            skillCategories = cats.filter(c => !c.startsWith('.')).sort();
            for (const cat of skillCategories) {
                const dir = HOME + '/skills/' + cat;
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const sp = dir + '/' + item;
                    if (fs.statSync(sp).isDirectory() && fs.existsSync(sp + '/SKILL.md')) {
                        skillCount++;
                    }
                }
            }
        } catch (e) {}

        // 4. Memory store — read limits from config.yaml (fallback hardcoded)
        let memoryChars = 0, memoryLimit = 4400, userChars = 0, userLimit = 2750;
        try {
            const cfg = fs.readFileSync(HOME + '/config.yaml', 'utf8');
            const ml = cfg.match(/memory_char_limit:\s*(\d+)/);
            if (ml) memoryLimit = parseInt(ml[1]);
            const ul = cfg.match(/user_char_limit:\s*(\d+)/);
            if (ul) userLimit = parseInt(ul[1]);
        } catch (e) {}
        try {
            const memPath = HOME + '/memories/MEMORY.md';
            if (fs.existsSync(memPath))
                memoryChars = fs.readFileSync(memPath, 'utf8').replace(/\n/g, '').length;
            const usrPath = HOME + '/memories/USER.md';
            if (fs.existsSync(usrPath))
                userChars = fs.readFileSync(usrPath, 'utf8').replace(/\n/g, '').length;
        } catch (e) {}

        // 5. Cron jobs
        let cronCount = 0;
        try {
            const jobFile = HOME + '/cron/jobs.json';
            if (fs.existsSync(jobFile)) {
                const raw = fs.readFileSync(jobFile, 'utf8');
                const jobs = JSON.parse(raw);
                cronCount = Array.isArray(jobs) ? jobs.length : 0;
            }
        } catch (e) {}

        // 6. API balance (cached, refetches every 5 min)
        const balance = cache.balance || '--';
        const balanceCurrency = cache.balanceCurrency || 'CNY';
        // Trigger background refresh if stale (doesn't block response)
        fetchBalance();

        res.json({
            model, provider,
            gatewayRunning, gatewayUptime,
            skillCount, skillCategories,
            memoryChars, memoryLimit, userChars, userLimit,
            cronCount,
            balance, balanceCurrency,
            profile: activeProfile
        });
    } catch (err) {
        console.error('采集 Hermes 信息失败:', err);
        res.status(500).json({ error: '采集失败' });
    }
});


// === Docker 容器状态 API ===
app.get('/api/docker', async (req, res) => {
    try {
        const containers = await fetchDockerContainers();
        res.json({ containers });
    } catch (err) {
        res.status(200).json({ containers: [], error: err.message });
    }
});

// === Docker 容器操作 API ===
app.post('/api/docker/action', express.json(), async (req, res) => {
    const { name, action, password } = req.body;
    if (!name || !action) {
        return res.status(400).json({ error: '需要 name 和 action 参数' });
    }
    const validActions = ['start', 'stop', 'restart'];
    if (!validActions.includes(action)) {
        return res.status(400).json({ error: 'action 必须是 start/stop/restart' });
    }
    // Require password for all container operations
    const config = getConfig();
    if (!password || password !== config.password) {
        return res.status(403).json({ error: '密码错误', needPassword: true });
    }
    // Safety: don't allow stopping the guard or nginx container
    if ((name === 'guard' || name === 'nginx') && action === 'stop') {
        return res.status(403).json({ error: '禁止停止 guard/nginx 容器' });
    }
    try {
        const result = await dockerApi('/containers/' + name + '/' + action, 'POST');
        res.json({ success: true, action, name, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function dockerApi(path, method) {
    method = method || 'GET';
    return new Promise((resolve, reject) => {
        const opts = {
            socketPath: '/var/run/docker.sock',
            path: path,
            method: method,
            timeout: method === 'POST' ? 30000 : 5000
        };
        const r = http.request(opts, (resp) => {
            let body = '';
            resp.on('data', chunk => body += chunk);
            resp.on('end', () => {
                if (resp.statusCode >= 200 && resp.statusCode < 400) {
                    try { resolve(body ? JSON.parse(body) : { status: resp.statusCode }); }
                    catch (e) { resolve({ status: resp.statusCode, raw: body }); }
                } else {
                    reject(new Error('HTTP ' + resp.statusCode + ': ' + body.substring(0, 100)));
                }
            });
        });
        r.on('error', reject);
        r.setTimeout(30000, () => { r.destroy(); reject(new Error('timeout')); });
        r.end();
    });
}

async function fetchDockerContainers() {
    const list = await dockerApi('/containers/json?all=true');
    // Hide nginx and guard (infra containers) — stopping them kills the dashboard
    const filtered = list.filter(c => {
        const name = c.Names[0].replace(/^\//, '');
        return name !== 'nginx' && name !== 'guard';
    });
    // Fetch stats for all containers in parallel
    const statsResults = await Promise.allSettled(
        filtered.map(c => dockerApi('/containers/' + c.Id + '/stats?stream=false'))
    );
    const statsList = [];
    for (let i = 0; i < filtered.length; i++) {
        const c = filtered[i];
        const statsResult = statsResults[i];
        if (statsResult.status === 'fulfilled') {
            const stats = statsResult.value;
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
            const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
            const cpuPct = sysDelta > 0 ? ((cpuDelta / sysDelta) * stats.cpu_stats.online_cpus * 100).toFixed(2) : '0';
            const memUsage = stats.memory_stats.usage || 0;
            const memLimit = stats.memory_stats.limit || 1;
            const memPct = ((memUsage / memLimit) * 100).toFixed(1);
            
            statsList.push({
                name: c.Names[0].replace(/^\//, ''),
                id: c.Id.substring(0, 12),
                state: c.State,
                status: c.Status,
                cpu: cpuPct + '%',
                mem: formatBytes(memUsage),
                memPct: memPct + '%',
                memLimit: formatBytes(memLimit),
                ports: c.Ports.map(p => p.publicPort || p.privatePort).filter(Boolean).join(', ') || '-'
            });
        } else {
            statsList.push({
                name: c.Names[0].replace(/^\//, ''),
                id: c.Id.substring(0, 12),
                state: c.State,
                status: c.Status,
                cpu: '-',
                mem: '-',
                memPct: '-',
                memLimit: '-',
                ports: '-'
            });
        }
    }
    // Sort: running first, then stopped
    statsList.sort((a, b) => {
        if (a.state === 'running' && b.state !== 'running') return -1;
        if (a.state !== 'running' && b.state === 'running') return 1;
        return 0;
    });
    return statsList;
}

function formatBytes(bytes) {
    if (!bytes) return '0B';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return val.toFixed(i > 0 ? 1 : 0) + units[i];
}

// === TOP 进程 API ===
app.get('/api/processes', (req, res) => {
    try {
        // Read directly from /proc via hostroot (which has all host processes)
        const pids = fs.readdirSync('/hostroot/proc').filter(p => /^\d+$/.test(p));
        const processes = [];
        
        for (const pid of pids) {
            try {
                const statRaw = fs.readFileSync('/hostroot/proc/' + pid + '/stat', 'utf8');
                const closeParen = statRaw.lastIndexOf(')');
                const after = statRaw.substring(closeParen + 2).split(' ');
                const state = after[0];
                const rssPages = parseInt(after[21]) || 0;
                
                // Only include processes with meaningful memory
                if (rssPages < 100) continue; // skip tiny processes (less than ~400KB)
                
                let cmdline = '';
                try {
                    cmdline = fs.readFileSync('/hostroot/proc/' + pid + '/cmdline', 'utf8').replace(/\0/g, ' ').trim();
                } catch (e) { continue; }
                if (!cmdline) continue;
                
                const rssMB = ((rssPages * 4096) / 1024 / 1024).toFixed(1);
                
                processes.push({
                    pid: pid,
                    state: state,
                    rss: rssMB + 'MB',
                    command: cmdline.substring(0, 60)
                });
            } catch (e) { /* skip failed reads */ }
        }
        
        // Sort by RSS descending, take top 10
        processes.sort((a, b) => parseFloat(b.rss) - parseFloat(a.rss));
        res.json({ processes: processes.slice(0, 12) });
    } catch (err) {
        res.status(200).json({ processes: [], error: err.message });
    }
});

// === 服务健康检测 API ===
app.get('/api/services/health', async (req, res) => {
    const PORTS = [81, 82, 83, 84, 85, 86];
    const NAMES = {81:'Dashboard',82:'noVNC',83:'CodeServe',84:'Antigrav',85:'NextChat',86:'VPN Dash'};
    const result = {};
    // Temporarily disable TLS verification for internal health checks
    const origEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    for (const port of PORTS) {
        try {
            const r = await fetch('https://nginx:' + port + '/', { signal: AbortSignal.timeout(3000) });
            result[port] = { name: NAMES[port], status: (r.status >= 200 && r.status < 400) ? 'online' : 'offline', code: r.status };
        } catch (e) {
            result[port] = { name: NAMES[port], status: 'offline', code: 0, error: e.message };
        }
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = origEnv;
    res.json(result);
});

app.listen(port, () => {
    console.log(`Hermes Guard (读本子模式) 正在 ${port} 端口值班...`);
});
