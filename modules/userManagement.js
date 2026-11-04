/* Modul sluzacy do zarzadzania uzytkownikami.
Polaczenie z baza danych Neon w
 * celu modyfikacji tabeli users.
 */

//Requirements
const express = require('express');
const app = express.Router();
const auth = require('basic-auth');
const {readJSON, saveJSON, checkCredentials, authenticateToken, generateID} = require(
    '../global.js'
);
const pool = require('../db');
const bcrypt = require('bcrypt');
const User = require('../models/User.js');
const axios = require('axios');
const imgurClientID = process.env.IMGUR

app.use(express.json());

/*
//TEST
app.get('/login', checkCredentials, async (req, res) => {
    //checkCredentials sprawdza, czy podane w BASIC AUTH dane zgadzaja sie z baza danych
    //i przypisuje do req.user obiekt klasy User
    let user = req.user;
    //res.status(200).json(user);
    console.log(user.prefferedName);
    console.log(await user.getTickets());
    res.send(user);
});

//Zmiana hasła
app.patch('/password', checkCredentials, jsonParser, async (req, res) => {
    let user = req.user;
    let response = await user.changePassword(req.body.password);
    if (!response) {
        res.status(403).json({response: "Can't change the password"});
    } else {
        res.status(200).json({response: "Password changed successfully!"});
    }
});
*/

//Pobieranie danych użytkownika
app.get('/', authenticateToken, (req, res) => {
    let targetUser = req.user;
    res.status(200).json(targetUser.toJSON());
});

//Zmiana danych użytkownika
app.patch('/', authenticateToken, (req, res) => {
    let targetUser = req.user;
    const selfAttributes = User.selfAttributes();

    //Zmiana dozwolonych parametrów
    for (i in selfAttributes) {
        if (req.body[selfAttributes[i]] != undefined) {
            targetUser[selfAttributes[i]] = req.body[selfAttributes[i]];
        }
    }

    //Wyczyszczenie "nickname"
    if (req.body.nickname == "") {
        targetUser.nickname = null;
    }
    res.status(200).json(targetUser.toJSON());
});

//Pobieranie zdjęcia profilowego
app.get('/avatar/:userID', async (req, res) => {
    const defaultAvatar = "https://i.imgur.com/Y360lKw.png";
    try {
        const targetUser = req.params.userID;
        const picDB = readJSON("./userdb/pic.json"); 
        const URL = (picDB[targetUser] && picDB[targetUser][0]) ? picDB[targetUser][0] : defaultAvatar;
        return res.redirect(URL);

        const response = await axios({
            method: 'get',
            url: URL,
            responseType: 'stream',
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        res.set({'Content-Type': response.headers['content-type'], 'Cache-Control': 'public, max-age=604800'});
        response.data.pipe(res);
    } catch (err) {
        console.log(err);
        return res.redirect(defaultAvatar);
    }

});

//Rejestracja nowego użytkownika
app.post('/register', async (req, res) => {
    return res.status(501).json({ response: "Not implemented" });

    //Zapisujemy wymagane dane
    const attributes = ["first_name", "last_name", "class", "email"];
    let userData = {};

    for (i in attributes) {
        if (req.body[attributes[i]] == undefined) { res.status(400).json({ response: 'Missing data'}) };
        userData[attributes[i]] = req.body[attributes[i]];
    }

    userData.id = generateID(16);

});
module.exports = app;