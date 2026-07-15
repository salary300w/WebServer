const express = require('express');
const { execFile, spawn } = require('child_process');
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
    sessions.set(token, { createdAt: Date.now() });
    res.json({ response, sessionToken: token });
  } catch (err) {
    console.error('Hermes 调用失败:', err.message);
    res.status(500).json({ error: '阿尼亚暂时不在，等一下再找我吧！' });
  }
});

// ── API: 流式聊天（直接调 DeepSeek API，真·逐 token 流式输出） ──
app.post('/api/chat/stream', async (req, res) => {
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

  // 读取 API key 和模型配置
  const envPath = HERMES_HOME + '/.env';
  const envRaw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const apiKey = (envRaw.match(/^DEEPSEEK_API_KEY=(.+)$/m) || [])[1];
  if (!apiKey) {
    return res.json({ response: '阿尼亚找不到 API Key 了…🥜', sessionToken: token });
  }

  // 读取 Anya 人格设定（SOUL.md）作为 system prompt
  const anyaProfilePath = HERMES_HOME + '/profiles/anya/SOUL.md';
  let systemPrompt = 'You are a helpful assistant.';
  if (fs.existsSync(anyaProfilePath)) {
    systemPrompt = fs.readFileSync(anyaProfilePath, 'utf8').trim();
  }

  const cfg = getModelInfo();
  const model = cfg.model;
  const baseUrl = cfg.provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.deepseek.com';

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const apiRes = await fetch(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey.trim(),
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: trimmed },
        ],
        stream: true,
        max_tokens: 4096,
      }),
    });

    if (!apiRes || !apiRes.ok) {
      const errText = apiRes ? await apiRes.text() : 'no response';
      console.error('DeepSeek API error:', apiRes ? apiRes.status : 'N/A', errText);
      res.write(`data: ${JSON.stringify({ text: '唔…阿尼亚走神了，爸爸再说一遍好不好？🥜' })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ sessionToken: token })}\n\n`);
      res.end();
      return;
    }

    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // Parse DeepSeek SSE: data: {...}\n\n 或 data: [DONE]\n\n
      const parts = buf.split('\n');
      buf = '';

      for (const line of parts) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const chunk = JSON.parse(payload);
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
            }
          } catch (e) {
            // ignore parse errors for incomplete lines
          }
        } else if (line.trim()) {
          // Incomplete line, put it back in buffer
          buf = (buf ? buf + '\n' : '') + line;
        }
      }
    }

    sessions.set(token, { createdAt: Date.now() });
    const cleaned = fullText.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
    res.write(`event: done\ndata: ${JSON.stringify({ sessionToken: token, text: cleaned })}\n\n`);
    res.end();

  } catch (err) {
    console.error('流式聊天失败:', err.message);
    res.write(`event: error\ndata: ${JSON.stringify({ message: '啊！网络断了…阿尼亚连接不上了 🥲' })}\n\n`);
    res.end();
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
      if (code === 0) resolve(cleaned);
      else if (code === null) reject(new Error('请求超时，阿尼亚想太久了…'));
      else reject(new Error(stderr.trim() || `exit code ${code}`));
    });
  });
}

// ── API: 获取可用模型列表（缓存） ──
app.get('/api/models', (req, res) => {
  try {
    const cachePath = HERMES_HOME + '/provider_models_cache.json';
    if (!fs.existsSync(cachePath)) return res.json({ provider: 'deepseek', models: [], current: 'unknown' });

    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const cfg = getModelInfo();
    const provider = cfg.provider;
    const providerData = raw[provider];
    const models = providerData?.models || [];

    res.json({ provider, models, current: cfg.model });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: 从官方接口实时刷新模型列表 ──
app.post('/api/models/refresh', async (req, res) => {
  try {
    const envPath = HERMES_HOME + '/.env';
    const apiKey = fs.existsSync(envPath)
      ? (fs.readFileSync(envPath, 'utf8').match(/^DEEPSEEK_API_KEY=(.+)$/m) || [])[1]
      : null;

    // 从缓存读取已有的模型列表（兜底）
    const cachePath = HERMES_HOME + '/provider_models_cache.json';
    let cachedModels = [];
    if (fs.existsSync(cachePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        cachedModels = raw['deepseek']?.models || [];
      } catch (e) {}
    }

    // 从 DeepSeek API 实时拉取
    let apiModels = [];
    if (apiKey) {
      try {
        const resp = await fetch('https://api.deepseek.com/v1/models', {
          headers: { 'Authorization': 'Bearer ' + apiKey.trim() }
        });
        if (resp.ok) {
          const data = await resp.json();
          apiModels = (data.data || []).map(m => m.id).filter(Boolean);
        }
      } catch (e) {
        console.error('刷新模型列表失败:', e.message);
      }
    }

    // 合并：API 新模型优先，再补上缓存中的模型，去重
    const merged = [...new Set([...apiModels, ...cachedModels])];
    const cfg = getModelInfo();

    res.json({ provider: cfg.provider, models: merged, current: cfg.model, live: !!apiModels.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: 切换模型 ──
app.post('/api/models/switch', (req, res) => {
  const { model } = req.body;
  if (!model || typeof model !== 'string') return res.status(400).json({ error: '模型名不能为空' });

  try {
    const cfgPath = HERMES_HOME + '/config.yaml';
    let cfg = fs.readFileSync(cfgPath, 'utf8');
    const updated = cfg.replace(/^(\s{2}default:\s*)\S+/m, '$1' + model);
    if (updated === cfg) return res.status(400).json({ error: '模型不存在或无需切换' });
    fs.writeFileSync(cfgPath, updated, 'utf8');
    res.json({ success: true, model });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 启动 ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HermesChat backend running on http://127.0.0.1:${PORT}`);
});
