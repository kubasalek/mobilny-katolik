// generator-biletu.js

// Zamiast 'import' używamy 'require'
//onst puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const fs = require('fs').promises; // Importujemy 'fs' i bierzemy z niego 'promises'
const path = require('path');
var nodemailer = require('nodemailer');

require('dotenv').config();

// WAŻNE: W CommonJS (__dirname) jest dostępne automatycznie!
// Nie musimy go tworzyć za pomocą 'import.meta.url'.

const folderBiletow = path.join(__dirname, 'eticket', 'tickets');

/**
 * Generuje plik PDF z biletem na podstawie dostarczonych danych.
 * @param {object} daneDoBiletu - Obiekt zawierający dane do biletu.
 * @returns {Promise<string>} - Obietnica, która zwraca publiczny URL do wygenerowanego pliku PDF.
*/


/*
async function generateTicket(eTicketData) {
    console.log(`Rozpoczynam generowanie biletu dla ID: ${eTicketData.id}`);

    const nazwaPliku = `eticket_${eTicketData.id}.pdf`;
    const sciezkaDoPliku = path.join(folderBiletow, nazwaPliku);
    const publicznyUrl = `/tickets/${nazwaPliku}`; // Ten URL zwrócimy
    console.log(sciezkaDoPliku)
    console.log(folderBiletow)

    try {
        // Upewniamy się, że folder /public/bilety istnieje
        await fs.mkdir(folderBiletow, { recursive: true });

        // --- Wczytanie szablonu HTML ---
        const sciezkaSzablonu = path.join(__dirname, 'eticket', 'template.html');
        const htmlTemplate = await fs.readFile(sciezkaSzablonu, 'utf-8');

        const finalHtml = htmlTemplate
            .replace('[NAME]', eTicketData.name)
            .replace('[DATE]', eTicketData.date)
            .replace('[TIME]', eTicketData.time)
            .replace('[PLACE]', eTicketData.place)
            .replace('[STATUS]', eTicketData.status)
            .replace('[OWNER]', eTicketData.owner)
            .replace('[PRICE]', eTicketData.price)
            .replace('[TICKET_QR]', eTicketData.id)
            .replace('[TICKET_ID]', eTicketData.id);

        // --- Uruchomienie Puppeteer ---
        console.log('Uruchamiam przeglądarkę w tle...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

        // --- Generowanie PDF ---
        await page.pdf({
            path: sciezkaDoPliku,
            width: '340px',
            height: '580px',
            printBackground: true
        });

        await browser.close();

        console.log(`✅ Sukces! Plik zapisany w: ${sciezkaDoPliku}`);


        if (eTicketData.email != undefined) {
            await sendMail("eticket", {
              "orderPaymentInfo": eTicketData.paymentinfo,
              "eventName": eTicketData.name
            }, eTicketData.email, sciezkaDoPliku)
        }

        // Zwracamy publiczny URL
        return publicznyUrl;

    } catch (error) {
        console.error('❌ Wystąpił błąd podczas generowania biletu:', error);
        throw new Error('Nie udało się wygenerować biletu PDF.');
    }
}
*/

const emailaddress = process.env.EMAIL
const emailpass = process.env.EMAILPASS

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailaddress,
    pass: emailpass
  }
});

async function sendMail(template, additionalInfo, userEmail, file) {
  var mailContent = await fs.readFile(`./templates/${template}.html`, 'utf-8')
  for (x in additionalInfo) {
    mailContent = mailContent.replaceAll(`[${x}]`, additionalInfo[x]);
  }
  var mailSubject = mailContent.split("\n")[0]
  mailContent = mailContent.split("\n")
  mailContent.shift()
  mailContent = mailContent.join("\n")

  var mailOptions = {
    from: `Mobilny Katolik <${emailaddress}>`,
    to: userEmail,
    subject: mailSubject,
    html: mailContent,
    headers: {
      "Precedence": "bulk"
    }
  };

  if (file != undefined) {
    mailOptions.attachments = [
        {
            path: file,
        }
    ]
  }

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      return 500;
    } else {
      return 200;
    }
  });

}

// Zamiast 'export' używamy 'module.exports'
module.exports = {
    generateTicket
};