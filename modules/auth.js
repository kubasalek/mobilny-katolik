//Requirements
const express = require('express');
const app = express.Router();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const auth = require('basic-auth');
const { readJSON, saveJSON, checkCredentials, requiredPermissions, authenticateToken } = require('../global.js');
const pool = require('../db');
const bcrypt = require('bcrypt');
const User = require('../models/User.js');
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json()

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
    res.send('Strona główna AUTH');
});

//Pobieranie tokenów
app.post('/login', checkCredentials, async (req, res) => {
    let user = req.user;

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({ accessToken });
});

app.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ response: 'Refresh token not provided' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const tokenQuery = `SELECT * FROM rtokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()`;
        const tokenCheck = await pool.query(tokenQuery, [refreshToken, decoded.id]);

        if (tokenCheck.rows.length === 0) {
            res.clearCookie('refreshToken');
            return res.status(403).json({ response: 'Invalid session' });
        }

        await pool.query('DELETE FROM rtokens WHERE token_hash = $1', [refreshToken]);

        const sqlQuery = 'SELECT * FROM users WHERE id = $1';
        const result = await pool.query(sqlQuery, [decoded.id]);

        //User not found
        if (result.rows.length === 0) {
            return res.status(401).json({ response: 'User not found' });
        }

        let user = new User(result.rows[0]);
        const newAccessToken = user.generateAccessToken();
        const newRefreshToken = user.generateRefreshToken();

        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ accessToken: newAccessToken });
    } catch (err) {
        console.error('Token refresh error:', err);
        return res.status(403).json({ response: 'Invalid token' });
    }
});

app.get('/check', authenticateToken, (req, res) => {
    res.status(200).json({response: 'Success'})
});

module.exports = app;