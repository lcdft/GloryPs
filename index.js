const express = require('express');
const app = express();
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Load configuration
let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Configuration loaded:', config);
} catch (error) {
    console.error('Error loading config.json, using defaults:', error.message);
    config = { block_cheats_mobile_mac: false };
}

app.use(compression({
    level: 5,
    filter: (req, res) => {
        if (req.headers['X-No-Compression']) return false;
        return compression.filter(req, res);
    }
}));

app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.on('finish', () => {
        console.log(`[${req.method}] ${req.url} | Status: ${res.statusCode}`);
    });
    next();
});

app.use(express.json());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after an hour',
}));

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

// --- DASHBOARD (Main Entry) ---
app.all('/player/login/dashboard', function (req, res) {
    let clientData = {};
    let rawData = '';
    
    if (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)) {
        if (req.body.platformID || req.body.tankIDName) { clientData = req.body; }
        else { const keys = Object.keys(req.body); if (keys.length > 0) rawData = keys[0]; }
    } else if (typeof req.body === 'string') { rawData = req.body; }

    if (rawData && Object.keys(clientData).length === 0) {
        const lines = rawData.split(/\r?\n|\\n/);
        lines.forEach(line => {
            const parts = line.split('|');
            if (parts.length >= 2) clientData[parts[0].trim()] = parts.slice(1).join('|').trim();
        });
    }

    // Cheat Detection
    const platformID = clientData.platformID || '0';
    const mac = clientData.mac || '02:00:00:00:00:00';
    if (config.block_cheats_mobile_mac) {
        if ((String(platformID) === '2' || String(platformID) === '4') && mac !== '02:00:00:00:00:00') {
            console.log(`CHEAT DETECTED: ${mac}`);
            return res.render(__dirname + '/public/html/cheat_detected.ejs', { data: clientData });
        }
    }

    res.render(__dirname + '/public/html/dashboard.ejs', { data: clientData });
});

// --- LOGIN FORM ---
app.all('/player/login/form', function (req, res) {
    let clientData = { ...req.body, ...req.query };
    res.render(__dirname + '/public/html/login.ejs', { data: clientData });
});

// --- VALIDATE (Web Login Step) ---
app.all('/player/growid/login/validate', (req, res) => {
    console.log('=== CLIENT VALIDATION REQUEST ===');
    
    // 1. Calculate the Dashboard URL automatically
    // This ensures that whatever IP the player uses to connect, the link matches it.
    const host = req.headers.host || 'localhost:5000';
    const dashboardUrl = `${req.protocol}://${host}/player/login/dashboard`;
    
    console.log(`[INFO] Sending Dashboard URL to client: ${dashboardUrl}`);

    const { type, growId = '', password = '', email = '', gender = 0, _token } = req.body;
    const trimmedGrowId = (growId || '').trim();
    const trimmedPassword = (password || '').trim();
    const isGuestRequest = type === 'guest' || (trimmedGrowId === '' && trimmedPassword === '');

    if (config.block_cheats_mobile_mac) {
        const { platformID = '0', mac = '02:00:00:00:00:00' } = req.body;
        const platformId = String(platformID).trim();
        if ((platformId === '2' || platformId === '4') && mac !== '02:00:00:00:00:00') {
            res.setHeader('Content-Type', 'text/html');
            return res.send(`{"status":"error","message":"Cheats detected.","token":"","url":"","accountType":""}`);
        }
    }

    if (!_token || !type) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid request.","token":"","url":"","accountType":""}`);
    }

    // GUEST LOGIC
    if (isGuestRequest) {
        const guestId = 'Guest' + Math.floor(100000 + Math.random() * 900000);
        const guestPass = 'g' + Math.floor(100000 + Math.random() * 900000);
        const guestEmail = `${guestId.toLowerCase()}@guest.local`;

        const tokenData = `_token=${_token}&type=reg&growId=${guestId}&password=${guestPass}&email=${guestEmail}&gender=${gender}`;
        const token = Buffer.from(tokenData).toString('base64');

        res.setHeader('Content-Type', 'text/html');
        // IMPORTANT: We send 'url' here so guest accounts also get the dashboard popup
        return res.send(`{"status":"success","message":"Guest account created.","token":"${token}","url":"${dashboardUrl}","accountType":"growtopia"}`);
    }

    // NORMAL LOGIC
    if (!trimmedGrowId || !trimmedPassword) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Missing username or password.","token":"","url":"","accountType":""}`);
    }

    if (type === "reg" && !isValidEmail(email)) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid email.","token":"","url":"","accountType":""}`);
    }

    const tokenData = type === 'reg'
        ? `_token=${_token}&type=${type}&growId=${trimmedGrowId}&password=${trimmedPassword}&email=${email}&gender=${gender}`
        : `_token=${_token}&type=${type}&growId=${trimmedGrowId}&password=${trimmedPassword}`;

    const token = Buffer.from(tokenData).toString('base64');

    res.setHeader('Content-Type', 'text/html');
    // IMPORTANT: We send 'url' here so normal accounts get the popup
    res.send(`{"status":"success","message":"Account Validated.","token":"${token}","url":"${dashboardUrl}","accountType":"growtopia"}`);
});

// --- CHECK TOKEN ---
app.all('/player/growid/checkToken', (req, res) => {
    console.log(`[CheckToken] Request from C++ Server`);

    // Ensure we also calculate the URL here, in case the C++ server triggers the popup
    const host = req.headers.host || 'localhost:5000';
    const dashboardUrl = `${req.protocol}://${host}/player/login/dashboard`;

    const incomingToken = req.body.token || req.body.refreshToken;

    if (!incomingToken) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Missing token"}`);
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(JSON.stringify({
        status: "success",
        message: "Token is valid.",
        token: incomingToken,
        url: dashboardUrl, // We send the URL here too
        accountType: "growtopia"
    }));
});

app.all('/', function (req, res) {
    res.redirect('/player/login/dashboard');
});

app.all('/player/login/register', function (req, res) {
    res.render(__dirname + '/public/html/register.ejs', { data: {} });
});

app.listen(5000, function () {
    console.log(`Listening on port 5000`);
});