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
const { Readable } = require('stream');
const imgurClientID = process.env.IMGUR
var nodemailer = require('nodemailer');
const fs = require("fs");
const path = require('path');

require('dotenv').config();

app.use(express.json());

const emailaddress = process.env.EMAIL
const emailpass = process.env.EMAILPASS

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailaddress,
    pass: emailpass
  }
});

app.get('/generate-ticket', async (req, res) => {
    let ticketData = {
        "email": "ksalek2006@gmail.com"
    }
    let response = await sendTicket(ticketData);
    if (response) {
        res.status(200).send("sukces");
    } else {
        res.status(404).send("nie udalo sie")
    }
});

async function sendTicket(ticketData) {
    try {
        const templatePath = path.join(__dirname, '../templates/ticket-pdf.html');
        let mailContent = fs.readFileSync(path.join(__dirname, '../templates/eticket.html'), 'utf-8');

        let ticketTemplate = fs.readFileSync(templatePath, 'utf-8');
        const formData = new FormData();

        ticketTemplate = ticketTemplate
            .replaceAll("[NAME]", ticketData.name)
            .replaceAll("[STATUS]", ticketData.status)
            .replaceAll("[OWNER]", ticketData.owner)
            .replaceAll("[DATE]", ticketData.date)
            .replaceAll("[TIME]", ticketData.time)
            .replaceAll("[PLACE]", ticketData.place)
            .replaceAll("[PRICE]", ticketData.price)
            .replaceAll("[TICKET_ID]", ticketData.id)
        
        // Parametry Gotenberg
        const htmlBlob = new Blob([ticketTemplate], { type: 'text/html' });

        formData.append('files', htmlBlob, 'index.html');
        formData.append('paperWidth', '3.5');
        formData.append('paperHeight', '5.8');
        formData.append('marginTop', '0');
        formData.append('marginBottom', '0');
        formData.append('marginLeft', '0');
        formData.append('marginRight', '0');

        const gotenbergResponse = await fetch('http://gotenberg:3000/forms/chromium/convert/html', {
            method: 'POST',
            body: formData
        });

        if (!gotenbergResponse.ok) {
            const errorText = await gotenbergResponse.text();
            console.error(`Błąd Gotenberga (${gotenbergResponse.status}): ${errorText}`);
            return false;
        }

        const nodeStream = Readable.fromWeb(gotenbergResponse.body);
        //Edycja treści maila
        mailContent = mailContent
            .replaceAll("[eventName]", ticketData.name)
            .replaceAll("[orderPaymentInfo]", ticketData.paymentinfo.replaceAll("[TicketID]", ticketData.id))

        const mailOptions = {
            from: `"eTicket Mobilny Katolik" <${emailaddress}>`,
            to: ticketData.email,
            subject: 'Potwierdzenie zakupu biletu',
            html: mailContent,
            attachments: [
                {
                    filename: 'eticket.pdf',
                    content: nodeStream, 
                    contentType: 'application/pdf'
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Błąd podczas generowania/wysyłania PDF:', error.message);
        return false;
    }
}

module.exports = {app, sendTicket};