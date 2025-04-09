const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const rateLimiter = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

app.set('trust proxy', 1);
app.use(compression());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));
app.set('view engine', 'ejs');

// Allow all CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// 📌 Required by original Growtopia client
app.post('/growtopia/server_data.php', (req, res) => {
    res.send(`
        server|157.230.218.22
        port|17091
        type|1
        #maint|Server under maintenance.
        beta_server|127.0.0.1
        beta_port|17091
        meta|GloryPs
        RTENDMARKERBS1001
    `);
});

// 🌐 Login page
app.all('/player/login/dashboard', (req, res) => {
    let tData = {};
    try {
        const uData = JSON.stringify(req.body).split('"')[1].split('\\n');
        for (let i = 0; i < uData.length - 1; i++) {
            const d = uData[i].split('|');
            tData[d[0]] = d[1];
        }
        if (tData['tankIDName'] && tData['tankIDPass']) {
            return res.redirect('/player/growid/login/validate');
        }
    } catch (err) {
        console.log('Dashboard parse error:', err);
    }
    res.render(path.join(__dirname, 'public/html/dashboard.ejs'), { data: tData });
});

// ✅ GrowID login validation
app.post('/player/growid/login/validate', (req, res) => {
    const _token = req.body._token || '';
    const growId = req.body.growId || '';
    const password = req.body.password || '';

    const token = Buffer.from(`_token=${_token}&growId=${growId}&password=${password}`).toString('base64');

    res.send({
        status: 'success',
        message: 'Account Validated.',
        token: token,
        url: '',
        accountType: 'growtopia'
    });
});

// ✅ NEW: Skip register and allow connection
app.post('/player/growid/register/skip', (req, res) => {
    const tankIDName = req.body.growId || 'Guest';
    const token = Buffer.from(`_token=skip&growId=${tankIDName}&password=none`).toString('base64');

    res.send({
        status: 'success',
        message: 'Account Created.',
        token: token,
        url: '',
        accountType: 'growtopia'
    });
});

// ✅ GrowID token check (important for reconnections)
app.post('/player/growid/checkToken', async (req, res) => {
    const { refreshToken, clientData } = req.body;

    if (!refreshToken || !clientData) {
        return res.status(400).send({ status: "error", message: "Missing refreshToken or clientData" });
    }

    try {
        const decoded = Buffer.from(refreshToken, 'base64').toString('utf-8');
        const replaced = decoded.replace(/(_token=)[^&]*/, `$1${Buffer.from(clientData).toString('base64')}`);
        const token = Buffer.from(replaced).toString('base64');

        res.send({
            status: "success",
            message: "Token is valid.",
            token: token,
            url: "",
            accountType: "growtopia"
        });
    } catch (err) {
        console.log('checkToken error:', err);
        res.status(500).send({ status: "error", message: "Internal Server Error" });
    }
});

// ✅ Backup Growtopia database route
app.all('/db/growtopia/server', (req, res) => {
    res.sendStatus(200); // Just to stop 404s
});

// 🧾 Catch all remaining /player requests
app.all('/player/*', (req, res) => {
    res.status(301).redirect('https://api.yoruakio.tech/player/' + req.path.slice(8));
});

// 🌍 Root
app.get('/', (req, res) => {
    res.send('Growtopia Login URL is active!');
});

// Start server
app.listen(5000, () => {
    console.log('Listening on port 5000');
});
