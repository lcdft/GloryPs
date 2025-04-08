const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const rateLimiter = require('express-rate-limit');
const compression = require('compression');

app.use(compression({
    level: 5,
    threshold: 0,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));
app.set('view engine', 'ejs');
app.set('trust proxy', 1);
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept',
    );
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url} - ${res.statusCode}`);
    next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, headers: true }));

// Add server data route
app.get('/growtopia/server_data.php', (req, res) => {
    const serverData = {
        "server": "157.230.218.22",
        "port": "17091",
        "type": "main",
        "meta": "1",
        "rtmp": "rtmp://157.230.218.22:1935",
        "rtmp_port": "1935",
        "items_dat": "https://157.230.218.22/items.dat",
        "items_version": "1",
        "version": "4.61"
    };
    res.json(serverData);
});

app.all('/player/login/dashboard', function (req, res) {
    const tData = {};
    try {
        const uData = JSON.stringify(req.body).split('"')[1].split('\\n'); const uName = uData[0].split('|'); const uPass = uData[1].split('|');
        for (let i = 0; i < uData.length - 1; i++) { const d = uData[i].split('|'); tData[d[0]] = d[1]; }
        if (uName[1] && uPass[1]) { res.redirect('/player/growid/login/validate'); }
    } catch (why) { console.log(`Warning: ${why}`); }

    res.render(__dirname + '/public/html/dashboard.ejs', { data: tData });
});

app.all('/player/growid/login/validate', (req, res) => {
    const _token = req.body._token;
    const growId = req.body.growId;
    const password = req.body.password;

    const token = Buffer.from(
        `_token=${_token}&growId=${growId}&password=${password}`,
    ).toString('base64');

    const serverUrl = "157.230.218.22:17091";

    res.send(
        `{"status":"success","message":"Account Validated.","token":"${token}","url":"${serverUrl}","accountType":"growtopia"}`
    );
});

// Add token validation endpoint
app.get("/player/growid/checktoken", (req, res) => {
    const token = req.query.token;
    if (!token) {
        res.status(400).json({
            "status": "error",
            "message": "Token is required"
        });
        return;
    }

    try {
        // Decode the token
        const decodedToken = Buffer.from(token, 'base64').toString('utf-8');
        const params = new URLSearchParams(decodedToken);
        
        // Validate token parameters
        if (!params.has('_token') || !params.has('growId') || !params.has('password')) {
            res.status(400).json({
                "status": "error",
                "message": "Invalid token format"
            });
            return;
        }

        // If token is valid, return success
        res.json({
            "status": "success",
            "message": "Token is valid",
            "growId": params.get('growId'),
            "accountType": "growtopia"
        });
    } catch (error) {
        res.status(400).json({
            "status": "error",
            "message": "Invalid token"
        });
    }
});

app.all('/player/*', function (req, res) {
    if (req.path.includes('login')) {
        res.render(__dirname + '/public/html/dashboard.ejs', { data: {} });
    } else {
        res.status(404).send('Not Found');
    }
});

app.get('/', function (req, res) {
    res.send('Hello World!');
});

app.listen(5000, function () {
    console.log('Listening on port 5000');
});
