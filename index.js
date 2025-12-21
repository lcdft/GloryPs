const express = require('express');
const app = express();
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

// --- HELPER FUNCTIONS ---
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
    config = { block_cheats_mobile_mac: true };
}

// --- MIDDLEWARE ---
app.use(compression({
    level: 5,
    filter: (req, res) => {
        if (req.headers['X-No-Compression']) return false;
        return compression.filter(req, res);
    }
}));

// We need these BEFORE the logger so req.body is populated
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// --- GLOBAL LOGGER (Everything Logger) ---
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n--- [INCOMING REQUEST] ${timestamp} ---`);
    console.log(`URL:    ${req.method} ${req.url}`);
    console.log(`IP:     ${req.ip || req.connection.remoteAddress}`);
    
    // Log Headers (Important for finding cheat client signatures)
    console.log(`Headers:`, JSON.stringify(req.headers, null, 2));

    // Log Query Parameters (e.g., /login?name=user)
    if (Object.keys(req.query).length > 0) {
        console.log(`Query:  `, JSON.stringify(req.query, null, 2));
    }

    // Log Body Data (Login info, token info, etc.)
    if (req.body && Object.keys(req.body).length > 0) {
        console.log(`Body:   `, JSON.stringify(req.body, null, 2));
    } else {
        console.log(`Body:    [Empty]`);
    }

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    res.on('finish', () => {
        console.log(`--- [RESPONSE SENT] Status: ${res.statusCode} ---\n`);
    });
    next();
});

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
    
    // Check if the body contains the typical Growtopia pipe-delimited string
    if (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)) {
        if (req.body.platformID || req.body.tankIDName) { 
            clientData = req.body; 
        } else { 
            const keys = Object.keys(req.body); 
            if (keys.length > 0) rawData = keys[0]; 
        }
    } else if (typeof req.body === 'string') { 
        rawData = req.body; 
    }

    if (rawData && Object.keys(clientData).length === 0) {
        const lines = rawData.split(/\r?\n|\\n/);
        lines.forEach(line => {
            const parts = line.split('|');
            if (parts.length >= 2) clientData[parts[0].trim()] = parts.slice(1).join('|').trim();
        });
    }

    // Log the parsed client data specifically
    console.log("Parsed Client Data:", clientData);

    // Cheat Detection
    const platformID = clientData.platformID || '0';
    const mac = clientData.mac || '02:00:00:00:00:00';
    if (config.block_cheats_mobile_mac) {
        if ((String(platformID) === '2' || String(platformID) === '4') && mac !== '02:00:00:00:00:00') {
            console.log(`!!! CHEAT DETECTED !!! MAC: ${mac} | Platform: ${platformID}`);
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
    const { type, growId = '', password = '', email = '', gender = 0, _token } = req.body;

    const trimmedGrowId = (growId || '').trim();
    const trimmedPassword = (password || '').trim();
    const isGuestRequest = type === 'guest' || (trimmedGrowId === '' && trimmedPassword === '');

    // Mobile Cheat Detection
    if (config.block_cheats_mobile_mac) {
        const { platformID = '0', mac = '02:00:00:00:00:00' } = req.body;
        const platformId = String(platformID).trim();
        if ((platformId === '2' || platformId === '4') && mac !== '02:00:00:00:00:00') {
            res.setHeader('Content-Type', 'text/html');
            return res.send(`{"status":"error","message":"Cheats detected. Please use the normal Growtopia client.","token":"","url":"","accountType":""}`);
        }
    }

    if (!_token || !type) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid request: Missing token or type.","token":"","url":"","accountType":""}`);
    }

    if (isGuestRequest) {
        const guestId = 'Guest' + Math.floor(100000 + Math.random() * 900000);
        const guestPass = 'g' + Math.floor(100000 + Math.random() * 900000);
        const guestEmail = `${guestId.toLowerCase()}@guest.local`;
        const tokenData = `_token=${_token}&type=reg&growId=${guestId}&password=${guestPass}&email=${guestEmail}&gender=${gender}`;
        const token = Buffer.from(tokenData).toString('base64');
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"success","message":"Guest account created.","token":"${token}","url":"","accountType":"growtopia"}`);
    }

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
    res.send(`{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia"}`);
});

// --- CHECK TOKEN ---
app.all('/player/growid/checkToken', (req, res) => {
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
        url: "",
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
    console.log(`[SERVER RUNNING] Listening on port 5000`);
});