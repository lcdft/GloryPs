const express = require('express');
const app = express();
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const compression = require('compression');

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
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    console.log(`${req.method} request for '${req.url}' - ${JSON.stringify(req.body)} | Status: ${res.statusCode}`);
    next();
});
app.use(express.json());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min cd
    max: 100, // 100 req / cd
    message: 'Too many requests from this IP, please try again after an hour',
}));
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

app.all('/player/login/dashboard', function (req, res) {
    const tData = {};
    try {
        // parsing the data from req.body
        const uData = JSON.stringify(req.body).split('"')[1].split('\\n');
        const uName = uData[0].split('|');
        const uPass = uData[1].split('|');

        // Format will be: tankIDName: user-name - tankIDPass: user-pass
        // console.log(`${uName[0]}: ${uName[1]} - ${uPass[0]}: ${uPass[1]}`);

        for (let i = 0; i < uData.length - 1; i++) { // -1 to remove the last empty value n string
            const d = uData[i].split('|');
            tData[d[0]] = d[1];
        }

        // console.log(tData);

        // If the user and pass is not empty, redirect to the next page
        if (uName[1] && uPass[1]) {
            return res.redirect('/player/growid/login/validate');
        }
    } catch (why) {
        console.log(`Warning: ${why}`);
    }

    res.render(__dirname + '/public/html/dashboard.ejs', { data: tData });
});

app.all('/player/growid/login/validate', (req, res) => {
    const { type, growId, password, email = '', gender = 0 } = req.body;
    console.log(`Type: ${type} | GrowID: ${growId} | Password: ${password} | Email: ${email} | Gender: ${gender}`);
    const _token = req.body._token;
    // console.log(`Body Token: ${_token}`);

    if (!_token || !type || !growId || !password) {
        console.log('Invalid request cuz no token, type, growId, or password');
        return res.send(
            '{"status":"error","message":"Invalid request.","token":"","url":"","accountType":""}',
        );
    }

    if (type === "reg" && !isValidEmail(email)) {
        console.log('Invalid email');
        return res.send(
            '{"status":"error","message":"Invalid email.","token":"","url":"","accountType":""}',
        );
    }

    // Note: The gender param is used on gt3 base | &gender=${parseGender(gender)}
    const tokenData = type === 'reg'
        ? `_token=${_token}&type=${type}&growId=${growId}&password=${password}&email=${email}`
        : `_token=${_token}&type=${type}&growId=${growId}&password=${password}`;

    const token = Buffer.from(tokenData).toString('base64');

    res.send(
        `{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia"}`,
    );
});

app.all('/player/growid/checkToken', (req, res) => {
    try {
        const { refreshToken, clientData } = req.body;

        if (!refreshToken || !clientData) {
            return res.status(400).send({ status: "error", message: "Missing refreshToken or clientData" });
        }

        let decodeRefreshToken = Buffer.from(refreshToken, 'base64').toString('utf-8');

        const token = Buffer.from(decodeRefreshToken.replace(/(_token=)[^&]*/, `$1${Buffer.from(clientData).toString('base64')}`)).toString('base64');

        res.send({
            status: "success",
            message: "Token is valid.",
            token: token,
            url: "",
            accountType: "growtopia"
        });
    } catch (error) {
        res.status(500).send({ status: "error", message: "Internal Server Error" });
    }
});

app.all('/', function (req, res) {
    res.sendFile(__dirname + '/public/html/index.html');
});

app.listen(5000, function () {
    console.log(`Listening on port 5000`);
});
