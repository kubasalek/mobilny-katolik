const bcrypt = require('bcrypt');
const pool = require('../db');
const jwt = require('jsonwebtoken');

function formatName(text) {
    if (!text) return "";

    return text
        .toLowerCase()
        .replace(/(^|[\s\-])\S/g, (match) => match.toUpperCase());
}

class User {
    #id; #first_name; #last_name; #class; #nickname; #email; #created_at; #password; #permissions; #last_activity;

    //Parametry zmienialne przez PMK
    static attributes() {
        return ["first_name", "last_name", "class", "nickname", "email", "permissions"];
    }

    //Parametry zmienialne przez samego użytkownika
    static selfAttributes() {
        return ["nickname"];
    }

    constructor(userData) {
        this.#id = userData.id;
        this.#first_name = userData.first_name;
        this.#last_name = userData.last_name;
        this.#class = userData.class;
        this.#nickname = userData.nickname;
        this.#email = userData.email;
        this.#created_at = userData.created_at;
        this.#password = userData.password;
        this.#permissions = userData.permissions;
        this.#last_activity = userData.last_activity;
    }

    //Auth
    generateAccessToken() {
        return jwt.sign({ id: this.#id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    }

    generateRefreshToken() {
        const refreshToken = jwt.sign({ id: this.#id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
        const refreshTokenExpiresAt = new Date();
        refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7);

        // 2. Zapytanie SQL dodające token do bazy
        const insertTokenQuery = `
            INSERT INTO rtokens (user_id, token_hash, expires_at) 
            VALUES ($1, $2, $3)
        `;

        pool.query(insertTokenQuery, [this.#id, refreshToken, refreshTokenExpiresAt]);
        return refreshToken;
    }

    //Getting user data from database using id
    async update() {
        const sqlQuery = 'SELECT * FROM users WHERE id = $1';
        const result = await pool.query(sqlQuery, [this.#id]);
        if (result.rows.length === 0) {
            return false;
        }
        let userData = result.rows[0];
        this.#first_name = userData.first_name;
        this.#last_name = userData.last_name;
        this.#class = userData.class;
        this.#nickname = userData.nickname;
        this.#email = userData.email;
        this.#created_at = userData.created_at;
        this.#password = userData.password;
        this.#permissions = userData.permissions;
        this.#last_activity = userData.last_activity;
        return true;
    }

    //Getting data
    get id() { return this.#id };
    get first_name() { return this.#first_name };
    get last_name() { return this.#last_name };
    get nickname() { return this.#nickname };
    get class() { return this.#class };
    get email() { return this.#email };
    get created_at() { return this.#created_at };
    get permissions() { return this.#permissions };
    get full_name() { return formatName(`${this.#first_name} ${this.#last_name}`)}
    get prefferedName() {
        if (this.#nickname != null) { return this.#nickname }
        else { return formatName(this.#first_name); }
    }

    //Getting additional data
    async getTickets() {
        const sql = `SELECT tickets.* FROM tickets JOIN users ON tickets.user=users.id WHERE users.id = $1;`
        const result = await pool.query(sql, [this.#id]);
        return result.rows;
    }

    //Updating fields
    set first_name(newValue) {
        this.#first_name = newValue.toUpperCase();
        this.#updateField("first_name", newValue.toUpperCase());
    }

    set last_name(newValue) {
        this.#last_name = newValue.toUpperCase();
        this.#updateField("last_name", newValue.toUpperCase());
    }

    set nickname(newValue) {
        this.#nickname = newValue;
        this.#updateField("nickname", newValue);
    }

    set class(newValue) {
        this.#class = newValue.toLowerCase();
        this.#updateField("class", newValue.toLowerCase());
    }

    set email(newValue) {
        this.#email = newValue;
        this.#updateField("email", newValue);
    }

    set permissions(newValue) {
        this.#permissions = parseInt(newValue);
        this.#updateField("permissions", parseInt(newValue));
    }

    toJSON() {
        return {
            id: this.#id,
            first_name: this.#first_name,
            last_name: this.#last_name,
            class: this.#class,
            nickname: this.#nickname,
            created_at: this.#created_at,
            last_activity: this.#last_activity,
            permissions: this.#permissions
        }
    }

    checkPermissions(needed) {
        if (this.#permissions < needed) { return false; }
        else { return true; }
    }

    async validatePassword(plainPassword) {
        if (!this.#password) return false;
        return await bcrypt.compare(plainPassword, this.#password);
    }

    async changePassword(newPassword) {
        if (newPassword.length < 8) { return false;}
        const hash = await bcrypt.hash(newPassword, 10);
        this.#password = hash;
        this.#updateField("password", hash);
        return true;
    }

    //Update in database
    async #updateField(column, value) {
        try {
            const sql = `UPDATE users SET ${column} = $1 WHERE id = $2`;
            await pool.query(sql, [value, this.#id]);
            console.log(`[Neon] Zaktualizowano ${column} dla użytkownika ${this.#id}`);
        } catch (err) {
            console.error(`[Neon] Błąd aktualizacji ${column}:`, err);
        }
    }

    /*DO WDROŻENIA
    async save() {
        if (Object.keys(this.#changes).length === 0) return;

        const columns = Object.keys(this.#changes);
        const values = Object.values(this.#changes);
        
        // Dynamiczne budowanie zapytania: UPDATE users SET col1=$1, col2=$2 WHERE id=$3
        const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
        const sql = `UPDATE users SET ${setClause} WHERE id = $${columns.length + 1}`;
        
        await pool.query(sql, [...values, this.#id]);
        this.#changes = {}; // Czyścimy listę zmian
    }
    */
}

module.exports = User;