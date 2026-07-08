const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
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
    if (req.cookies.shrimp_auth === config.token_secret) {
        res.status(200).send('OK');
    } else {
        res.status(401).send('Unauthorized');
    }
});

app.post('/do-login', (req, res) => {
    const { password } = req.body;
    const config = getConfig();
    
    if (password === config.password) {
        res.cookie('shrimp_auth', config.token_secret, { 
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
    res.clearCookie('shrimp_auth');
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
    const HOME = '/hostroot/home/lighthouse/.hermes';
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

        // 2. Gateway process
        let gatewayRunning = false, gatewayUptime = '--';
        try {
            const pidData = JSON.parse(fs.readFileSync(HOME + '/gateway.pid', 'utf8'));
            const pid = pidData.pid;
            const procStat = fs.readFileSync('/hostroot/proc/' + pid + '/stat', 'utf8');
            const closeParen = procStat.lastIndexOf(')');
            if (closeParen !== -1) {
                const after = procStat.substring(closeParen + 2).split(' ');
                const startTicks = parseInt(after[19]);
                gatewayUptime = calcElapsed(startTicks);
                gatewayRunning = true;
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

        // 4. Memory store
        let memoryChars = 0, memoryLimit = 2200;
        let userChars = 0, userLimit = 1375;
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
            profile: 'default'
        });
    } catch (err) {
        console.error('采集 Hermes 信息失败:', err);
        res.status(500).json({ error: '采集失败' });
    }
});

app.listen(port, () => {
    console.log(`虾卫士 (读本子模式) 正在 ${port} 端口值班...`);
});
