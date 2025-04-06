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

app.all('/player/login/dashboard', function (req, res) {
    const tData = {};
    try {
        const uData = JSON.stringify(req.body).split('"')[1].split('\\n'); const uName = uData[0].split('|'); const uPass = uData[1].split('|');
        for (let i = 0; i < uData.length - 1; i++) { const d = uData[i].split('|'); tData[d[0]] = d[1]; }
        if (uName[1] && uPass[1]) {
            tData['session_time'] = Date.now();
            res.redirect('/player/growid/login/validate');
        }
    } catch (why) { console.log(`Warning: ${why}`); }

    res.render(__dirname + '/public/html/dashboard.ejs', { data: tData });
});

app.all('/player/growid/login/validate', (req, res) => {
    const _token = req.body._token;
    const growId = req.body.growId;
    const password = req.body.password;

    const uniqueTimestamp = Date.now();
    const randomConnId = Math.floor(Math.random() * 10000);
    
    // Create a unique token with connection parameters
    const token = Buffer.from(
        `_token=${_token}&growId=${growId}&password=${password}&timestamp=${uniqueTimestamp}&conn_id=${randomConnId}`,
    ).toString('base64');

    // Add connection parameters to force new connection
    res.send(
        `{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia","conn_timestamp":"${uniqueTimestamp}","conn_id":"${randomConnId}"}`,
    );
});

// Add new endpoint for server connection
app.all('/player/server/connect', (req, res) => {
    // Get the token from the request
    const token = req.body.token || req.query.token;
    
    if (!token) {
        return res.status(401).send({
            status: "error",
            message: "No authentication token provided."
        });
    }
    
    try {
        // Generate new connection parameters
        const connTimestamp = Date.now();
        const connId = Math.floor(Math.random() * 100000);
        
        // Send response with connection parameters
        res.send({
            status: "success",
            message: "Connection parameters generated.",
            server_address: "157.230.218.22", // Change to your actual server address
            port: 17091, // Change to your actual port number
            conn_timestamp: connTimestamp,
            conn_id: connId
        });
    } catch (error) {
        console.error("Error generating connection parameters:", error);
        res.status(500).send({
            status: "error",
            message: "Failed to generate connection parameters."
        });
    }
});

// Add connection reset endpoint for game startup
app.all('/player/reset_connection', (req, res) => {
    // Get identification info if available
    const growId = req.body.growId || req.query.growId || "unknown";
    
    console.log(`[${new Date().toLocaleString()}] Connection reset requested for: ${growId}`);
    
    // Return success response with timestamp to ensure uniqueness
    res.send({
        status: "success",
        message: "Connection has been reset.",
        reset_timestamp: Date.now(),
        requires_login: true
    });
});

app.all('/player/*', function (req, res) {
    res.status(301).redirect('https://api.yoruakio.tech/player/' + req.path.slice(8));
});

// Update root path to clear connection state
app.get('/', function (req, res) {
    // Set cache-control headers to prevent caching
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    
    // Redirect to login page with timestamp to ensure uniqueness
    res.redirect('/player/login/dashboard?t=' + Date.now());
});

app.listen(5000, function () {
    console.log('Listening on port 5000');
});
