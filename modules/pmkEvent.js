//Requirements
const express = require('express');
const app = express.Router();
const auth = require('basic-auth');
const { readJSON, saveJSON, checkCredentials, requiredPermissions, authenticateToken } = require('../global.js');
const pool = require('../db');
const bcrypt = require('bcrypt');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json()

app.get('/list', authenticateToken, async (req, res) => {
    try {
        const sqlQuery = 'SELECT * FROM events';
        const result = await pool.query(sqlQuery, []);

        const events = result.rows.map(eventData => new Event(eventData));

        return res.status(200).json(events);
    } catch (err) {
        return res.status(500).json({ response: "Error" });
    }
});

app.get('/:eventID', authenticateToken, async (req, res) => {
    try {
        const sqlQuery = 'SELECT * FROM events WHERE id = $1';
        const result = await pool.query(sqlQuery, [req.params.eventID]);

        if (result.rows.length === 0) {
            return res.status(400).json({ response: "Event not found"} );
        }

        let targetEvent = new Event(result.rows[0]);

        return res.status(200).json(targetEvent);
    } catch (err) {
        return res.status(500).json({ response: "Error" });
    }
    
});


module.exports = app;