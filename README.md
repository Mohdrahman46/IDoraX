# Company ID Card Maker

IDoraX Company ID Card Maker is a web application for creating and managing
employee ID cards, with a matching digital ID experience.

## Features

- Create, edit, search, and manage employee records.
- Customize company branding and ID card appearance.
- Preview, print, and download front-and-back ID cards as exact-size PDFs.
- Generate QR codes linking to enabled digital ID pages.
- Import employee records in bulk and export employee data.

## Technologies

- Node.js and Express for the application server and API.
- MySQL for employee and company data.
- HTML, CSS, and JavaScript for the user interface.
- Vite for frontend development.
- Puppeteer and `pdf-lib` for card PDF generation.
- QRCode and ExcelJS for QR code and spreadsheet features.

## Run locally

1. Install the project dependencies:

   ```sh
   npm install
   ```

2. Make sure your MySQL server is running and `database/.env` contains the
   connection settings for your database. Use `database/.env.example` as a
   guide, replacing the example database credentials with your own. Keep
   `database/.env` private.
3. Set `APP_PUBLIC_URL` in `database/.env` to the public HTTPS origin that
   serves this application, for example `APP_PUBLIC_URL=https://id.your-company.com`.
   The domain must resolve to this running application or its reverse proxy.
   Do not use localhost, an IP address, or a private development hostname.
   QR codes open `/digital-id/<unguessable-token>` on this domain.
4. From the project root, run:

   ```sh
   node test-db.js
   ```

5. For normal use, start the application:

   ```sh
   npm start
   ```

6. Open `http://localhost:3000` in your browser.

## Frontend development with Vite

Install the frontend development dependency once:

```sh
npm install
```

In one VS Code terminal, start the Express/MySQL backend:

```sh
npm run dev:server
```

In a second terminal, start Vite:

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. Vite serves the existing `index.html`, CSS, and
JavaScript files without converting the project to React. Requests to `/api`
and `/uploads` are proxied to the Express backend on port `3000`. If the
backend uses a different port, set `API_PROXY_TARGET` to its URL before
starting Vite.

The backend loads `database/.env` relative to its own location and creates any
missing application tables with non-destructive `CREATE TABLE IF NOT EXISTS`
statements. Employees, company branding, bulk-import history, and printed-card
counts are stored in MySQL. Uploaded images remain in `uploads/`.

Company Branding supports multiple saved profiles. The existing profile with
database ID `1` remains the protected default; new profiles receive their own
database IDs. Employee records store their selected profile ID, so updating a
company changes only that profile and its employees continue to use their
assigned branding. Deleting a non-default profile moves its employees to the
default profile. Startup migrations add the profile color/tagline fields and
the employee-to-profile relationship without deleting existing data; existing
employees are associated with profile `1` when it is present.

At startup, an additive migration adds a unique random digital-ID token and an
access-enabled flag to the existing employees table. Existing employee rows
are retained and receive tokens only when they do not already have one. New
employees created directly or through bulk import receive tokens as well. To
revoke an employee's public digital ID, set `digital_id_enabled` to `0` for
that employee in MySQL, for example:

```sql
UPDATE employees SET digital_id_enabled = 0 WHERE employee_id = 'EMPLOYEE-ID';
```

Setting it back to `1` restores access. Do not remove or regenerate tokens
unless existing printed QR codes should stop working.

The Green Corporate QR code contains only the configured HTTPS digital-ID URL
and its random token. The public page shows the company name and logo plus the
employee photo, name, ID, designation, department, phone, email, joining date,
and employment status. It also shows the selected company's configured
address, phone, email, and website. These fields are displayed because they
were explicitly approved for public access through the QR profile. The page
does not expose database IDs or administrative API data and loads the latest
approved fields each time it is opened.

## Downloading a digital ID PDF

The employee card preview includes a Save ID Card button. Its
`GET /api/employees/:id/id-card.pdf` endpoint returns a two-page
`application/pdf` attachment named `Employee_ID_<employee-id>.pdf`, with each
page sized to 54 × 86 mm. The public Digital ID page also includes a download
button backed by the token-authenticated
`GET /api/public/digital-id/:token/pdf` endpoint. Both PDFs use the existing
Green Corporate card styling, and the back QR code reuses that employee's
existing digital-ID token. Downloads require the employee's digital ID to be
enabled.

The employee preview displays each side at 54 × 86 mm. Printing uses a
zero-margin 54 × 86 mm page for each side; in the browser print dialog, select
Actual Size or 100% scale and disable fit-to-page scaling if it is enabled.
The printer must support the card-size paper dimensions to avoid clipping.
On iOS, the public Digital ID page opens the PDF inline in a new Safari tab so
the Share sheet can save it to Files; other browsers download the attachment
directly.

PDF generation uses Puppeteer with its managed Chromium browser; `pdf-lib`
sets the exact PDF page boxes after rendering. Install dependencies with
`npm install` (or `npm ci`) and allow Puppeteer's install step to download
Chromium. In production, keep Puppeteer's browser cache available to the
application, or set `PUPPETEER_EXECUTABLE_PATH` to an installed Chromium
executable. The PDF intentionally omits employee email and joining-date
values, as well as company contact/address details. The front includes
employee photo, name, ID, department, and phone;
the back contains only terms, the QR code, and the existing green wave design.
Missing employee photos or company logos are left blank without preventing
the PDF download.

Run `npm test` to verify the two-page output and exact page dimensions,
including the missing-image fallback.

For production, configure `APP_PUBLIC_URL` to the domain's HTTPS origin in
`database/.env`, point that domain or HTTPS reverse proxy to the Express
application, then restart the backend before generating or printing QR codes.
The development Vite address is not a public QR destination. Actual scanning
from Android or iPhone cameras requires deployment to a reachable HTTPS
domain and should be tested after deployment.
