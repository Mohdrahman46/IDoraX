const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

const projectRoot = path.resolve(__dirname, "..");
const uploadFolder = path.join(projectRoot, "uploads");
const employeeCssPath = path.join(projectRoot, "css", "employee.css");
const defaultTerms = [
    "This card is the property of the company.",
    "Carry this card while on duty.",
    "Report a lost card to the company immediately.",
    "Return this card when leaving the company."
];

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[character];
    });
}

function safeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

async function imageDataUrl(fileName) {
    if (!fileName) {
        return "";
    }

    const safeName = path.basename(fileName);
    const extension = path.extname(safeName).toLowerCase();
    const mimeType = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }[extension];
    if (!mimeType) {
        return "";
    }

    try {
        const image = await fs.promises.readFile(
            path.join(uploadFolder, safeName)
        );
        return "data:" + mimeType + ";base64," + image.toString("base64");
    } catch (error) {
        if (error.code === "ENOENT") {
            return "";
        }
        throw error;
    }
}

function buildCardHtml(employee, images, qrDataUrl) {
    const primaryColor = safeColor(
        employee.company_primary_color,
        "#285638"
    );
    const secondaryColor = safeColor(
        employee.company_secondary_color,
        "#36764b"
    );
    const accentColor = safeColor(employee.company_accent_color, "#a8e6b0");
    const companyName = escapeHtml(employee.company_name || "Company");
    const logoMarkup = images.logo
        ? `<img src="${images.logo}" alt="">`
        : '<img alt="" hidden>';
    const photoMarkup = images.photo
        ? `<img class="green-employee-photo" src="${images.photo}" alt="">`
        : '<img class="green-employee-photo" alt="" hidden>';

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${employee.css}</style>
    <style>
        * { box-sizing: border-box; }
        @page { size: 54mm 86mm; margin: 0; }
        @media print {
            body * { visibility: visible !important; }
        }
        html, body {
            width: 54mm;
            height: auto;
            margin: 0;
            padding: 0;
            overflow: visible;
            background: #fff;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }
        .id-card-pdf-page {
            display: grid;
            width: 54mm;
            height: 86mm;
            margin: 0;
            padding: 0;
            overflow: hidden;
            place-items: start;
            break-after: page;
            page-break-after: always;
        }
        .id-card-pdf-page:last-child {
            break-after: auto;
            page-break-after: auto;
        }
        .green-id-card {
            width: 320px;
            height: auto;
            max-width: none;
            aspect-ratio: 54 / 86;
            margin: 0;
            zoom: 0.6377952755905512;
            box-shadow: none;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }
        .green-id-card,
        .green-id-card * {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }
    </style>
</head>
<body>
    <section class="id-card-pdf-page" aria-label="Front of employee ID card">
        <article class="green-id-card green-id-card-front"
            style="--company-primary-color:${primaryColor};--company-secondary-color:${secondaryColor};--company-accent-color:${accentColor}">
            <header class="green-card-header">
                <svg class="green-card-wave-art" viewBox="0 0 320 240" preserveAspectRatio="none" aria-hidden="true">
                    <path class="green-wave-dark" d="M0 0h320v165c-63 35-115 40-175 18C87 164 46 171 0 204z"></path>
                    <path class="green-wave-medium" d="M0 0h320v125c-68 42-119 53-181 34C79 138 43 159 0 182z"></path>
                    <path class="green-wave-light" d="M0 0h320v78c-76 41-127 51-192 33C76 95 39 113 0 139z"></path>
                </svg>
                <div class="green-company-brand">
                    ${logoMarkup}
                    <h2>${companyName}</h2>
                </div>
            </header>
            ${photoMarkup}
            <div class="green-front-content">
                <h2>${escapeHtml(employee.full_name)}</h2>
                <div class="green-employee-details">
                    <p><strong>Employee ID</strong><span>${escapeHtml(employee.employee_id)}</span></p>
                    <p><strong>Department</strong><span>${escapeHtml(employee.department || "")}</span></p>
                    <p><strong>Phone</strong><span>${escapeHtml(employee.phone || "")}</span></p>
                </div>
            </div>
            <svg class="green-card-wave-art green-card-wave-bottom" viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true">
                <path class="green-wave-dark" d="M0 48c72-37 120 18 178 17 58-1 88-38 142-48v103H0z"></path>
                <path class="green-wave-medium" d="M0 76c60-34 119 6 172 8 64 3 98-23 148-36v72H0z"></path>
            </svg>
        </article>
    </section>
    <section class="id-card-pdf-page" aria-label="Back of employee ID card">
        <article class="green-id-card green-id-card-back"
            style="--company-primary-color:${primaryColor};--company-secondary-color:${secondaryColor};--company-accent-color:${accentColor}">
            <header class="green-card-header green-back-header">
                <svg class="green-card-wave-art" viewBox="0 0 320 190" preserveAspectRatio="none" aria-hidden="true">
                    <path class="green-wave-dark" d="M0 0h320v110c-64 34-115 42-175 20C85 111 42 129 0 151z"></path>
                    <path class="green-wave-medium" d="M0 0h320v78c-68 39-122 48-185 28C82 87 40 104 0 126z"></path>
                </svg>
            </header>
            <div class="green-back-content">
                <h2>Terms &amp; Conditions</h2>
                <ul>${defaultTerms.map(function (term) {
        return "<li>" + escapeHtml(term) + "</li>";
    }).join("")}</ul>
                <img class="green-qr-code" src="${qrDataUrl}" alt="QR code for this employee's digital ID">
            </div>
            <svg class="green-card-wave-art green-card-wave-bottom" viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true">
                <path class="green-wave-dark" d="M0 48c72-37 120 18 178 17 58-1 88-38 142-48v103H0z"></path>
                <path class="green-wave-medium" d="M0 76c60-34 119 6 172 8 64 3 98-23 148-36v72H0z"></path>
            </svg>
        </article>
    </section>
</body>
</html>`;
}

async function renderEmployeeIdPdf(employee, qrDataUrl) {
    const [css, logo, photo] = await Promise.all([
        fs.promises.readFile(employeeCssPath, "utf8"),
        imageDataUrl(employee.company_logo),
        imageDataUrl(employee.photo_path)
    ]);
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--disable-dev-shm-usage"]
    });

    try {
        const page = await browser.newPage();
        await page.setContent(
            buildCardHtml(
                Object.assign({}, employee, { css: css }),
                { logo: logo, photo: photo },
                qrDataUrl
            ),
            { waitUntil: "load" }
        );
        await page.emulateMediaType("print");
        const layout = await page.evaluate(function () {
            return Array.from(document.querySelectorAll(".id-card-pdf-page"))
                .map(function (pageSection) {
                    const card = pageSection.querySelector(".green-id-card");
                    const qr = pageSection.querySelector(".green-qr-code");
                    const wave = pageSection.querySelector(
                        ".green-card-wave-bottom"
                    );
                    const content = pageSection.querySelector(
                        ".green-employee-details, .green-back-content ul"
                    );
                    const cardBounds = card.getBoundingClientRect();
                    const pageBounds = pageSection.getBoundingClientRect();
                    return {
                        visible: getComputedStyle(card).visibility === "visible"
                            && getComputedStyle(card).display !== "none",
                        fitsPage: cardBounds.left >= pageBounds.left - 1
                            && cardBounds.top >= pageBounds.top - 1
                            && cardBounds.right <= pageBounds.right + 1
                            && cardBounds.bottom <= pageBounds.bottom + 1,
                        qrVisible: !card.classList.contains(
                            "green-id-card-back"
                        ) || Boolean(qr)
                            && getComputedStyle(qr).display !== "none",
                        contentClearsWave: !content
                            || !wave
                            || content.getBoundingClientRect().bottom
                                <= wave.getBoundingClientRect().top + 1,
                        qrClearsContent: !qr || !content
                            || qr.getBoundingClientRect().top
                                >= content.getBoundingClientRect().bottom - 1,
                        qrClearsWave: !qr || !wave
                            || qr.getBoundingClientRect().bottom
                                <= wave.getBoundingClientRect().top + 1
                    };
                });
        });
        if (
            layout.length !== 2
            || layout.some(function (side) {
                return !side.visible
                    || !side.fitsPage
                    || !side.qrVisible
                    || !side.contentClearsWave
                    || !side.qrClearsContent
                    || !side.qrClearsWave;
            })
        ) {
            throw new Error("The ID card layout does not fit its PDF page.");
        }
        await page.evaluate(async function () {
            await Promise.all(Array.from(document.images).map(function (image) {
                return image.decode().catch(function () {
                    if (image.classList.contains("green-qr-code")) {
                        throw new Error("Could not render the employee QR code.");
                    }
                    image.hidden = true;
                });
            }));
        });
        const renderedPdf = Buffer.from(await page.pdf({
            width: "54mm",
            height: "86mm",
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }));
        const document = await PDFDocument.load(renderedPdf);
        const width = 54 / 25.4 * 72;
        const height = 86 / 25.4 * 72;
        document.getPages().forEach(function (pdfPage) {
            pdfPage.setSize(width, height);
        });
        return Buffer.from(await document.save());
    } finally {
        await browser.close();
    }
}

module.exports = renderEmployeeIdPdf;
