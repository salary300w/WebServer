const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = 3001;
const HERMES_BIN = '/home/lighthouse/.local/bin/hermes';
const HERMES_HOME = '/home/lighthouse/.hermes';

// ── 余额缓存 ──
const cache = { balance: null, currency: 'CNY', at: 0 };
const CACHE_TTL = 5 * 60 * 1000;

async function fetchBalance() {
  const now = Date.now();
  if (cache.balance !== null && (now - cache.at) < CACHE_TTL) return;
  try {
    const envPath = HERMES_HOME + '/.env';
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    const m = raw.match(/^DEEPSEEK_API_KEY=(.+)$/m);
    if (!m) return;
    const resp = await fetch('https://api.deepseek.com/user/balance', {
      headers: { 'Authorization': 'Bearer ' + m[1].trim() }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.balance_infos && data.balance_infos.length > 0) {
        cache.balance = data.balance_infos[0].total_balance;
        cache.currency = data.balance_infos[0].currency || 'CNY';
        cache.at = now;
      }
    }
  } catch (e) {
    console.error('获取余额失败:', e.message);
  }
}
fetchBalance();
setInterval(fetchBalance, CACHE_TTL);

// ── 会话存储 ──
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (now - v.createdAt > SESSION_TTL) sessions.delete(k);
}, 3600_000);

app.use(express.json());

// ── 获取模型和余额 ──
function getModelInfo() {
  try {
    const cfgPath = HERMES_HOME + '/config.yaml';
    if (!fs.existsSync(cfgPath)) return { model: 'unknown', provider: 'unknown' };
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    const mm = cfg.match(/^\s{2}default:\s*(\S+)/m);
    const pm = cfg.match(/^\s{2}provider:\s*(\S+)/m);
    return {
      model: mm ? mm[1] : 'unknown',
      provider: pm ? pm[1] : 'unknown',
    };
  } catch (e) {
    return { model: 'unknown', provider: 'unknown' };
  }
}

// ── API: 信息（模型 + 余额） ──
app.get('/api/info', async (req, res) => {
  const info = getModelInfo();
  await fetchBalance(); // 触发后台刷新
  res.json({
    model: info.model,
    provider: info.provider,
    balance: cache.balance,
    currency: cache.currency,
  });
});

// ── API: 聊天 ──
app.post('/api/chat', async (req, res) => {
  const { message, sessionToken } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: '消息不能为空' });
  }
  const trimmed = message.trim().slice(0, 2000);

  let token = sessionToken;
  let isNew = false;
  if (!token || !sessions.has(token)) {
    token = crypto.randomUUID();
    isNew = true;
  }

  try {
    const response = await callHermes(trimmed, !isNew);
    res.json({ response, sessionToken: token });
  } catch (err) {
    console.error('Hermes 调用失败:', err.message);
    res.status(500).json({ error: '阿尼亚暂时不在，等一下再找我吧！' });
  }
});

function callHermes(message, resume) {
  return new Promise((resolve, reject) => {
    const args = ['chat', '-q', message, '--profile', 'anya', '--quiet'];
    if (resume) args.push('--continue');

    const child = execFile(HERMES_BIN, args, {
      cwd: '/home/lighthouse',
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HOME: '/home/lighthouse', HERMES_HOME },
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', c => stdout += c);
    child.stderr.on('data', c => stderr += c);
    child.on('error', reject);
    child.on('close', (code) => {
      const cleaned = stdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
      if (code === 0 || code === null) resolve(cleaned);
      else reject(new Error(stderr.trim() || `exit code ${code}`));
    });
  });
}

// ── 启动 ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HermesChat backend running on http://127.0.0.1:${PORT}`);
});
