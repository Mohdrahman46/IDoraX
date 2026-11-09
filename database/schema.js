const pool = require("./db");
const { randomBytes } = require("crypto");

const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS employees (
        id INT NOT NULL AUTO_INCREMENT,
        employee_id VARCHAR(50) NOT NULL,
        company_branding_id INT DEFAULT NULL,
        digital_id_token CHAR(64) NOT NULL,
        digital_id_enabled TINYINT(1) NOT NULL DEFAULT 1,
        full_name VARCHAR(150) NOT NULL,
        designation VARCHAR(100) NOT NULL,
        department VARCHAR(100) DEFAULT '',
        phone VARCHAR(20) DEFAULT '',
        email VARCHAR(150) DEFAULT '',
        photo_path VARCHAR(255) DEFAULT NULL,
        joining_date DATE DEFAULT NULL,
        status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_employees_employee_id (employee_id),
        UNIQUE KEY uq_employees_digital_id_token (digital_id_token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS company_branding (
        id INT NOT NULL AUTO_INCREMENT,
        company_name VARCHAR(150) NOT NULL,
        company_logo VARCHAR(255) DEFAULT NULL,
        company_address TEXT DEFAULT NULL,
        company_phone VARCHAR(20) DEFAULT NULL,
        company_email VARCHAR(150) DEFAULT NULL,
        website VARCHAR(255) DEFAULT NULL,
        tagline VARCHAR(150) DEFAULT NULL,
        company_primary_color VARCHAR(7) NOT NULL DEFAULT '#285638',
        company_secondary_color VARCHAR(7) NOT NULL DEFAULT '#36764b',
        company_accent_color VARCHAR(7) NOT NULL DEFAULT '#a8e6b0',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS bulk_import_jobs (
        id INT NOT NULL AUTO_INCREMENT,
        job_id VARCHAR(50) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        total_records INT DEFAULT 0,
        successful_records INT DEFAULT 0,
        failed_records INT DEFAULT 0,
        status ENUM('Pending', 'Processing', 'Completed', 'Failed')
            DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_bulk_import_jobs_job_id (job_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS id_card_jobs (
        id INT NOT NULL AUTO_INCREMENT,
        job_id VARCHAR(50) NOT NULL,
        total_cards INT DEFAULT 0,
        output_format VARCHAR(20) DEFAULT 'PDF',
        file_path VARCHAR(255) DEFAULT NULL,
        status ENUM('Pending', 'Processing', 'Completed', 'Failed')
            DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_id_card_jobs_job_id (job_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

async function initializeSchema() {
    for (const statement of schemaStatements) {
        await pool.query(statement);
    }

    const [brandingColumns] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_branding'`
    );
    const existingBrandingColumns = new Set(
        brandingColumns.map(function (column) {
            return column.COLUMN_NAME;
        })
    );
    const brandingMigrations = [
        ["tagline", "VARCHAR(150) DEFAULT NULL"],
        [
            "company_primary_color",
            "VARCHAR(7) NOT NULL DEFAULT '#285638'"
        ],
        [
            "company_secondary_color",
            "VARCHAR(7) NOT NULL DEFAULT '#36764b'"
        ],
        [
            "company_accent_color",
            "VARCHAR(7) NOT NULL DEFAULT '#a8e6b0'"
        ]
    ];
    for (const migration of brandingMigrations) {
        if (!existingBrandingColumns.has(migration[0])) {
            await pool.query(
                "ALTER TABLE company_branding ADD COLUMN "
                    + migration[0] + " " + migration[1]
            );
        }
    }

    const [columns] = await pool.execute(
        `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'
            AND COLUMN_NAME IN (
                'digital_id_token', 'digital_id_enabled',
                'company_branding_id'
            )`
    );
    const existingColumns = new Set(columns.map(function (column) {
        return column.COLUMN_NAME;
    }));

    if (!existingColumns.has("digital_id_token")) {
        await pool.query(
            "ALTER TABLE employees ADD COLUMN digital_id_token CHAR(64) NULL"
        );
    }

    if (!existingColumns.has("digital_id_enabled")) {
        await pool.query(
            "ALTER TABLE employees ADD COLUMN digital_id_enabled "
                + "TINYINT(1) NOT NULL DEFAULT 1"
        );
    }

    if (!existingColumns.has("company_branding_id")) {
        await pool.query(
            "ALTER TABLE employees ADD COLUMN company_branding_id INT DEFAULT NULL"
        );
    }

    await pool.query(
        `UPDATE employees e LEFT JOIN company_branding b
            ON b.id = e.company_branding_id
        SET e.company_branding_id = NULL
        WHERE e.company_branding_id IS NOT NULL AND b.id IS NULL`
    );
    await pool.query(
        `UPDATE employees SET company_branding_id = 1
        WHERE company_branding_id IS NULL
            AND EXISTS (
                SELECT 1 FROM company_branding WHERE id = 1
            )`
    );

    const [brandingIndexes] = await pool.execute(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'
            AND INDEX_NAME = 'ix_employees_company_branding_id'`
    );
    if (brandingIndexes.length === 0) {
        await pool.query(
            "ALTER TABLE employees ADD INDEX "
                + "ix_employees_company_branding_id (company_branding_id)"
        );
    }

    const [brandingForeignKeys] = await pool.execute(
        `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
            AND TABLE_NAME = 'employees'
            AND CONSTRAINT_NAME = 'fk_employees_company_branding'`
    );
    if (brandingForeignKeys.length === 0) {
        await pool.query(
            "ALTER TABLE employees ADD CONSTRAINT "
                + "fk_employees_company_branding "
                + "FOREIGN KEY (company_branding_id) "
                + "REFERENCES company_branding(id) ON DELETE SET NULL"
        );
    }

    const [employees] = await pool.execute(
        "SELECT id FROM employees WHERE digital_id_token IS NULL "
            + "OR digital_id_token = ''"
    );
    for (const employee of employees) {
        await pool.execute(
            "UPDATE employees SET digital_id_token = ? "
                + "WHERE id = ? AND (digital_id_token IS NULL "
                + "OR digital_id_token = '')",
            [randomBytes(32).toString("hex"), employee.id]
        );
    }

    const [indexes] = await pool.execute(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'
            AND INDEX_NAME = 'uq_employees_digital_id_token'`
    );
    if (indexes.length === 0) {
        await pool.query(
            "ALTER TABLE employees ADD UNIQUE KEY "
                + "uq_employees_digital_id_token (digital_id_token)"
        );
    }
}

module.exports = initializeSchema;
