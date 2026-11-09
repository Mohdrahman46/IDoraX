const pool = require("./database/db");

async function testConnection() {
    let connection;

    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            "SELECT DATABASE() AS databaseName"
        );

        console.log("MySQL connection successful.");
        console.log("Connected database:", rows[0].databaseName);
    } catch (error) {
        const password = process.env.DB_PASSWORD;
        let message = error.message || "Unknown connection error.";

        if (password) {
            message = message.split(password).join("[redacted]");
        }

        console.error("Could not connect to MySQL:", message);
        if (error.code) {
            console.error("Error code:", error.code);
        }
        console.error(
            "Check that MySQL is running and that database/.env has the correct connection settings."
        );
        process.exitCode = 1;
    } finally {
        if (connection) {
            connection.release();
        }

        try {
            await pool.end();
        } catch (error) {
            console.error("Could not close the MySQL connection pool:", error.message);
            process.exitCode = 1;
        }
    }
}

testConnection();
