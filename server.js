const path = require("path");
require('dotenv').config();

//B
const fs = require("fs");
const YAML = require('yaml')
const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json()
var nodemailer = require('nodemailer');
const push = require('web-push');
const moment = require('moment-timezone');
const axios = require('axios');
var FormData = require('form-data');
const multer = require('multer');
const auth = require('basic-auth');
const pool = require('./db');

//Swagger
const swaggerUi = require('swagger-ui-express');

const mk = require('./global.js');

//eTicket
//const { generateTicket } = require('./eticket.js');

const { Readable } = require('stream');
const Jimp = require('jimp');

const { permission } = require("process");

const { aiEventNotification } = require('./ai/openai.js');


const upload = multer({ dest: 'uploads/' });

//Modules
const allowedOrigins = [
    'https://mobilnykatolik.github.io',
    'https://apimk.salek.it/',
    'https://auth.mobilnykatolik.pl'
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

const pmkRouter = require('./modules/pmk.js');
const userManagement = require('./modules/userManagement.js');
const authenticationRouter = require('./modules/auth.js');
const ticketsRouter = require('./modules/tickets.js');
app.use('/pmk', pmkRouter);
app.use('/auth', authenticationRouter);
app.use('/user', userManagement);
app.use('/tickets', ticketsRouter.app);

app.use('/docs', swaggerUi.serve, (req, res, next) => {
    try {
        const file  = fs.readFileSync('./swagger.yaml', 'utf8')
        const swaggerDocument = YAML.parse(file)
        swaggerUi.setup(swaggerDocument)(req, res, next);
    } catch (e) {
        console.error("Błąd podczas ładowania swagger.yaml:", e);
        res.status(500).send("Nie udało się załadować dokumentacji.");
    }
});

//Tokens
const token = process.env.TOKEN
const alarmtoken = process.env.ALARM
const admintoken = process.env.ADMINTOKEN
const emailaddress = process.env.EMAIL
const emailpass = process.env.EMAILPASS
const pushprivatekey = process.env.PUSHPRIVATEKEY
const countryTimezone = 'Europe/Warsaw';
const imgurClientID = process.env.IMGUR
const owr = process.env.OWR
const ADMINID = process.env.ADMINID

//Inactive users
const inactiveDaysNotification = 180;
const inactiveDaysDelete = 210;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailaddress,
    pass: emailpass
  }
});

let vapidKeys = {
  publicKey: 'BKYA3uX7SGiQ0YeC-CxulKo66lsFHm1tEtbMvSO-NJst6HkmeYP_gzgQPItcCH--kjxTZE4XG2MZayQLahtrGto',
  privateKey: pushprivatekey
}

push.setVapidDetails("mailto:mobilnykatolik@gmail.com", vapidKeys.publicKey, vapidKeys.privateKey)

app.listen(3000, async () => {
  console.log('Mobilny Katolik API is running');
});

app.get('/', (req, res) => {
  res.send('Mobilny Katolik API by Kuba Salek - last updated: 04/11/2026 13:05')
})

app.get('/generateluckylist', (req, res) => {
  res.send(createLuckyNumberList());
})

app.get('/db/:token/:patha/:pathb', (req, res) => {
  if (req.params.token != token) {
    res.status(404);
    res.send("Invalid token");
    return false;
  }
  var patha = req.params.patha;
  var pathb = req.params.pathb;
  var path = `./${patha}/${pathb}.json`
  var userdb = mk.readJSON(path);
  res.status(200);
  res.send(userdb);
});


app.get('/getstats/:token', (req, res) => {
  if (req.params.token != token) {
    res.status(404);
    res.send("Invalid token");
    return false;
  }
  var userdb = mk.readJSON("./userdb/users.json");
  var userCount = 0;
  for (user in userdb) {
    userCount += 1
  }
  res.status(200);
  res.send(`Registered users: ${userCount}`);
});

//Get profile picture
app.get('/profilepic/get/:userid', async (req, res) => {
  //console.log("POBIERANIE ZDJECIA PROFILOWEGO")
  var userID = req.params.userid;
  var picDB = mk.readJSON("./userdb/pic.json");
  
  var URL;
  
  if (picDB[userID] != undefined) {
    URL = picDB[userID][0]
    //console.log(URL)
  } else {
    URL = "https://i.imgur.com/Y360lKw.png"
  }
  
  var imageResponse;
  
  try {
    imageResponse = await axios.get(URL, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
  } catch (err) {
    URL = "https://i.imgur.com/Y360lKw.png"
    imageResponse = await axios.get(URL, { responseType: 'stream' });
  }
  
  res.set('Content-Type', imageResponse.headers['content-type']);
  res.set('Content-Length', imageResponse.headers['content-length']);
  res.set('Cache-Control', "max-age=604800");
  imageResponse.data.pipe(res);
  res.status(200);
});

//Delete profile picture
app.post('/profilepic/delete', jsonParser, async (req, res) => {
  var userDB = mk.readJSON("./userdb/users.json");
  var picDB = mk.readJSON("./userdb/pic.json");
  
  var userID = req.body.userID
  var loginID = req.body.loginID
  
  if (userID == undefined || loginID == undefined) {
    res.status(400);
    res.send("Undefined userID or loginID!");
    return false;
  }
  
  if (userDB[userID].loginid != loginID) {
    res.status(400);
    res.send("Invalid loginID!");
    return false;
  }
  
  if (picDB[userID] != undefined) {
    const apiUrl = `https://api.imgur.com/3/image/${picDB[userID][1]}`;

    // Make the DELETE request
        axios.delete(apiUrl, {
      headers: {
        'Authorization': `Client-ID ${imgurClientID}`
      }
    })
      .then(response => {
        console.log('Deleted successfully:', response.data);
        delete picDB[userID];
        mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
        res.status(200);
        res.send("Profile picture deleted successfully!")
      })
      .catch(error => {
        res.status(400);
        res.send("An error occured!");
        return false;
      });
  }
});

//Fotobudka
app.post('/photobox/upload', jsonParser, (req, res) => {
  var photoboxDB = mk.readJSON("./photobox/photos.json");
  
  var photoCode = generateID(5).toUpperCase()
  while (photoboxDB[photoCode] != undefined) {
    photoCode = generateID(5).toUpperCase()
  }
  
  if (req.body.url == undefined) {
    res.status(404);
    res.send("Invalid URL")
  }
  
  photoboxDB[photoCode] = {
    "url": req.body.url
  }
  
  if (req.body.deletehash != undefined) {
    photoboxDB[photoCode].deletehash = req.body.deletehash
  }
  
  if (req.body.userid != undefined) {
    photoboxDB[photoCode].userid = [req.body.userid]
    notifyUsers([req.body.userid], "📸 Twoje zdjęcie z fotobudki jest gotowe!", `Sprawdź i pobierz je w aplikacji 📲`);
  }
  
  mk.saveJSON("./photobox/photos.json", JSON.stringify(photoboxDB));
  
  res.status(200);
  res.send(photoCode);
})

//Fotobudka - alarm o błędzie
app.get('/alarmapi/:token', async (req, res) => {
  var alarmapitoken = req.params.token
  if (alarmtoken != alarmapitoken) {
    res.status(404)
    return false;
  }
  
  notifyUsers(["5ifnxrpww6t92jlv", "ibyfmb1stmrimw3a"], "🚨 Błąd fotobudki", `Wystąpił błąd w działaniu fotobudki`);
  

  res.status(200);
});

//Fotobudka - pokazywanie zdjęć
app.get('/photo/get/:photocode', async (req, res) => {
  var photoCode = req.params.photocode.toUpperCase();
  console.log(photoCode)
  var photoboxDB = mk.readJSON("./photobox/photos.json");
  console.log(photoboxDB[photoCode])
  
  var URL;
  
  if (photoboxDB[photoCode] != undefined) {
    URL = photoboxDB[photoCode].url
  } else {
    res.status(404);
    res.send("Photo not found!")
    return false;
  }
  
  const imageResponse = await axios.get(URL, { responseType: 'stream' });
  //res.setHeader('Content-Disposition', `attachment; filename="foto-${photoCode}.jpeg"`)
  res.set('Content-Type', imageResponse.headers['content-type']);
  res.set('Content-Length', imageResponse.headers['content-length']);
  res.set('Cache-Control', "max-age=604800");
  imageResponse.data.pipe(res);
  res.status(200);
  console.log("wyswietlam zdjecie")
});

//Fotobudka - pobieranie zdjęć
app.get('/photo/download/:photocode', async (req, res) => {
  var photoCode = req.params.photocode.toUpperCase();
  var photoboxDB = mk.readJSON("./photobox/photos.json");
  
  var URL;
  
  if (photoboxDB[photoCode] != undefined) {
    URL = photoboxDB[photoCode].url
  } else {
    res.status(404);
    res.send("Photo not found!")
    return false;
  }
  
  const imageResponse = await axios.get(URL, { responseType: 'stream' });
  res.setHeader('Content-Disposition', `attachment; filename="foto-${photoCode}.jpeg"`)
  imageResponse.data.pipe(res);
  res.status(200);
});


//Change profile picture
app.post('/profilepic/upload', jsonParser, upload.single('image'), async (req, res) => {
  var startTime = new Date()
  var userDB = mk.readJSON("./userdb/users.json");
  var picDB = mk.readJSON("./userdb/pic.json");
  
  var userID = JSON.parse(req.body.json).userID
  var loginID = JSON.parse(req.body.json).loginID
  
  if (userID == undefined || loginID == undefined) {
    res.status(400);
    res.send("Undefined userID or loginID!");
    fs.unlinkSync(imagePath)
    return false;
  }
  
  if (userDB[userID].loginid != loginID) {
    res.status(400);
    res.send("Invalid loginID!");
    fs.unlinkSync(imagePath)
    return false;
  }
  
  //console.log("Przyjęto zdjęcie")
  
  const imagePath = req.file.path;
  
  const image = await Jimp.read(imagePath);
  image.cover(256, 256) // Opcjonalnie zmniejszenie jakości do 80%

  const resizedImageBuffer = await image.getBufferAsync(Jimp.MIME_PNG); // Konwersja do PNG
  //console.log("Przekonwertowano na mniejszy rozmiar")

    // Konwersja Buffer na Readable Stream
  const stream = new Readable();
  stream.push(resizedImageBuffer);
  stream.push(null);
  
  //console.log("Przekonwertowano na STREAM")
  
  if (picDB[userID] != undefined) {
    const apiUrl = `https://api.imgur.com/3/image/${picDB[userID][1]}`;

    // Make the DELETE request
        axios.delete(apiUrl, {
      headers: {
        'Authorization': `Client-ID ${imgurClientID}`
      }
    })
      .then(response => {
        //console.log('Deleted successfully:', response.data);
        //console.log("Usunięto poprzednie zdjęcie")
        delete picDB[userID];
      })
      .catch(error => {
        //console.error('Error deleting resource:', error);
        res.status(400);
        res.send("An error occured!");
        fs.unlinkSync(imagePath)
        return false;
      });
  }

  
  var data = new FormData();
  //data.append('image', fs.createReadStream(imagePath));
  data.append('image', stream, { filename: 'resized-image.png' });
  data.append('type', 'image');
  data.append('title', 'mk-profilepic');
  data.append('description', 'mk-profilepic');

  var config = {
    method: 'post',
  maxBodyLength: Infinity,
    url: 'https://api.imgur.com/3/image',
    headers: { 
      'Authorization': `Client-ID ${imgurClientID}`, 
      ...data.getHeaders()
    },
    data : data
  };

  axios(config)
  .then(function (response) {
    //console.log("Zmieniono zdjęcie pomyślnie!")
    var imgurURL = response.data.data.link
    var imgurDeleteHash = response.data.data.deletehash
    fs.unlinkSync(imagePath)
    picDB[userID] = [imgurURL, imgurDeleteHash]
    res.status(200);
    res.send(imgurURL);
    mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
    var endTime = new Date()
    console.warn(`Proces zmiany zdjęcia profilowego zakończony pomyślnie! Czas trwania: ${endTime - startTime}ms`)
  })
  .catch(function (error) {
    console.log(error);
    fs.unlinkSync(imagePath)
    res.status(400);
    res.send("An error occured. Try again.")
    mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
    var endTime = new Date()
    console.warn(`Błąd zmiany zdjęcia profilowego! Czas trwania: ${endTime - startTime}ms`)
  });
});


//Authorization

//Register
app.post('/register', jsonParser, (req, res) => {
  var userdb = mk.readJSON("./userdb/users.json"); //Pobieranie bazy danych użytkowników
  var peopledb = mk.readJSON("./userdb/people.json"); //Pobieranie bazy uczniów
  
  //Sprawdzanie na liście uczniów
  if (req.body.class != "n") {
    if (peopledb[req.body.class] == undefined) {
      res.status(500);
      res.send("Invalid class, unable to check students list");
      return false;
    }

    if (!peopledb[req.body.class].list.includes(`${req.body.lastname} ${req.body.firstname}`)) {
      res.status(404);
      res.send("User is not a school member");
      return false;
    }
  }
  
  //Sprawdzanie na liście użytkowników
  for (user in userdb) {
    if (userdb[user].email == null) {
      continue;
    }
    if (userdb[user].class == req.body.class && (userdb[user].firstname == req.body.firstname && userdb[user].lastname == req.body.lastname)) {
      res.status(406);
      res.send("Account with provided data already exists")
      return false;
    }
    if (userdb[user].email.toUpperCase() == req.body.email.toUpperCase()) {
      res.status(403);
      res.send("Account with provided email already exists")
      return false;
    }
  }

  var userId = generateID(16);
  while (userdb[userId] != undefined) {
    userId = generateID(16);
  }
  var loginId = generateLoginID();
  while (String(userdb).includes(loginId)) {
    loginId = generateLoginID();
  }
  userdb[userId] = JSON.parse(`{
    "firstname": "${req.body.firstname.toUpperCase()}",
    "lastname": "${req.body.lastname.toUpperCase()}",
    "nickname": "",
    "class": "${req.body.class}",
    "email": "${req.body.email}",
    "settings": "",
    "loginid": "${loginId}",
    "accounttype": "mk",
    "active": false,
    "lastactivity": ${Math.floor(Date.now())},
    "access": 0
  }`)

  var verificationCode = Math.floor(Math.random() * (9999 - 1111) + 1111);
  verificationCode = String(verificationCode);

  userdb[userId].code = [verificationCode, Math.floor(Date.now())] //Zapis jednorazowego kodu do bazy danych

  userName = userdb[userId].firstname;
  userName = userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase()
  userEmail = userdb[userId].email;
  fullName = `${userdb[userId].firstname} ${userdb[userId].lastname}`

  additionalInfo = { "verificationCode": verificationCode, "userName": userName, "userID": userId }

  var mailContent = fs.readFileSync(`./templates/verify.html`, 'utf8')
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

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      res.status(500);
      res.send("An error occured while sending email")
      return false;
    } else {
      res.status(200);
      res.send(`{
        "message": "Wprowadź kod, który wysłaliśmy na twój adres e-mail",
        "welcome": "Miło Cię poznać, ${userName}!",
        "fullname": "${fullName}",
        "userid": "${userId}"
      }`)
      mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
      return false;
    }
  });
});

//Email login
app.get('/login/:email', (req, res) => {
  var userEmail = req.params.email;
  var userId;
  var userName;
  var userdb = mk.readJSON("./userdb/users.json")
  for (user in userdb) {
    if (userdb[user].email == null) {
      continue;
    }
    if (userdb[user].email.toUpperCase() == userEmail.toUpperCase()) {
      userId = user;
      firstName = userdb[user].firstname;
      firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
      fullName = `${userdb[user].firstname} ${userdb[user].lastname}`
      if (userdb[user].code != undefined) {
        if ((Math.floor(Date.now()) - userdb[user].code[1]) < 300000) {
          //Code has been sent recently
          res.status(200);
          res.send(`{
            "message": "Wprowadź kod, który wysłaliśmy na twój adres e-mail",
            "welcome": "Witamy ponownie, ${firstName}!",
            "fullname": "${fullName}",
            "userid": "${userId}"
          }`)
          return false;
        }
      }
      break;
    }
  }

  if (userId == undefined) {
    res.status(400);
    res.send("Email not found")
    return false;
  }

  var verificationCode = Math.floor(Math.random() * (9999 - 1111) + 1111);
  verificationCode = String(verificationCode);

  userdb[userId].code = [verificationCode, (Math.floor(Date.now()))]
  mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));

  additionalInfo = { "verificationCode": verificationCode, "userName": firstName, "userID": userId }

  var mailContent = fs.readFileSync(`./templates/verify.html`, 'utf8')
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

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      res.status(500);
      res.send("An error occured while sending email")
      return false;
    } else {
      res.status(200);
      res.send(`{
        "message": "Wprowadź kod, który wysłaliśmy na twój adres e-mail",
        "welcome": "Witamy ponownie, ${firstName}!",
        "fullname": "${fullName}",
        "userid": "${userId}"
      }`)
      return false;
    }
  });

})

//Code verification
app.get('/code/:email/:code', (req, res) => {
  var userEmail = req.params.email;
  var providedCode = req.params.code;
  var userdb = mk.readJSON("./userdb/users.json");
  //console.log(userdb)
  for (user in userdb) {
    if (userdb[user].email == null) {
      continue;
    }
    if (userdb[user].email.toUpperCase() == userEmail.toUpperCase()) {
      if (userdb[user].code != undefined) {
        if ((Math.floor(Date.now()) - userdb[user].code[1]) > 300000) {
          delete userdb[user].code;
          console.log("Code has expired")
          if (userdb[user].active == false) {
            delete userdb[user];
          }
          res.status(410);
          res.send("Code has expired")
          mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
          return false;
        }
      } else {
        console.log("Code has expired")
        if (userdb[user].active == false) {
          delete userdb[user];
        }
        res.status(410);
        res.send("Code has expired");
        mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
        return false;
      }
      if (userdb[user].code[0] != providedCode) {
        res.status(406);
        res.send("Invalid code");
        return false;
      }
      userId = user;
      userName = userdb[user].firstname;
      userName = userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase()
      if (userdb[user].active == false) {
        userdb[user].active = true;
      }
      delete userdb[user].code;
      userdb[user].lastactivity = Math.floor(Date.now());
      mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
      userdb[user].login = "success";
      userdb[user].userid = user;
      userdb[user].userscount = Object.keys(userdb).length;
      res.status(200);
      //res.send(`{"login":"success","userid":"${user}","userloginid":"${userdb[user].loginid}","access":${userdb[user].access}}`);
      res.send(userdb[user]);
      return false;
    }
  }
  res.status(404);
  res.send("Email not found")
})

//Downloading databases for PMK
app.get('/pmk/db/:userid/:loginid/:patha/:pathb', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  var patha = req.params.patha;
  var pathb = req.params.pathb;
  var path = `./${patha}/${pathb}.json`
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (path == "./userdb/users.json" && userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (path == "./events/tickets.json" && userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (path == "./events/coupons.json" && userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (path == "./userdb/people.json" && userdb[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (path == "./userdb/push.json" && userdb[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (userdb[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  /*if (path == "./events/events.json") {
    if (userdb[userID].access == undefined || userdb[userID].access < 1) {
      res.status(403);
      res.send("Insufficient access level");
      return false;
    }
  } else {
    if (userdb[userID].access == undefined || userdb[userID].access < 3) {
      res.status(403);
      res.send("Insufficient access level");
      return false;
    }
  }*/
  
  
  var userdb = mk.readJSON(path);
  
  if (path == "./userdb/users.json") {
    for (x in userdb) {
      delete userdb[x].loginid;
      delete userdb[x].cred;
    }
  }
  
  if (path == "./events/eventTickets.json") {
    for (x in userdb) {
      userdb[x].sales_start = timestampToISOString(userdb[x].sales_start)
      userdb[x].sales_end = timestampToISOString(userdb[x].sales_end)
    }
  }
  
  res.status(200);
  res.send(userdb);
});

function timestampToISOString(timestamp) {
  return moment(timestamp).tz(countryTimezone).format('YYYY-MM-DDTHH:mm');
}

//Editing/adding calendar event
app.post('/pmk/events/modify/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var eventsdb = mk.readJSON("./events/events.json")
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (req.body.type == "szkolne" && userdb[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  if (req.body.type == "dla su" && userdb[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (req.body.event_id != undefined && eventsdb[req.body.event_id] == undefined) {
    res.status(404);
    res.send("Event not found!");
    return false;
  }
  
  //Check if user is trying to modify event without being coordinator
  if (req.body.event_id != undefined && !eventsdb[req.body.event_id].by.includes(userID)) {
    if (userdb[userID].access < 4) {
      res.status(403);
      res.send("User is not coordinating selected event!");
      return false;
    }
  }
  
  var response;
  
  //Usuwanie eventów
  if (req.body.delete == true) {
    if (!eventsdb[req.body.event_id].by.includes(userID) && userdb[userID].access < 4) {
      res.status(403);
      res.send("Insufficient access level");
      return false;
    }
    if (eventsdb[req.body.event_id] != undefined) {
      delete eventsdb[req.body.event_id];
      mk.saveJSON("./events/events.json", JSON.stringify(eventsdb));
      res.status(200);
      res.send("Successfully deleted 1 event!");
      return false;
    } else {
      res.status(404);
      res.send("Event not found!");
      return false;
    }
  }
  
  //New event
  if (req.body.event_id == undefined) {
    const keys = ["name", "startdate", "type"]
    var eventID = generateID(8);
    while (eventsdb[eventID] != undefined) {
      eventID = generateID(8);
    }
    for (key in keys) {
      key = keys[key]
      if (req.body[key] == undefined) {
        res.status(404);
        res.send("Incomplete information provided!");
        return false;
      }
    }
    eventsdb[eventID] = req.body;
    if (!eventsdb[eventID].by.includes(userID)) {
      eventsdb[eventID].by.push(userID);
    }
    if (eventsdb[eventID].type == "szkolne") {
      eventsdb[eventID].by = []
    }
    if (eventsdb[eventID].type == "spotkanie") {
      eventsdb[eventID].by = []
      eventsdb[eventID].for = ["#su"]
    }
    response = "Successfully added 1 event!"
  }
  
  //Modify event
  if (req.body.event_id != undefined) {
    var eventID = req.body.event_id;
    delete req.body.event_id;
    if (eventsdb[eventID] == undefined) {
      res.status(404);
      res.send("Event not found!");
      return false;
    }
    for (x in req.body) {
      eventsdb[eventID][x] = req.body[x]
    }
    /*if (!eventsdb[eventID].by.includes(userID)) {
      eventsdb[eventID].by.push(userID);
    }*/
    if (eventsdb[eventID].type == "szkolne") {
      eventsdb[eventID].by = []
    }
    if (eventsdb[eventID].type == "spotkanie") {
      eventsdb[eventID].by = []
      eventsdb[eventID].for = ["#su"]
    }
    response = "Successfully modified 1 event!"
  }
  
  mk.saveJSON("./events/events.json", JSON.stringify(eventsdb));
  res.status(200);
  res.send(response);
})

//Editing/adding calendar event points
app.post('/pmk/eventpoints/modify/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var eventsdb = mk.readJSON("./events/events.json");
  var eventpointsdb = mk.readJSON("./events/eventPoints.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  eventsdb = Object.fromEntries(
    Object.entries(eventsdb).sort(([key1, event1], [key2, event2]) => {
      const date1 = new Date(event1.startdate);
      const date2 = new Date(event2.startdate);
      return date1 - date2;
    })
  );
  
  var response;
  
  if (req.body.delete == true) { //Delete points from event
    if (eventpointsdb[req.body.id] == undefined) {
      res.status(404);
      res.send("Event not found!");
      return false;
    }
    delete eventpointsdb[req.body.id];
    response = "Successfully deleted 1 event points!";
  } else if (req.body.id == undefined) { //New event
    const keys = ["name", "amount", "eventid"]
    var eventPointsID = generateID(8);
    while (eventpointsdb[eventPointsID] != undefined) {
      eventPointsID = generateID(8);
    }
    for (key in keys) {
      key = keys[key]
      if (req.body[key] == undefined) {
        res.status(404);
        res.send("Incomplete information provided!");
        return false;
      }
    }
    if (eventsdb[req.body.eventid] == undefined) {
      res.status(404);
      res.send("Event not found!");
      return false;
    }
    eventpointsdb[eventPointsID] = req.body;
    response = "Successfully added points for 1 event!"
  } else if (req.body.id != undefined) { //Modify event
    var eventPointsID = req.body.id;
    delete req.body.id;
    if (eventpointsdb[eventPointsID] == undefined) {
      res.status(404);
      res.send("Event not found!");
      return false;
    }
    if (eventsdb[req.body.eventid] == undefined) {
      res.status(404);
      res.send("Event not found!");
      return false;
    }
    for (x in req.body) {
      eventpointsdb[eventPointsID][x] = req.body[x]
    }
    response = "Successfully modified 1 event!"
  }
  
  const eventsIDs = Object.keys(eventsdb);
  var sortedEventPointsDB = {}
  
  for (eID in eventsIDs) {
    var eID = eventsIDs[eID];
    for (ep in eventpointsdb) {
      if (eventpointsdb[ep].eventid == eID) {
        sortedEventPointsDB[ep] = eventpointsdb[ep];
        delete eventpointsdb[ep];
      }
    }
  }
  
  for (ep in eventpointsdb) {
    sortedEventPointsDB[ep] = eventpointsdb[ep];
  }
  
  mk.saveJSON("./events/eventPoints.json", JSON.stringify(sortedEventPointsDB));
  res.status(200);
  res.send(response);
})

//Editing users' points
app.post('/pmk/points/modify/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var pointsdb = mk.readJSON("./userdb/points.json");
  var eventpointsdb = mk.readJSON("./events/eventPoints.json");
  var eventsdb = mk.readJSON("./events/events.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userdb[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  //Zablokowanie dostępu w przypadku zwykłej modyfkacji poniżej 4 poziomu uprawnień
  if (req.body.peid == undefined && userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  //Sprawdzanie, czy użytkownik istnieje
  if (userdb[req.body.userid] == undefined) {
    res.status(404);
    res.send("User not found");
    return false;
  }
  
  var response = {
    "success": false,
    "state": ""
  }
  
  //Dodawanie punktów w ramach zaplanowanych wydarzeń przez skaner
  if (req.body.peid != undefined && userdb[userID].access < 4) {
    var PEID = req.body.peid
    if (eventpointsdb[PEID] == undefined) {
      res.status(404);
      res.send("Invalid PEID!");
      return false;
    }
    var event = eventsdb[eventpointsdb[PEID].eventid]
    if (!event.by.includes(userID)) {
      res.status(403);
      res.send("Insufficient access level");
      return false;
    }
    var amount = eventpointsdb[PEID].amount
    var today = new Date()
    var todayFull = moment(today).tz(countryTimezone).format('YYYY-MM-DD HH:mm:ss');
    today = moment(today).tz(countryTimezone).format('YYYY-MM-DD');
    
    var currentDate = new Date();
    
    event.startdate = moment(event.startdate).tz(countryTimezone).format('YYYY-MM-DD');
    
    //Sprawdzanie, czy wydarzenie się rozpoczeło
    if (event.enddate != "") {
      event.enddate = moment(event.enddate).tz(countryTimezone).format('YYYY-MM-DD');
      if (today > event.enddate || today < event.startdate) {
        res.status(423);
        res.send("Nie możesz teraz dodać Wirutalnych Rybek w ramach tego wydarzenia")
        return false;
      }
    } else {
      if (today != event.startdate) {
        res.status(423);
        res.send("Nie możesz teraz dodać Wirutalnych Rybek w ramach tego wydarzenia")
        return false;
      }
    }
    
    var entry = {"id": PEID, "amount": parseInt(amount), "ts": todayFull}
    response = addPointsEntry(req.body.userid, entry);
    res.status(200);
    res.send(response);
    return false;
  } else if (req.body.peid != undefined && userdb[userID].access >= 3) {
    var PEID = req.body.peid
    if (eventpointsdb[PEID] == undefined) {
      res.status(404);
      res.send("Invalid PEID!");
      return false;
    }
    var event = eventsdb[eventpointsdb[PEID].eventid]
    var amount = eventpointsdb[PEID].amount
    if (req.body.amount != undefined) {
      amount = req.body.amount
    }
    var today = new Date()
    var todayFull = moment(today).tz(countryTimezone).format('YYYY-MM-DD HH:mm:ss');
    
    var entry = {"id": PEID, "amount": parseInt(amount), "ts": todayFull}
    response = addPointsEntry(req.body.userid, entry);
    res.status(200);
    res.send(response);
    return false;
  } else if (req.body.peid == undefined && userdb[userID].access >= 3) {
    if (req.body.amount == undefined) {
      res.status(404);
      res.send("Amount and PEID not provided!");
      return false;
    }
    amount = req.body.amount
    var today = new Date()
    var todayFull = moment(today).tz(countryTimezone).format('YYYY-MM-DD HH:mm:ss');
    
    var entry = {"amount": parseInt(amount), "ts": todayFull}
    response = addPointsEntry(req.body.userid, entry);
    res.status(200);
    res.send(response);
    return false;
  } else {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
});

function addPointsEntry(userid, entry) {
  var userdb = mk.readJSON("./userdb/users.json");
  var pointsdb = mk.readJSON("./userdb/points.json");
  var amount = entry.amount;
  
  if (pointsdb[userid] == undefined) { //Pierwszy wpis użytkownika
    pointsdb[userid] = {
      "points": 0,
      "history": []
    }
    pointsdb[userid].history.unshift(entry)
  } else {
    pointsdb[userid].history.unshift(entry)
  }
  
  if (amount > 0) {
    notifyUsers([userid], "😍 Otrzymujesz Wirtualne Rybki!", `${entry.amount} 🐟 wpada na Twoje konto! 🥳`);
  }
  
  var points = 0;
  for (entry in pointsdb[userid].history) {
    points += pointsdb[userid].history[entry].amount
  }
  pointsdb[userid].points = points
  var owner = `${userdb[userid].firstname} ${userdb[userid].lastname}, ${userdb[userid].class.toUpperCase()}`
  if (amount != 0) {
    mk.saveJSON("./userdb/points.json", JSON.stringify(pointsdb));
  }
  
  return {points, owner, "success": true};
}

//KUPONY

//Odbieranie kuponów
app.post('/coupons/get', jsonParser, (req, res) => {
  var userID = req.body.userid;
  var ECID = req.body.ecid;

  //Getting current timestamp
  const timestamp = Math.floor(Date.now())

  var availableCoupons = mk.readJSON("./events/eventCoupons.json");
  var userDB = mk.readJSON("./userdb/users.json");
  var couponsDB = mk.readJSON("./events/coupons.json");
  var pointsDB = mk.readJSON("./userdb/points.json");
  
  

  //Check if coupon is available to get
  if (availableCoupons[ECID] == undefined) {
    res.status(404);
    res.send("ECID not found.");
    return false;
  } else if (availableCoupons[ECID].available == false) {
    res.status(404);
    res.send("Nie możesz już odebrać tego kuponu!");
    return false;
  }
  

  //Check users information
  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("User not found.");
    return false;
  } else if (!availableCoupons[ECID].for.includes(userDB[userID].class)) {
    res.status(404);
    res.send("You cannot get this coupon!");
    return false;
  }
  
  //Check amount of points
  if (pointsDB[userID] == undefined) {
    res.status(404);
    res.send("Nie masz wystarczającej ilości punktów!")
    return false;
  } else if (pointsDB[userID].points < availableCoupons[ECID].cost) {
    res.status(404);
    res.send("Nie masz wystarczającej ilości punktów!")
    return false;
  }
  
  var today = new Date()
  var todayFull = moment(today).tz(countryTimezone).format('YYYY-MM-DD HH:mm:ss');
    
  var entry = {"amount": parseInt(availableCoupons[ECID].cost)*-1, "ts": todayFull}
  var response = addPointsEntry(userID, entry);
  if (response.success != true) {
    res.status(404);
    res.send("Wystąpił błąd!")
    return false;
  }

  var couponID = "C-"+generateOrderID();
  while (couponsDB[couponID] != undefined) {
    couponID = "C-"+generateOrderID();
  }

  var couponData = {
    "ecid": ECID,
    "userid": userID,
    "cost": availableCoupons[ECID].cost
  }

  couponsDB[couponID] = couponData;
  mk.saveJSON("./events/coupons.json", JSON.stringify(couponsDB));
  
  delete couponsDB[couponID].userid;
  delete couponsDB[couponID].cost
          
  couponsDB[couponID].name = availableCoupons[ECID].name
  couponsDB[couponID].icon_url = availableCoupons[ECID].icon_url
  couponsDB[couponID].info = availableCoupons[ECID].info
  var coupon = {}
  coupon[couponID] = couponsDB[couponID]

  notifyUsers(userID, "🎫 Nowy kupon", "Do Twojego konta został dodany nowy kupon. Sprawdź w zakładce Bilety i kupony.");
  res.status(200);
  res.send(coupon);

  return false;
})

//Zwracanie kuponów
app.post('/coupons/return', jsonParser, (req, res) => {
  var CID = req.body.cid;

  //Getting current timestamp
  const timestamp = Math.floor(Date.now())

  var userDB = mk.readJSON("./userdb/users.json");
  var couponsDB = mk.readJSON("./events/coupons.json");
  var pointsDB = mk.readJSON("./userdb/points.json");
  
  if (couponsDB[CID] == undefined) {
    res.status(404);
    res.send("Nie znaleziono tego kuponu!");
    return false;
  }
  
  if (couponsDB[CID].userid == undefined || userDB[couponsDB[CID].userid] == undefined) {
    delete couponsDB[CID];
    mk.saveJSON("./events/coupons.json", JSON.stringify(couponsDB));

    res.status(200);
    res.send("Pomyślnie zwrócono kupon!");
    return false;
  }
  
  var userID = couponsDB[CID].userid;
  
  var today = new Date()
  var todayFull = moment(today).tz(countryTimezone).format('YYYY-MM-DD HH:mm:ss');
    
  var entry = {"amount": parseInt(couponsDB[CID].cost), "ts": todayFull}
  var response = addPointsEntry(userID, entry);
  if (response.success != true) {
    res.status(404);
    res.send("Wystąpił błąd!")
    return false;
  }
  
  delete couponsDB[CID];
  mk.saveJSON("./events/coupons.json", JSON.stringify(couponsDB));

  res.status(200);
  res.send("Pomyślnie zwrócono kupon!");
})

//Modyfikacja dostępych kuponów przez PMK
app.post('/pmk/points/coupons/manage/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var eventCouponsDB = mk.readJSON("./events/eventCoupons.json");
  var eventsDB = mk.readJSON("./events/events.json");

  if (userdb[userID].loginid != loginID || userdb[userID] == undefined) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  //ECID - Event Coupon ID
  
  if (req.body.ecid != undefined && eventCouponsDB[req.body.ecid] == undefined) {
    res.status(404);
    res.send("Event coupon with provided ID not found!");
    return false;
  }
  
  var ECID;
  var response;
  const requiredElements = ["name", "for", "icon_url", "cost", "info"]
  
  if (req.body.ecid == undefined) { //Tworzenie nowego kuponu
    ECID = generateID(8);
    while (eventCouponsDB[ECID] != undefined) {
      ECID = generateID(8);
    }

    var eventCouponData = {}
    
    for (e in requiredElements) {
      if (req.body[requiredElements[e]] == undefined) {
        res.status(404);
        res.send("Incomplete data!");
        return false;
      }
      eventCouponData[requiredElements[e]] = req.body[requiredElements[e]];
    }
  
    eventCouponData.available = false;
    
    //Zamiana ceny na float
    eventCouponData.cost = parseInt(Math.ceil(parseFloat(eventCouponData.cost)))
    if (isNaN(eventCouponData.cost)) {
      res.status(404);
      res.send("Invalid cost format!");
      return false;
    }
    
    eventCouponsDB[ECID] = eventCouponData;
    response = "Successfully added new coupon!"
  } else if (req.body.delete == true) { //Usuwanie kuponu
    ECID = req.body.ecid;
    delete eventCouponsDB[ECID];
    response = "Successfully removed 1 coupon!"
  } else { //Edycja istniejącego kuponu
    ECID = req.body.ecid;
    
    for (e in requiredElements) {
      if (req.body[requiredElements[e]] != undefined) {
        eventCouponsDB[ECID][requiredElements[e]] = req.body[requiredElements[e]];
      }
    }
    
    if (req.body.available != undefined) {
      eventCouponsDB[ECID].available = req.body.available
    }
    
    //Zamiana ceny na float
    eventCouponsDB[ECID].cost = parseInt(Math.ceil(parseFloat(eventCouponsDB[ECID].cost)))
    if (isNaN(eventCouponsDB[ECID].cost)) {
      res.status(404);
      res.send("Invalid cost format!");
      return false;
    }
    response = "Successfully modified 1 coupon!"
  }
  
  
  mk.saveJSON("./events/eventCoupons.json", JSON.stringify(eventCouponsDB));

  
  res.status(200);
  res.send(response);
})

//Dodawanie kuponów do użytkowników
app.post('/pmk/points/coupons/grant/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userDB = mk.readJSON("./userdb/users.json");
  var eventCouponsDB = mk.readJSON("./events/eventCoupons.json");
  var couponsDB = mk.readJSON("./events/coupons.json");

  if (userDB[userID].loginid != loginID || userDB[userID] == undefined) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userDB[userID].access == undefined || userDB[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  //ECID - Event Coupon ID
  
  if (req.body.ecid == undefined || eventCouponsDB[req.body.ecid] == undefined) {
    res.status(404);
    res.send("Event coupon with provided ID not found!");
    return false;
  }
  
  userID = req.body.userid;
  var ECID = req.body.ecid;


  //Check users information
  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("User not found.");
    return false;
  }

  var couponID = "C-"+generateOrderID();
  while (couponsDB[couponID] != undefined) {
    couponID = "C-"+generateOrderID();
  }

  var couponData = {
    "ecid": ECID,
    "userid": userID,
    "cost": 0
  }

  couponsDB[couponID] = couponData;
  mk.saveJSON("./events/coupons.json", JSON.stringify(couponsDB));

  notifyUsers([userID], "🎫 Nowy kupon", "Do Twojego konta został dodany nowy kupon. Sprawdź w zakładce Bilety i kupony.");
  res.status(200);
  res.send("Pomyślnie przyznano kupon!");
})

//PMK credentials generate
app.get('/pmk/cred/generate/:userid', async (req, res) => {
  var userID = req.params.userid;
  var userDB = mk.readJSON("./userdb/users.json");
  
  if (userDB[userID] == undefined) {
    res.send(404)
    return false;
  }
  
  var userName = userDB[userID].firstname;
  userName = userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase()
  
  var login = `${userDB[userID].firstname.charAt(0).toLowerCase()}.${userDB[userID].lastname.toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, "").replaceAll(/ł/g, "l").replaceAll(/ß/g, "ss")}`
  
  userDB[userID].cred = {
    login: login,
    pass: generateID(8)
  }
  
  var additionalInfo = {
    "name": userName,
    "login": login,
    "password": userDB[userID].cred.pass
  }
  var userEmail = userDB[userID].email

  var mailContent = fs.readFileSync(`./templates/passgen.html`, 'utf8')
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

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      res.status(500);
      res.send("An error occured while sending email")
    } else {
      res.status(200);
      res.send("Success")
      mk.saveJSON("./userdb/users.json", JSON.stringify(userDB));
    }
  });
})

//PMK login by credentials
app.post('/pmk/cred/login', jsonParser, (req, res) => {
  var login = req.body.login;
  var password = req.body.pass;
  console.log(login);
  console.log(password);
  
  var userDB = mk.readJSON("./userdb/users.json");
  
  for (user in userDB) {
    if (userDB[user].cred == undefined) {
      continue;
    }
    
    if (userDB[user].cred.login == login && userDB[user].cred.pass == password) {
        console.log("udalo sie zalogowac")
      res.status(200)
      res.send({
        loginid: userDB[user].loginid
      })
      return false;
    }
  }
  
  res.status(404)
  res.send("User not found")
});


//Skaner 2.0: Skanowanie kodu QR użytkownika
app.post('/pmk/scan/user/:userid/:loginid', jsonParser, (req, res) => {
  /*
  Należy wyszukać wszystkie kupony użytkownika
  -> jeśli są to zwrócić je w response
  -> jeśli nie ma, przyznać punkty według PEID
  */
  
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userDB = mk.readJSON("./userdb/users.json");
  
  var couponsDB = mk.readJSON("./events/coupons.json");
  var eventCouponsDB = mk.readJSON("./events/eventCoupons.json");
  
  var eventPointsDB = mk.readJSON("./events/eventPoints.json");

  if (userDB[userID].loginid != loginID || userDB[userID] == undefined) {
    res.status(403);
    res.send("Invalid loginID");
    return false;
  }
  if (userDB[userID].access == undefined || userDB[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var user = req.body.userid;
  
  if (userDB[user] == undefined) {
    res.status(404);
    res.send("User not found!")
    return false;
  }
  
  var response = {
    "success": true
  }
  
  var userCoupons = {}
  
  for (let coupon in couponsDB) {
    if (couponsDB[coupon].userid == user) {
      var ECID = couponsDB[coupon].ecid;
      if (eventCouponsDB[ECID] == undefined) {
        continue;
      }
      var couponData = eventCouponsDB[ECID];

      delete couponsDB[coupon].userid;
      delete couponsDB[coupon].cost;
      delete couponsDB[coupon].ecid;
          
      couponsDB[coupon].name = couponData.name
      couponsDB[coupon].icon_url = couponData.icon_url
      couponsDB[coupon].info = couponData.info

      userCoupons[coupon] = couponsDB[coupon];
    }
  }
  
  if (Object.keys(userCoupons).length > 0) {
    response.coupons = userCoupons;
    response.success = true
    res.status(200);
    res.send(JSON.stringify(response))
    return false;
  }
  
  

  res.status(200);
  res.send(response);
})

//Skanowanie kuponów przez PMK
app.post('/pmk/coupons/scan/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userDB = mk.readJSON("./userdb/users.json");
  
  var couponsDB = mk.readJSON("./events/coupons.json");
  var eventCouponsDB = mk.readJSON("./events/eventCoupons.json");
  
  var eventPointsDB = mk.readJSON("./events/eventPoints.json");
  
  //ARRAY
  var couponIDlist = req.body.couponid
  

  if (userDB[userID].loginid != loginID || userDB[userID] == undefined) {
    res.status(403);
    res.send("Invalid loginID");
    return false;
  }
  if (userDB[userID].access == undefined || userDB[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  
  var response = {"success": false, "info": ""}
  
  for (let x in couponIDlist) {
    var couponID = couponIDlist[x]
      if (couponID == undefined || couponsDB[couponID] == undefined) {
      response.state = "Kupon nie istnieje!"
      res.status(200);
      res.send(JSON.stringify(response));
      return false;
    }

    var couponOwner;

    //Pobieranie właściciela biletu
    if (userDB[couponsDB[couponID].userid] != undefined) {
      couponOwner = `${userDB[couponsDB[couponID].userid].firstname} ${userDB[couponsDB[couponID].userid].lastname}, ${userDB[couponsDB[couponID].userid].class.toUpperCase()}`
    }

    response.info += eventCouponsDB[couponsDB[couponID].ecid].name+"<br><br>"+eventCouponsDB[couponsDB[couponID].ecid].info+"<br><br>"
    response.owner = couponOwner

    response.state = "Zeskanowano pomyślnie!"

    
  }
  
  for (let x in couponIDlist) {
    delete couponsDB[couponIDlist[x]]
  }
  
  mk.saveJSON("./events/coupons.json", JSON.stringify(couponsDB));
  response.success = true

  res.status(200);
  res.send(JSON.stringify(response));
})


//Editing SLS database through PMK
app.post('/pmk/sls/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var slsdb = mk.readJSON("./userdb/sls.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access < 5 && !["1fbyc0ciwry4hop9"].includes(userID)) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var slsData = req.body;
  if (slsData.participants != undefined) {
    slsdb.participants = slsData.participants;
  }
  if (slsData.page != undefined) {
    slsdb.page = slsData.page;
  }
  
  const dataArray = Object.entries(slsdb.participants);
  dataArray.sort((a, b) => b[1].points - a[1].points);
  const sortedObject = Object.fromEntries(dataArray);
  slsdb.participants = sortedObject;
  
  mk.saveJSON("./userdb/sls.json", JSON.stringify(slsdb));
  
  res.status(200);
  res.send("Success");
});

//Sending push notifications from PMK
app.post('/pmk/push/:userid/:loginid', jsonParser, async (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  const users = req.body.users;
  //console.log(users);
  var pushdb = mk.readJSON("./userdb/push.json")
  var successCount = 0;
  
  var response = "test"
  response = await notifyUsers(users, req.body.title, req.body.content)
  
  
  /*
  for (user in users) {
    user = users[user]
    if (pushdb[user] == undefined) {
      continue;
    }
    var sub = pushdb[user];
    var options = { TTL: 3600 }
    var context = `{"title": "${req.body.title}", "content": "${req.body.content}", "timestamp": ${Math.floor(Date.now())}}`
    try {
      push.sendNotification(sub, context, options);
      //console.log(context);
      successCount += 1
    } catch (err) {
      console.error(err)
    }
  }*/
  
  res.status(200);
  res.send(response);
})

//Deleting users using PMK
app.post('/pmk/manageusers/delete/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userDB = mk.readJSON("./userdb/users.json");
  
  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userDB[userID].access == undefined || userDB[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (req.body.owr == undefined || req.body.owr != owr) {
    res.status(406);
    res.send("Invalid OWR code!")
    return false;
  }
  
  var users = req.body.users
  
  if (users == undefined || users == []) {
    res.status(404);
    res.send("Please provide users to delete")
    return false;
  }
  
  var response = {
    "overallSuccess": 0,
    "overallFailure": 0
  }
  
  //Sprawdzanie, czy można usunąć wszystkich użytkowników
  for (u in users) {
    var user = users[u]
    response[user] = {}
    response[user].del = false
    
    if (userDB[user] == undefined) {
      delete response[user];
      continue;
    }
    
    response[user].name = `${userDB[user].firstname} ${userDB[user].lastname}, ${userDB[user].class.toUpperCase()}`
    
    if (user == userID) {
      response[user].state = "Cannot delete own account"
      response.overallFailure += 1
      continue;
    }
    
    if (userDB[userID].access <= userDB[user].access) {
      response[user].state = "Insufficient access level"
      response.overallFailure += 1
      continue;
    }
    
    response[user].del = true
  }
  
  users = []
  for (u in response) {
    if (response[u].del == true) {
      users.push(u)
    }
  }
  
  /*console.log("Konta do usunięcia:")
  console.log(users)*/

  var ticketsDB = mk.readJSON("./events/tickets.json"); //Bilety - zmiana danych +
  var couponsDB = mk.readJSON("./events/coupons.json"); //Kupony - usunięcie +
  var pointsDB = mk.readJSON("./userdb/points.json"); //Punkty - usunięcie +
  var exDB = mk.readJSON("./icsu/exemptions.json"); //Zwolnienia - usunięcie +
  //var reviewsDB = mk.readJSON("./icsu/review.json"); //Sprawozdania - NIE USUWAMY
  var pushDB = mk.readJSON("./userdb/push.json"); //Dane PUSH - usunięcie +
  var picDB = mk.readJSON("./userdb/pic.json"); //Zdjęcie profilowe - usunięcie
  
  
  //Bilety
  for (t in ticketsDB) {
    if (users.includes(ticketsDB[t].userid)) {
      if (userDB[ticketsDB[t].userid] == undefined) {
        continue;
      }
      ticketsDB[t].userid = `${userDB[ticketsDB[t].userid].firstname} ${userDB[ticketsDB[t].userid].lastname}, ${userDB[ticketsDB[t].userid].class.toUpperCase()}`
    }
  }

  //Kupony
  for (c in couponsDB) {
    if (users.includes(couponsDB[c].userid)) {
      delete couponsDB[c];
    }
  }

  //Zwolnienia
  for (ex in exDB) {
    if (users.includes(exDB[ex].for)) {
      delete exDB[ex]
    }
  }
  
  //userID jako Object.key
  for (u in users) {
    var user = users[u]
    //Punkty
    if (pointsDB[user] != undefined) {
      delete pointsDB[user];
    }

    //Dane PUSH
    if (pushDB[user] != undefined) {
      delete pushDB[user]; //Usuwanie danych PUSH
    }

    //Zdjęcie profilowe
    if (picDB[user] != undefined) {
      const apiUrl = `https://api.imgur.com/3/image/${picDB[user][1]}`;
          axios.delete(apiUrl, {
        headers: {
          'Authorization': `Client-ID ${imgurClientID}`
        }
      })
        .then(response => {
          console.log("Pomyślnie usunięto zdjęcie!")
          delete picDB[user];
          mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
        })
        .catch(error => {
          console.log("Wystąpił błąd podczas usuwania zdjęcia!")
          delete picDB[user];
          mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
        });
    }

    //USUWANIE Z BAZY UŻYTKOWNIKÓW
    if (userDB[user] != undefined) {
      response[user].state = "Success"
      response.overallSuccess += 1
      delete userDB[user];
    }
  }

  mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));
  mk.saveJSON("./events/coupons.json", JSON.stringify(couponsDB));
  mk.saveJSON("./userdb/points.json", JSON.stringify(pointsDB));
  mk.saveJSON("./icsu/exemptions.json", JSON.stringify(exDB));
  mk.saveJSON("./userdb/push.json", JSON.stringify(pushDB));
  mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
  
  mk.saveJSON("./userdb/users.json", JSON.stringify(userDB));
  
  
  res.status(200)
  res.send(response);
});


//Editing user from PMK
app.post('/pmk/manageusers/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  const users = req.body.users;
  delete req.body.users;
  
  //Check if there is a change to higher access level user (WAR. 1)
  for (user in users) {
    user = users[user]
    if (userdb[user].access >= userdb[userID].access && user != userID) {
      res.status(403);
      res.send("Insufficient access level");
      console.log("WARUNEK 1")
      return false;
    }
  }
  
  //Check if there is an access level change (WAR. 2)
  if (req.body.access != undefined && userdb[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    console.log("WARUNEK 2")
    return false;
  }
  
  //Check if there is an higher access level change (WAR. 3)
  if (req.body.access != undefined && req.body.access >= userdb[userID].access) {
    res.status(403);
    res.send("Insufficient access level");
    console.log("WARUNEK 3")
    return false;
  }
  
  //Check if there is own access level change (WAR. 4)
  if (req.body.access != undefined && users.includes(userID)) {
    res.status(403);
    res.send("Insufficient access level");
    console.log("WARUNEK 4")
    return false;
  }
  
  //Check the amount of users to make changes (WAR. 5)
  console.log(users.length);
  if (users.length > 1) {
    if (req.body.firstname != undefined) {
      res.status(403);
      res.send("Unable to make this changes to few people");
      console.log("WARUNEK 5A")
      return false;
    } else if (req.body.lastname != undefined) {
      res.status(403);
      res.send("Unable to make this changes to few people");
      console.log("WARUNEK 5B")
      return false;
    } else if (req.body.nickname != undefined) {
      res.status(403);
      res.send("Unable to make this changes to few people");
      console.log("WARUNEK 5C")
      return false;
    } else if (req.body.email != undefined) {
      res.status(403);
      res.send("Unable to make this changes to few people");
      console.log("WARUNEK 5D")
      return false;
    }
  }
  
  //Check access level for email change (WAR. 6)
  if (req.body.email != undefined && userdb[userID].access < 5) {
      res.status(403);
      res.send("Insufficient access level");
      console.log("WARUNEK 5D")
      return false;
    }
  
  //Formatting
  if (req.body.firstname != undefined) {
    req.body.firstname = req.body.firstname.toUpperCase();
  }
  if (req.body.lastname != undefined) {
    req.body.lastname = req.body.lastname.toUpperCase();
  }
  if (req.body.access != undefined) {
    req.body.access = parseInt(req.body.access);
  }
  
  var changeableValues = ["firstname", "lastname", "nickname", "class", "email", "access"]
  
  var changedValues = []
  for (i in req.body) {
    if (changeableValues.includes(i)) {
      changedValues.push(i.toUpperCase());
    } else {
      delete req.body[i];
    }
  }
  
  if (changedValues.length == 0) {
    res.status(200);
    res.send("There was nothing to change!");
    return false;
  }

  const timestamp = Math.floor(Date.now());
  
  for (user in users) {
    user = users[user];
    for (i in req.body) {
      if (i == "cred") {
        continue;
      }
      userdb[user][i] = req.body[i];
      userdb[user].lastactivity = timestamp;
    }
  }
  
  mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
  
  res.status(200);
  res.send(`Changed ${changedValues.length} values (${changedValues.join(", ")}) of ${users.length} users!`);
})

//Getting classes array
app.get('/getclasses', (req, res) => {
  var peopledb = mk.readJSON("./userdb/people.json");
  var classes = []
  for (x in peopledb) {
    classes.push(x)
  }
  res.status(200);
  res.send(classes.join(";"));
});

//Getting classes array
app.get('/pmk/su/userlist/:userid/:loginid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var db = {}
  
  for (user in userdb) {
    if (userdb[user].access < 1 || userdb[user].access > 5) {
      continue;
    }
    db[user] = {
      "firstname": userdb[user].firstname,
      "lastname": userdb[user].lastname,
      "class": userdb[user].class,
    }
  }
  
  const sortedData = Object.entries(db).sort((a, b) => a[1].lastname.localeCompare(b[1].lastname));
  const sortedJson = Object.fromEntries(sortedData);
  
  res.status(200);
  res.send(sortedJson);
});

//Editing class from PMK
app.post('/pmk/manageclass/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var peopledb = mk.readJSON("./userdb/people.json")
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var className = req.body.classname
  var luckycount = req.body.luckycount
  var list = req.body.list
  
  var response = "";
  
  //Formattings
  className = className.toLowerCase()
  
  luckycount = parseInt(luckycount)
  
  if (list != undefined) {
    list = list.split(";")
    for (name in list) {
      list[name] = list[name].toUpperCase()
    }
    peopledb[className] = {luckycount, list}
    response = `Class ${className.toUpperCase()} successfully edited!`
  } else if (peopledb[className] != undefined) {
    delete peopledb[className]
    response = `Class ${className.toUpperCase()} successfully removed!`
  } else {
    res.status(404);
    res.send("Class doesn't exist!");
    return false;
  }
  
  mk.saveJSON("./userdb/people.json", JSON.stringify(peopledb));
  
  res.status(200);
  res.send(response);
})


//Downloading tickets for PMK
app.get('/pmk/tickets/list/:userid/:loginid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ticketsdb = mk.readJSON("./events/tickets.json");
  var ticketeventsdb = mk.readJSON("./events/eventTickets.json");

  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  
  for (ticket in ticketsdb) {
    var ticketOwnerID = ticketsdb[ticket].userid;
    var ticketEventID = ticketsdb[ticket].ticket_event_id;
    if (userdb[ticketOwnerID] == undefined) {
      ticketsdb[ticket].owner = ticketOwnerID;
      ticketsdb[ticket].ownerid = ticketOwnerID;
    } else {
      ticketsdb[ticket].owner = `${userdb[ticketOwnerID].firstname} ${userdb[ticketOwnerID].lastname}, ${userdb[ticketOwnerID].class.toUpperCase()}`
      ticketsdb[ticket].ownerid = ticketOwnerID;
    }
    if (ticketeventsdb[ticketEventID] == undefined) { //Bilety z usuniętych wydarzeń biletowanych
      //delete ticketsdb[ticket];
      //continue;
      ticketsdb[ticket].status = 5 //NIEZNANY
    } else {
      ticketsdb[ticket].event = ticketeventsdb[ticketEventID].name;
      ticketsdb[ticket].consent_required = ticketeventsdb[ticketEventID].consent;
      ticketsdb[ticket].cost = parseFloat(ticketeventsdb[ticketEventID].cost);
    }
    ticketsdb[ticket].paid = parseFloat(ticketsdb[ticket].paid);
    delete ticketsdb[ticket].userid;
    
    var x = ticketsdb[ticket];
    if (x.status != undefined) {
      //
    } else if (x.used == true) {
      ticketsdb[ticket].status = 4
    } else if (x.paid >= x.cost) { //Bilet opłacony
      if (x.consent_required == false) {
        ticketsdb[ticket].status = 3
      } else {
        if (x.consent == true) {
          ticketsdb[ticket].status = 3
        } else {
          ticketsdb[ticket].status = 2
        }
      }
    } else {
      if (x.consent_required == false) {
        ticketsdb[ticket].status = 0
      } else {
        if (x.consent == true) {
          ticketsdb[ticket].status = 1
        } else {
          ticketsdb[ticket].status = 0
        }
      }
    }
  }
  ticketsdb["eventTickets"] = ticketeventsdb;
  
  res.status(200);
  res.send(ticketsdb);
});

app.get('/pmk/tickets/peoplelist/:userid/:loginid/:teid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ticketsdb = mk.readJSON("./events/tickets.json");
  var ticketeventsdb = mk.readJSON("./events/eventTickets.json");
  var TEID = req.params.teid;

  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var peoplelist = {}
  
  for (ticket in ticketsdb) {
    if (ticketsdb[ticket].ticket_event_id != TEID) {
      continue;
    }
    var ticketOwnerID = ticketsdb[ticket].userid;
    if (userdb[ticketOwnerID] == undefined) {
      continue;
    }
    peoplelist[ticketOwnerID] = {
      "firstname": userdb[ticketOwnerID].firstname,
      "lastname": userdb[ticketOwnerID].lastname,
      "class": userdb[ticketOwnerID].class
    }
  }
  
  res.status(200);
  res.send(peoplelist);
});

//Edycja biletu przez PMK
app.post('/pmk/tickets/manage/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ticketsDB = mk.readJSON("./events/tickets.json");
  var ticketEventsDB = mk.readJSON("./events/eventTickets.json");

  if (userdb[userID].loginid != loginID || userdb[userID] == undefined) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 3) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (req.body.ticketid != undefined && ticketsDB[req.body.ticketid] == undefined) {
    res.status(404);
    res.send("Ticket not found");
    return false;
  }
  
  var ticketID;
  var response;
  
  if (req.body.ticketid == undefined) { //Tworzenie nowego biletu
    ticketID = generateOrderID();
    while (ticketsDB[ticketID] != undefined) {
      ticketID = generateOrderID();
    }

    var ticketData = {}
    
    if (req.body.ticket_event_id != undefined) {
      ticketData.ticket_event_id = req.body.ticket_event_id;
    } else {
      res.status(404);
      res.send("Ticket event ID not provided!")
      return false;
    }
    
    if (req.body.owner != undefined) {
      if (userdb[req.body.owner] == undefined) {
        ticketData.userid = req.body.owner.toUpperCase();
        for (let user in userdb) {
          var check = `${userdb[user].firstname} ${userdb[user].lastname}, ${userdb[user].class}`.toUpperCase()
          if (ticketData.userid == check) {
            ticketData.userid = user
            response = "Pomyślnie dodano nowy bilet i przypisano do Profilu Mobilnego użytkownika!"
            break;
          }
        }
      } else {
        ticketData.userid = req.body.owner;
      } 
    } else {
      res.status(404);
      res.send("Owner not provided!")
      return false;
    }
    
    if (req.body.paid != undefined) {
      ticketData.paid = req.body.paid;
    }
    
    if (req.body.consent != undefined) {
      ticketData.consent = req.body.consent;
    }
    
    ticketsDB[ticketID] = ticketData;
    if (!response) {response = "Pomyślnie dodano nowy bilet!"}
  } else { //Edycja istniejącego biletu
    ticketID = req.body.ticketid;
    if (req.body.paid != undefined) {
      ticketsDB[ticketID].paid = req.body.paid;
    }
    if (req.body.consent != undefined) {
      ticketsDB[ticketID].consent = req.body.consent;
    }
    if (req.body.used != undefined) {
      ticketsDB[ticketID].used = req.body.used;
    }
    if (req.body.delete == true) {
      delete ticketsDB[ticketID];
      response = "Bilet został usunięty!"
    } else {
      response = "Zmiany zostały wprowadzone pomyślnie!"
    }
  }
  
  
  mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));

  
  res.status(200);
  res.send(response);
})

//Skanowanie biletu przez PMK
app.post('/pmk/tickets/scan/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ticketsDB = mk.readJSON("./events/tickets.json");
  var ticketEventsDB = mk.readJSON("./events/eventTickets.json");

  if (userdb[userID].loginid != loginID || userdb[userID] == undefined) {
    res.status(403);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 2) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (req.body.teid == undefined) {
    res.status(403);
    res.send("TEID not provided!");
    return false;
  }
  
  var response = {"success": false}
  
  if (req.body.ticketid == undefined || ticketsDB[req.body.ticketid] == undefined) {
    response.state = "Bilet nie istnieje!"
    res.status(200);
    res.send(JSON.stringify(response));
    return false;
  }
  
  var ticketID = req.body.ticketid;
  var event = ticketEventsDB[ticketsDB[ticketID].ticket_event_id];
  var ticket = ticketsDB[ticketID];
  var TEID = req.body.teid;
  var ticketOwner;
  
  //Pobieranie właściciela biletu
  if (userdb[ticket.userid] != undefined) {
    ticketOwner = `${userdb[ticket.userid].firstname} ${userdb[ticket.userid].lastname}, ${userdb[ticket.userid].class.toUpperCase()}`
  } else {
    ticketOwner = ticket.userid.toUpperCase()
  }
  response.event = event.name
  response.owner = ticketOwner
  
  //Sprawdzanie wydarzenia
  console.log(ticket.ticket_event_id)
  console.log(TEID)
  if (ticket.ticket_event_id != TEID) {
    response.state = "Bilet dotyczy innego wydarzenia"
    res.status(200);
    res.send(JSON.stringify(response));
    return false;
  }
  
  //Sprawdzanie użycia
  if (ticket.used != undefined && ticket.used == true) {
    response.state = "Bilet wykorzystany"
    res.status(200);
    res.send(JSON.stringify(response));
    return false;
  }

  //Sprawdzanie wpłaty
  if (parseFloat(ticket.paid) < parseFloat(event.cost)) {
    response.state = "Niedokonana wpłata"
    res.status(200);
    res.send(JSON.stringify(response));
    return false;
  }

  //Sprawdzanie zgody
  if (event.consent == true && ticket.consent == false) {
    response.state = "Niedostarczona zgoda"
    res.status(200);
    res.send(JSON.stringify(response));
    return false;
  }
  
  ticketsDB[ticketID].used = true;
  response.state = "Bilet aktywny"
  response.success = true
  mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));

  res.status(200);
  res.send(JSON.stringify(response));
})


//Edycja wydarzenia biletowanego przez PMK
app.post('/pmk/tickets/events/manage/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ticketsDB = mk.readJSON("./events/tickets.json");
  var ticketEventsDB = mk.readJSON("./events/eventTickets.json");

  if (userdb[userID].loginid != loginID || userdb[userID] == undefined) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  //TEID - Ticketed Event ID
  
  if (req.body.teid != undefined && ticketEventsDB[req.body.teid] == undefined) {
    res.status(404);
    res.send("Ticketed event with provided ID not found!");
    return false;
  }
  
  var TEID;
  var response;
  const requiredElements = ["consent", "file", "name", "date", "time", "place", "for", "icon_url", "cost", "sales_start", "sales_end", "quantity", "colors", "info", "paymentinfo"]
  
  if (req.body.teid == undefined) { //Tworzenie nowego wydarzenia biletowanego
    TEID = generateID(8);
    while (ticketEventsDB[TEID] != undefined) {
      TEID = generateID(8);
    }

    var ticketEventData = {}
    
    for (e in requiredElements) {
      if (req.body[requiredElements[e]] == undefined) {
        res.status(404);
        res.send("Incomplete data!");
        return false;
      }
      ticketEventData[requiredElements[e]] = req.body[requiredElements[e]];
    }
    
    //Zamiana daty na timestamp
    if (moment.tz(ticketEventData.sales_start, countryTimezone).valueOf() != null) {
      ticketEventData.sales_start = moment.tz(ticketEventData.sales_start, countryTimezone).valueOf()
    } else {
      res.status(404);
      res.send("Invalid date format!");
      return false;
    }
    if (moment.tz(ticketEventData.sales_end, countryTimezone).valueOf() != null) {
      ticketEventData.sales_end = moment.tz(ticketEventData.sales_end, countryTimezone).valueOf()
    } else {
      res.status(404);
      res.send("Invalid date format!");
      return false;
    }
    
    //Zamiana ceny na float
    ticketEventData.cost = parseFloat(ticketEventData.cost)
    if (isNaN(ticketEventData.cost)) {
      res.status(404);
      res.send("Invalid cost format!");
      return false;
    }
    
    
    
    ticketEventsDB[TEID] = ticketEventData;
    response = "Successfully added new ticketed event!"
  } else if (req.body.delete == true) { //Usuwanie wydarzenia biletowanego
    TEID = req.body.teid;
    var counter = 0;
    for (t in ticketsDB) {
      if (ticketsDB[t].ticket_event_id == TEID) {
        if (ticketsDB[t].paid == 0 || ticketsDB[t].used == true) {
          delete ticketsDB[t];
          counter += 1
        }
      }
    }
    delete ticketEventsDB[TEID];
    response = `Pomyślnie usunięto wydarzenie biletowane i przypisane do niego bilety (${counter})!`
    mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));
  } else { //Edycja istniejącego wydarzenia biletowanego
    TEID = req.body.teid;
    
    for (e in requiredElements) {
      if (req.body[requiredElements[e]] != undefined) {
        ticketEventsDB[TEID][requiredElements[e]] = req.body[requiredElements[e]]
      }
    }
    
    //Zamiana daty na timestamp
    if (moment.tz(ticketEventsDB[TEID].sales_start, countryTimezone).valueOf() != null) {
      ticketEventsDB[TEID].sales_start = moment.tz(ticketEventsDB[TEID].sales_start, countryTimezone).valueOf()
    } else {
      res.status(404);
      res.send("Invalid date format!");
      return false;
    }
    if (moment.tz(ticketEventsDB[TEID].sales_end, countryTimezone).valueOf() != null) {
      ticketEventsDB[TEID].sales_end = moment.tz(ticketEventsDB[TEID].sales_end, countryTimezone).valueOf()
    } else {
      res.status(404);
      res.send("Invalid date format!");
      return false;
    }
    
    //Zamiana ceny na float
    ticketEventsDB[TEID].cost = parseFloat(ticketEventsDB[TEID].cost)
    if (isNaN(ticketEventsDB[TEID].cost)) {
      res.status(404);
      res.send("Invalid cost format!");
      return false;
    }
    response = "Successfully modified 1 ticketed event!"
  }
  
  
  mk.saveJSON("./events/eventTickets.json", JSON.stringify(ticketEventsDB));

  
  res.status(200);
  res.send(response);
})

//Getting waiting exemptions - for supervisors
app.get('/pmk/exemptions/list/:userid/:loginid', (req, res) => { 
  var userID = req.params.userid
  var loginID = req.params.loginid;
  var userDB = mk.readJSON("./userdb/users.json");

  const exStatus = ["OCZEKUJĄCE", "AKTYWNE", "ODRZUCONE", "ZARCHIWIZOWANE"]

  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }

  if (userDB[userID].access == undefined || userDB[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  var exDB = mk.readJSON("./icsu/exemptions.json"); //Zwolnienia
  var eventsDB = mk.readJSON("./events/events.json"); //Wydarzenia

  var fullName = `${userDB[userID].firstname} ${userDB[userID].lastname}`

  const nowTimestamp = Date.now(); // Aktualny czas w milisekundach

  for (ex in exDB) {
    /*if (exDB[ex].end_date < nowTimestamp) { 
      exDB[ex].status = 3
      if (exDB[ex].by == undefined) {
        delete exDB[ex];
        continue
      }
    }*/
    exDB[ex].date = formatTimeRangeFromTimestamps(exDB[ex].start_date, exDB[ex].end_date)
  }
  mk.saveJSON("./icsu/exemptions.json", JSON.stringify(exDB));


  for (ex in exDB) {
    /*if (exDB[ex].by != undefined && exDB[ex].by != fullName) {
      delete exDB[ex]
      continue
    }*/
    if (userDB[exDB[ex].for] == undefined) { 
      delete exDB[ex]
      continue
    }
    exDB[ex].for = `${userDB[exDB[ex].for].firstname} ${userDB[exDB[ex].for].lastname}, ${userDB[exDB[ex].for].class.toUpperCase()}`
  }

  res.status(200);
  res.send(exDB);
});

//Downloading eDigest data
app.get('/icsu/:userid/:loginid/:self', (req, res) => { 
  var userID = req.params.userid
  var loginID = req.params.loginid;
  var self = req.params.self;
  var userDB = mk.readJSON("./userdb/users.json");

  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("Invalid userID!");
    return false;
  }

  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }

  var exDB = mk.readJSON("./icsu/exemptions.json"); //Zwolnienia
  var reviewsDB = mk.readJSON("./icsu/review.json"); //Sprawozdania
  var eventsDB = mk.readJSON("./events/events.json"); //Wydarzenia

  eventsDB = Object.fromEntries(
    Object.entries(eventsDB).sort(([key1, event1], [key2, event2]) => {
      const date1 = new Date(event1.startdate);
      const date2 = new Date(event2.startdate);
      return date2 - date1;
    })
  );

  var icsu = {}

  const now = moment.tz(countryTimezone);
  const nowTimestamp = Date.now(); // Aktualny czas w milisekundach


  //Sprawdzanie, czy pobieranie własnego czy cudzego ICSU
  if (self != "true") {
    
    if (userDB[userID].access == undefined || userDB[userID].access < 5) {
      res.status(403);
      res.send("Insufficient access level");
      return false;
    }

    //Nadpisywanie loginID sprawdzanej osoby
    if (userDB[self] == undefined) {
      res.status(404);
      res.send("Invalid userID!");
      return false;
    }
    loginID = userDB[self].loginid
  }

  for (userID in userDB) {
    if (userDB[userID].loginid == loginID) {

      //Sprawozdania
      let pastEvents = [] //Zakończone wydarzenia
      icsu.myEvents = {}
      for (eID in eventsDB) {
        if (eventsDB[eID].by.includes(userID)) {
          icsu.myEvents[eID] = eventsDB[eID]
          var endDate = eventsDB[eID].enddate
          if (endDate == "") {endDate = eventsDB[eID].startdate}
          endDate = moment.tz(endDate, countryTimezone);
          if (now.isAfter(endDate)) { pastEvents.push(eID) }
        }
      }

      let myReviews = []
      for (eID in reviewsDB) {
        if (Object.keys(reviewsDB[eID]).includes(userID)) {
          myReviews.push(eID)
        }
      }

      icsu.pastEvents = []
      for (mr in myReviews) {
        if (eventsDB[myReviews[mr]] == undefined) {
          delete reviewsDB[eID];
          continue
        }
        icsu.pastEvents.push({"eventID": myReviews[mr], "name": eventsDB[myReviews[mr]].name, "answers": reviewsDB[myReviews[mr]][userID]})
      }

      myReviews = new Set(myReviews);
      icsu.waitingReviews = pastEvents.filter(eID => !myReviews.has(eID));

      for (wr in icsu.waitingReviews) {
        let eID = icsu.waitingReviews[wr]
        icsu.waitingReviews[wr] = {
          "eventID": eID,
          "name": eventsDB[eID].name
        }
      }

      //Zwolnienia
      icsu.exemptions = {}
      for (ex in exDB) {
        if (exDB[ex].for == userID) {
          /*if (exDB[ex].end_date < nowTimestamp) { 
            exDB[ex].status = 3
            if (exDB[ex].by == undefined) {
              delete exDB[ex];
              continue
            }
          }*/
          icsu.exemptions[ex] = exDB[ex]
          icsu.exemptions[ex].date = formatTimeRangeFromTimestamps(icsu.exemptions[ex].start_date, icsu.exemptions[ex].end_date)
        }
      }

      mk.saveJSON("./icsu/exemptions.json", JSON.stringify(exDB));
      mk.saveJSON("./icsu/review.json", JSON.stringify(reviewsDB))

      icsu.firstname = userDB[userID].firstname
      icsu.lastname = userDB[userID].lastname
      icsu.class = userDB[userID].class

      //console.log(icsu)
      res.status(200);
      res.send(icsu);
      return false;
    }
  }

  res.status(404);
  res.send("Unregistered user");
});


//Downloading data from API
app.get('/sync/:loginid', (req, res) => {
  var loginId = req.params.loginid;
  var userdb = mk.readJSON("./userdb/users.json");

  var pushdb = mk.readJSON("./userdb/push.json");

  var pointsdb = mk.readJSON("./userdb/points.json");

  var ordersdb = mk.readJSON("./orders/orders.json");
  var stores = mk.readJSON("./orders/stores.json");
  
  var picDB = mk.readJSON("./userdb/pic.json");

  var exDB = mk.readJSON("./icsu/exemptions.json");
  
  var sls = mk.readJSON("./userdb/sls.json");

  var events = mk.readJSON("./events/events.json");
  var availableTickets = mk.readJSON("./events/eventTickets.json");
  var userTickets = mk.readJSON("./events/tickets.json");
  
  var availableCoupons = mk.readJSON("./events/eventCoupons.json");
  var userCoupons = mk.readJSON("./events/coupons.json");
  
  var photoboxDB = mk.readJSON("./photobox/photos.json");

  //Getting current timestamp
  const timestamp = Math.floor(Date.now())

  for (user in userdb) {
    if (userdb[user].loginid == loginId) {
      //Getting lucky number
      //userdb[user].luckynumber = getLuckyNumber(`${userdb[user].lastname} ${userdb[user].firstname}`, userdb[user].class);
      var activityDiff = timestamp - userdb[user].lastactivity;
      console.log(`(${userdb[user].firstname} ${userdb[user].lastname}): Od ostatniego logowania minęło ${Math.floor(activityDiff / 1000)} sekund`)
      userdb[user].lastactivity = timestamp;
      userdb[user].indeletion = false;
      mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
      delete userdb[user].loginid;
      delete userdb[user].accounttype;
      delete userdb[user].active;
      delete userdb[user].email
      userdb[user].id = user;
      userdb[user].userscount = Object.keys(userdb).length;
      userdb[user].photobox = {}
      
      //Getting photos from photobox
      for (x in photoboxDB) {
        if (photoboxDB[x].userid == undefined) {
          continue;
        }
        if (photoboxDB[x].userid.includes(user)) {
          userdb[user].photobox[x] = photoboxDB[x]
        }
      }

      //Getting push notifications endpoint
      if (pushdb[user] != undefined) {
        userdb[user].pushendpoint = pushdb[user].endpoint;
      }
      if (pointsdb[user] != undefined) {
        userdb[user].points = pointsdb[user];
      }
      
      //Getting profile picture
      if (picDB[user] != undefined) {
        userdb[user].profilepic = picDB[user]
      }

      //Getting orders
      var ordersDBsearch = `${userdb[user].firstname.toUpperCase()} ${userdb[user].lastname.toUpperCase()}, ${userdb[user].class.toUpperCase()}`
      if (JSON.stringify(ordersdb).includes(ordersDBsearch)) {
        for (order in ordersdb) {
          if (ordersdb[order].customer == ordersDBsearch) {
            if (userdb[user].orders == undefined) {
              userdb[user].orders = {}
            }
            userdb[user].orders[order] = ordersdb[order];
            //console.log(stores[ordersdb[order].store].paymentinfo)
            if (stores[ordersdb[order].store].paymentinfo != undefined) {
              userdb[user].orders[order].paymentinfo = stores[ordersdb[order].store].paymentinfo
            }
          }
        }
      }

      //Getting available tickets
      userdb[user].tickets = {}
      for (ticket in availableTickets) {
        if (availableTickets[ticket].for.includes(userdb[user].class) && availableTickets[ticket].sales_end > timestamp) {
          delete availableTickets[ticket].for;
          delete availableTickets[ticket].consent_required;
          userdb[user].tickets[ticket] = availableTickets[ticket];
        }
      }

      //Getting user tickets
      userdb[user].usertickets = {}
      for (ticket in userTickets) {
        if (userTickets[ticket].userid == user) {
          var ticketEventID = userTickets[ticket].ticket_event_id;
          if (availableTickets[ticketEventID] == undefined) {
            continue;
          }
          var ticketEvent = availableTickets[ticketEventID];

          delete userTickets[ticket].userid;

          userTickets[ticket].name = ticketEvent.name;
          userTickets[ticket].date = ticketEvent.date;
          userTickets[ticket].time = ticketEvent.time;
          userTickets[ticket].place = ticketEvent.place;
          userTickets[ticket].icon_url = ticketEvent.icon_url;
          userTickets[ticket].cost = ticketEvent.cost;
          userTickets[ticket].consent_required = ticketEvent.consent;
          userTickets[ticket].info = ticketEvent.info;
          userTickets[ticket].paymentinfo = ticketEvent.paymentinfo;
          userTickets[ticket].colors = ticketEvent.colors;
          userTickets[ticket].file = ticketEvent.file;

          userdb[user].usertickets[ticket] = userTickets[ticket];
        }
      }
      
      //Getting available coupons
      userdb[user].coupons = {}
      for (coupon in availableCoupons) {
        if (availableCoupons[coupon].for.includes(userdb[user].class) && availableCoupons[coupon].available) {
          delete availableCoupons[coupon].for;
          userdb[user].coupons[coupon] = availableCoupons[coupon];
        }
      }
      
      //Getting user coupons
      userdb[user].usercoupons = {}
      for (coupon in userCoupons) {
        if (userCoupons[coupon].userid == user) {
          var ECID = userCoupons[coupon].ecid;
          if (availableCoupons[ECID] == undefined) {
            continue;
          }
          var couponData = availableCoupons[ECID];

          delete userCoupons[coupon].userid;
          delete userCoupons[coupon].cost
          
          userCoupons[coupon].name = couponData.name
          userCoupons[coupon].icon_url = couponData.icon_url
          userCoupons[coupon].info = couponData.info

          userdb[user].usercoupons[coupon] = userCoupons[coupon];
        }
      }
      
      //userdb[user].sls = sls;
      
      //Getting user events
      userdb[user].events = {}
      for (event in events) {
        if (events[event].for.includes("#su") && userdb[user].access > 0) {
          userdb[user].events[event] = events[event];
          continue
        }
        if (events[event].for.includes(userdb[user].class) || userdb[user].access > 0) {
          if (!events[event].for.includes(userdb[user].class)) {
            events[event].hidden = true;
          }
          for (x in events[event].by) {
            if (userdb[events[event].by[x]] == undefined) {
              delete events[event].by[x];
              continue;
            }
            if (events[event].by[x] == user) {
              events[event].my = true
            }
            events[event].by[x] = {
              "id": events[event].by[x],
              "name": `${userdb[events[event].by[x]].firstname} ${userdb[events[event].by[x]].lastname}`,
              "class": userdb[events[event].by[x]].class.toUpperCase()
            }
          }
          userdb[user].events[event] = events[event];
        }
      }
      
      res.status(200);
      res.send(userdb[user]);
      return false;
    }
  }
  res.status(404);
  res.send("Unregistered user");
});

//Reserve ticket - kupowanie biletu przez aplikacje lub serwis eTicket
app.post('/tickets/add', jsonParser, (req, res) => {
  var userid = req.body.userid;
  var ticketEventID = req.body.ticket_event_id;

  //Getting current timestamp
  const timestamp = Math.floor(Date.now())

  var availableTickets = mk.readJSON("./events/eventTickets.json");
  var userDB = mk.readJSON("./userdb/users.json");
  var ticketsDB = mk.readJSON("./events/tickets.json");
  
  

  //Check if ticket is available to buy
  if (availableTickets[ticketEventID] == undefined) {
    res.status(404);
    res.send("Ticket event not found.");
    return false;
  } else if (req.body.bypass == true) {
    //Bypass
  } else if (availableTickets[ticketEventID].sales_start > timestamp) {
    res.status(404);
    res.send(`Sprzedaż biletów na to wydarzenie rozpoczyna się za: ${formatTimeDifference(timestamp, availableTickets[ticketEventID].sales_start)}`);
    return false;
  } else if (availableTickets[ticketEventID].sales_end < timestamp) {
    res.status(404);
    res.send("Sprzedaż biletów na to wydarzenie już się zakończyła!");
    return false;
  }
  
  if (availableTickets[ticketEventID].quantity > -1) {
    //Checking quantity limits
    var counter = 0;
    for (x in ticketsDB) {
      if (ticketsDB[x].ticket_event_id == ticketEventID) {
        counter += 1
      }
    }
    if (counter >= availableTickets[ticketEventID].quantity) {
      res.status(404);
      res.send("Brak miejsc na to wydarzenie!");
      return false;
    }
  }

  //Check users information (jesli aplikacja to sprawdza czy klasa jest zgodna z docelowa)
  if (userDB[userid] != undefined && !availableTickets[ticketEventID].for.includes(userDB[userid].class)) {
    res.status(404);
    res.send("You cannot buy this ticket!");
    return false;
  }

  var ticketID = generateOrderID();
  while (ticketsDB[ticketID] != undefined) {
    ticketID = generateOrderID();
  }

  var ticketData = {
    "ticket_event_id": ticketEventID,
    "userid": userid,
    "paid": 0,
    "consent": false
  }

  if (userDB[userid] == undefined) {
    ticketData.userid = userid.toUpperCase();
  }

  //Wygeneruj PDF jesli uzytkownik podal maila
  if (req.body.email != undefined) {
    ticketsRouter.sendTicket({
      "name": availableTickets[ticketEventID].name,
      "date": availableTickets[ticketEventID].date,
      "time": availableTickets[ticketEventID].time,
      "place": availableTickets[ticketEventID].place,
      "status": "Bilet wstępu",
      "owner": userid.toUpperCase(),
      "price": `${parseFloat(availableTickets[ticketEventID].cost).toFixed(2)} zł`,
      "id": ticketID,
      "email": req.body.email,
      "paymentinfo": availableTickets[ticketEventID].paymentinfo.replaceAll("[TicketID]", ticketID)
    })
  }

  ticketsDB[ticketID] = ticketData;
  mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));

  notifyUsers([userid], "🎫 Nowy bilet", "Do Twojego konta został dodany nowy bilet. Sprawdź w zakładce Bilety i kupony.");
  res.status(200);
  res.send(ticketID);

  return false;
})

//Data update
app.post('/data/update', jsonParser, (req, res) => {
  userid = req.body.userid;
  loginid = req.body.loginid;
  delete req.body.userid;
  delete req.body.loginid;
  var userdb = mk.readJSON("./userdb/users.json");
  if (userdb[userid] == undefined) {
    res.status(404);
    res.send("User not found")
    return false;
  }
  if (userdb[userid].loginid != loginid) {
    res.status(404);
    res.send("Invalid LoginID");
    return false;
  }
  if (req.body.nickname != undefined) {
    userdb[userid].nickname = req.body.nickname
  }
  mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
  res.status(200);
  res.send("Success")
})


//Push notifications handler
//Registration
app.post('/push/register', jsonParser, (req, res) => {
  userid = req.body.userid;
  loginid = req.body.loginid;
  nickname = req.body.nickname;
  var userdb = mk.readJSON("./userdb/users.json");
  if (userdb[userid] == undefined) {
    res.status(404);
    res.send("User not found")
    return false;
  }
  if (userdb[userid].loginid != loginid) {
    res.status(404);
    res.send("Invalid LoginID");
    return false;
  }
  if (nickname != undefined) {
    userdb[userid].nickname = nickname;
    mk.saveJSON("./userdb/users.json", JSON.stringify(userdb));
  }
  var pushdb = mk.readJSON("./userdb/push.json");
  if (req.body.push == undefined) {
    if (pushdb[userid] != undefined) {
      delete pushdb[userid];
    }
  } else {
    pushdb[userid] = req.body.push;
  }
  mk.saveJSON("./userdb/push.json", JSON.stringify(pushdb));
  console.log(req.body)
  res.status(200);
  res.send("Success")
})

//Sending push notification
app.post('/push/send/:token', jsonParser, (req, res) => {
  if (token != req.params.token) {
    res.status(401);
    res.send("Invalid token")
    return false;
  }
  var userid = req.body.userid;
  console.log(`USERID: ${userid}`);
  var userdb = mk.readJSON("./userdb/push.json")
  if (userdb[userid] == undefined) {
    res.status(400);
    res.send("User not found")
    return false;
  }

  var sub = userdb[userid];
  console.log(sub);
  var options = { TTL: 3600 }
  var context = `{"title": "${req.body.title}", "content": "${req.body.content}", "timestamp": ${Math.floor(Date.now())}}`
  try {
    push.sendNotification(sub, context, options);
    console.log(context);
  } catch (err) {
    console.log(err)
  }
  res.status(200);
  res.send("Success")
})

//Zamówienia w sklepie
//New order
app.post('/order/make', jsonParser, (req, res) => {
  var ordersDB = mk.readJSON("./orders/orders.json");
  var stores = mk.readJSON("./orders/stores.json");
  
  var orderData = req.body;
  orderData.paid = 0
  orderData.status = 0
  
  var orderID = generateOrderID();
  while (ordersDB[orderID] != undefined) {
    orderID = generateOrderID();
  }
  
  if (stores[orderData.store].active == false) {
    res.status(404);
    res.send("Nie możesz złożyć zamówienia!");
    return false;
  }
  
  ordersDB[orderID] = orderData;
  mk.saveJSON('./orders/orders.json', JSON.stringify(ordersDB));
  
  var paymentInfo = "Skontaktuj się z Samorządem Uczniowskim"
  
  if (stores[orderData.store].paymentinfo != undefined) {
    paymentInfo = stores[orderData.store].paymentinfo
  }
  
  var orderPositions = ""
  
  for (pos in orderData.products) {
    var pos = orderData.products[pos]
    var mailOrderPos = fs.readFileSync(`./templates/orderPos.html`, 'utf8')
    var posOptions = []
    for (opt in pos.options) {
      posOptions.push(`${opt.toUpperCase()}: ${pos.options[opt].toUpperCase()}`)
    }
    posOptions = posOptions.join("<br>")
    mailOrderPos = mailOrderPos.replaceAll("[posName]", pos.name)
    mailOrderPos = mailOrderPos.replaceAll("[posImg]", pos.img)
    mailOrderPos = mailOrderPos.replaceAll("[posOptions]", posOptions)
    mailOrderPos = mailOrderPos.replaceAll("[posPrice]", parseFloat(pos.price).toFixed(2))
    orderPositions += mailOrderPos
  }
  
  var additionalInfo = {"orderPaymentInfo": paymentInfo, "orderID": orderID, "orderPositions": orderPositions, "orderTotal": parseFloat(orderData.price).toFixed(2), "orderCustomer": orderData.customer};
    var userEmail = orderData.email;

    var mailContent = fs.readFileSync(`./templates/neworder.html`, 'utf8')
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

    transporter.sendMail(mailOptions, function(error, info) { });
  
  
  
  res.status(200);
  res.send(orderID);
  
})

//Downloading store info for STORE PAGE
app.get('/store/getall', (req, res) => {
  var storesDB = mk.readJSON("./orders/stores.json");
  var productsDB = mk.readJSON("./orders/products.json");
  
  for (let store in storesDB) {
    storesDB[store].products = {}
  }
  
  for (let prod in productsDB) {
    //if (storesDB[productsDB[prod].store] != undefined && storesDB[productsDB[prod].store].active) {
    if (storesDB[productsDB[prod].store] != undefined) {
      storesDB[productsDB[prod].store].products[prod] = productsDB[prod]
    }
  }

  res.status(200);
  res.send(storesDB);
});

//Downloading tickets info for TICKETS PAGE
app.get('/tickets/getall', (req, res) => {
  var ticketedEventsDB = mk.readJSON("./events/eventTickets.json");

  res.status(200);
  res.send(ticketedEventsDB);
});

//Downloading stores and items for PMK
app.get('/pmk/store/list/:userid/:loginid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  
  var userDB = mk.readJSON("./userdb/users.json");
  var storesDB = mk.readJSON("./orders/stores.json");
  var productsDB = mk.readJSON("./orders/products.json");

  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userDB[userID].access == undefined || userDB[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  for (let store in storesDB) {
    storesDB[store].products = {}
  }
  
  for (let prod in productsDB) {
    if (storesDB[productsDB[prod].store] != undefined) {
      storesDB[productsDB[prod].store].products[prod] = productsDB[prod]
    }
  }

  res.status(200);
  res.send(storesDB);
});

//Making order through PMK POS
app.post('/pmk/order/make/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ordersdb = mk.readJSON("./orders/orders.json");

  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var ordersDB = mk.readJSON("./orders/orders.json");
  var stores = mk.readJSON("./orders/stores.json");
  
  var orderData = req.body;
  orderData.status = 0
  
  var orderID = generateOrderID();
  while (ordersDB[orderID] != undefined) {
    orderID = generateOrderID();
  }
  
  orderData.type = "POS"
  ordersDB[orderID] = orderData;
  
  if (parseFloat(ordersDB[orderID].paid) >= parseFloat(ordersDB[orderID].price) && ordersDB[orderID].status == 0) {
    ordersDB[orderID].status = 1;
  }
  if (parseFloat(ordersDB[orderID].paid) < parseFloat(ordersDB[orderID].price) && ordersDB[orderID].status == 1) {
    ordersDB[orderID].status = 0;
  }
  
  mk.saveJSON('./orders/orders.json', JSON.stringify(ordersDB));
  
  
  
  res.status(200);
  res.send(orderID);
  
})


//Downloading orders for PMK
app.get('/pmk/order/list/:userid/:loginid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ordersdb = mk.readJSON("./orders/orders.json");

  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  for (order in ordersdb) {
    if (ordersdb[order].customer == undefined && ordersdb[order].userid != undefined) {
      ordersdb[order].customer = `${userdb[ordersdb[order].userid].firstname} ${userdb[ordersdb[order].userid].lastname}, ${userdb[ordersdb[order].userid].class.toUpperCase()}`;
      delete ordersdb[order].userid
    } else if (ordersdb[order].email != undefined) {
      //delete ordersdb[order].email;
    }
  }
  res.status(200);
  res.send(ordersdb);
});

//Downloading orders for individual use
app.get('/order/get/:orderid', (req, res) => {
  var orderID = req.params.orderid.toUpperCase();
  var ordersDB = mk.readJSON("./orders/orders.json");
  var storesDB = mk.readJSON("./orders/stores.json");

  if (ordersDB[orderID] == undefined) {
    res.status(404);
    res.send("Invalid orderID!");
    return false;
  }

  delete ordersDB[orderID].customer;
  delete ordersDB[orderID].email
  ordersDB[orderID].id = orderID;
  if (ordersDB[orderID].store != undefined) {
    ordersDB[orderID].paymentinfo = storesDB[ordersDB[orderID].store].paymentinfo
  }
  
  res.status(200);
  res.send(ordersDB[orderID]);
});

//Edycja zamówienia przez PMK
app.post('/pmk/order/manage/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  
  var orderID = req.body.orderID;
  var orderPaid = req.body.paid;
  var orderStatus = req.body.status;
  var orderCustomer = req.body.customer;
  
  var userDB = mk.readJSON("./userdb/users.json");
  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("User not found");
    return false;
  }
  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  var ordersDB = mk.readJSON("./orders/orders.json");
  
  if (userDB[userID].access == undefined || userDB[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  
  if (ordersDB[orderID] == undefined) {
    res.status(404);
    res.send("Order not found");
    return false;
  }
  
  if (orderCustomer != undefined) {
    ordersDB[orderID].customer = orderCustomer
  }
  
  if (orderStatus != undefined) {
    if (orderStatus == "DELETE") {
      if (userDB[userID].access == undefined || userDB[userID].access < 5) {
        res.status(403);
        res.send("Insufficient access level");
        return false;
      }
      delete ordersDB[orderID];
      mk.saveJSON("./orders/orders.json", JSON.stringify(ordersDB));
      res.status(200);
      res.send("Usunięto zamówienie!");
      return false;
    } else {
      ordersDB[orderID].status = parseInt(orderStatus);
    }
  }
  
  if (orderPaid != undefined) {
    ordersDB[orderID].paid = parseFloat(orderPaid);
  }
  if (parseFloat(ordersDB[orderID].paid) >= parseFloat(ordersDB[orderID].price) && ordersDB[orderID].status == 0) {
    ordersDB[orderID].status = 1;
  }
  if (parseFloat(ordersDB[orderID].paid) < parseFloat(ordersDB[orderID].price) && ordersDB[orderID].status == 1) {
    ordersDB[orderID].status = 0;
  }
  
  mk.saveJSON("./orders/orders.json", JSON.stringify(ordersDB));
  var userdb = mk.readJSON("./userdb/users.json");
  for (order in ordersDB) {
      delete ordersDB[order].email;
  }
  res.status(200);
  res.send("Zmodyfikowano zamówienie!");
})

//Edycja kolejnosci produktow przez PMK
app.post('/pmk/product/order/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  
  var userDB = mk.readJSON("./userdb/users.json");
  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("User not found");
    return false;
  }
  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userDB[userID].access == undefined || userDB[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  var productsDB = mk.readJSON("./orders/products.json");
  var newOrder = req.body.neworder;

  const posortowanyObiekt = [
    ...newOrder, 
    ...Object.keys(productsDB).filter(klucz => !newOrder.includes(klucz))
  ].reduce((obj, klucz) => {
    if (productsDB[klucz]) {
      obj[klucz] = productsDB[klucz];
    }
    return obj;
  }, {});

  mk.saveJSON("./orders/products.json", JSON.stringify(posortowanyObiekt));
  res.status(200)
  res.send("Pomyślnie zmieniono kolejność produktów!")

  

});

//Edycja produktu przez PMK
app.post('/pmk/product/manage/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  
  var userDB = mk.readJSON("./userdb/users.json");
  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("User not found");
    return false;
  }
  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userDB[userID].access == undefined || userDB[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var productsDB = mk.readJSON("./orders/products.json");
  var productID = req.body.id
  delete req.body.id

  var ordersDB = mk.readJSON("./orders/orders.json");
  var storesDB = mk.readJSON("./orders/stores.json");
  
  if (productsDB[productID] != undefined && req.body.del) { //Usuwanie produktu
    if (JSON.stringify(ordersDB).includes(`"id":"${productID}"`)) {
      res.status(404)
      res.send("Nie można usunąć produktu! Usuń zamówienia, które zawierają wybrany produkt, aby kontynuować.")
      return false;
    }
    delete productsDB[productID]
    mk.saveJSON("./orders/products.json", JSON.stringify(productsDB));
    res.status(200)
    res.send("Pomyślnie usunięto produkt!")
    return false
  }
  
  if (req.body.new && productsDB[productID] != undefined) {
    res.status(404)
    res.send("Produkt o podanym ID już istnieje!")
    return false;
  } else if (req.body.new) {
    delete req.body.new
  }
  
  if (productID != undefined && productID != "") {
    productsDB[productID] = req.body
  } else {
    productID = generateProductID()
    while (productsDB[productID] != undefined) {
      productID = generateProductID()
    }
    productsDB[productID] = req.body
  }
   
  if (req.body.price == null || req.body.price == "") {
    res.status(404)
    res.send("Brak wystarczających informacji!")
    return false;
  } else if (req.body.store == "" || req.body.store == undefined) {
    res.status(404)
    res.send("Brak wystarczających informacji!")
    return false;
  }

  for (prod in productsDB) {
    if (storesDB[productsDB[prod].store] == undefined) {
      delete productsDB[prod]
    }
  }
  
  //console.log(productsDB[productID])
  mk.saveJSON("./orders/products.json", JSON.stringify(productsDB));
  
  res.status(200)
  res.send("Pomyślnie wykonano operację!")
  
})

//Edycja dostępności produktu przez PMK
app.post('/pmk/product/availability/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  
  var userDB = mk.readJSON("./userdb/users.json");
  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("User not found");
    return false;
  }
  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userDB[userID].access == undefined || userDB[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var productsDB = mk.readJSON("./orders/products.json");
  var productID = req.body.id
  
  if (productID == undefined || productsDB[productID] == undefined) {
    res.status(404)
    res.send("Produkt nie istnieje!")
    return false;
  }
  
  var availability = !req.body.availability
  
  if (req.body.availability == undefined) {
    availability = !productsDB[productID].disabled
  }
  
  productsDB[productID].disabled = availability
  
  
  //console.log(productsDB[productID])
  mk.saveJSON("./orders/products.json", JSON.stringify(productsDB));
  
  res.status(200)
  res.send("Pomyślnie zmieniono dostępność!")
  
})

//Edycja sklepu / Tworzenie sklepu przez PMK
app.post('/pmk/store/manage/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  
  var userDB = mk.readJSON("./userdb/users.json");
  if (userDB[userID] == undefined) {
    res.status(404);
    res.send("User not found");
    return false;
  }
  if (userDB[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  
  if (userDB[userID].access == undefined || userDB[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  var storesDB = mk.readJSON("./orders/stores.json");
  var ordersDB = mk.readJSON("./orders/orders.json");
  var productsDB = mk.readJSON("./orders/products.json");

  var response = " ";

  if (Object.keys(req.body).length == 1) { //Jeśli w JSON jest tylko ID sklepu - utwórz nowy
    if (req.body.id != undefined) {
      req.body.id = req.body.id.replaceAll(" ", "")
      req.body.id = req.body.id.toUpperCase()
      if (storesDB[req.body.id] != undefined) {
        res.status(404);
        res.send("Sklep o podanym ID już istnieje!");
        return false;
      }
      storesDB[req.body.id] = JSON.parse(`{
        "paymentinfo": "",
        "displayname": "${req.body.id}",
        "active": false,
        "banner": "",
        "rules": ""
      }`)
    } else {
      res.status(404);
      res.send("Invalid store ID!");
      return false;
    }
    response = "Pomyślnie utworzono nowy sklep!"
  } else if (req.body.del) { //Usuwanie sklepu
    if (storesDB[req.body.id] == undefined || req.body.id == undefined) {
        res.status(404);
        res.send("Invalid storeID!");
        return false;
    }
    for (order in ordersDB) {
      if (ordersDB[order].store == req.body.id && ordersDB[order].status != 4 && ordersDB[order].status != 5) {
        res.status(404);
        res.send("Nie możesz usunąć sklepu z aktywnymi zamówieniami!");
        return false;
      }
    }
    if (JSON.stringify(ordersDB).includes(`"store":"${req.body.id}"`)) {
      res.status(404);
      res.send("Administrator wyłączył możliwość usuwania sklepów bez aktywnych zamówień.");
      return false;
    }

    for (order in ordersDB) {
      if (ordersDB[order].store == req.body.id) {
        delete ordersDB[order];
      }
    }
    for (prod in productsDB) {
      if (productsDB[prod].store == req.body.id) {
        delete productsDB[prod];
      }
    }

    delete storesDB[req.body.id];
    response = "Pomyślnie usunięto sklep!"
    mk.saveJSON("./orders/orders.json", JSON.stringify(ordersDB));
    mk.saveJSON("./orders/products.json", JSON.stringify(productsDB));
  } else { //Jeśli w JSON są inne dane - edytuj obecny
    if (storesDB[req.body.id] == undefined || req.body.id == undefined) {
      res.status(404);
      res.send("Invalid store ID!");
      return false;
    }
    if (req.body.paymentinfo != undefined) {storesDB[req.body.id].paymentinfo = req.body.paymentinfo}
    if (req.body.displayname != undefined) {storesDB[req.body.id].displayname = req.body.displayname}
    if (req.body.active != undefined) {storesDB[req.body.id].active = req.body.active}
    if (req.body.banner != undefined) {storesDB[req.body.id].banner = req.body.banner}
    if (req.body.rules != undefined) {storesDB[req.body.id].rules = req.body.rules}
    response = "Pomyślnie wprowadzono zmiany!"
  }
  

  mk.saveJSON("./orders/stores.json", JSON.stringify(storesDB));
  res.status(200)
  res.send(response)
  
})

/*
var ordersDB = mk.readJSON("./orders/orders.json");
ordersDB["SMZ411149"] = JSON.parse(`{"customer":"LEONARD BREJZA, 8B","email":"brejzapati@op.pl","products":[{"id":"b3250-mo","name":"Bluza rozpinana","price":164,"img":"https://mobilnykatolik.github.io/store/img/b3250-mo.png","options":{"LOGO":"ksp-classics","KOLOR":"navy","ROZMIAR":"m"}}],"price":164,"paid":164,"status":1}`)
mk.saveJSON("./orders/orders.json", JSON.stringify(ordersDB));
*/

//Wznawianie biletu
app.post('/tickets/reuse', jsonParser, (req, res) => {
  var loginid = req.body.loginid;
  var userid = req.body.userid;
  var ticketID = req.body.ticketid;

  var userdb = mk.readJSON("./userdb/users.json");
  if (userdb[userid] == undefined) {
    res.status(404);
    res.send("User not found");
    return false;
  }
  if (userdb[userid].loginid != loginid) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userid].access == undefined || userdb[userid].access < 2) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  var ticketsDB = mk.readJSON("./events/tickets.json");
  if (ticketsDB[ticketID] == undefined) {
    res.status(404);
    res.send("Ticket not found");
    return false;
  }

  delete ticketsDB[ticketID].used;
  mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));
  
  var userdb = mk.readJSON("./userdb/users.json");
  var ticketeventsdb = mk.readJSON("./events/eventTickets.json");

  var counter = 1;
  for (ticket in ticketsDB) {
    var ticketOwnerID = ticketsDB[ticket].userid;
    var ticketEventID = ticketsDB[ticket].ticket_event_id;
    if (userdb[ticketOwnerID] == undefined) {
      ticketsDB[ticket].owner = ticketOwnerID;
      ticketsDB[ticket].ownerid = ticketOwnerID;
    } else {
      ticketsDB[ticket].owner = `${userdb[ticketOwnerID].firstname} ${userdb[ticketOwnerID].lastname}, ${userdb[ticketOwnerID].class.toUpperCase()}`
      ticketsDB[ticket].ownerid = ticketOwnerID;
    }
    if (ticketeventsdb[ticketEventID] == undefined) {
      delete ticketsDB[ticket];
      continue;
    } else {
      ticketsDB[ticket].event = ticketeventsdb[ticketEventID].name;
      ticketsDB[ticket].consent_required = ticketeventsdb[ticketEventID].consent;
      ticketsDB[ticket].cost = parseFloat(ticketeventsdb[ticketEventID].cost);
    }
    ticketsDB[ticket].paid = parseFloat(ticketsDB[ticket].paid);
    delete ticketsDB[ticket].userid;
    delete ticketsDB[ticket].ticket_event_id;
    ticketsDB[ticket].lp = String(counter);
    counter += 1;
  }

  res.status(200);
  res.send(ticketsDB);
})

app.post('/tickets/scan', jsonParser, (req, res) => {
  var loginid = req.body.loginid;
  var userid = req.body.userid;
  var ticketID = req.body.ticketid;
  var userdb = mk.readJSON("./userdb/users.json");
  var ticketeventsdb = mk.readJSON("./events/eventTickets.json");
  
  if (userdb[userid] == undefined) {
    response.owner = "Błąd autoryzacji"
    response.state = "Nieprawidłowe dane autoryzacyjne"
    res.status(404);
    res.send(JSON.stringify(response));
    return false;
  }
  if (userdb[userid].loginid != loginid) {
    response.owner = "Błąd autoryzacji"
    response.state = "Nieprawidłowe dane autoryzacyjne"
    res.status(404);
    res.send(JSON.stringify(response));
    return false;
  }
  if (userdb[userid].access == undefined || userdb[userid].access < 2) {
    response.owner = "Błąd autoryzacji"
    response.state = "Nie masz uprawnień"
    res.status(404);
    res.send(JSON.stringify(response));
    return false;
  }

  var ticketsDB = mk.readJSON("./events/tickets.json");
  if (ticketsDB[ticketID] == undefined) {
    response.owner = "Brak"
    response.state = "Nie znaleziono biletu"
    res.status(404);
    res.send(JSON.stringify(response));
    return false;
  }
  var response = {};
  var event = ticketeventsdb[ticketsDB[ticketID].ticket_event_id];
  var ticket = ticketsDB[ticketID];

  if (userdb[ticket.userid] != undefined) {
    response.owner = `${userdb[ticket.userid].firstname.toUpperCase()} ${userdb[ticket.userid].lastname.toUpperCase()}, ${userdb[ticket.userid].class.toUpperCase()}`
  } else {
    response.owner = ticket.userid;
  }

  //Sprawdzanie użycia
  if (ticket.used != undefined && ticket.used == true) {
    response.state = "Bilet użyty"
    res.status(404);
    res.send(JSON.stringify(response));
    return false;
  }

  //Sprawdzanie wpłaty
  if (parseFloat(ticket.paid) < parseFloat(event.cost)) {
    response.state = "Niedokonana wpłata"
    res.status(404);
    res.send(JSON.stringify(response));
    return false;
  }

  //Sprawdzanie zgody
  if (event.consent == true && ticket.consent == false) {
    response.state = "Niedostarczona zgoda"
    res.status(404);
    res.send(JSON.stringify(response));
    return false;
  }

  ticketsDB[ticketID].used = true;
  console.log(ticketsDB[ticketID]);

  response.state = "Bilet aktywny"

  mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));

  res.status(200);
  res.send(JSON.stringify(response));
})





//Prewencyjne usuwanie kodów w przypadku gdy wygasły
function deleteExpiredCodes() {
  var stats = [0, 0]
  //Removed codes, removed accounts
  var userdb = mk.readJSON("./userdb/users.json");
  for (user in userdb) {
    if (userdb[user].code != undefined) {
      if ((Math.floor(Date.now()) - userdb[user].code[1]) > 300000) {
        delete userdb[user].code;
        stats[0] += 1
        if (userdb[user].active == false) {
          delete userdb[user];
          stats[1] += 1
          stats[0] -= 1
        }
      }
    }
  }
  console.log(`Removed: ${stats[0]} expired codes, ${stats[1]} non-verified accounts`)
  mk.saveJSON('./userdb/users.json', JSON.stringify(userdb));
}


// Dodaliśmy cache, żeby nie czytać pliku z dysku przy każdym mailu
const templatesCache = {};

function getTemplate(templateName) {
  if (!templatesCache[templateName]) {
    templatesCache[templateName] = fs.readFileSync(`./templates/${templateName}.html`, 'utf8');
  }
  return templatesCache[templateName];
}

function sendMail(template, additionalInfo, userEmail) {
  return new Promise((resolve) => {
    try {
      let mailContent = getTemplate(template);
      
      // Bezpieczniejsze podstawianie zmiennych
      for (const key in additionalInfo) {
        mailContent = mailContent.replaceAll(`[${key}]`, additionalInfo[key]);
      }
      
      let lines = mailContent.split("\n");
      let mailSubject = lines[0];
      lines.shift();
      mailContent = lines.join("\n");

      let mailOptions = {
        from: `Mobilny Katolik <${emailaddress}>`, // upewnij się, że emailaddress jest zdefiniowane
        to: userEmail,
        subject: mailSubject,
        html: mailContent,
        headers: {
          "Precedence": "bulk"
        }
      };

      transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
          console.error(`Błąd wysyłki do ${userEmail}:`, error.message);
          resolve(500); // Zwracamy status do Promise'a
        } else {
          resolve(200); // Sukces
        }
      });
    } catch (err) {
      console.error(`Krytyczny błąd dla ${userEmail}:`, err);
      resolve(500);
    }
  });
}

//sendMail("bal25", {}, "kuba.salek@icloud.com")

deleteExpiredCodes();

/*var userdb = mk.readJSON("./userdb/users.json");
var maturzysci = []
for (user in userdb) {
  if (userdb[user].class == "4lo") {
    //console.log(userdb[user].email)
    maturzysci.push(userdb[user].email)
  }
}

async function bal25() {
  for (x in maturzysci) {
    await new Promise(r => setTimeout(r, 2000));
    sendMail("bal25", {}, maturzysci[x])
    console.log(maturzysci[x])
  }
  console.log("WYSŁANO DO WSZYSTKICH")
}

//bal25()
*/



//var toSave = JSON.parse(fs.readFileSync("./userdb/people.json", 'utf8'));
//mk.saveJSON("./userdb/lucky.json", JSON.parse('{}'));

function generateOrderID() {
  var length = 3,
    charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    retVal = "";
  for (var i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  retVal += String(Math.floor(Math.random() * (999999 - 111111 + 1) + 111111));
  return retVal;
}

function generateProductID() {
  var length = 1,
    charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    retVal = "";
  for (var i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  retVal += String(Math.floor(Math.random() * (9999 - 1111 + 1) + 1111));
  return retVal;
}

function generateID(length) {
  var charset = "abcdefghijklmnopqrstuvwxyz0123456789",
    retVal = "";
  for (var i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

function generateLoginID() {
  return Math.floor(Math.random() * (9999999999999999 - 1111111111111111 + 1) + 1111111111111111);
}

function generatePosSession() {
  return Math.floor(Math.random() * (999999 - 111111 + 1) + 111111);
}

/*var userdb2 = mk.readJSON("./userdb/users.json");
console.log(userdb2);*/


function createLuckyNumberList() {
  return false;
  var luckyDB = mk.readJSON("./userdb/lucky.json");
  const tomorrowDate = moment().tz(countryTimezone).add(1, 'days');
  const tomorrowDay = String(tomorrowDate.format('dddd'));
  if (luckyDB[String(tomorrowDate.format('YYYY-MM-DD'))] != undefined) {
    return false; //Szczęśliwy numerek na dany dzień został wylosowany
  }
  if (tomorrowDay == "Saturday" || tomorrowDay == "Sunday") {
    return "Lucky number cannot be generated for saturday/sunday"; //Szczęśliwy numerek na te dni nie obowiązuje
  }

  const currentTime = moment().tz(countryTimezone).hours();
  if (currentTime < 15) {
    return "New list cannot be generated."; //Jest przed 15
  }

  var peopleDB = mk.readJSON("./userdb/people.json");
  var usedLuckyDB = mk.readJSON("./userdb/usedLucky.json");
  var tomorrowLuckyDB = {}
  for (x in peopleDB) {
    tomorrowLuckyDB[x] = [];
  }

  for (x in peopleDB) {
    var selectedPeople = []
    for (let i = 0; i < peopleDB[x].luckycount; i++) {
      if (usedLuckyDB[x].length >= peopleDB[x].list.length) {
        usedLuckyDB[x] = []
      }
      var randomIndex = Math.floor(Math.random() * peopleDB[x].list.length);
      var selectedPerson = peopleDB[x].list[randomIndex];
      while (usedLuckyDB[x].includes(selectedPerson) || selectedPeople.includes(selectedPerson)) {
        randomIndex = Math.floor(Math.random() * peopleDB[x].list.length);
        selectedPerson = peopleDB[x].list[randomIndex];
      }
      selectedPeople.push(selectedPerson);
      usedLuckyDB[x].push(selectedPerson);
    }
    //console.log(`Klasa ${x}: ${selectedPeople.join(", ")}`);
    tomorrowLuckyDB[x] = selectedPeople;
  }
  luckyDB[String(tomorrowDate.format('YYYY-MM-DD'))] = tomorrowLuckyDB;
  mk.saveJSON("./userdb/usedLucky.json", JSON.stringify(usedLuckyDB));
  mk.saveJSON("./userdb/lucky.json", JSON.stringify(luckyDB));

  //Wysyłanie powiadomień do osób, które mają następnego dnia szczęśliwy numerek

  return "Success";
}

function getLuckyNumber(username, userclass) {
  var luckyDB = mk.readJSON("./userdb/lucky.json");
  var luckynumbers = {}
  const currentDate = moment().tz(countryTimezone).format('YYYY-MM-DD');
  const tomorrowDate = moment().tz(countryTimezone).add(1, 'days').format('YYYY-MM-DD');
  if (luckyDB[currentDate] != undefined) {
    for (group in luckyDB[currentDate]) {
      for (person in luckyDB[currentDate][group]) {
        if (luckyDB[currentDate][group][person] == username && group == userclass) {
          personName = luckyDB[currentDate][group][person].split(" ");
          luckyDB[currentDate][group][person] = `<b>${personName[1]} ${personName[0]}</b>`
          continue;
        }
        personName = luckyDB[currentDate][group][person].split(" ");
        personName[0] = `${personName[0].charAt(0)}${'*'.repeat(personName[0].length - 1)}`
        luckyDB[currentDate][group][person] = `${personName[1]} ${personName[0]}`
      }
    }
    luckynumbers.today = luckyDB[currentDate];
  }
  if (luckyDB[tomorrowDate] != undefined) {
    for (group in luckyDB[tomorrowDate]) {
      for (person in luckyDB[tomorrowDate][group]) {
        if (luckyDB[tomorrowDate][group][person] == username && group == userclass) {
          personName = luckyDB[tomorrowDate][group][person].split(" ");
          luckyDB[tomorrowDate][group][person] = `<b>${personName[1]} ${personName[0]}</b>`
          continue;
        }
        personName = luckyDB[tomorrowDate][group][person].split(" ");
        personName[0] = `${personName[0].charAt(0)}${'*'.repeat(personName[0].length - 1)}`
        luckyDB[tomorrowDate][group][person] = `${personName[1]} ${personName[0]}`
      }
    }
    luckynumbers.tomorrow = luckyDB[tomorrowDate];
  }
  return luckynumbers;
}

createLuckyNumberList();


function formatTimeDifference(startTime, endTime) {
    // Oblicz różnicę w milisekundach
    let timeDiff = endTime - startTime;

    // Oblicz dni, godziny, minuty i sekundy
    let seconds = Math.floor(timeDiff / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);

    seconds %= 60;
    minutes %= 60;
    hours %= 24;

    // Formatuj wynik
    let formattedTime = pad(days, 2) + "d " + pad(hours, 2) + "h " + pad(minutes, 2) + "m " + pad(seconds, 2) + "s";

    return formattedTime;
}

function pad(number, length) {
    let str = String(number);
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}

async function deleteUser(userID) {
  var userDB = mk.readJSON("./userdb/users.json");
  if (userDB[userID] == undefined) return false;

  //Mail z informacja
  var userName = userDB[user].firstname;
  userName = userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase()
  var additionalInfo = {
    "userName": userName,
    "userID": user,
  }
  await sendMail("delNotify", additionalInfo, userDB[user].email);

  var ticketsDB = mk.readJSON("./events/tickets.json");
  var couponsDB = mk.readJSON("./events/coupons.json");
  var pointsDB = mk.readJSON("./userdb/points.json");
  var exDB = mk.readJSON("./icsu/exemptions.json");
  var pushDB = mk.readJSON("./userdb/push.json");
  var picDB = mk.readJSON("./userdb/pic.json");

  //Bilety
  for (t in ticketsDB) {
    if (ticketsDB[t].userid == userID) {
      if (userDB[ticketsDB[t].userid] == undefined) {
        continue;
      }
      ticketsDB[t].userid = `${userDB[ticketsDB[t].userid].firstname} ${userDB[ticketsDB[t].userid].lastname}, ${userDB[ticketsDB[t].userid].class.toUpperCase()}`
    }
  }

  //Kupony
  for (c in couponsDB) {
    if (couponsDB[c].userid == userID) {
      delete couponsDB[c];
    }
  }

  //Zwolnienia
  for (ex in exDB) {
    if (exDB[ex].for == userID) {
      delete exDB[ex]
    }
  }
    //Punkty
    if (pointsDB[userID] != undefined) {
      delete pointsDB[userID];
    }

    //Dane PUSH
    if (pushDB[userID] != undefined) {
      delete pushDB[userID]; //Usuwanie danych PUSH
    }

    //Zdjęcie profilowe
    if (picDB[userID] != undefined) {
      const apiUrl = `https://api.imgur.com/3/image/${picDB[userID][1]}`;
          axios.delete(apiUrl, {
        headers: {
          'Authorization': `Client-ID ${imgurClientID}`
        }
      })
        .then(response => {
          console.log("Pomyślnie usunięto zdjęcie!")
          delete picDB[userID];
          mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
        })
        .catch(error => {
          console.log("Wystąpił błąd podczas usuwania zdjęcia!")
          delete picDB[userID];
          mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
        });
    }

    //USUWANIE Z BAZY UŻYTKOWNIKÓW
    delete userDB[userID];

  mk.saveJSON("./events/tickets.json", JSON.stringify(ticketsDB));
  mk.saveJSON("./events/coupons.json", JSON.stringify(couponsDB));
  mk.saveJSON("./userdb/points.json", JSON.stringify(pointsDB));
  mk.saveJSON("./icsu/exemptions.json", JSON.stringify(exDB));
  mk.saveJSON("./userdb/push.json", JSON.stringify(pushDB));
  mk.saveJSON("./userdb/pic.json", JSON.stringify(picDB));
  
  mk.saveJSON("./userdb/users.json", JSON.stringify(userDB));
  console.log(`Usunięto konto ${user}`)
  return true;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Upewnij się, że masz zdefiniowaną funkcję sleep gdzieś na górze pliku:
// const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function inactiveAccounts() {
  // Wyszukiwanie nieaktywnych kont
  var userDB = mk.readJSON("./userdb/users.json")
  var timestamp = Math.floor(Date.now())
  
  // Zmienne inactiveDaysNotification i inactiveDaysDelete muszą być zdefiniowane wcześniej
  var accNotification = timestamp - (inactiveDaysNotification * 24 * 60 * 60 * 1000);
  var accDelete = timestamp - (inactiveDaysDelete * 24 * 60 * 60 * 1000);

  var accountsToNotify = 0;
  var accountsToDelete = 0;

  // DODANO 'let' przed user
  for (let user in userDB) {
    var activityDiff = timestamp - userDB[user].lastactivity;
    
    if (userDB[user].lastactivity <= accDelete && userDB[user].indeletion == true) {
      console.log(`Konto ${user} usunięte ze względu na brak aktywności`);
      const userToDelete = user;
      
      // Jeśli deleteUser też jest asynchroniczne, dodaj tutaj await!
      await (userToDelete); 
      
      accountsToDelete += 1;
      await sleep(1000);
      
    } else if (Math.floor(activityDiff / 24 / 60 / 60 / 1000) >= inactiveDaysNotification) {
      if (userDB[user].indeletion != undefined && userDB[user].indeletion == true) {
        continue;
      }
      console.log(`Wysyłam powiadomienie do ${user} o usunięciu konta za 30 dni`);
      var userName = userDB[user].firstname;
      userName = userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase();
      
      var additionalInfo = {
        "userName": userName,
        "userID": user,
      }
      
      // DODANO 'await' - czekamy aż mail faktycznie wyjdzie, zanim uśpimy pętlę
      let mailStatus = await sendMail("delWarning", additionalInfo, userDB[user].email);
      
      if (mailStatus === 200) {
        accountsToNotify += 1;
      } else {
        console.log(`Błąd wysyłania powiadomienia do ${userDB[user].email}`);
      }
      
      userDB[user].indeletion = true;
      mk.saveJSON("./userdb/users.json", JSON.stringify(userDB));
      await sleep(1000); // 1 sekunda pauzy przed kolejnym użytkownikiem
    }
  }
  
  console.log(`Konta usuniete: ${accountsToDelete}, konta poinformowane o usunieciu: ${accountsToNotify}`);
}


app.get('/maintenance/:token', async (req, res) => {
  if (req.params.token != admintoken) {
    res.status(404)
    res.send("Invalid token!")
    return false;
  }
  console.warn("Starting maintenance...")
  //notifyUsers([ADMINID], "🔧 App maintenance", "Testing PUSH notification")
  
  var userDB = mk.readJSON("./userdb/users.json");
  var eventsDB = mk.readJSON("./events/events.json")
  
  //Powiadomienie o wydarzeniu
  var tomorrowEvents = []
  var todayEvents = []
  // Dzisiejsza data (można ją modyfikować dla testów, np. jako "2024-09-08")
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  for (const [id, event] of Object.entries(eventsDB)) {
    if (event.startdate.startsWith(tomorrowStr)) {
      tomorrowEvents.push(id)
    }
    if (event.startdate.startsWith(todayStr)) {
      todayEvents.push(id)
    }
  }
  
  const now = moment.tz(countryTimezone);

  // Sprawdzenie, czy jest przed godziną 12:00
  if (now.hour() < 12) {
      for (var i in todayEvents) {
      var event = eventsDB[todayEvents[i]]
      var users = []
      for (x in userDB) {
        if (event.for.includes(userDB[x].class)) {
          users.push(x)
        }
      }
      await eventNotificationToday(users, event.name, event.description, event.specialsuit)
    }
  } else {
      for (var i in tomorrowEvents) {
      var event = eventsDB[tomorrowEvents[i]]
      var users = []
      for (x in userDB) {
        if (event.for.includes(userDB[x].class)) {
          users.push(x)
        }
        if (event.type == "spotkanie" && userDB[x].access > 0) {
          users.push(x)
        }
      }
      await eventNotification(users, event.name, event.description, event.specialsuit)
    }
    await inactiveAccounts();
  }
  
  
  
  res.send('Mobilny Katolik API by Kuba Salek')
})


//Zlecenia PUSH

const sendPushNotification = async (subscription, title, content, user, userID, action) => {
  title = title.replaceAll("[fname]", capitalizeWords(user.firstname))
  content = content.replaceAll("[fname]", capitalizeWords(user.firstname))
  title = title.replaceAll("[sname]", capitalizeWords(user.lastname))
  content = content.replaceAll("[sname]", capitalizeWords(user.lastname))
  var payload = `{"title": "${title}", "content": "${content}", "timestamp": ${Math.floor(Date.now())}, "action": "${action}"}`
  try {
    await push.sendNotification(subscription, payload);
    //console.log(`Notification sent to ${subscription.endpoint}`);
    return { success: true }; // Return a success object
  } catch (error) {
    //console.error(`Failed to send notification to ${subscription.endpoint}:`, error);
    if (error.statusCode === 410) { // 410 means the subscription is no longer valid
      return Promise.reject({ success: false, reason: error });
      //console.log(`Subscription has expired for ${subscription.endpoint}`);
    }
  }
};

// Main function to send notifications in parallel
async function notifyUsers(users, title, content, action) {
  var options = { TTL: 3600 }
  
  var subscriptions =  []
  
  var pushDB = mk.readJSON("./userdb/push.json")
  var userDB = mk.readJSON("./userdb/users.json")
  var counter = [0, 0]
  for (u in users) {
    if (pushDB[users[u]] == undefined) {
      users.splice(u, 1);
      counter[1] = counter[1] + 1
      continue;
    }
    subscriptions.push(pushDB[users[u]])
    //console.log(users[u])
  }
  //console.log(subscriptions)
  //console.log(users)
  if (action == undefined) {action = "reload"}
  const promises = users.map((userID) =>
    sendPushNotification(pushDB[userID], title, content, userDB[userID], userID, action)
  );

  // Use Promise.allSettled to ensure all promises resolve, even if some fail
  const results = await Promise.allSettled(promises);
  
  var successUsers = []
  var errorUsers = []

  // Log results and handle errors
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      counter[0] = counter[0] + 1
      successUsers.push(users[index])
      //console.log(`Notification successfully sent to ${subscriptions[index].endpoint}`);
    } else {
      //console.error(`Error sending notification to ${subscriptions[index].endpoint}:`, result.reason);
      counter[1] = counter[1] + 1
      errorUsers.push(users[index])
    }
  });
  console.log(`Ukończono zlecenie PUSH z wynikiem: ${counter[0]} / ${counter[1]}`)
  //console.log(successUsers)
  //console.log(errorUsers)
  return `Ukończono zlecenie PUSH z wynikiem: ${counter[0]} (SUKCES) / ${counter[1]} (BŁĄD)`;
};

function capitalize(str) {
  if (!str) return ''; // Handle empty strings
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function capitalizeWords(str) {
    // Rozdzielanie stringu na słowa rozdzielone spacją
    return str.split(' ').map(word => {
        // Rozdzielanie słów z myślnikiem
        return word.split('-').map(part => {
            // Zamiana pierwszej litery na wielką, a reszty na małe
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }).join('-'); // Połącz z powrotem słowa z myślnikiem
    }).join(' '); // Połącz z powrotem słowa rozdzielone spacją
}


async function eventNotification(users, name, description, specialsuit) {
  var pushTitle = `📆 Jutro: ${name}`
  var pushContent = `Sprawdź szczegóły w aplikacji.`
  
  if (description != "") {
    try {
      const n = await aiEventNotification("jutro", name, description);
      pushTitle = n.title;
      pushContent = n.content;
    } catch (err) {
      console.log(err)
    }
  }
  
  if (specialsuit == true) {
    pushContent = `Pamiętaj o stroju galowym! 👔`
  }
  console.log(`Wysyłam powiadomienie do (${users.length}) użytkowników`)
  console.log({pushTitle, pushContent})
  notifyUsers(users, pushTitle, pushContent)
}

async function eventNotificationToday(users, name, description, specialsuit) {
  var pushTitle = `📆 Dziś: ${name}`
  var pushContent = `Sprawdź szczegóły w aplikacji.`
  
  if (description != "") {
    try {
      const n = await aiEventNotification("dzisiaj", name, description);
      pushTitle = n.title;
      pushContent = n.content;
    } catch (err) {
      console.log(err)
    }
  }
  
  if (specialsuit == true) {
    pushContent = `Pamiętaj o stroju galowym! 👔`
  }
  console.log(`Wysyłam powiadomienie do (${users.length}) użytkowników`)
  console.log({pushTitle, pushContent})
  notifyUsers(users, pushTitle, pushContent)
}


async function deleteImagesAsync() {
  var photoboxDB = mk.readJSON("./photobox/photos.json");
  console.log(Object.keys(photoboxDB).length)
  var counter = 1;
  for (const x in photoboxDB) {
    const apiUrl = `https://api.imgur.com/3/image/${photoboxDB[x].deletehash}`;
    try {
      const response = await axios.delete(apiUrl, {
        headers: {
          'Authorization': `Client-ID ${imgurClientID}`
        }
      });
      console.log('${counter}: Deleted successfully:', response.data);
      delete photoboxDB[x];
    } catch (error) {
      console.log(`${counter}: ERROR ${x}`, error.message);
    } finally {
      await mk.saveJSON("./photobox/photos.json", JSON.stringify(photoboxDB));
    }
    counter += 1
  }
}


//POS-CONNECT

//New POS-CONNECT session
app.get('/pmk/posconnect/new/:userid/:loginid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  var posConnectDB = mk.readJSON("./orders/posconnect.json");
  
  var posConnectSessionID = generatePosSession()
  while (posConnectDB[posConnectSessionID] != undefined) {
    posConnectSessionID = generatePosSession()
  }
  
  var posConnectDetails = {
    "code": generateID(4).toUpperCase(),
    "scan": "",
    "lastscan": Math.floor(Date.now() / 1000)
  }
  
  posConnectDB[posConnectSessionID] = posConnectDetails
  
  //Usuwanie przestarzałych sesji (czas bez aktywności >24h)
  var timestamp = Math.floor(Date.now / 1000)
  for (let session in posConnectDB) {
    if ((timestamp - posConnectDB[session].lastscan) > 86400) {
      delete posConnectDB[session];
    }
  }
  
  mk.saveJSON("./orders/posconnect.json", JSON.stringify(posConnectDB))
  posConnectDetails.sessionid = posConnectSessionID
  
  res.status(200);
  res.send(posConnectDetails);
});

//Connect to POS-CONNECT session
app.post('/pmk/posconnect/connect/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (req.body.code == undefined) {
    res.status(404);
    res.send("Please provide valid code!");
    return false;
  }
  
  var code = req.body.code.toUpperCase()
  var posConnectDB = mk.readJSON("./orders/posconnect.json");
  var selectedSession;
  
  for (let session in posConnectDB) {
    if (posConnectDB[session].code == code) {
      selectedSession = session
      break
    }
  }
  
  if (selectedSession == undefined) {
    res.status(404);
    res.send("Please provide valid code!");
    return false;
  }
  
  delete posConnectDB[selectedSession].code
  mk.saveJSON("./orders/posconnect.json", JSON.stringify(posConnectDB))
  
  posConnectDB[selectedSession].sessionid = selectedSession
  

  res.status(200);
  res.send(posConnectDB[selectedSession]);
})

//Scan for POS-CONNECT
app.post('/pmk/posconnect/scan/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (req.body.sessionid == undefined) {
    res.status(404);
    res.send("Please provide valid session ID!");
    return false;
  }
  
  var sessionID = req.body.sessionid
  var scan = req.body.scan
  
  var posConnectDB = mk.readJSON("./orders/posconnect.json");
  
  if (posConnectDB[sessionID] == undefined) {
    res.status(404);
    res.send("Please provide valid session ID!");
    return false;
  }
  
  posConnectDB[sessionID].scan = scan
  posConnectDB[sessionID].lastscan = Math.floor(Date.now() / 1000)
  mk.saveJSON("./orders/posconnect.json", JSON.stringify(posConnectDB))
  
  var response = {
    "success": true
  }

  res.status(200);
  res.send(JSON.stringify(response));
})

//Get POS-CONNECT scan
app.get('/pmk/posconnect/get/:sessionid/:userid/:loginid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var sessionID = req.params.sessionid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (sessionID == undefined) {
    res.status(404);
    res.send("Please provide valid session ID!");
    return false;
  }
  
  var posConnectDB = mk.readJSON("./orders/posconnect.json");
  
  if (posConnectDB[sessionID] == undefined) {
    res.status(404);
    res.send("Please provide valid session ID!");
    return false;
  }
  
  var scan = posConnectDB[sessionID].scan
  
  res.status(200);
  res.send(scan);
});

//Get user data for POS-CONNECT
app.get('/pmk/posconnect/getuser/:sessionid/:userid/:loginid', (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var sessionID = req.params.sessionid;
  var userdb = mk.readJSON("./userdb/users.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access == undefined || userdb[userID].access < 4) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  
  if (sessionID == undefined) {
    res.status(404);
    res.send("Please provide valid session ID!");
    return false;
  }
  
  var posConnectDB = mk.readJSON("./orders/posconnect.json");
  
  if (posConnectDB[sessionID] == undefined) {
    res.status(404);
    res.send("Please provide valid session ID!");
    return false;
  }
  
  var scan = posConnectDB[sessionID].scan
  
  if (userdb[scan] == undefined) {
    res.status(404);
    res.send("Please scan valid userID!");
    return false;
  }
  
  delete userdb[scan].cred
  delete userdb[scan].loginid
  userdb[scan].userid = scan
  
  
  res.status(200);
  res.send(JSON.stringify(userdb[scan]));
});



//Zwolnienia - exemptions
app.post('/pmk/exemptions/new', jsonParser, (req, res) => { //wysyłanie prośby o zwolnienie
  var userID = req.body.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var eventsDB = mk.readJSON("./events/events.json")
  var exDB = mk.readJSON("./icsu/exemptions.json")
  
  if (userdb[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  let projectID = req.body.eventID
  let date = req.body.date
  let timeStart = req.body.start
  let timeEnd = req.body.end

  if (eventsDB[projectID] == undefined) {
    projectID = "Inne"
  }

  const datetime1 = moment.tz(`${date} ${timeStart}`, 'YYYY-MM-DD HH:mm', countryTimezone);
  const datetime2 = moment.tz(`${date} ${timeEnd}`, 'YYYY-MM-DD HH:mm', countryTimezone);
  
  const timestamp1 = datetime1.valueOf(); // lub .unix() dla sekund
  const timestamp2 = datetime2.valueOf();

  let exID = generateID(8)
  while (exDB[exID] != undefined) {
    exID = generateID(8)
  }

  var exData = {
    "for": userID,
    "status": 0,
    "start_date": timestamp1,
    "end_date": timestamp2,
    "event": projectID
  }

  exDB[exID] = exData
  console.log(exData)
  console.log(exDB)
  var forFullName = `${userdb[userID].firstname} ${userdb[userID].lastname} (${userdb[userID].class.toUpperCase()})`
  mk.saveJSON("./icsu/exemptions.json", JSON.stringify(exDB));

  //Informowanie osób z poziomem uprawnień >= 5
  var permittedUsers = []
  for (user in userdb) {
    if (userdb[user].access >= 5) {
      permittedUsers.push(user)
    }
  }

  

  //Tutaj trzeba zrobić wysłanie powiadomienia do osób z poziomem uprawnień >=5, że zwolnienie oczekuje na akceptację
  notifyUsers(permittedUsers, `*️⃣ Nowa prośba o zwolnienie`, `${forFullName} prosi o zwolnienie`, "showWaitingExemptions");

  res.status(200);
  res.send("Success");
});

//Zatwierdzanie/odrzucanie zwolnienia
app.post('/pmk/exemptions/manage/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var exDB = mk.readJSON("./icsu/exemptions.json")
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access < 5) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }
  if (userdb[userID].class != "n") {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  if (req.body.accept == undefined) {
    res.status(404);
    res.send("Provide approval")
    return false;
  }

  let approval = req.body.accept

  if (req.body.exid == undefined || exDB[req.body.exid] == undefined) {
    res.status(404);
    res.send("Invalid exemption ID!")
    return false
  }

  var fullName = `${userdb[userID].firstname} ${userdb[userID].lastname}`

  const now = moment.tz(countryTimezone);
  const formattedDate = now.format('YYYY-MM-DDTHH:mm');  

  if (approval == true) {
    exDB[req.body.exid].status = 1
    exDB[req.body.exid].by = fullName
    exDB[req.body.exid].time = formattedDate
    notifyUsers([exDB[req.body.exid].for], `✅ Otrzymano zwolnienie`, `Zatwierdzone przez: ${fullName}`);
  } else if (approval == false) {
    exDB[req.body.exid].status = 2
    exDB[req.body.exid].by = fullName
    exDB[req.body.exid].time = "Odrzucono"
    notifyUsers([exDB[req.body.exid].for], `⛔️ Prośba o zwolnienie odrzucona`, `Odrzucone przez: ${fullName}`);
  }


  mk.saveJSON("./icsu/exemptions.json", JSON.stringify(exDB));

  res.status(200);
  res.send("Success");
});

//Reviews - sprawozdania
//Wysyłanie sprawozdania
app.post('/pmk/reviews/new/:userid/:loginid', jsonParser, (req, res) => {
  var loginID = req.params.loginid;
  var userID = req.params.userid;
  var userdb = mk.readJSON("./userdb/users.json");
  var reviewsDB = mk.readJSON("./icsu/review.json")
  var eventsDB = mk.readJSON("./events/events.json");
  
  if (userdb[userID].loginid != loginID) {
    res.status(404);
    res.send("Invalid loginID");
    return false;
  }
  if (userdb[userID].access < 1) {
    res.status(403);
    res.send("Insufficient access level");
    return false;
  }

  if (req.body.answers == undefined) {
    res.status(404);
    res.send("Invalid answers")
    return false;
  }

  let eID = req.body.eventID

  if (eID == undefined || eventsDB[eID] == undefined) {
    res.status(404);
    res.send("Invalid event")
    return false;
  }


  if (reviewsDB[eID] == undefined) { reviewsDB[eID] = {} }

  reviewsDB[eID][userID] = req.body.answers
  mk.saveJSON("./icsu/review.json", JSON.stringify(reviewsDB));

  res.status(200);
  res.send("Success");
});

const dniTygodnia = [
  'ndz', 'pon', 'wt', 'śr',
  'czw', 'pt', 'sb'
];
const miesiaceSkrot = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'
];

function formatTimeRangeFromTimestamps(ts1, ts2) {
  if (ts1 > ts2) {
    var timestamp1 = ts2
    var timestamp2 = ts1
  } else {
    var timestamp1 = ts1
    var timestamp2 = ts2
  }
  const start = moment.tz(timestamp1, countryTimezone);
  const end = moment.tz(timestamp2, countryTimezone);
  const today = moment.tz(countryTimezone).startOf('day');
  const tomorrow = moment(today).add(1, 'day');

  let prefix;
  const day = start.date();
  const month = miesiaceSkrot[start.month()];
  const year = start.year()
  const dayName = dniTygodnia[start.day()];

  if (start.isSame(today, 'day')) {
    prefix = `${dayName}., ${day} ${month} ${year} r. (dziś)`;
  } else if (start.isSame(tomorrow, 'day')) {
    prefix = `${dayName}., ${day} ${month} ${year} r. (jutro)`;
  } else {
    prefix = `${dayName}., ${day} ${month} ${year} r.`;
  }

  const timeRange = `${start.format('HH:mm')} - ${end.format('HH:mm')}`;
  return [prefix, timeRange];
}


async function test() {
  var eventsdb = mk.readJSON("./events/events.json")

  for (e in eventsdb) {
    var name = eventsdb[e].name;
    var description = eventsdb[e].description;
    //console.log(name, description);

    var pushTitle = `📆 Dziś: ${name}`
    var pushContent = `Sprawdź szczegóły w aplikacji.`
    
    if (description != "") {
      try {
        const n = await aiEventNotification("dzisiaj", name, description);
        pushTitle = n.title;
        pushContent = n.content;
      } catch (err) {
        console.log(err)
      }
    }

    console.log(`
      POWIADOMIENIE\n
      Tytuł: ${pushTitle}\n
      Treść: ${pushContent}
      `)
  }

}

//test();