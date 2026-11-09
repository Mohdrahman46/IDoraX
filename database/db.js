const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, ".env");

if (!fs.existsSync(envPath)) {
    throw new Error("Database configuration file database/.env was not found.");
}

require("dotenv").config({ path: envPath, quiet: true });

const requiredSettings = ["DB_HOST", "DB_USER", "DB_NAME"];
const missingSettings = requiredSettings.filter(function (name) {
    return !process.env[name] || !process.env[name].trim();
});
const port = Number(process.env.DB_PORT || 3306);

if (missingSettings.length > 0) {
    throw new Error(
        "Missing required database settings in database/.env: "
            + missingSettings.join(", ")
    );
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT in database/.env must be a valid port number.");
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
});

module.exports = pool;
