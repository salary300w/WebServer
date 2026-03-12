const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

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
            maxAge: 86400000, 
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

app.listen(port, () => {
    console.log(`虾卫士 (读本子模式) 正在 3000 端口值班...`);
});
