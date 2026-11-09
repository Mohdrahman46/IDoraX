document.addEventListener("DOMContentLoaded", function () {

    const brandingForm = document.getElementById("brandingForm");

    if (!brandingForm) {
        return;
    }

    const companyNameInput = document.getElementById("companyNameInput");
    const companyLogoInput = document.getElementById("companyLogoInput");

    const companyLogoPreview = document.getElementById("companyLogoPreview");
    const logoPlaceholder = document.getElementById("logoPlaceholder");

    const brandingMessage = document.getElementById("brandingMessage");

    const savedCompanyName = document.getElementById("savedCompanyName");
    const savedCompanyLogo = document.getElementById("savedCompanyLogo");

    let selectedLogo = null;

    // Show a preview of the selected logo.
    companyLogoInput.addEventListener("change", function () {

        const file = companyLogoInput.files[0];

        selectedLogo = null;

        companyLogoPreview.hidden = true;
        companyLogoPreview.removeAttribute("src");
        logoPlaceholder.hidden = false;

        if (!file) {
            return;
        }

        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            brandingMessage.textContent =
                "Please select a PNG, JPG, or WebP image.";

            companyLogoInput.value = "";
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            brandingMessage.textContent =
                "Your logo must be smaller than 2 MB.";

            companyLogoInput.value = "";
            return;
        }

        selectedLogo = file;

        const previewURL = URL.createObjectURL(file);

        companyLogoPreview.src = previewURL;
        companyLogoPreview.hidden = false;
        logoPlaceholder.hidden = true;

        brandingMessage.textContent = "";
    });

    // Load saved company information.
    async function loadBranding() {

        try {

            const response = await fetch("/api/branding");

            if (!response.ok) {
                throw new Error("Could not load company branding.");
            }

            const branding = await response.json();

            if (!branding.companyName) {
                return;
            }

            companyNameInput.value = branding.companyName;

            savedCompanyName.textContent = branding.companyName;

            if (branding.logoUrl) {

                savedCompanyLogo.src = branding.logoUrl;
                savedCompanyLogo.hidden = false;

                companyLogoPreview.src = branding.logoUrl;
                companyLogoPreview.hidden = false;

                logoPlaceholder.hidden = true;

                // An existing logo is already saved.
                companyLogoInput.required = false;
            }

            updateDashboardCompanyName(branding.companyName);

        } catch (error) {

            brandingMessage.textContent =
                "Could not load saved details. Please check the server.";

            console.error(error);

        }
    }

    // Save the company name and logo.
    brandingForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const companyName = companyNameInput.value.trim();

        if (!companyName) {
            brandingMessage.textContent =
                "Please enter your company name.";
            return;
        }

        if (!selectedLogo && companyLogoInput.required) {
            brandingMessage.textContent =
                "Please upload your company logo.";
            return;
        }

        const formData = new FormData();

        formData.append("companyName", companyName);

        if (selectedLogo) {
            formData.append("companyLogo", selectedLogo);
        }

        const saveButton = brandingForm.querySelector(
            'button[type="submit"]'
        );

        saveButton.disabled = true;
        brandingMessage.textContent = "Saving your company details...";

        try {

            const response = await fetch("/api/branding", {
                method: "POST",
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "Could not save company branding."
                );
            }

            savedCompanyName.textContent = result.companyName;

            if (result.logoUrl) {
                savedCompanyLogo.src = result.logoUrl;
                savedCompanyLogo.hidden = false;

                companyLogoPreview.src = result.logoUrl;
                companyLogoPreview.hidden = false;

                logoPlaceholder.hidden = true;
            }

            companyLogoInput.required = false;

            selectedLogo = null;
            companyLogoInput.value = "";

            brandingMessage.textContent =
                "Company branding saved successfully!";

            updateDashboardCompanyName(result.companyName);
            window.dispatchEvent(new CustomEvent(
                "companybrandingupdated",
                { detail: result }
            ));

        } catch (error) {

            brandingMessage.textContent = error.message;

        } finally {

            saveButton.disabled = false;

        }
    });

    // Update the company name displayed on the dashboard.
    function updateDashboardCompanyName(companyName) {

        const dashboardName = document.getElementById(
            "dashboardCompanyName"
        );

        if (dashboardName) {
            dashboardName.textContent = companyName;
        }
    }

    loadBranding();

});
