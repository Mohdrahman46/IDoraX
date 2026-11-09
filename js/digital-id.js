(function () {
    const page = document.getElementById("digitalIdPage");
    const loadingState = document.getElementById("loadingState");
    const unavailableState = document.getElementById("unavailableState");
    const digitalIdCard = document.getElementById("digitalIdCard");
    const tagSuspension = document.getElementById("tagSuspension");
    const scanSuccess = document.getElementById("scanSuccess");
    const employeePhoto = document.getElementById("employeePhoto");
    const portraitFallback = document.getElementById("portraitFallback");
    const companyLogo = document.getElementById("companyLogo");
    const downloadPanel = document.getElementById("downloadPanel");
    const downloadButton = document.getElementById("downloadIdButton");
    const downloadMessage = document.getElementById("downloadMessage");
    const employeeProfileDetails = document.getElementById(
        "employeeProfileDetails"
    );
    const companyInformationCard = document.getElementById(
        "companyInformationCard"
    );
    let digitalIdToken = "";
    let downloadableEmployeeId = "";

    function formatJoiningDate(value) {
        const dateValue = String(value);
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
        if (!match) {
            return dateValue;
        }
        const date = new Date(dateValue + "T00:00:00Z");
        if (
            Number.isNaN(date.getTime())
            || date.toISOString().slice(0, 10) !== dateValue
        ) {
            return dateValue;
        }
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "long",
            timeZone: "UTC"
        }).format(date);
    }

    function renderProfileFacts(container, fields) {
        container.replaceChildren();
        let count = 0;
        fields.forEach(function (field) {
            if (field[1] === null || field[1] === undefined) {
                return;
            }
            const value = String(field[1]).trim();
            if (!value || value.toLowerCase() === "undefined") {
                return;
            }

            const row = document.createElement("div");
            const label = document.createElement("dt");
            const detail = document.createElement("dd");
            label.textContent = field[0];
            detail.textContent = value;
            row.append(label, detail);
            container.appendChild(row);
            count += 1;
        });
        return count;
    }

    function showUnavailable(message) {
        loadingState.hidden = true;
        digitalIdCard.hidden = true;
        tagSuspension.hidden = true;
        scanSuccess.hidden = true;
        downloadPanel.hidden = true;
        unavailableState.hidden = false;
        document.getElementById("errorMessage").textContent = message;
        page.setAttribute("aria-busy", "false");
    }

    async function downloadIdPdf() {
        downloadButton.disabled = true;
        downloadButton.classList.add("is-downloading");
        downloadButton.setAttribute("aria-busy", "true");
        downloadMessage.textContent = "Preparing your ID softcopy…";
        downloadMessage.className = "download-message is-pending";
        downloadMessage.hidden = false;

        try {
            const pdfUrl = "/api/public/digital-id/"
                + encodeURIComponent(digitalIdToken) + "/pdf";
            const isAppleMobile = /iPhone|iPad|iPod/.test(
                window.navigator.userAgent
            ) || (
                window.navigator.platform === "MacIntel"
                && window.navigator.maxTouchPoints > 1
            );

            if (isAppleMobile) {
                const link = document.createElement("a");
                link.href = pdfUrl + "?view=inline";
                link.target = "_blank";
                link.rel = "noopener";
                link.hidden = true;
                document.body.appendChild(link);
                link.click();
                link.remove();
                downloadMessage.textContent =
                    "Your PDF is open. Use Share, then Save to Files to keep a copy.";
                downloadMessage.className = "download-message is-success";
                return;
            }

            const response = await fetch(pdfUrl, { cache: "no-store" });
            if (!response.ok) {
                throw new Error("The ID could not be generated.");
            }

            const pdf = await response.blob();
            if (!pdf.size || pdf.type !== "application/pdf") {
                throw new Error("The downloaded file was not a PDF.");
            }

            const employeeIdForFile = downloadableEmployeeId
                .replace(/[^a-zA-Z0-9_-]/g, "_")
                .slice(0, 50);
            const objectUrl = URL.createObjectURL(pdf);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = "Employee_ID_" + employeeIdForFile + ".pdf";
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(function () {
                URL.revokeObjectURL(objectUrl);
            }, 60000);

            downloadMessage.textContent =
                "Your Employee ID has been downloaded successfully!";
            downloadMessage.className = "download-message is-success";
        } catch (error) {
            downloadMessage.textContent =
                "We couldn't download your ID right now. Please try again.";
            downloadMessage.className = "download-message is-error";
        } finally {
            downloadButton.disabled = false;
            downloadButton.classList.remove("is-downloading");
            downloadButton.removeAttribute("aria-busy");
        }
    }

    downloadButton.addEventListener("click", downloadIdPdf);

    function setImage(image, url, fallback) {
        if (!url) {
            image.hidden = true;
            image.removeAttribute("src");
            if (fallback) {
                fallback.hidden = false;
            }
            return;
        }

        image.addEventListener("error", function () {
            image.hidden = true;
            if (fallback) {
                fallback.hidden = false;
            }
        }, { once: true });
        image.src = url;
        image.hidden = false;
        if (fallback) {
            fallback.hidden = true;
        }
    }

    async function loadDigitalId() {
        const token = window.location.pathname
            .slice("/digital-id/".length)
            .split("/")[0];
        digitalIdToken = token;

        let response;
        try {
            response = await fetch(
                "/api/public/digital-id/" + encodeURIComponent(token),
                { cache: "no-store" }
            );
        } catch (error) {
            showUnavailable(
                "A network connection is required to load this digital ID. "
                    + "Please reconnect and try again."
            );
            return;
        }

        if (response.status === 404) {
            showUnavailable("Employee ID not found or unavailable.");
            return;
        }
        if (!response.ok) {
            showUnavailable("This digital ID could not be loaded right now.");
            return;
        }

        let employee;
        try {
            employee = await response.json();
        } catch (error) {
            showUnavailable("This digital ID could not be loaded right now.");
            return;
        }

        document.title = "Digital Employee ID | "
            + (employee.companyName || "IDoraX");
        document.getElementById("companyName").textContent =
            employee.companyName || "Company";
        const companyTagline = document.getElementById("companyTagline");
        companyTagline.textContent = employee.tagline || "";
        companyTagline.hidden = !employee.tagline;
        digitalIdCard.style.setProperty(
            "--company-primary-color",
            employee.primaryColor || "#132A20"
        );
        digitalIdCard.style.setProperty(
            "--company-secondary-color",
            employee.secondaryColor || "#0D1D16"
        );
        digitalIdCard.style.setProperty(
            "--company-accent-color",
            employee.accentColor || "#45543A"
        );
        document.getElementById("employeeName").textContent =
            employee.employeeName;
        document.getElementById("employeeId").textContent =
            employee.employeeId;
        document.getElementById("employeeDesignation").textContent =
            employee.designation;

        renderProfileFacts(
            document.getElementById("employeeProfileFacts"),
            [
                ["Department", employee.department],
                ["Phone", employee.phone],
                ["Email", employee.email],
                [
                    "Joining date",
                    employee.joiningDate
                        ? formatJoiningDate(employee.joiningDate)
                        : ""
                ],
                ["Employment status", employee.status]
            ]
        );
        const companyFactCount = renderProfileFacts(
            document.getElementById("companyProfileFacts"),
            [
                ["Address", employee.companyAddress],
                ["Phone", employee.companyPhone],
                ["Email", employee.companyEmail],
                ["Website", employee.companyWebsite]
            ]
        );
        employeeProfileDetails.hidden = false;
        companyInformationCard.hidden = companyFactCount === 0;

        setImage(companyLogo, employee.companyLogoUrl);
        setImage(
            employeePhoto,
            employee.employeePhotoUrl,
            portraitFallback
        );
        downloadableEmployeeId = employee.employeeId;

        loadingState.hidden = true;
        digitalIdCard.hidden = false;
        tagSuspension.hidden = false;
        scanSuccess.hidden = false;
        downloadPanel.hidden = false;
        page.setAttribute("aria-busy", "false");
        page.classList.add("is-ready");
    }

    loadDigitalId();
}());
