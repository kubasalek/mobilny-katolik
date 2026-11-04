//Requirements
const express = require('express');
const app = express.Router();
const auth = require('basic-auth');
const { readJSON, saveJSON, checkCredentials, requiredPermissions, authenticateToken } = require('../global.js');
const pool = require('../db');
const bcrypt = require('bcrypt');
const User = require('../models/User.js');
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json()

//PMK UserManagement
app.get('/users', authenticateToken, requiredPermissions(3), async (req, res) => {
    //Send SQL Query
    const sqlQuery = 'SELECT id, first_name, last_name, class, nickname, permissions FROM users';
    const result = await pool.query(sqlQuery);
    const usersList = Object.fromEntries(result.rows.map(user => [user.id, user]));
    res.json(usersList);
});

app.get('/user/:id', authenticateToken, requiredPermissions(3), jsonParser, async (req, res) => {
    let targetUser = new User({id: req.params.id});
    if (!(await targetUser.update())) {
        res.status(400).json({response: "User not found"});
        return;
    }
    res.status(200).json(targetUser);
});

app.patch('/user/:id', authenticateToken, requiredPermissions(4), jsonParser, async (req, res) => {
    let authUser = req.user; //Użytkownik wywołujący
    const attributes = User.attributes();

    let targetUser = new User({id: req.params.id});
    if (!(await targetUser.update())) {
        res.status(400).json({response: "User not found"});
        return;
    }

    //Sprawdzamy, czy modyfikujemy użytkownika o niższym poziomie uprawnień
    if (authUser.id != targetUser.id && authUser.permissions <= targetUser.permissions) {
        res.status(403).json({response: "Insufficient permissions"});
        return;
    }

    if (req.body.permissions != undefined) {
        //Błąd uprawnień, jeśli
        //a) authUser ma <5 poziom uprawnień
        //b) authUser nadaje wyższe uprawnienia, niż ma sam
        //c) authUser modyfikuje swoje uprawnienia
        if (authUser.permissions < 5 || authUser.permissions <= req.body.permissions || authUser.id == targetUser.id) {
            res.status(403).json({response: "Insufficient permissions"});
            return;
        }
    }

    for (i in attributes) {
        if (req.body[attributes[i]] != undefined) {
            targetUser[attributes[i]] = req.body[attributes[i]];
        }
    }

    if (req.body.nickname == "") {
        targetUser.nickname = null;
    }

    res.status(200).json(targetUser.toJSON());
});

app.post('/user/push', authenticateToken, requiredPermissions(3), jsonParser, async (req, res) => {
    return res.status(501).json({response: "Not implemented"})
});

const pmkEvent = require('./pmkEvent.js');
app.use('/event', pmkEvent);


module.exports = app;