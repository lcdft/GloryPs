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
        console.log(`${req.method} ${req.url} - Status: ${res.statusCode} | Body: ${JSON.stringify(req.body)}`);
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

app.all('/player/login/dashboard', function (req, res) {
    // Parse the Growtopia client data format
    let clientData = {};
    try {
        // Check if this is a Growtopia client request (has valKey parameter or body data)
        if (req.query.valKey || (req.body && Object.keys(req.body).length > 0)) {

            let bodyData = {};
            let rawData = '';

            // DETECT DATA FORMAT
            if (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)) {
                // CHECK: Is the data "Clean" (parsed correctly) or "Messy" (stuck in the key)?
                if (req.body.platformID || req.body.tankIDName) {
                    // It is CLEAN. Use as is.
                    bodyData = req.body;
                } else {
                    // It is MESSY (The issue you are facing).
                    // The data is likely trapped in the first key of the object.
                    const keys = Object.keys(req.body);
                    if (keys.length > 0) {
                        // Extract the giant string from the first key
                        rawData = keys[0];
                    }
                }
            } else if (typeof req.body === 'string') {
                rawData = req.body;
            }

            // If we found raw string data (Messy), parse it manually now
            if (rawData && Object.keys(bodyData).length === 0) {
                 // Clean up newlines if they are literal strings (common in some raw logs)
                const lines = rawData.split(/\r?\n|\\n/);
                lines.forEach(line => {
                    const parts = line.split('|');
                    if (parts.length >= 2) {
                        const key = parts[0].trim();
                        // Join back the rest in case the value contains pipes
                        const value = parts.slice(1).join('|').trim();
                        if (key) {
                            bodyData[key] = value;
                        }
                    }
                });
            }

            // Extract platformID and mac from the client data
            // Default to '0' ONLY if extraction fails
            const platformID = bodyData.platformID || '0';
            const mac = bodyData.mac || '02:00:00:00:00:00';

            console.log('=== GROWTOPIA CLIENT DETECTED ===');
            console.log(`Platform ID: ${platformID}`);
            console.log(`MAC Address: ${mac}`);

            // === MOBILE CHEAT DETECTION ===
            if (config.block_cheats_mobile_mac) {
                // Check if this is a mobile platform (iOS or Android)
                // ENSURE platformID is treated as a string for comparison
                if (String(platformID) === '2' || String(platformID) === '4') {
                    // Mobile platforms must have the default MAC address
                    if (mac !== '02:00:00:00:00:00') {
                        console.log(`CHEAT DETECTED: Mobile platform ${platformID} with invalid MAC address: ${mac}`);
                        // Show cheat detection page
                        return res.render(__dirname + '/public/html/cheat_detected.ejs', { data: bodyData });
                    }
                }
            }

            // If no cheats detected, proceed with normal login flow
            clientData = bodyData;
        }
    } catch (error) {
        console.error('Error parsing Growtopia client data:', error.message);
    }

    // For web browsers, show login page
    res.render(__dirname + '/public/html/login.ejs', { data: clientData });
});

app.all('/player/growid/login/validate', (req, res) => {
    // === CLIENT ANALYSIS LOGGING ===
    console.log('=== CLIENT ANALYSIS ===');
    console.log(`IP Address: ${req.ip || req.connection.remoteAddress}`);
    console.log(`User-Agent: ${req.headers['user-agent'] || 'Unknown'}`);
    console.log(`Request Body: ${JSON.stringify(req.body, null, 2)}`);
    console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    console.log('=======================');

    const { type, growId = '', password = '', email = '', gender = 0, _token } = req.body;

    const trimmedGrowId = (growId || '').trim();
    const trimmedPassword = (password || '').trim();
    const isGuestRequest =
        type === 'guest' || (trimmedGrowId === '' && trimmedPassword === '');

    console.log(
        `Type: ${type} | GrowID: ${isGuestRequest ? 'GUEST_MODE' : trimmedGrowId} | Password: ${isGuestRequest ? '(guest)' : '***'} | Email: ${email} | Gender: ${gender}`
    );

    // === MOBILE CHEAT DETECTION ===
    if (config.block_cheats_mobile_mac) {
        const { platformID = '0', mac = '02:00:00:00:00:00' } = req.body;
        const platformId = String(platformID).trim();

        console.log(`Platform ID: ${platformId}, MAC Address: ${mac}`);

        // Check if this is a mobile platform (iOS or Android)
        if (platformId === '2' || platformId === '4') {
            // Mobile platforms must have the default MAC address
            if (mac !== '02:00:00:00:00:00') {
                console.log(`CHEAT DETECTED: Mobile platform ${platformId} with invalid MAC address: ${mac}`);
                res.setHeader('Content-Type', 'text/html');
                return res.send(`{"status":"error","message":"Cheats detected Logon fail: please login using the normal growtopia client","token":"","url":"","accountType":""}`);
            }
        }
    }

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

    const token = Buffer.from(tokenData).toString('base64');

    res.setHeader('Content-Type', 'text/html');
    res.send(`{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia"}`);
});

app.all('/player/growid/checkToken', (req, res) => {
    try {
        const { refreshToken, clientData } = req.body;

        if (!refreshToken || !clientData) {
            res.setHeader('Content-Type', 'text/html');
            return res.status(400).send(`{"status":"error","message":"Missing refreshToken or clientData"}`);
        }

        const decodedRefreshToken = Buffer.from(refreshToken, 'base64').toString('utf-8');
        const updatedToken = Buffer.from(
            decodedRefreshToken.replace(/(_token=)[^&]*/, `$1${Buffer.from(clientData).toString('base64')}`)
        ).toString('base64');

        res.setHeader('Content-Type', 'text/html');
        res.send(`{"status":"success","message":"Token is valid.","token":"${updatedToken}","url":"","accountType":"growtopia"}`);
    } catch (error) {
        res.setHeader('Content-Type', 'text/html');
        res.status(500).send(`{"status":"error","message":"Internal Server Error"}`);
    }
});

app.all('/', function (req, res) {
    // Redirect root to the login page first
    res.redirect('/player/login/dashboard');
});

// Render register page
app.all('/player/login/register', function (req, res) {
    res.render(__dirname + '/public/html/register.ejs', { data: {} });
});

app.listen(5000, function () {
    console.log(`Listening on port 5000`);
});
