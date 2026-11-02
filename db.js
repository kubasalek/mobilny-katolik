const { Pool } = require('pg');
require('dotenv').config();

// Tworzymy tzw. Pool, czyli pulę połączeń. 
// pg automatycznie zaczyta link ze zmiennej środowiskowej DATABASE_URL!
const pool = new Pool({
  connectionString: process.env.DATABASE,
  ssl: {
    rejectUnauthorized: false // Wymagane przez większość chmur (w tym Neona)
  }
});

// Szybki test połączenia
pool.connect((err, client, release) => {
  if (err) {
    console.error('[Neon] Connection error: ', err.stack);
  } else {
    console.log('[Neon] PostgreSQL connected!');
    release(); // Zwalniamy klienta z powrotem do puli
  }
});

module.exports = pool;