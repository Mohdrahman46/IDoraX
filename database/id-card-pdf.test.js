const assert = require("node:assert/strict");
const test = require("node:test");
const { PDFDocument } = require("pdf-lib");
const QRCode = require("qrcode");
const renderEmployeeIdPdf = require("./id-card-pdf");

test("renders a two-sided 54 by 86 mm employee card without optional images", async function () {
    const token = "a".repeat(64);
    const qrDataUrl = await QRCode.toDataURL(
        "https://example.test/digital-id/" + token
    );
    const pdf = await renderEmployeeIdPdf({
        employee_id: "EMP001",
        full_name: "Sample Employee",
        designation: "Designer",
        department: "Creative",
        status: "Active",
        photo_path: "missing-pdf-test-photo.png",
        company_name: "Sample Company",
        company_logo: "missing-pdf-test-logo.png",
        tagline: ""
    }, qrDataUrl);
    const document = await PDFDocument.load(pdf);
    const pages = document.getPages();
    const expectedWidth = 54 / 25.4 * 72;
    const expectedHeight = 86 / 25.4 * 72;

    assert.equal(pages.length, 2);
    pages.forEach(function (page) {
        assert.ok(Math.abs(page.getWidth() - expectedWidth) < 0.001);
        assert.ok(Math.abs(page.getHeight() - expectedHeight) < 0.001);
    });
});
