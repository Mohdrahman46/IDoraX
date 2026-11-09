const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const { randomBytes, randomUUID } = require("crypto");
const { isIP } = require("net");
const pool = require("./db");
const initializeSchema = require("./schema");
const renderEmployeeIdPdf = require("./id-card-pdf");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const projectRoot = path.resolve(__dirname, "..");
const uploadFolder = path.join(projectRoot, "uploads");
fs.mkdirSync(uploadFolder, { recursive: true });

app.use(express.json({ limit: "1mb" }));

function createImageUpload(prefix) {
    const storage = multer.diskStorage({
        destination: function (req, file, callback) {
            callback(null, uploadFolder);
        },
        filename: function (req, file, callback) {
            const extension = {
                "image/png": ".png",
                "image/jpeg": ".jpg",
                "image/webp": ".webp"
            }[file.mimetype];

            if (!extension) {
                return callback(
                    new Error("Only PNG, JPG, and WebP images are allowed.")
                );
            }

            callback(null, prefix + "-" + randomUUID() + extension);
        }
    });

    return multer({
        storage: storage,
        limits: { fileSize: 2 * 1024 * 1024 },
        fileFilter: function (req, file, callback) {
            const allowedTypes = [
                "image/png",
                "image/jpeg",
                "image/webp"
            ];

            if (allowedTypes.includes(file.mimetype)) {
                return callback(null, true);
            }

            callback(new Error("Only PNG, JPG, and WebP images are allowed."));
        }
    });
}

const upload = createImageUpload("company-logo");
const employeePhotoUpload = createImageUpload("employee-photo");

const employeeImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 10
    },
    fileFilter: function (req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        const allowedMimeTypes = extension === ".csv"
            ? [
                "",
                "text/csv",
                "application/csv",
                "application/vnd.ms-excel",
                "application/octet-stream",
                "text/plain"
            ]
            : extension === ".xlsx"
                ? [
                    "",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/zip",
                    "application/octet-stream"
                ]
                : [];

        if (allowedMimeTypes.includes(file.mimetype)) {
            callback(null, true);
        } else {
            callback(new Error(file.originalname + " must be a CSV or XLSX file."));
        }
    }
});

function parseCsv(content) {

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < content.length; index += 1) {

        const character = content[index];

        if (character === '"') {

            if (inQuotes && content[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (inQuotes || field.length === 0) {
                inQuotes = !inQuotes;
            } else {
                throw new Error("CSV contains an unexpected quote.");
            }

        } else if (character === "," && !inQuotes) {
            row.push(field);
            field = "";
        } else if (
            (character === "\n" || character === "\r") &&
            !inQuotes
        ) {
            if (character === "\r" && content[index + 1] === "\n") {
                index += 1;
            }

            row.push(field);
            if (row.some(function (value) {
                return value.trim() !== "";
            })) {
                rows.push(row);
            }
            row = [];
            field = "";
        } else {
            field += character;
        }
    }

    if (inQuotes) {
        throw new Error("CSV contains an unclosed quoted field.");
    }

    row.push(field);
    if (row.some(function (value) {
        return value.trim() !== "";
    })) {
        rows.push(row);
    }

    return rows;
}

function normalizeImportHeader(header) {
    return String(header || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function excelCellToString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? "Invalid Date"
            : value.toISOString().slice(0, 10);
    }

    if (typeof value === "object") {
        if (Object.prototype.hasOwnProperty.call(value, "result")) {
            return excelCellToString(value.result);
        }
        if (Array.isArray(value.richText)) {
            return value.richText.map(function (part) {
                return part.text || "";
            }).join("");
        }
        if (typeof value.text === "string") {
            return value.text;
        }
        return "";
    }

    return String(value);
}

function excelSerialToDate(value) {
    if (!Number.isFinite(value)) {
        return String(value);
    }

    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Number.isNaN(date.getTime())
        ? String(value)
        : date.toISOString().slice(0, 10);
}

async function employeeRowsFromExcel(buffer, filename) {
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(buffer);
    } catch (error) {
        throw new Error(filename + " is not a valid .xlsx workbook.");
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
        throw new Error(filename + " is empty or has no employee records.");
    }

    const rows = [];
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const values = worksheet.getRow(rowNumber).values.slice(1);
        if (
            rowNumber === 1 ||
            values.some(function (value) {
                return excelCellToString(value).trim() !== "";
            })
        ) {
            rows.push({ rowNumber: rowNumber, values: values });
        }
    }

    return parseEmployeeRows(rows, filename, true);
}

function parseEmployeeCsv(buffer, filename) {
    let rows;

    try {
        rows = parseCsv(buffer.toString("utf8"));
    } catch (error) {
        throw new Error(filename + ": " + error.message);
    }

    return parseEmployeeRows(
        rows.map(function (values, index) {
            return { rowNumber: index + 1, values: values };
        }),
        filename,
        false
    );
}

function parseEmployeeRows(rows, filename, isExcel) {
    if (rows.length < 2) {
        throw new Error(filename + " is empty or has no employee records.");
    }

    const aliases = {
        employeeid: "employeeId",
        id: "employeeId",
        staffid: "employeeId",
        fullname: "fullName",
        employeename: "fullName",
        name: "fullName",
        designation: "designation",
        jobtitle: "designation",
        title: "designation",
        department: "department",
        dept: "department",
        phone: "phone",
        phonenumber: "phone",
        mobile: "phone",
        email: "email",
        emailaddress: "email",
        joiningdate: "joiningDate",
        dateofjoining: "joiningDate"
    };

    const headers = rows[0].values.map(function (value) {
        return normalizeImportHeader(excelCellToString(value));
    });
    const columns = {};

    headers.forEach(function (header, index) {

        const fieldName = aliases[header];

        if (!fieldName) {
            return;
        }

        if (columns[fieldName] !== undefined) {
            throw new Error(
                filename + " has more than one column for " + fieldName + "."
            );
        }

        columns[fieldName] = index;
    });

    const requiredFields = ["employeeId", "fullName", "designation"];
    const missingFields = requiredFields.filter(function (fieldName) {
        return columns[fieldName] === undefined;
    });

    if (missingFields.length > 0) {
        throw new Error(
            filename
                + " is missing required columns: "
                + missingFields.join(", ")
                + "."
        );
    }

    const employees = [];
    const errors = [];

    rows.slice(1).forEach(function (record) {
        const row = Array.from(record.values, function (value, index) {
            if (
                isExcel &&
                columns.joiningDate === index &&
                typeof value === "number"
            ) {
                return excelSerialToDate(value);
            }
            return excelCellToString(value).trim();
        });

        if (
            row.length !== headers.length &&
            (!isExcel || row.slice(headers.length).some(function (value) {
                return excelCellToString(value).trim() !== "";
            }))
        ) {
            errors.push(
                filename
                    + " row "
                    + record.rowNumber
                    + " has an incorrect number of columns."
            );
            return;
        }

        function valueFor(fieldName) {
            const column = columns[fieldName];
            return column === undefined ? "" : row[column];
        }

        const employee = {
            employeeId: valueFor("employeeId"),
            fullName: valueFor("fullName"),
            designation: valueFor("designation"),
            department: valueFor("department"),
            phone: valueFor("phone"),
            email: valueFor("email"),
            joiningDate: valueFor("joiningDate"),
            sourceFile: filename,
            sourceRow: record.rowNumber
        };

        const missingValues = requiredFields.filter(function (fieldName) {
            return !employee[fieldName];
        });

        if (missingValues.length > 0) {
            errors.push(
                filename
                    + " row "
                    + record.rowNumber
                    + " is missing "
                    + missingValues.join(", ")
                    + "."
            );
            return;
        }

        const maximumLengths = {
            employeeId: 50,
            fullName: 150,
            designation: 100,
            department: 100,
            phone: 20,
            email: 150
        };
        const tooLong = Object.keys(maximumLengths).find(function (fieldName) {
            return employee[fieldName].length > maximumLengths[fieldName];
        });

        if (tooLong) {
            errors.push(
                filename
                    + " row "
                    + record.rowNumber
                    + " has a value that is too long for "
                    + tooLong
                    + "."
            );
            return;
        }

        if (
            employee.joiningDate &&
            !isValidDate(employee.joiningDate)
        ) {
            errors.push(
                filename
                    + " row "
                    + record.rowNumber
                    + " has an invalid joining date."
            );
            return;
        }

        employees.push(employee);
    });

    if (employees.length === 0 && errors.length === 0) {
        throw new Error(filename + " contains no employee records.");
    }

    return { employees: employees, errors: errors };
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(date.getTime())
        && date.toISOString().slice(0, 10) === value;
}

function validateEmployee(body) {
    const companyBrandingIdInput = String(
        body.companyBrandingId || ""
    ).trim();
    const companyBrandingId = companyBrandingIdInput
        ? Number(companyBrandingIdInput)
        : null;

    if (
        companyBrandingIdInput
        && (
            !/^\d+$/.test(companyBrandingIdInput)
            || !Number.isSafeInteger(companyBrandingId)
            || companyBrandingId < 1
        )
    ) {
        return { error: "Select a valid company branding profile." };
    }

    const employee = {
        employeeId: String(body.employeeId || "").trim(),
        fullName: String(body.fullName || "").trim(),
        designation: String(body.designation || "").trim(),
        department: String(body.department || "").trim(),
        phone: String(body.phone || "").trim(),
        email: String(body.email || "").trim(),
        joiningDate: String(body.joiningDate || "").trim(),
        status: String(body.status || "Active").trim(),
        companyBrandingId: companyBrandingId
    };

    const requiredFields = [
        ["employeeId", "Employee ID"],
        ["fullName", "Full name"],
        ["designation", "Designation"]
    ];
    const missing = requiredFields
        .filter(function (field) {
            return !employee[field[0]];
        })
        .map(function (field) {
            return field[1];
        });

    if (missing.length > 0) {
        return { error: missing.join(", ") + " is required." };
    }

    const maximumLengths = {
        employeeId: 50,
        fullName: 150,
        designation: 100,
        department: 100,
        phone: 20,
        email: 150
    };
    const tooLong = Object.keys(maximumLengths).find(function (field) {
        return employee[field].length > maximumLengths[field];
    });

    if (tooLong) {
        return { error: tooLong + " exceeds the maximum supported length." };
    }

    if (employee.joiningDate && !isValidDate(employee.joiningDate)) {
        return { error: "Joining date must be a valid YYYY-MM-DD date." };
    }

    if (!["Active", "Inactive"].includes(employee.status)) {
        return { error: "Status must be Active or Inactive." };
    }

    return { employee: employee };
}

function employeeToApi(employee) {
    return {
        id: employee.id,
        companyBrandingId: employee.company_branding_id === null
            || employee.company_branding_id === undefined
            ? ""
            : String(employee.company_branding_id),
        employeeId: employee.employee_id,
        fullName: employee.full_name,
        designation: employee.designation,
        department: employee.department || "",
        phone: employee.phone || "",
        email: employee.email || "",
        photoUrl: employee.photo_path
            ? "/uploads/" + encodeURIComponent(employee.photo_path)
            : "",
        joiningDate: employee.joining_date || "",
        status: employee.status || "Active",
        createdAt: employee.created_at
    };
}

function brandingToApi(branding) {
    return {
        id: Number(branding.id),
        isDefault: Number(branding.id) === 1,
        companyName: branding.company_name,
        logoUrl: branding.company_logo
            ? "/uploads/" + encodeURIComponent(
                path.basename(branding.company_logo)
            )
            : "",
        address: branding.company_address || "",
        phone: branding.company_phone || "",
        email: branding.company_email || "",
        website: branding.website || "",
        tagline: branding.tagline || "",
        primaryColor: branding.company_primary_color || "#285638",
        secondaryColor: branding.company_secondary_color || "#36764b",
        accentColor: branding.company_accent_color || "#a8e6b0",
        employeeCount: Number(branding.employee_count || 0)
    };
}

async function resolveCompanyBrandingId(value, executor) {
    const requestedId = value === null ? 1 : value;
    const [rows] = await executor.execute(
        "SELECT id FROM company_branding WHERE id = ?",
        [requestedId]
    );
    if (rows.length === 0 && value !== null) {
        const error = new Error(
            "The selected company branding profile no longer exists."
        );
        error.code = "COMPANY_BRANDING_NOT_FOUND";
        throw error;
    }
    return rows.length > 0 ? rows[0].id : null;
}

function getPublicApplicationUrl() {
    const configuredUrl = String(process.env.APP_PUBLIC_URL || "").trim();

    if (!configuredUrl) {
        return {
            error: "Set APP_PUBLIC_URL in database/.env to the public HTTPS domain serving this application."
        };
    }

    let publicUrl;
    try {
        publicUrl = new URL(configuredUrl);
    } catch (error) {
        return {
            error: "APP_PUBLIC_URL must be a valid public HTTPS application URL."
        };
    }

    const hostname = publicUrl.hostname.toLowerCase();
    const isPrivateDevelopmentHost = hostname === "localhost"
        || hostname.endsWith(".localhost")
        || hostname.endsWith(".local")
        || hostname.endsWith(".internal")
        || hostname.endsWith(".test")
        || hostname.endsWith(".example")
        || hostname.endsWith(".invalid")
        || isIP(hostname.replace(/^\[|\]$/g, "")) !== 0
        || !hostname.includes(".");

    if (
        publicUrl.protocol !== "https:"
        || publicUrl.username
        || publicUrl.password
        || publicUrl.pathname !== "/"
        || publicUrl.search
        || publicUrl.hash
        || isPrivateDevelopmentHost
    ) {
        return {
            error: "APP_PUBLIC_URL must use HTTPS and a public domain name, not a local or private development address."
        };
    }

    return { url: publicUrl.origin };
}

async function removeUploadedFile(filename) {
    if (!filename) {
        return;
    }

    const filePath = path.join(uploadFolder, path.basename(filename));

    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Could not remove uploaded file:", error.code);
        }
    }
}

app.use("/css", express.static(path.join(projectRoot, "css")));
app.use("/js", express.static(path.join(projectRoot, "js")));
app.use("/assets", express.static(path.join(projectRoot, "assets")));
app.use("/uploads", express.static(uploadFolder));
app.get("/", function (req, res) {
    return res.sendFile(path.join(projectRoot, "index.html"));
});
app.get("/index.html", function (req, res) {
    return res.sendFile(path.join(projectRoot, "index.html"));
});
app.get("/create-employee.html", function (req, res) {
    return res.sendFile(path.join(projectRoot, "create-employee.html"));
});
app.get("/digital-id/:token", function (req, res) {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; script-src 'self'; "
            + "style-src 'self'; connect-src 'self'; object-src 'none'; "
            + "base-uri 'none'; frame-ancestors 'none'"
    );
    return res.sendFile(path.join(projectRoot, "digital-id.html"));
});

app.get("/api/public/digital-id/:token", async function (req, res) {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(404).json({ error: "Digital ID unavailable." });
    }

    try {
        const [rows] = await pool.execute(
            `SELECT e.employee_id, e.full_name, e.designation, e.department,
                e.phone, e.email, e.joining_date, e.status, e.photo_path,
                b.company_name, b.company_logo, b.company_address,
                b.company_phone, b.company_email, b.website, b.tagline,
                b.company_primary_color, b.company_secondary_color,
                b.company_accent_color
            FROM employees e
            LEFT JOIN company_branding b
                ON b.id = COALESCE(e.company_branding_id, 1)
            WHERE e.digital_id_token = ? AND e.digital_id_enabled = 1`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Digital ID unavailable." });
        }

        const employee = rows[0];
        res.set("Cache-Control", "no-store");
        res.set("X-Content-Type-Options", "nosniff");
        return res.json({
            companyName: employee.company_name || "Company",
            companyLogoUrl: employee.company_logo
                ? "/uploads/" + encodeURIComponent(
                    path.basename(employee.company_logo)
                )
                : "",
            tagline: employee.tagline || "",
            primaryColor: employee.company_primary_color || "#285638",
            secondaryColor: employee.company_secondary_color || "#36764b",
            accentColor: employee.company_accent_color || "#a8e6b0",
            employeeName: employee.full_name,
            employeeId: employee.employee_id,
            designation: employee.designation,
            department: employee.department || "",
            phone: employee.phone || "",
            email: employee.email || "",
            joiningDate: employee.joining_date || "",
            status: employee.status || "",
            companyAddress: employee.company_address || "",
            companyPhone: employee.company_phone || "",
            companyEmail: employee.company_email || "",
            companyWebsite: employee.website || "",
            employeePhotoUrl: employee.photo_path
                ? "/uploads/" + encodeURIComponent(
                    path.basename(employee.photo_path)
                )
                : ""
        });
    } catch (error) {
        console.error(
            "Public digital ID lookup failed:",
            error.code || "database error"
        );
        return res.status(500).json({ error: "Digital ID unavailable." });
    }
});

app.get(
    "/api/public/digital-id/:token/pdf",
    async function (req, res) {
        const token = String(req.params.token || "");
        if (!/^[a-f0-9]{64}$/.test(token)) {
            return res.status(404).json({ error: "Digital ID unavailable." });
        }

        try {
            const [rows] = await pool.execute(
                `SELECT e.employee_id, e.full_name, e.department, e.phone,
                    e.photo_path, b.company_name,
                    b.company_logo, b.company_primary_color,
                    b.company_secondary_color, b.company_accent_color
                FROM employees e
                LEFT JOIN company_branding b
                    ON b.id = COALESCE(e.company_branding_id, 1)
                WHERE e.digital_id_token = ? AND e.digital_id_enabled = 1`,
                [token]
            );
            if (rows.length === 0) {
                return res.status(404).json({
                    error: "Digital ID unavailable."
                });
            }

            const publicApplication = getPublicApplicationUrl();
            if (publicApplication.error) {
                return res.status(503).json({
                    error: "ID downloads are temporarily unavailable."
                });
            }

            const employee = rows[0];
            const digitalIdUrl = new URL(
                "/digital-id/" + token,
                publicApplication.url
            ).href;
            const qrDataUrl = await QRCode.toDataURL(digitalIdUrl, {
                errorCorrectionLevel: "M",
                margin: 2,
                width: 384
            });
            const pdf = await renderEmployeeIdPdf(employee, qrDataUrl);
            const safeEmployeeId = String(employee.employee_id)
                .replace(/[^a-zA-Z0-9_-]/g, "_")
                .slice(0, 50);
            res.set({
                "Cache-Control": "no-store",
                "Pragma": "no-cache",
                "X-Content-Type-Options": "nosniff",
                "Content-Type": "application/pdf",
                "Content-Disposition":
                    (req.query.view === "inline" ? "inline" : "attachment")
                    + '; filename="Employee_ID_'
                    + safeEmployeeId + '.pdf"'
            });
            return res.send(pdf);
        } catch (error) {
            console.error(
                "Public digital ID PDF generation failed:",
                error.code || "PDF generation error"
            );
            return res.status(500).json({
                error: "ID download is temporarily unavailable."
            });
        }
    }
);

app.get("/api/branding", async function (req, res) {
    try {
        const [rows] = await pool.execute(
            "SELECT id, company_name, company_logo, company_address, "
                + "company_phone, company_email, website, tagline, "
                + "company_primary_color, company_secondary_color, "
                + "company_accent_color "
                + "FROM company_branding WHERE id = 1"
        );
        return res.json(rows[0]
            ? brandingToApi(rows[0])
            : {
                id: null,
                isDefault: true,
                companyName: "",
                logoUrl: "",
                address: "",
                phone: "",
                email: "",
                website: "",
                tagline: "",
                primaryColor: "#285638",
                secondaryColor: "#36764b",
                accentColor: "#a8e6b0",
                employeeCount: 0
            });
    } catch (error) {
        console.error("Branding lookup failed:", error.code || "database error");
        return res.status(500).json({
            error: "Could not load company branding."
        });
    }
});

app.get("/api/branding/profiles", async function (req, res) {
    try {
        const [rows] = await pool.execute(
            `SELECT b.id, b.company_name, b.company_logo, b.company_address,
                b.company_phone, b.company_email, b.website, b.tagline,
                b.company_primary_color, b.company_secondary_color,
                b.company_accent_color, COUNT(e.id) AS employee_count
            FROM company_branding b
            LEFT JOIN employees e ON e.company_branding_id = b.id
            GROUP BY b.id
            ORDER BY b.id`
        );
        return res.json(rows.map(brandingToApi));
    } catch (error) {
        console.error(
            "Branding profiles lookup failed:",
            error.code || "database error"
        );
        return res.status(500).json({
            error: "Could not load company branding profiles."
        });
    }
});

app.get("/api/dashboard", async function (req, res) {
    try {
        const results = await Promise.all([
            pool.execute("SELECT COUNT(*) AS total FROM employees"),
            pool.execute(
                "SELECT COALESCE(SUM(total_cards), 0) AS total "
                    + "FROM id_card_jobs WHERE status = 'Completed'"
            ),
            pool.execute(
                "SELECT COUNT(*) AS total FROM bulk_import_jobs "
                    + "WHERE status = 'Completed'"
            ),
            pool.execute(
                "SELECT company_name, company_logo FROM company_branding WHERE id = 1"
            ),
            pool.execute(
                "SELECT id, employee_id, full_name, designation, department "
                    + "FROM employees ORDER BY id DESC LIMIT 5"
            )
        ]);
        const recentEmployees = results[4][0].map(function (employee) {
            return {
                id: employee.id,
                employeeId: employee.employee_id,
                employeeName: employee.full_name,
                jobTitle: employee.designation,
                department: employee.department || ""
            };
        });

        return res.json({
            totalEmployees: results[0][0][0].total,
            totalCards: results[1][0][0].total,
            totalBulkJobs: results[2][0][0].total,
            companyName: results[3][0][0]
                ? results[3][0][0].company_name
                : "My Company",
            companyLogoUrl: results[3][0][0] && results[3][0][0].company_logo
                ? "/uploads/" + encodeURIComponent(results[3][0][0].company_logo)
                : "",
            recentEmployees: recentEmployees
        });
    } catch (error) {
        console.error("Dashboard lookup failed:", error.code || "database error");
        return res.status(500).json({
            error: "Could not load dashboard information."
        });
    }
});

app.get("/api/employees/export", async function (req, res) {
    const format = req.query.format;

    if (format !== "csv" && format !== "xlsx") {
        return res.status(400).json({
            error: "Unsupported export format. Choose csv or xlsx."
        });
    }

    try {
        const [employees] = await pool.execute(`
            SELECT employee_id, full_name, designation, department, phone,
                email, joining_date
            FROM employees
            ORDER BY id
        `);

        if (employees.length === 0) {
            return res.status(404).json({
                error: "There are no employee records to export yet."
            });
        }

        const headers = [
            "Employee ID",
            "Full Name",
            "Designation",
            "Department",
            "Phone",
            "Email",
            "Joining Date"
        ];
        const rows = employees.map(function (employee) {
            return [
                employee.employee_id,
                employee.full_name,
                employee.designation,
                employee.department,
                employee.phone,
                employee.email,
                employee.joining_date
            ];
        });

        if (format === "csv") {
            function escapeCsv(value) {
                const text = value === null || value === undefined
                    ? ""
                    : String(value);
                return '"' + text.replace(/"/g, '""') + '"';
            }

            const csv = [headers, ...rows]
                .map(function (row) {
                    return row.map(escapeCsv).join(",");
                })
                .join("\r\n");

            res.set({
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition":
                    'attachment; filename="employees_export.csv"',
                "Cache-Control": "no-store"
            });
            return res.send("\uFEFF" + csv);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Employees");
        worksheet.addRow(headers);
        rows.forEach(function (row) {
            worksheet.addRow(row);
        });
        worksheet.getRow(1).font = { bold: true };
        worksheet.columns = [
            { width: 18 },
            { width: 28 },
            { width: 22 },
            { width: 22 },
            { width: 18 },
            { width: 30 },
            { width: 18 }
        ];

        const workbookBuffer = await workbook.xlsx.writeBuffer();
        res.set({
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
                'attachment; filename="employees_export.xlsx"',
            "Cache-Control": "no-store"
        });
        return res.send(Buffer.from(workbookBuffer));
    } catch (error) {
        console.error("Employee export failed:", error.code || "database error");
        return res.status(500).json({
            error: "Could not export employee records. Please try again."
        });
    }
});

app.post(
    "/api/employees/import",
    employeeImportUpload.array("files", 10),
    async function (req, res) {
        const files = req.files || [];

        if (files.length === 0) {
            return res.status(400).json({
                error: "Select at least one CSV or XLSX file to import."
            });
        }

        let employees = [];
        const validationErrors = [];

        try {
            for (const file of files) {
                const extension = path.extname(file.originalname).toLowerCase();
                const parsed = extension === ".xlsx"
                    ? await employeeRowsFromExcel(file.buffer, file.originalname)
                    : parseEmployeeCsv(file.buffer, file.originalname);
                employees = employees.concat(parsed.employees);
                validationErrors.push(...parsed.errors);
            }
        } catch (error) {
            return res.status(400).json({
                error: error.message || "Employee import validation failed.",
                errors: [error.message || "Employee import validation failed."]
            });
        }

        const seenIds = new Map();
        employees.forEach(function (employee) {
            const normalizedId = employee.employeeId.toLowerCase();
            if (seenIds.has(normalizedId)) {
                validationErrors.push(
                    employee.sourceFile
                        + " row "
                        + employee.sourceRow
                        + " has duplicate employee ID "
                        + employee.employeeId
                        + "."
                );
            } else {
                seenIds.set(normalizedId, true);
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: "Some import rows need correction.",
                errors: validationErrors
            });
        }

        if (employees.length === 0) {
            return res.status(400).json({
                error: "The selected files contain no employee records."
            });
        }

        const connection = await pool.getConnection();
        let transactionStarted = false;

        try {
            await connection.beginTransaction();
            transactionStarted = true;

            const placeholders = employees.map(function () {
                return "?";
            }).join(", ");
            const normalizedIds = employees.map(function (employee) {
                return employee.employeeId.toLowerCase();
            });
            const [existing] = await connection.execute(
                "SELECT employee_id FROM employees "
                    + "WHERE LOWER(employee_id) IN (" + placeholders + ")",
                normalizedIds
            );

            if (existing.length > 0) {
                await connection.rollback();
                transactionStarted = false;
                const errors = existing.map(function (row) {
                    const importedEmployee = employees.find(function (employee) {
                        return employee.employeeId.toLowerCase()
                            === row.employee_id.toLowerCase();
                    });
                    return importedEmployee.sourceFile
                        + " row "
                        + importedEmployee.sourceRow
                        + ": employee ID "
                        + row.employee_id
                        + " already exists in the database.";
                });
                return res.status(409).json({
                    error: "Some employee IDs already exist.",
                    errors: errors
                });
            }

            for (const employee of employees) {
                await connection.execute(
                    `INSERT INTO employees (
                        employee_id, full_name, designation, department,
                        phone, email, joining_date, digital_id_token
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        employee.employeeId,
                        employee.fullName,
                        employee.designation,
                        employee.department,
                        employee.phone,
                        employee.email,
                        employee.joiningDate || null,
                        randomBytes(32).toString("hex")
                    ]
                );
            }

            let jobId = String(req.body.jobId || "").trim();
            if (!/^[A-Za-z0-9_-]{1,50}$/.test(jobId)) {
                jobId = "JOB-" + randomUUID();
            }
            const fileNames = files.map(function (file) {
                return file.originalname;
            }).join(", ").slice(0, 255);

            await connection.execute(
                `INSERT INTO bulk_import_jobs (
                    job_id, file_name, total_records, successful_records,
                    failed_records, status
                ) VALUES (?, ?, ?, ?, 0, 'Completed')`,
                [jobId, fileNames, employees.length, employees.length]
            );
            await connection.commit();
            transactionStarted = false;

            return res.status(201).json({
                message: "Employee records imported successfully.",
                importedCount: employees.length,
                jobId: jobId
            });
        } catch (error) {
            if (transactionStarted) {
                await connection.rollback();
            }

            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: "An employee ID or import job ID already exists.",
                    errors: ["Check employee IDs and try the import again."]
                });
            }

            console.error("Employee import failed:", error.code || "database error");
            return res.status(500).json({
                error: "An error occurred while saving imported employees."
            });
        } finally {
            connection.release();
        }
    }
);

app.get("/api/employees", async function (req, res) {
    const conditions = [];
    const parameters = [];
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();

    if (search) {
        const pattern = "%" + search + "%";
        conditions.push(
            "(employee_id LIKE ? OR full_name LIKE ? OR designation LIKE ? "
                + "OR department LIKE ? OR email LIKE ?)"
        );
        parameters.push(pattern, pattern, pattern, pattern, pattern);
    }

    if (status) {
        if (!["Active", "Inactive"].includes(status)) {
            return res.status(400).json({ error: "Invalid employee status." });
        }
        conditions.push("status = ?");
        parameters.push(status);
    }

    const where = conditions.length > 0
        ? "WHERE " + conditions.join(" AND ")
        : "";

    try {
        const [employees] = await pool.execute(
            "SELECT id, employee_id, full_name, designation, department, "
                + "phone, email, photo_path, joining_date, status, created_at, "
                + "company_branding_id "
                + "FROM employees " + where + " ORDER BY id DESC",
            parameters
        );
        return res.json(employees.map(employeeToApi));
    } catch (error) {
        console.error("Employee list failed:", error.code || "database error");
        return res.status(500).json({ error: "Could not load employees." });
    }
});

app.get("/api/employees/import-template", async function (req, res) {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Employees");

        worksheet.columns = [
            { header: "Employee ID", key: "employeeId", width: 18 },
            { header: "Full Name", key: "fullName", width: 25 },
            { header: "Designation", key: "designation", width: 22 },
            { header: "Department", key: "department", width: 22 },
            { header: "Phone", key: "phone", width: 18 },
            { header: "Email", key: "email", width: 30 },
            { header: "Joining Date", key: "joiningDate", width: 18 }
        ];

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.alignment = {
            vertical: "middle",
            horizontal: "center"
        };
        worksheet.views = [{ state: "frozen", ySplit: 1 }];

        const workbookBuffer = await workbook.xlsx.writeBuffer();
        res.set({
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
                'attachment; filename="employee_import_template.xlsx"',
            "Cache-Control": "no-store"
        });
        return res.send(Buffer.from(workbookBuffer));
    } catch (error) {
        console.error(
            "Template generation failed:",
            error.code || error.message
        );
        return res.status(500).json({
            error: "Failed to generate the Excel template."
        });
    }
});

app.post(
    "/api/employees",
    employeePhotoUpload.single("employeePhoto"),
    async function (req, res) {
        const validated = validateEmployee(req.body);
        if (validated.error) {
            await removeUploadedFile(req.file && req.file.filename);
            return res.status(400).json({ error: validated.error });
        }

        const employee = validated.employee;
        try {
            employee.companyBrandingId = await resolveCompanyBrandingId(
                employee.companyBrandingId,
                pool
            );
            const [existing] = await pool.execute(
                "SELECT id FROM employees WHERE LOWER(employee_id) = LOWER(?)",
                [employee.employeeId]
            );
            if (existing.length > 0) {
                await removeUploadedFile(req.file && req.file.filename);
                return res.status(409).json({
                    error: "That employee ID is already in use."
                });
            }

            const [result] = await pool.execute(
                `INSERT INTO employees (
                    employee_id, full_name, designation, department, phone,
                    email, photo_path, joining_date, status,
                    company_branding_id, digital_id_token
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    employee.employeeId,
                    employee.fullName,
                    employee.designation,
                    employee.department,
                    employee.phone,
                    employee.email,
                    req.file ? req.file.filename : null,
                    employee.joiningDate || null,
                    employee.status,
                    employee.companyBrandingId,
                    randomBytes(32).toString("hex")
                ]
            );
            const [rows] = await pool.execute(
                "SELECT id, employee_id, full_name, designation, department, "
                    + "phone, email, photo_path, joining_date, status, created_at, "
                    + "company_branding_id "
                    + "FROM employees WHERE id = ?",
                [result.insertId]
            );
            return res.status(201).json({
                message: "Employee saved successfully.",
                employee: employeeToApi(rows[0])
            });
        } catch (error) {
            await removeUploadedFile(req.file && req.file.filename);
            if (error.code === "COMPANY_BRANDING_NOT_FOUND") {
                return res.status(400).json({ error: error.message });
            }
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: "That employee ID is already in use."
                });
            }
            console.error("Employee save failed:", error.code || "database error");
            return res.status(500).json({ error: "Could not save employee." });
        }
    }
);

app.get("/api/employees/:id", async function (req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ error: "Invalid employee record ID." });
    }

    try {
        const [rows] = await pool.execute(
            "SELECT id, employee_id, full_name, designation, department, "
                + "phone, email, photo_path, joining_date, status, created_at, "
                + "company_branding_id "
                + "FROM employees WHERE id = ?",
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: "Employee was not found." });
        }
        return res.json(employeeToApi(rows[0]));
    } catch (error) {
        console.error("Employee lookup failed:", error.code || "database error");
        return res.status(500).json({ error: "Could not load employee." });
    }
});

app.get("/api/employees/:id/id-card.pdf", async function (req, res) {
    const employeeDatabaseId = Number(req.params.id);
    if (!Number.isSafeInteger(employeeDatabaseId) || employeeDatabaseId < 1) {
        return res.status(400).json({ error: "Invalid employee record ID." });
    }

    try {
        const [employees] = await pool.execute(
            `SELECT e.employee_id, e.full_name, e.department, e.phone,
                e.photo_path, e.digital_id_token, e.digital_id_enabled,
                b.company_name, b.company_logo, b.company_primary_color,
                b.company_secondary_color, b.company_accent_color
            FROM employees e
            LEFT JOIN company_branding b
                ON b.id = COALESCE(e.company_branding_id, 1)
            WHERE e.id = ?`,
            [employeeDatabaseId]
        );
        if (employees.length === 0) {
            return res.status(404).json({ error: "Employee was not found." });
        }

        const employee = employees[0];
        if (
            employee.digital_id_enabled !== 1
            || !/^[a-f0-9]{64}$/.test(employee.digital_id_token || "")
        ) {
            return res.status(403).json({
                error: "Digital ID access is currently unavailable."
            });
        }

        const publicApplication = getPublicApplicationUrl();
        if (publicApplication.error) {
            return res.status(503).json({
                error: "ID downloads are temporarily unavailable."
            });
        }

        const digitalIdUrl = new URL(
            "/digital-id/" + employee.digital_id_token,
            publicApplication.url
        ).href;
        const qrDataUrl = await QRCode.toDataURL(digitalIdUrl, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 384
        });
        const pdf = await renderEmployeeIdPdf(employee, qrDataUrl);
        const safeEmployeeId = String(employee.employee_id)
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 50);
        res.set({
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": "application/pdf",
            "Content-Disposition":
                'attachment; filename="Employee_ID_'
                + safeEmployeeId + '.pdf"'
        });
        return res.send(pdf);
    } catch (error) {
        console.error(
            "Employee ID card PDF generation failed:",
            error.code || "PDF generation error"
        );
        return res.status(500).json({
            error: "ID download is temporarily unavailable."
        });
    }
});

app.put(
    "/api/employees/:id",
    employeePhotoUpload.single("employeePhoto"),
    async function (req, res) {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) {
            await removeUploadedFile(req.file && req.file.filename);
            return res.status(400).json({ error: "Invalid employee record ID." });
        }

        const validated = validateEmployee(req.body);
        if (validated.error) {
            await removeUploadedFile(req.file && req.file.filename);
            return res.status(400).json({ error: validated.error });
        }

        const connection = await pool.getConnection();
        let transactionStarted = false;
        try {
            await connection.beginTransaction();
            transactionStarted = true;
            const [currentRows] = await connection.execute(
                "SELECT photo_path, company_branding_id "
                    + "FROM employees WHERE id = ? FOR UPDATE",
                [id]
            );
            if (currentRows.length === 0) {
                await connection.rollback();
                transactionStarted = false;
                await removeUploadedFile(req.file && req.file.filename);
                return res.status(404).json({ error: "Employee was not found." });
            }

            const employee = validated.employee;
            employee.companyBrandingId = await resolveCompanyBrandingId(
                employee.companyBrandingId,
                connection
            );
            const photoPath = req.file
                ? req.file.filename
                : currentRows[0].photo_path;
            await connection.execute(
                `UPDATE employees
                SET employee_id = ?, full_name = ?, designation = ?,
                    department = ?, phone = ?, email = ?, photo_path = ?,
                    joining_date = ?, status = ?, company_branding_id = ?
                WHERE id = ?`,
                [
                    employee.employeeId,
                    employee.fullName,
                    employee.designation,
                    employee.department,
                    employee.phone,
                    employee.email,
                    photoPath,
                    employee.joiningDate || null,
                    employee.status,
                    employee.companyBrandingId,
                    id
                ]
            );
            const [updatedRows] = await connection.execute(
                "SELECT id, employee_id, full_name, designation, department, "
                    + "phone, email, photo_path, joining_date, status, created_at, "
                    + "company_branding_id "
                    + "FROM employees WHERE id = ?",
                [id]
            );
            await connection.commit();
            transactionStarted = false;
            if (
                req.file &&
                currentRows[0].photo_path &&
                currentRows[0].photo_path !== req.file.filename
            ) {
                await removeUploadedFile(currentRows[0].photo_path);
            }

            return res.json({
                message: "Employee updated successfully.",
                employee: employeeToApi(updatedRows[0])
            });
        } catch (error) {
            if (transactionStarted) {
                await connection.rollback();
            }
            await removeUploadedFile(req.file && req.file.filename);
            if (error.code === "COMPANY_BRANDING_NOT_FOUND") {
                return res.status(400).json({ error: error.message });
            }
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: "That employee ID is already in use."
                });
            }
            console.error("Employee update failed:", error.code || "database error");
            return res.status(500).json({ error: "Could not update employee." });
        } finally {
            connection.release();
        }
    }
);

app.delete("/api/employees/:id", async function (req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ error: "Invalid employee record ID." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
            "SELECT photo_path FROM employees WHERE id = ? FOR UPDATE",
            [id]
        );
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: "Employee was not found." });
        }
        await connection.execute("DELETE FROM employees WHERE id = ?", [id]);
        await connection.commit();
        await removeUploadedFile(rows[0].photo_path);
        return res.json({ message: "Employee deleted successfully." });
    } catch (error) {
        await connection.rollback();
        console.error("Employee deletion failed:", error.code || "database error");
        return res.status(500).json({ error: "Could not delete employee." });
    } finally {
        connection.release();
    }
});

app.post("/api/id-cards", async function (req, res) {
    const employeeId = Number(req.body.employeeId);
    if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        return res.status(400).json({
            error: "Save the employee before recording a printed ID card."
        });
    }

    try {
        const [employees] = await pool.execute(
            "SELECT id FROM employees WHERE id = ?",
            [employeeId]
        );
        if (employees.length === 0) {
            return res.status(404).json({ error: "Employee was not found." });
        }
        const jobId = "CARD-" + randomUUID();
        await pool.execute(
            `INSERT INTO id_card_jobs (
                job_id, total_cards, output_format, status
            ) VALUES (?, 1, 'Print', 'Completed')`,
            [jobId]
        );
        return res.status(201).json({
            message: "ID card print recorded.",
            jobId: jobId
        });
    } catch (error) {
        console.error("ID card job failed:", error.code || "database error");
        return res.status(500).json({ error: "Could not record ID card print." });
    }
});

app.post("/api/id-cards/qr", async function (req, res) {
    const employeeDatabaseId = Number(
        req.body && req.body.employeeDatabaseId
    );
    const employeeId = req.body && typeof req.body.employeeId === "string"
        ? req.body.employeeId.trim()
        : "";

    if (
        !Number.isSafeInteger(employeeDatabaseId)
        || employeeDatabaseId < 1
        || !employeeId
        || employeeId.length > 50
    ) {
        return res.status(400).json({
            error: "Save this employee before generating a digital ID QR code."
        });
    }

    const publicApplication = getPublicApplicationUrl();
    if (publicApplication.error) {
        return res.status(503).json({ error: publicApplication.error });
    }

    try {
        const [employees] = await pool.execute(
            `SELECT digital_id_token, digital_id_enabled FROM employees
            WHERE id = ? AND LOWER(employee_id) = LOWER(?)`,
            [employeeDatabaseId, employeeId]
        );
        if (employees.length === 0) {
            return res.status(404).json({
                error: "The saved employee ID changed. Save the employee to refresh its digital ID QR code."
            });
        }
        if (
            employees[0].digital_id_enabled !== 1
            || !/^[a-f0-9]{64}$/.test(employees[0].digital_id_token || "")
        ) {
            return res.status(403).json({
                error: "Digital ID access is currently unavailable."
            });
        }

        const digitalIdUrl = new URL(
            "/digital-id/" + employees[0].digital_id_token,
            publicApplication.url
        ).href;
        const qrDataUrl = await QRCode.toDataURL(digitalIdUrl, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 384
        });
        return res.json({
            qrDataUrl: qrDataUrl,
            digitalIdUrl: digitalIdUrl
        });
    } catch (error) {
        console.error("Digital ID QR generation failed:", error.message);
        return res.status(500).json({
            error: "Could not generate the digital ID QR code."
        });
    }
});

async function saveCompanyBranding(
    req,
    res,
    profileId,
    createMissingDefault
) {
    const companyName = String(req.body.companyName || "").trim();
    const branding = {
        companyName: companyName,
        address: String(req.body.address || "").trim(),
        phone: String(req.body.phone || "").trim(),
        email: String(req.body.email || "").trim(),
        website: String(req.body.website || "").trim(),
        tagline: String(req.body.tagline || "").trim(),
        primaryColor: String(req.body.primaryColor || "#285638").trim(),
        secondaryColor: String(
            req.body.secondaryColor || "#36764b"
        ).trim(),
        accentColor: String(req.body.accentColor || "#a8e6b0").trim()
    };
    const maximumLengths = {
        companyName: 150,
        address: 2000,
        phone: 20,
        email: 150,
        website: 255,
        tagline: 150
    };
    const tooLong = Object.keys(maximumLengths).find(function (field) {
        return branding[field].length > maximumLengths[field];
    });

    if (!companyName) {
        await removeUploadedFile(req.file && req.file.filename);
        return res.status(400).json({ error: "Company name is required." });
    }
    if (tooLong) {
        await removeUploadedFile(req.file && req.file.filename);
        return res.status(400).json({
            error: tooLong + " exceeds the maximum supported length."
        });
    }
    if (
        !/^#[0-9a-fA-F]{6}$/.test(branding.primaryColor)
        || !/^#[0-9a-fA-F]{6}$/.test(branding.secondaryColor)
        || !/^#[0-9a-fA-F]{6}$/.test(branding.accentColor)
    ) {
        await removeUploadedFile(req.file && req.file.filename);
        return res.status(400).json({
            error: "Choose valid six-digit hex values for all brand colors."
        });
    }
    if (
        branding.email
        && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(branding.email)
    ) {
        await removeUploadedFile(req.file && req.file.filename);
        return res.status(400).json({
            error: "Enter a valid company contact email address."
        });
    }
    if (branding.website) {
        try {
            const websiteUrl = new URL(branding.website);
            if (
                websiteUrl.protocol !== "http:"
                && websiteUrl.protocol !== "https:"
            ) {
                throw new Error("Unsupported website protocol.");
            }
        } catch (error) {
            await removeUploadedFile(req.file && req.file.filename);
            return res.status(400).json({
                error: "Enter a valid website URL beginning with http:// or https://."
            });
        }
    }

    try {
        let existing = null;
        if (profileId !== null) {
            const [existingRows] = await pool.execute(
                "SELECT id, company_logo FROM company_branding WHERE id = ?",
                [profileId]
            );
            existing = existingRows[0];
            if (!existing && !createMissingDefault) {
                await removeUploadedFile(req.file && req.file.filename);
                return res.status(404).json({
                    error: "Company branding profile was not found."
                });
            }
        }

        if (existing && createMissingDefault) {
            if (!Object.prototype.hasOwnProperty.call(req.body, "address")) {
                branding.address = existing.company_address || "";
            }
            if (!Object.prototype.hasOwnProperty.call(req.body, "phone")) {
                branding.phone = existing.company_phone || "";
            }
            if (!Object.prototype.hasOwnProperty.call(req.body, "email")) {
                branding.email = existing.company_email || "";
            }
            if (!Object.prototype.hasOwnProperty.call(req.body, "website")) {
                branding.website = existing.website || "";
            }
            if (!Object.prototype.hasOwnProperty.call(req.body, "tagline")) {
                branding.tagline = existing.tagline || "";
            }
            if (!Object.prototype.hasOwnProperty.call(req.body, "primaryColor")) {
                branding.primaryColor =
                    existing.company_primary_color || "#285638";
            }
            if (
                !Object.prototype.hasOwnProperty.call(
                    req.body,
                    "secondaryColor"
                )
            ) {
                branding.secondaryColor =
                    existing.company_secondary_color || "#36764b";
            }
            if (!Object.prototype.hasOwnProperty.call(req.body, "accentColor")) {
                branding.accentColor =
                    existing.company_accent_color || "#a8e6b0";
            }
        }

        const logoFilename = req.file
            ? req.file.filename
            : existing
                ? existing.company_logo
                : null;
        if (!logoFilename) {
            await removeUploadedFile(req.file && req.file.filename);
            return res.status(400).json({
                error: "Upload a company logo before saving this profile."
            });
        }

        const isNewProfile = profileId === null
            || (!existing && createMissingDefault);
        let savedId = profileId;
        if (isNewProfile) {
            const columns = createMissingDefault
                ? "id, company_name, company_logo, company_address, "
                    + "company_phone, company_email, website, tagline, "
                    + "company_primary_color, company_secondary_color, "
                    + "company_accent_color"
                : "company_name, company_logo, company_address, "
                    + "company_phone, company_email, website, tagline, "
                    + "company_primary_color, company_secondary_color, "
                    + "company_accent_color";
            const values = [
                branding.companyName,
                logoFilename,
                branding.address || null,
                branding.phone || null,
                branding.email || null,
                branding.website || null,
                branding.tagline || null,
                branding.primaryColor,
                branding.secondaryColor,
                branding.accentColor
            ];
            if (createMissingDefault) {
                values.unshift(profileId);
            }
            const [result] = await pool.execute(
                "INSERT INTO company_branding (" + columns + ") VALUES ("
                    + values.map(function () {
                        return "?";
                    }).join(", ")
                    + ")",
                values
            );
            savedId = createMissingDefault ? profileId : result.insertId;
        } else {
            await pool.execute(
                `UPDATE company_branding
                SET company_name = ?, company_logo = ?, company_address = ?,
                    company_phone = ?, company_email = ?, website = ?,
                    tagline = ?, company_primary_color = ?,
                    company_secondary_color = ?, company_accent_color = ?
                WHERE id = ?`,
                [
                    branding.companyName,
                    logoFilename,
                    branding.address || null,
                    branding.phone || null,
                    branding.email || null,
                    branding.website || null,
                    branding.tagline || null,
                    branding.primaryColor,
                    branding.secondaryColor,
                    branding.accentColor,
                    profileId
                ]
            );
        }

        if (
            req.file
            && existing
            && existing.company_logo
            && existing.company_logo !== logoFilename
        ) {
            await removeUploadedFile(existing.company_logo);
        }

        return res.json({
            message: isNewProfile
                ? "Company branding profile created successfully."
                : "Company branding profile updated successfully.",
            ...brandingToApi({
                id: savedId,
                company_name: branding.companyName,
                company_logo: logoFilename,
                company_address: branding.address,
                company_phone: branding.phone,
                company_email: branding.email,
                website: branding.website,
                tagline: branding.tagline,
                company_primary_color: branding.primaryColor,
                company_secondary_color: branding.secondaryColor,
                company_accent_color: branding.accentColor
            })
        });
    } catch (error) {
        await removeUploadedFile(req.file && req.file.filename);
        console.error("Branding save failed:", error.code || "database error");
        return res.status(500).json({
            error: "An error occurred while saving company branding."
        });
    }
}

app.post(
    "/api/branding",
    upload.single("companyLogo"),
    async function (req, res) {
        return saveCompanyBranding(req, res, 1, true);
    }
);

app.post(
    "/api/branding/profiles",
    upload.single("companyLogo"),
    async function (req, res) {
        return saveCompanyBranding(req, res, null, false);
    }
);

app.put(
    "/api/branding/:id",
    upload.single("companyLogo"),
    async function (req, res) {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) {
            await removeUploadedFile(req.file && req.file.filename);
            return res.status(400).json({
                error: "Invalid company branding profile ID."
            });
        }
        return saveCompanyBranding(req, res, id, false);
    }
);

app.delete("/api/branding/:id", async function (req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({
            error: "Invalid company branding profile ID."
        });
    }
    if (id === 1) {
        return res.status(400).json({
            error: "The default company branding profile cannot be deleted."
        });
    }

    const connection = await pool.getConnection();
    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        const [profiles] = await connection.execute(
            "SELECT id, company_logo FROM company_branding "
                + "WHERE id = ? FOR UPDATE",
            [id]
        );
        if (profiles.length === 0) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({
                error: "Company branding profile was not found."
            });
        }

        const [defaults] = await connection.execute(
            "SELECT id FROM company_branding WHERE id = 1"
        );
        await connection.execute(
            "UPDATE employees SET company_branding_id = ? "
                + "WHERE company_branding_id = ?",
            [defaults.length > 0 ? 1 : null, id]
        );
        await connection.execute(
            "DELETE FROM company_branding WHERE id = ?",
            [id]
        );
        await connection.commit();
        transactionStarted = false;
        await removeUploadedFile(profiles[0].company_logo);
        return res.json({
            message: "Company branding profile deleted successfully."
        });
    } catch (error) {
        if (transactionStarted) {
            await connection.rollback();
        }
        console.error(
            "Branding profile deletion failed:",
            error.code || "database error"
        );
        return res.status(500).json({
            error: "Could not delete company branding profile."
        });
    } finally {
        connection.release();
    }
});

app.use("/api", function (req, res) {
    return res.status(404).json({ error: "API endpoint was not found." });
});

// Handle upload errors.
app.use(function (error, req, res, next) {

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                error: error.field === "files"
                    ? "Each import file must be smaller than 5 MB."
                    : "Uploaded image must be smaller than 2 MB."
            });
        }

        if (error.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({
                error: "You can import up to 10 CSV or XLSX files at a time."
            });
        }

        if (
            error.code === "LIMIT_UNEXPECTED_FILE" &&
            error.field === "files"
        ) {
            return res.status(400).json({
                error: "You can import up to 10 CSV or XLSX files at a time."
            });
        }

        return res.status(400).json({
            error: error.message
        });
    }

    if (error) {
        console.error("Request upload failed:", error.message);
        return res.status(400).json({
            error: error.message || "Request failed."
        });
    }

    next();
});

async function startServer() {
    await initializeSchema();
    return new Promise(function (resolve, reject) {
        const server = app.listen(PORT, function () {
            console.log("ID Card Maker is running at http://localhost:" + PORT);
            resolve(server);
        });
        server.once("error", reject);
    });
}

if (require.main === module) {
    startServer().then(function (server) {
        async function shutdown() {
            server.close(async function () {
                await pool.end();
                process.exit(0);
            });
        }

        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
    }).catch(async function (error) {
        console.error(
            "Could not start the application:",
            error.code || error.message
        );
        await pool.end();
        process.exitCode = 1;
    });
}

module.exports = { app: app, startServer: startServer };