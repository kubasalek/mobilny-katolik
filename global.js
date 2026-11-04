const fs = require("fs");
const crypto = require("crypto");
const path = require('path');
const auth = require('basic-auth');
const bcrypt = require('bcrypt');
const User = require('./models/User.js');
const pool = require('./db');
const jwt = require('jsonwebtoken');

const cryptokey = process.env.CRYPTOKEY

function readJSON(file) {
    const absolutePath = path.join(__dirname, file);
    var encryptedFile = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    while (typeof encryptedFile != "object") {
        encryptedFile = JSON.parse(encryptedFile);
    }
  
    if (encryptedFile.encryptedData == undefined) {
        while (typeof encryptedFile != "object") {
            encryptedFile = JSON.parse(encryptedFile);
        }
        return encryptedFile;
    }

    const readIv = Buffer.from(encryptedFile.iv, 'base64');
    const readEncryptedData = encryptedFile.encryptedData;

    const hashedKey = crypto.createHash('sha256').update(cryptokey).digest('base64');
    const keyBuffer = Buffer.from(hashedKey, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, readIv);

    let decryptedData = decipher.update(readEncryptedData, 'base64', 'utf8');
    decryptedData += decipher.final('utf8');

    while (typeof decryptedData != "object") {
        decryptedData = JSON.parse(decryptedData);
    }

    return decryptedData;
}

function saveJSON(file, data) {
    const absolutePath = path.join(__dirname, file);
    const jsonString = JSON.stringify(data);

    const hashedKey = crypto.createHash('sha256').update(cryptokey).digest('base64');
    const keyBuffer = Buffer.from(hashedKey, 'base64');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);

    let encryptedData = cipher.update(jsonString, 'utf8', 'base64');
    encryptedData += cipher.final('base64');

    fs.writeFileSync(absolutePath, JSON.stringify({ iv: iv.toString('base64'), encryptedData }));
}

async function checkCredentials(req, res, next) {
    if (!auth(req)) {
        //res.set('WWW-Authenticate', 'Basic realm="Mobilny Katolik API"');
        return res.status(401).json({ response: 'Brak autoryzacji lub błędne dane' });
    }

    const email = auth(req).name;
    const pass = auth(req).pass;

    const sqlQuery = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(sqlQuery, [email]);

    //User not found
    if (result.rows.length === 0) {
      return res.status(401).json({ response: 'User not found' });
    }

    let user = new User(result.rows[0]);
    const isPasswordValid = await user.validatePassword(pass);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    req.user = user;
    next();
}

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, tokenData) => {
        if (err) {
            return res.status(401).json({ response: 'Invalid token' });
        }

        try {
            const sqlQuery = 'SELECT * FROM users WHERE id = $1';
            const result = await pool.query(sqlQuery, [tokenData.id]);

            if (result.rows.length === 0) {
                return res.status(401).json({ response: 'User not found' });
            }

            req.user = new User(result.rows[0]);
            
            next();
        } catch (dbError) {
            console.error('Database error:', dbError);
            res.status(500).json({ response: 'Internal server error' });
        }
    });
};

const requiredPermissions = (level) => {
    return (req, res, next) => {
        const user = req.user; // Załóżmy, że checkCredentials już go tu wstawił

        if (user && user.checkPermissions(level)) {
            next(); // Użytkownik ma uprawnienia, idź dalej
        } else {
            res.status(403).json({ response: "Insufficient permissions" });
        }
    };
};

function generateID(length) {
  var charset = "abcdefghijklmnopqrstuvwxyz0123456789",
    retVal = "";
  for (var i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

module.exports = {
    readJSON,
    saveJSON,
    checkCredentials,
    requiredPermissions,
    authenticateToken,
    generateID
};