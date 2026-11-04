const bcrypt = require('bcrypt');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');
const countryTimezone = 'Europe/Warsaw';

class Event {
    #id; #name; #start_date; #end_date; #type; #for; #by; #special_suit; #description;

    //Parametry zmienialne przez PMK
    static attributes() {
        return ["name", "start_date", "end_date", "for", "by", "special_suit", "description"];
    }

    constructor(eventData) {
        this.#id = eventData.id;
        this.#name = eventData.name;
        this.#start_date = eventData.start_date;
        this.#end_date = eventData.end_date;
        this.#for = eventData.for != null ? eventData.for.split(";") : null;
        this.#by = eventData.by != null ? eventData.by.split(";") : null;
        this.#special_suit = eventData.special_suit;
        this.#description = eventData.description;
    }

    //Getting event data from database using id
    async update() {
        const sqlQuery = 'SELECT * FROM events WHERE id = $1';
        const result = await pool.query(sqlQuery, [this.#id]);
        if (result.rows.length === 0) {
            return false;
        }
        let eventData = result.rows[0];
        this.#name = eventData.name;
        this.#start_date = eventData.start_date;
        this.#end_date = eventData.end_date;
        this.#for = eventData.for != null ? eventData.for.split(";") : null;
        this.#by = eventData.by != null ? eventData.by.split(";") : null;
        this.#special_suit = eventData.special_suit;
        this.#description = eventData.description;
        return true;
    }

    //Getting data
    get id() { return this.#id };
    get name() { return this.#name };
    get start_date() { return this.#start_date };
    get end_date() { return this.#end_date };
    get for() { return this.#for };
    get by() { return this.#by };
    get special_suit() { return this.#special_suit };
    get description() { return this.#description };

    //Updating fields
    set name(newValue) {
        this.#name = newValue;
        this.#updateField("name", newValue);
    }

    set start_date(newValue) {
        this.#start_date = newValue;
        this.#updateField("start_date", newValue);
    }

    set end_date(newValue) {
        this.#end_date = newValue;
        this.#updateField("end_date", newValue);
    }

    set for(newValue) {
        this.#for = newValue;
        this.#updateField("for", newValue);
    }

    set by(newValue) {
        this.#by= newValue;
        this.#updateField("by", newValue);
    }

    set special_suit(newValue) {
        this.#special_suit = newValue;
        this.#updateField("special_suit", newValue);
    }

    set description(newValue) {
        this.#description = newValue;
        this.#updateField("description", newValue);
    }


    toJSON() {
        return {
            id: this.#id,
            name: this.#name,
            start_date: this.#start_date,
            end_date: this.#end_date,
            for: this.#for,
            by: this.#by,
            special_suit: this.#special_suit,
            description: this.#description
        }
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

}

module.exports = Event;