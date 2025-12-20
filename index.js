const express = require('express');
const app = express();
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Added for Token Encryption

// --- CRYPTO CONFIGURATION (For Vercel Memory Fix) ---
// This ensures tokens are valid without needing server memory
const SECRET_KEY = crypto.scryptSync('GrowtopiaPrivateServerKey', 'salt', 32);
const IV_LENGTH = 16; 

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return null; 
    }
}
// ----------------------------------------------------

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
        // Log safely (hide password in logs)
        const safeBody = { ...req.body };
        if(safeBody.password) safeBody.password = "***HIDDEN***";
        console.log(`${req.method} ${req.url} - Status: ${res.statusCode} | Body: ${JSON.stringify(safeBody)}`);
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

// --- ROUTE: DASHBOARD (Main Entry) ---
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

// --- ROUTE: LOGIN FORM (Input Fields) ---
app.all('/player/login/form', function (req, res) {
    let clientData = { ...req.body, ...req.query };
    res.render(__dirname + '/public/html/login.ejs', { data: clientData });
});

// --- ROUTE: VALIDATE LOGIN (Generates Time-Based Token) ---
app.all('/player/growid/login/validate', (req, res) => {
    const { type, growId = '', password = '', email = '', gender = 0, _token } = req.body;

    const trimmedGrowId = (growId || '').trim();
    const trimmedPassword = (password || '').trim();
    const isGuestRequest = type === 'guest' || (trimmedGrowId === '' && trimmedPassword === '');

    // === MOBILE CHEAT DETECTION ===
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

    // ===== GUEST LOGIN =====
    if (isGuestRequest) {
        const guestId = 'Guest' + Math.floor(100000 + Math.random() * 900000);
        const guestPass = 'g' + Math.floor(100000 + Math.random() * 900000); // Random Pass
        
        // Encrypt the guest pass too so checkToken passes
        const rawData = `${guestPass}|${Date.now()}`; 
        const secureToken = encrypt(rawData);

        const tokenData = `_token=${_token}&type=reg&growId=${guestId}&password=${secureToken}&email=${guestId}@guest.local&gender=${gender}`;
        const token = Buffer.from(tokenData).toString('base64');

        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"success","message":"Guest account created.","token":"${token}","url":"","accountType":"growtopia"}`);
    }

    // ===== NORMAL LOGIN =====
    if (!trimmedGrowId || !trimmedPassword) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid request.","token":"","url":"","accountType":""}`);
    }

    if (type === "reg" && !isValidEmail(email)) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid email.","token":"","url":"","accountType":""}`);
    }

    // *** ENCRYPTION LOGIC ***
    // We encrypt the timestamp into the password field.
    // This allows us to check if the token is "fresh" in checkToken
    const rawData = `${trimmedGrowId}|${Date.now()}`;
    const secureToken = encrypt(rawData);

    const tokenData = type === 'reg'
        ? `_token=${_token}&type=${type}&growId=${trimmedGrowId}&password=${secureToken}&email=${email}&gender=${gender}`
        : `_token=${_token}&type=${type}&growId=${trimmedGrowId}&password=${secureToken}`;

    const token = Buffer.from(tokenData).toString('base64');

    res.setHeader('Content-Type', 'text/html');
    res.send(`{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia"}`);
});

// --- ROUTE: CHECK TOKEN (Validates Time & Sends URL on Fail) ---
app.all('/player/growid/checkToken', (req, res) => {
    try {
        const { refreshToken } = req.body;

        // *** IMPORTANT: CHANGE THIS TO YOUR VERCEL DOMAIN ***
        // Example: https://my-growtopia-server.vercel.app/player/login/dashboard
        const DASHBOARD_URL = "https://YOUR-VERCEL-APP-NAME.vercel.app/player/login/dashboard"; 

        if (!refreshToken) {
            // Soft Fail: Send Success + URL to force redirect
            return res.send(`{"status":"success","message":"Login required","token":"","url":"${DASHBOARD_URL}","accountType":""}`);
        }

        // 1. Decode the base64 packet from client
        const decodedStr = Buffer.from(refreshToken, 'base64').toString('utf-8');
        const match = decodedStr.match(/password=([^&]+)/);
        const tokenUsed = match ? match[1] : null;

        if (!tokenUsed) {
             return res.send(`{"status":"success","message":"No Token","token":"","url":"${DASHBOARD_URL}","accountType":""}`);
        }

        // 2. Decrypt the token (which is the password field)
        const decryptedData = decrypt(tokenUsed);
        
        if (decryptedData) {
            const [gid, timestamp] = decryptedData.split('|');
            const tokenTime = parseInt(timestamp);
            const now = Date.now();

            // 3. CHECK TIME: Is the token younger than 20 seconds?
            // If yes -> Allow Login.
            if (now - tokenTime < 20000) { 
                // VALID!
                res.setHeader('Content-Type', 'text/html');
                return res.send(`{"status":"success","message":"Logged In","token":"${refreshToken}","url":"","accountType":"growtopia"}`);
            }
        }

        // 4. INVALID or EXPIRED -> Send Dashboard URL (Soft Fail)
        console.log("Token expired. Redirecting...");
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"success","message":"Session Expired","token":"","url":"${DASHBOARD_URL}","accountType":""}`);

    } catch (error) {
        // Error handling
        const DASHBOARD_URL_ERR = "https://YOUR-VERCEL-APP-NAME.vercel.app/player/login/dashboard";
        res.send(`{"status":"success","message":"Error","token":"","url":"${DASHBOARD_URL_ERR}","accountType":""}`);
    }
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