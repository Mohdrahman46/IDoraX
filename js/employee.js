document.addEventListener("DOMContentLoaded", function () {

    const employeeForm = document.getElementById("employeeForm");
    const employeeListBody = document.getElementById("employeeListBody");
    const employeeSearch = document.getElementById("employeeSearch");
    const employeeStatusFilter = document.getElementById(
        "employeeStatusFilter"
    );
    const employeeListMessage = document.getElementById("employeeListMessage");
    const employeeListCount = document.getElementById("employeeListCount");
    const employeePhoto = document.getElementById("employeePhoto");
    const employeeCompanyBranding = document.getElementById(
        "employeeCompanyBranding"
    );
    const employeeMessage = document.getElementById("employeeMessage");
    const employeeDatabaseId = document.getElementById("employeeDatabaseId");
    const greenTermsInput = document.getElementById("greenTermsInput");
    const greenTermsList = document.getElementById("greenTermsList");
    const greenQrCode = document.getElementById("greenQrCode");
    const greenQrMessage = document.getElementById("greenQrMessage");
    const previewButton = document.getElementById("previewEmployeeCard");
    const saveEmployeeButton = document.getElementById("saveEmployeeButton");
    const previewValidationMessage = document.getElementById(
        "previewValidationMessage"
    );
    const previewOverlay = document.getElementById("idCardPreviewOverlay");
    const previewStage = document.getElementById("idCardPreviewStage");
    const previewRotator = document.getElementById("previewCardRotator");
    const previewControls = document.getElementById("idCardPreviewControls");
    const closePreviewButton = document.getElementById("closeIdCardPreview");
    const closePreviewActionButton = document.getElementById(
        "closeIdCardPreviewAction"
    );
    const rotatePreviewButton = document.getElementById("rotateIdCardPreview");
    const resetPreviewButton = document.getElementById("resetIdCardPreview");
    const savePreviewButton = document.getElementById("saveIdCardPreview");
    const savePreviewStatus = document.getElementById("idCardSaveStatus");
    const printPreviewButton = document.getElementById("printIdCardPreview");
    const printStatus = document.getElementById("idCardPrintStatus");
    let searchTimer;
    let qrRequestId = 0;
    let employeeSelectionRequestId = 0;
    let printDialogActive = false;
    let cardDownloadActive = false;
    let activeAfterPrintHandler;
    let saveInProgress = false;
    let savedEmployeeId = "";
    let formHasUnsavedChanges = false;
    let qrUpdatePromise = Promise.resolve(false);
    let previewTimers = [];
    let previousPreviewFocus;
    let previewClosing = false;
    let previewRotation = 0;
    let previewTilt = 0;
    let previewDrag;
    let previewRotationAnimation;
    let previewPhotoUrl = "";
    let previewPhotoObjectUrl = "";
    let companyProfiles = [];
    let companyProfilesReady = Promise.resolve();

    const fields = [
        ["employeeName", "greenNamePreview", "Employee Name"],
        ["employeeId", "greenIdPreview", "Employee ID"],
        ["employeeDepartment", "greenDepartmentPreview", "Department"],
        ["employeePhone", "greenPhonePreview", "Phone"]
    ];

    function resizeGreenCardPreview() {
        const preview = document.getElementById("greenCorporatePreview");
        if (!preview) {
            return;
        }

        preview.querySelectorAll(".green-preview-side").forEach(
            function (side) {
                const frame = side.querySelector(".green-card-scale-frame");
                const card = frame
                    ? frame.querySelector(".green-id-card")
                    : null;
                const availableWidth = side.clientWidth;
                if (!frame || !card || availableWidth <= 0) {
                    return;
                }

                const scale = Math.min(1, availableWidth / 320);
                frame.style.width = 320 * scale + "px";
                frame.style.height = 320 * 86 / 54 * scale + "px";
                card.style.setProperty("--green-preview-scale", scale);
            }
        );
    }

    const greenPreview = document.getElementById("greenCorporatePreview");
    if (greenPreview) {
        if (typeof ResizeObserver === "function") {
            new ResizeObserver(resizeGreenCardPreview).observe(greenPreview);
        }
        if (typeof MutationObserver === "function") {
            const createEmployeePage = document.getElementById("create-id");
            const employeePreview = document.querySelector(".employee-preview");
            const previewVisibilityObserver = new MutationObserver(
                resizeGreenCardPreview
            );
            if (createEmployeePage) {
                previewVisibilityObserver.observe(createEmployeePage, {
                    attributes: true,
                    attributeFilter: ["class"]
                });
            }
            if (employeePreview) {
                previewVisibilityObserver.observe(employeePreview, {
                    attributes: true,
                    attributeFilter: ["hidden"]
                });
            }
        }
        window.addEventListener("resize", resizeGreenCardPreview);
        resizeGreenCardPreview();
    }

    function updatePreviewAvailability() {
        if (previewButton) {
            previewButton.disabled =
                !savedEmployeeId || formHasUnsavedChanges || saveInProgress;
        }
    }

    function markEmployeeFormDirty() {
        if (saveInProgress) {
            return;
        }

        formHasUnsavedChanges = true;
        updatePreviewAvailability();
        if (employeeMessage) {
            employeeMessage.textContent = savedEmployeeId
                ? "Save your changes before previewing the saved employee card."
                : "Save this employee before previewing the ID card.";
        }
    }

    function updateEmployeePreview() {
        fields.forEach(function (field) {
            const input = document.getElementById(field[0]);
            const preview = document.getElementById(field[1]);
            if (input && preview) {
                preview.textContent = input.value.trim() || field[2];
            }
        });
        resizeGreenCardPreview();

    }

    function setEmployeePhotoPreview(photoUrl, isObjectUrl) {
        const greenPhoto = document.getElementById("greenEmployeePhoto");
        if (previewPhotoObjectUrl && previewPhotoObjectUrl !== photoUrl) {
            URL.revokeObjectURL(previewPhotoObjectUrl);
            previewPhotoObjectUrl = "";
        }
        if (isObjectUrl) {
            previewPhotoObjectUrl = photoUrl;
        } else {
            previewPhotoUrl = photoUrl || "";
        }
        if (!greenPhoto) {
            return;
        }
        greenPhoto.src = photoUrl || "";
        greenPhoto.hidden = !photoUrl;
    }

    function setEmployeeForm(employee) {
        document.getElementById("employeeDatabaseId").value =
            employee ? employee.id : "";
        savedEmployeeId = employee && Number.isSafeInteger(Number(employee.id))
            ? String(employee.id)
            : "";
        formHasUnsavedChanges = false;
        updatePreviewAvailability();
        document.getElementById("employeeId").value =
            employee ? employee.employeeId : "";
        document.getElementById("employeeName").value =
            employee ? employee.fullName : "";
        document.getElementById("employeeDesignation").value =
            employee ? employee.designation : "";
        document.getElementById("employeeDepartment").value =
            employee ? employee.department : "";
        document.getElementById("employeePhone").value =
            employee ? employee.phone : "";
        document.getElementById("employeeEmail").value =
            employee ? employee.email : "";
        document.getElementById("employeeJoiningDate").value =
            employee ? employee.joiningDate : "";
        document.getElementById("employeeStatus").value =
            employee ? employee.status : "Active";
        if (employeeCompanyBranding) {
            const defaultProfile = companyProfiles.find(function (profile) {
                return profile.isDefault;
            }) || companyProfiles[0];
            employeeCompanyBranding.value = employee
                ? employee.companyBrandingId || ""
                : defaultProfile
                    ? String(defaultProfile.id)
                    : "";
        }
        employeePhoto.value = "";
        setEmployeePhotoPreview(employee ? employee.photoUrl : "", false);
        updateEmployeePreview();
        updateSelectedCompanyBranding();
        qrUpdatePromise = updateGreenQrCode();
    }

    fields.forEach(function (field) {
        const input = document.getElementById(field[0]);
        if (!input) {
            return;
        }

        input.addEventListener("input", function () {
            updateEmployeePreview();
            if (field[0] === "employeeId") {
                qrUpdatePromise = updateGreenQrCode();
            }
        });
    });

    document.getElementById("employeeStatus").addEventListener(
        "change",
        updateEmployeePreview
    );

    if (employeeForm) {
        employeeForm.addEventListener("input", markEmployeeFormDirty);
        employeeForm.addEventListener("change", markEmployeeFormDirty);
    }

    function renderGreenTerms() {
        if (!greenTermsList || !greenTermsInput) {
            return;
        }

        greenTermsList.replaceChildren();
        greenTermsInput.value.split(/\r?\n/).forEach(function (term) {
            const text = term.trim();
            if (text) {
                const item = document.createElement("li");
                item.textContent = text;
                greenTermsList.appendChild(item);
            }
        });
    }

    if (greenTermsInput) {
        greenTermsInput.addEventListener("input", renderGreenTerms);
        renderGreenTerms();
    }

    async function updateGreenQrCode() {
        if (!greenQrCode || !greenQrMessage) {
            return false;
        }

        const employeeIdInput = document.getElementById("employeeId");
        const employeeId = employeeIdInput.value.trim();
        const requestId = ++qrRequestId;
        const databaseId = employeeDatabaseId
            ? employeeDatabaseId.value
            : "";

        greenQrCode.hidden = true;
        greenQrCode.removeAttribute("src");
        greenQrMessage.hidden = true;
        greenQrMessage.textContent = "";

        if (!databaseId || !employeeId) {
            return false;
        }

        greenQrMessage.textContent = "Generating this employee's digital ID QR code...";
        greenQrMessage.hidden = false;

        try {
            const response = await fetch("/api/id-cards/qr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeDatabaseId: databaseId,
                    employeeId: employeeId
                })
            });
            const result = await readJsonResponse(response);

            if (requestId !== qrRequestId) {
                return false;
            }

            if (
                typeof result.qrDataUrl !== "string"
                || !result.qrDataUrl.startsWith("data:image/png;base64,")
            ) {
                throw new Error("The QR service returned an invalid image.");
            }

            greenQrCode.src = result.qrDataUrl;
            await greenQrCode.decode();

            if (requestId !== qrRequestId) {
                return false;
            }

            greenQrCode.hidden = false;
            greenQrMessage.hidden = true;
            greenQrMessage.textContent = "";
            return true;
        } catch (error) {
            if (requestId === qrRequestId) {
                greenQrCode.hidden = true;
                greenQrCode.removeAttribute("src");
                greenQrMessage.textContent = error.message;
                greenQrMessage.hidden = false;
                console.error("Digital ID QR generation failed:", error.message);
            }
            return false;
        }
    }

    function copyCardSnapshot(selector, face, destination) {
        const source = document.querySelector(selector);
        if (!source || !destination) {
            return;
        }

        const clone = source.cloneNode(true);
        clone.removeAttribute("id");
        clone.querySelectorAll("[id]").forEach(function (element) {
            element.removeAttribute("id");
        });
        clone.classList.add("id-card-preview-snapshot");
        destination.querySelector(face).replaceChildren(clone);
    }

    function updatePreviewRotation() {
        if (!previewRotator || !previewStage) {
            return;
        }

        previewRotator.style.transform =
            "rotateX(" + previewTilt + "deg) rotateY(" +
            previewRotation + "deg)";
        const normalizedRotation = ((previewRotation % 360) + 360) % 360;
        const showingBack = normalizedRotation > 90 &&
            normalizedRotation < 270;
        previewOverlay.querySelectorAll("[data-preview-side]").forEach(
            function (button) {
                const isSelected = button.dataset.previewSide ===
                    (showingBack ? "back" : "front");
                button.classList.toggle("is-selected", isSelected);
                button.setAttribute("aria-pressed", String(isSelected));
            }
        );
        previewStage.setAttribute(
            "aria-label",
            showingBack
                ? "Back of the employee ID card. Drag to rotate."
                : "Front of the employee ID card. Drag to rotate."
        );
    }

    function setPreviewSide(side) {
        if (previewRotationAnimation) {
            previewRotationAnimation.cancel();
            previewRotationAnimation = undefined;
        }
        rotatePreviewButton.disabled = false;
        previewTilt = 0;
        previewRotation = side === "back" ? 180 : 0;
        updatePreviewRotation();
    }

    function resizePreviewCard() {
        if (!previewStage || !previewOverlay || previewOverlay.hidden) {
            return;
        }

        const scale = previewStage.getBoundingClientRect().width / 320;
        previewOverlay.querySelectorAll(".preview-card-face .green-id-card")
            .forEach(function (card) {
                card.style.setProperty("--preview-card-scale", scale);
            });
    }

    function clearPreviewTimers() {
        previewTimers.forEach(function (timer) {
            window.clearTimeout(timer);
        });
        previewTimers = [];
    }

    function closeIdCardPreview() {
        clearPreviewTimers();
        if (previewRotationAnimation) {
            previewRotationAnimation.cancel();
            previewRotationAnimation = undefined;
        }
        rotatePreviewButton.disabled = false;
        if (!previewOverlay || previewOverlay.hidden || previewClosing) {
            return;
        }

        previewClosing = true;
        previewOverlay.classList.remove("is-entering", "is-ready");
        previewOverlay.classList.add("is-closing");
        const finishClose = function () {
            previewOverlay.hidden = true;
            previewOverlay.classList.remove("is-closing");
            previewControls.hidden = true;
            previewStage.classList.remove("is-dragging");
            previewStage.tabIndex = -1;
            previewDrag = undefined;
            previewClosing = false;
            if (previousPreviewFocus && previousPreviewFocus.isConnected) {
                previousPreviewFocus.focus();
            }
        };
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            finishClose();
        } else {
            previewTimers.push(window.setTimeout(finishClose, 220));
        }
    }

    function finishPreviewEntrance() {
        clearPreviewTimers();
        previewOverlay.classList.remove("is-entering");
        previewOverlay.classList.add("is-ready");
        previewControls.hidden = false;
        previewStage.tabIndex = 0;
        setPreviewSide("front");
        previewOverlay.querySelector('[data-preview-side="front"]').focus();
    }

    async function openIdCardPreview() {
        if (
            !employeeForm ||
            !previewOverlay ||
            !previewControls ||
            !savedEmployeeId ||
            formHasUnsavedChanges ||
            saveInProgress ||
            previewClosing
        ) {
            return;
        }

        previewValidationMessage.textContent = "";
        previousPreviewFocus = document.activeElement;
        previewButton.disabled = true;
        employeeMessage.textContent = "Loading the saved employee card...";
        try {
            const response = await fetch(
                "/api/employees/" + encodeURIComponent(savedEmployeeId),
                { cache: "no-store" }
            );
            const employee = await readJsonResponse(response);
            if (String(employee.id) !== savedEmployeeId) {
                throw new Error("The saved employee record did not match.");
            }

            setEmployeeForm(employee);
            await qrUpdatePromise;
            copyCardSnapshot(
                ".green-id-card-front",
                ".preview-card-face-front",
                previewOverlay
            );
            copyCardSnapshot(
                ".green-id-card-back",
                ".preview-card-face-back",
                previewOverlay
            );
            previewRotation = -16;
            previewTilt = 5;
            updatePreviewRotation();
            previewOverlay.hidden = false;
            resizePreviewCard();
            previewOverlay.classList.remove("is-ready", "is-closing");
            previewOverlay.classList.add("is-entering");
            previewControls.hidden = true;
            closePreviewButton.focus();
            employeeMessage.textContent = "";

            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                finishPreviewEntrance();
            } else {
                previewTimers.push(window.setTimeout(function () {
                    previewRotation = 0;
                    previewTilt = 0;
                    updatePreviewRotation();
                    setPreviewSide("back");
                }, 1050));
                previewTimers.push(window.setTimeout(function () {
                    setPreviewSide("front");
                }, 2650));
                previewTimers.push(window.setTimeout(function () {
                    finishPreviewEntrance();
                }, 4100));
            }
        } catch (error) {
            previewValidationMessage.textContent =
                "Could not load the saved employee card: " + error.message;
            employeeMessage.textContent =
                "The saved employee card could not be loaded.";
        } finally {
            updatePreviewAvailability();
        }
    }

    function rotatePreviewByDrag(event) {
        if (!previewDrag || previewDrag.pointerId !== event.pointerId) {
            return;
        }

        previewRotation = previewDrag.rotation +
            (event.clientX - previewDrag.x) * 0.8;
        previewTilt = Math.max(
            -18,
            Math.min(
                18,
                previewDrag.tilt + (event.clientY - previewDrag.y) * 0.35
            )
        );
        updatePreviewRotation();
    }

    function updateCompanyBranding(branding) {
        const greenCompanyName = document.getElementById("greenCompanyName");
        const greenCompanyLogo = document.getElementById("greenCompanyLogo");
        const cardColors = [
            ["--company-primary-color", branding.primaryColor || "#285638"],
            ["--company-secondary-color", branding.secondaryColor || "#36764b"],
            ["--company-accent-color", branding.accentColor || "#a8e6b0"]
        ];

        if (greenCompanyName) {
            greenCompanyName.textContent = branding.companyName || "Company";
        }

        document.querySelectorAll(".green-id-card").forEach(function (card) {
            cardColors.forEach(function (color) {
                card.style.setProperty(color[0], color[1]);
            });
        });

        if (greenCompanyLogo) {
            if (branding.logoUrl) {
                greenCompanyLogo.src = branding.logoUrl;
                greenCompanyLogo.hidden = false;
            } else {
                greenCompanyLogo.hidden = true;
                greenCompanyLogo.removeAttribute("src");
            }
        }
    }

    function updateSelectedCompanyBranding() {
        const selectedProfile = employeeCompanyBranding
            ? companyProfiles.find(function (profile) {
                return String(profile.id) === employeeCompanyBranding.value;
            })
            : null;
        const defaultProfile = companyProfiles.find(function (profile) {
            return profile.isDefault;
        }) || companyProfiles[0];
        updateCompanyBranding(selectedProfile || defaultProfile || {});
    }

    async function loadCompanyBrandingProfiles() {
        const response = await fetch("/api/branding/profiles", {
            cache: "no-store"
        });
        let profiles;
        try {
            profiles = await response.json();
        } catch (error) {
            throw new Error("The server returned an invalid branding response.");
        }
        if (!response.ok) {
            throw new Error(
                profiles.error || "Could not load company branding profiles."
            );
        }
        if (!Array.isArray(profiles)) {
            throw new Error("The server returned invalid company profiles.");
        }

        companyProfiles = profiles;
        if (employeeCompanyBranding) {
            const previousId = employeeCompanyBranding.value;
            employeeCompanyBranding.replaceChildren();
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = "Use default company branding";
            employeeCompanyBranding.appendChild(defaultOption);
            profiles.forEach(function (profile) {
                const option = document.createElement("option");
                option.value = String(profile.id);
                option.textContent = profile.companyName
                    + (profile.isDefault ? " — Default" : "");
                employeeCompanyBranding.appendChild(option);
            });
            const retainedProfile = profiles.find(function (profile) {
                return String(profile.id) === previousId;
            });
            const defaultProfile = profiles.find(function (profile) {
                return profile.isDefault;
            }) || profiles[0];
            employeeCompanyBranding.value = retainedProfile
                ? String(retainedProfile.id)
                : defaultProfile
                    ? String(defaultProfile.id)
                    : "";
        }
        updateSelectedCompanyBranding();
    }

    companyProfilesReady = loadCompanyBrandingProfiles().catch(
        function (error) {
            console.error("Branding error:", error);
            if (employeeMessage) {
                employeeMessage.textContent =
                    "Company branding profiles could not be loaded: "
                    + error.message;
            }
        }
    );

    window.addEventListener("companybrandingupdated", function (event) {
        const updatedProfile = event.detail;
        const index = companyProfiles.findIndex(function (profile) {
            return String(profile.id) === String(updatedProfile.id);
        });
        if (index < 0) {
            companyProfiles.push(updatedProfile);
        } else {
            companyProfiles[index] = updatedProfile;
        }
        companyProfilesReady = loadCompanyBrandingProfiles().catch(function (error) {
            console.error("Branding refresh failed:", error);
        });
    });

    window.addEventListener("companybrandingdeleted", function () {
        companyProfilesReady = loadCompanyBrandingProfiles().catch(
            function (error) {
                console.error("Branding refresh failed:", error);
            }
        );
    });

    if (employeeCompanyBranding) {
        employeeCompanyBranding.addEventListener(
            "change",
            updateSelectedCompanyBranding
        );
    }

    if (employeePhoto) {
        employeePhoto.addEventListener("change", function () {
            const file = employeePhoto.files[0];

            if (!file) {
                setEmployeePhotoPreview(previewPhotoUrl, false);
                return;
            }

            const allowedTypes = [
                "image/png",
                "image/jpeg",
                "image/webp"
            ];

            if (!allowedTypes.includes(file.type)) {
                alert("Please upload a PNG, JPG, or WebP image.");
                employeePhoto.value = "";
                setEmployeePhotoPreview(previewPhotoUrl, false);
                return;
            }

            if (file.size > 2 * 1024 * 1024) {
                alert("Image size must be less than 2 MB.");
                employeePhoto.value = "";
                setEmployeePhotoPreview(previewPhotoUrl, false);
                return;
            }

            const photoUrl = URL.createObjectURL(file);
            setEmployeePhotoPreview(photoUrl, true);
        });
    }

    async function readJsonResponse(response) {
        let result;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error("The server returned an invalid response.");
        }

        if (!response.ok) {
            throw new Error(result.error || "The request could not be completed.");
        }

        return result;
    }

    if (employeeForm) {
        employeeForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            if (saveInProgress) {
                return;
            }
            if (!employeeForm.checkValidity()) {
                employeeMessage.textContent =
                    "Complete all required fields and correct any invalid values.";
                employeeForm.reportValidity();
                return;
            }

            saveInProgress = true;
            updatePreviewAvailability();
            const controlStates = Array.from(
                employeeForm.querySelectorAll("input, select, textarea, button")
            ).map(function (control) {
                return [control, control.disabled];
            });
            controlStates.forEach(function (state) {
                state[0].disabled = true;
            });
            if (saveEmployeeButton) {
                saveEmployeeButton.textContent = "Saving Employee...";
            }
            employeeMessage.textContent = "Saving employee...";

            const formData = new FormData();
            formData.append(
                "employeeId",
                document.getElementById("employeeId").value
            );
            formData.append(
                "fullName",
                document.getElementById("employeeName").value
            );
            formData.append(
                "designation",
                document.getElementById("employeeDesignation").value
            );
            formData.append(
                "department",
                document.getElementById("employeeDepartment").value
            );
            formData.append(
                "phone",
                document.getElementById("employeePhone").value
            );
            formData.append(
                "email",
                document.getElementById("employeeEmail").value
            );
            formData.append(
                "joiningDate",
                document.getElementById("employeeJoiningDate").value
            );
            formData.append(
                "companyBrandingId",
                employeeCompanyBranding ? employeeCompanyBranding.value : ""
            );

            const statusInput = document.getElementById("employeeStatus");
            if (statusInput) {
                formData.append("status", statusInput.value);
            }

            if (employeePhoto && employeePhoto.files[0]) {
                formData.append("employeePhoto", employeePhoto.files[0]);
            }

            const id = employeeDatabaseId ? employeeDatabaseId.value : "";
            const url = id
                ? "/api/employees/" + encodeURIComponent(id)
                : "/api/employees";

            try {
                const response = await fetch(url, {
                    method: id ? "PUT" : "POST",
                    body: formData
                });
                const result = await readJsonResponse(response);

                if (
                    !result.employee ||
                    !Number.isSafeInteger(Number(result.employee.id))
                ) {
                    throw new Error(
                        "The server did not confirm a saved employee record."
                    );
                }
                setEmployeeForm(result.employee);
                employeeMessage.textContent =
                    result.message || "Employee saved successfully.";
                const employeePreviewMessage = document.getElementById(
                    "employeePreviewMessage"
                );
                if (employeePreviewMessage) {
                    employeePreviewMessage.textContent =
                        "Preview updated from the saved employee record.";
                }

                if (employeeListBody) {
                    loadEmployees();
                }
                if (typeof window.updateDashboard === "function") {
                    window.updateDashboard();
                }
                window.dispatchEvent(new Event("employeesupdated"));
            } catch (error) {
                employeeMessage.textContent = error.message;
            } finally {
                saveInProgress = false;
                controlStates.forEach(function (state) {
                    state[0].disabled = state[1];
                });
                if (saveEmployeeButton) {
                    saveEmployeeButton.textContent = "Save Employee";
                }
                updatePreviewAvailability();
            }
        });
    }

    if (previewButton) {
        previewButton.addEventListener("click", openIdCardPreview);
    }

    if (previewOverlay) {
        previewOverlay.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                event.preventDefault();
                closeIdCardPreview();
                return;
            }

            if (event.key === "Tab") {
                const focusableElements = Array.from(
                    previewOverlay.querySelectorAll(
                        "button:not([disabled]), [tabindex='0']"
                    )
                ).filter(function (element) {
                    return element.getClientRects().length > 0;
                });
                const firstElement = focusableElements[0];
                const lastElement =
                    focusableElements[focusableElements.length - 1];

                if (
                    event.shiftKey &&
                    document.activeElement === firstElement
                ) {
                    event.preventDefault();
                    lastElement.focus();
                } else if (
                    !event.shiftKey &&
                    document.activeElement === lastElement
                ) {
                    event.preventDefault();
                    firstElement.focus();
                }
            }
        });
    }

    if (closePreviewButton) {
        closePreviewButton.addEventListener("click", closeIdCardPreview);
    }

    if (closePreviewActionButton) {
        closePreviewActionButton.addEventListener(
            "click",
            closeIdCardPreview
        );
    }

    if (previewOverlay) {
        previewOverlay.querySelectorAll("[data-preview-side]").forEach(
            function (button) {
                button.addEventListener("click", function () {
                    setPreviewSide(button.dataset.previewSide);
                });
            }
        );
    }

    if (rotatePreviewButton) {
        rotatePreviewButton.addEventListener("click", function () {
            if (!previewRotator || previewRotationAnimation) {
                return;
            }

            const startingRotation = previewRotation;
            const startingTilt = previewTilt;
            rotatePreviewButton.disabled = true;

            if (typeof previewRotator.animate === "function") {
                previewRotationAnimation = previewRotator.animate(
                    [
                        {
                            transform: "rotateX(" + startingTilt +
                                "deg) rotateY(" + startingRotation + "deg)"
                        },
                        {
                            transform: "rotateX(" + startingTilt +
                                "deg) rotateY(" +
                                (startingRotation + 360) + "deg)"
                        }
                    ],
                    {
                        duration: 1500,
                        easing: "cubic-bezier(0.2, 0.75, 0.25, 1)"
                    }
                );
                previewRotationAnimation.onfinish = function () {
                    previewRotation += 360;
                    previewRotationAnimation = undefined;
                    updatePreviewRotation();
                    rotatePreviewButton.disabled = false;
                };
            } else {
                previewRotation += 360;
                updatePreviewRotation();
                rotatePreviewButton.disabled = false;
            }
        });
    }

    if (resetPreviewButton) {
        resetPreviewButton.addEventListener("click", function () {
            setPreviewSide("front");
        });
    }

    if (savePreviewButton && savePreviewStatus) {
        savePreviewButton.addEventListener("click", async function () {
            if (
                !previewOverlay ||
                previewOverlay.hidden ||
                cardDownloadActive
            ) {
                return;
            }

            cardDownloadActive = true;
            savePreviewButton.disabled = true;
            savePreviewStatus.classList.remove("is-error");
            savePreviewStatus.textContent = "Preparing your ID card PDF...";
            savePreviewStatus.hidden = false;

            try {
                if (
                    !savedEmployeeId ||
                    savedEmployeeId !== employeeDatabaseId.value
                ) {
                    throw new Error(
                        "The saved employee changed. Reopen the preview before saving."
                    );
                }

                const response = await fetch(
                    "/api/employees/"
                        + encodeURIComponent(savedEmployeeId)
                        + "/id-card.pdf",
                    { cache: "no-store" }
                );
                if (!response.ok) {
                    const result = await readJsonResponse(response);
                    throw new Error(
                        result.error || "The ID card PDF could not be generated."
                    );
                }

                const pdf = await response.blob();
                if (!pdf.size || pdf.type !== "application/pdf") {
                    throw new Error(
                        "The server returned an invalid ID card PDF."
                    );
                }

                const employeeIdForFile =
                    document.getElementById("employeeId").value
                        .trim()
                        .replace(/[^a-zA-Z0-9_-]/g, "_")
                        .slice(0, 50) || "ID_Card";
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

                savePreviewStatus.textContent =
                    "ID card PDF downloaded. Each side is 54 × 86 mm.";
            } catch (error) {
                savePreviewStatus.classList.add("is-error");
                savePreviewStatus.textContent =
                    "Could not save the ID card: " + error.message;
            } finally {
                cardDownloadActive = false;
                savePreviewButton.disabled = false;
            }
        });
    }

    if (printPreviewButton) {
        function waitForPreviewImages() {
            const images = Array.from(
                previewOverlay.querySelectorAll(
                    ".preview-card-face .green-id-card img:not([hidden])"
                )
            );
            return Promise.all(images.map(function (image) {
                return new Promise(function (resolve, reject) {
                    let timeout;
                    let settled = false;
                    const finish = function (error) {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        window.clearTimeout(timeout);
                        image.removeEventListener("load", onLoad);
                        image.removeEventListener("error", onError);
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    };
                    const verifyLoaded = function () {
                        if (!image.naturalWidth) {
                            finish(new Error(
                                "A card photo, logo, or QR code could not be loaded."
                            ));
                            return;
                        }
                        finish();
                    };
                    const onLoad = verifyLoaded;
                    const onError = function () {
                        finish(new Error(
                            "A card photo, logo, or QR code could not be loaded."
                        ));
                    };

                    timeout = window.setTimeout(function () {
                        finish(new Error(
                            "Timed out while preparing card images for printing."
                        ));
                    }, 10000);
                    if (image.complete) {
                        verifyLoaded();
                    } else {
                        image.addEventListener("load", onLoad, { once: true });
                        image.addEventListener("error", onError, { once: true });
                    }
                });
            }));
        }

        function restorePrintControls() {
            if (activeAfterPrintHandler) {
                window.removeEventListener(
                    "afterprint",
                    activeAfterPrintHandler
                );
                activeAfterPrintHandler = undefined;
            }
            document.body.classList.remove("printing-id-card-preview");
            printDialogActive = false;
            printPreviewButton.disabled = false;
            printStatus.hidden = true;
            printStatus.textContent = "";
        }

        function waitForPreparationFrame(startedAt) {
            return new Promise(function (resolve) {
                window.requestAnimationFrame(function () {
                    window.requestAnimationFrame(function () {
                        const remaining = Math.max(
                            0,
                            650 - (performance.now() - startedAt)
                        );
                        window.setTimeout(resolve, remaining);
                    });
                });
            });
        }

        printPreviewButton.addEventListener("click", async function () {
            if (
                !previewOverlay ||
                previewOverlay.hidden ||
                printDialogActive
            ) {
                return;
            }

            printDialogActive = true;
            printPreviewButton.disabled = true;
            const preparationStartedAt = performance.now();
            printStatus.textContent = "Preparing your ID card...";
            printStatus.hidden = false;
            finishPreviewEntrance();
            setPreviewSide("front");

            try {
                await Promise.all([
                    waitForPreviewImages(),
                    waitForPreparationFrame(preparationStartedAt)
                ]);

                if (!savedEmployeeId || savedEmployeeId !== employeeDatabaseId.value) {
                    throw new Error(
                        "The saved employee changed. Reopen the preview before printing."
                    );
                }

                fetch("/api/id-cards", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        employeeId: savedEmployeeId
                    })
                })
                    .then(readJsonResponse)
                    .catch(function (error) {
                        employeeMessage.textContent =
                            "Card print tracking failed: " + error.message;
                    });

                printStatus.hidden = true;
                document.body.classList.add("printing-id-card-preview");
                activeAfterPrintHandler = restorePrintControls;
                window.addEventListener("afterprint", activeAfterPrintHandler);
                window.print();
                restorePrintControls();
            } catch (error) {
                restorePrintControls();
                employeeMessage.textContent =
                    "Could not prepare the ID card for printing: "
                    + error.message;
            }
        });
    }

    if (previewStage) {
        previewStage.addEventListener("pointerdown", function (event) {
            if (
                !previewOverlay.classList.contains("is-ready") ||
                previewRotationAnimation ||
                (event.pointerType === "mouse" && event.button !== 0)
            ) {
                return;
            }

            previewDrag = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                rotation: previewRotation,
                tilt: previewTilt
            };
            previewStage.classList.add("is-dragging");
            previewStage.setPointerCapture(event.pointerId);
        });

        previewStage.addEventListener("pointermove", rotatePreviewByDrag);
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(
            function (eventName) {
                previewStage.addEventListener(eventName, function () {
                    previewDrag = undefined;
                    previewStage.classList.remove("is-dragging");
                });
            }
        );

        previewStage.addEventListener("keydown", function (event) {
            if (
                !previewOverlay.classList.contains("is-ready") ||
                previewRotationAnimation
            ) {
                return;
            }

            const angleStep = event.shiftKey ? 30 : 15;
            if (event.key === "ArrowLeft") {
                previewRotation -= angleStep;
            } else if (event.key === "ArrowRight") {
                previewRotation += angleStep;
            } else if (event.key === "ArrowUp") {
                previewTilt = Math.max(-18, previewTilt - angleStep / 2);
            } else if (event.key === "ArrowDown") {
                previewTilt = Math.min(18, previewTilt + angleStep / 2);
            } else if (event.key === "Home") {
                setPreviewSide("front");
                event.preventDefault();
                return;
            } else {
                return;
            }

            event.preventDefault();
            updatePreviewRotation();
        });
    }

    window.addEventListener("resize", resizePreviewCard);

    async function loadEmployees() {
        if (!employeeListBody) {
            return;
        }

        employeeListMessage.textContent = "Loading employee records…";
        if (employeeListCount) {
            employeeListCount.textContent = "Loading records";
        }
        const params = new URLSearchParams();
        if (employeeSearch.value.trim()) {
            params.set("search", employeeSearch.value.trim());
        }
        if (employeeStatusFilter.value) {
            params.set("status", employeeStatusFilter.value);
        }

        try {
            const response = await fetch(
                "/api/employees?" + params.toString()
            );
            const employees = await readJsonResponse(response);
            employeeListBody.replaceChildren();

            if (employees.length === 0) {
                const row = document.createElement("tr");
                const cell = document.createElement("td");
                cell.colSpan = 6;
                cell.className = "empty-state";
                cell.textContent = "No employee records match this search.";
                row.appendChild(cell);
                employeeListBody.appendChild(row);
                employeeListMessage.textContent = "Try another search or status filter.";
                if (employeeListCount) {
                    employeeListCount.textContent = "0 matching records";
                }
                return;
            }

            employees.forEach(function (employee) {
                const row = document.createElement("tr");
                [
                    employee.fullName || "Unnamed employee",
                    employee.employeeId || "—",
                    employee.designation || "—",
                    employee.department || "—"
                ].forEach(function (value) {
                    const cell = document.createElement("td");
                    cell.textContent = value;
                    row.appendChild(cell);
                });

                const statusCell = document.createElement("td");
                const statusBadge = document.createElement("span");
                statusBadge.className = "employee-status-badge "
                    + (employee.status === "Active" ? "is-active" : "is-inactive");
                statusBadge.textContent = employee.status || "Unknown";
                statusCell.appendChild(statusBadge);
                row.appendChild(statusCell);

                const actions = document.createElement("td");
                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.textContent = "Edit";
                editButton.dataset.action = "edit";
                editButton.dataset.id = employee.id;

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.textContent = "Delete";
                deleteButton.dataset.action = "delete";
                deleteButton.dataset.id = employee.id;
                actions.append(editButton, document.createTextNode(" "), deleteButton);
                row.appendChild(actions);
                employeeListBody.appendChild(row);
            });

            employeeListMessage.textContent =
                "Showing matching employee records.";
            if (employeeListCount) {
                employeeListCount.textContent =
                    employees.length + (employees.length === 1
                        ? " matching record"
                        : " matching records");
            }
        } catch (error) {
            employeeListBody.replaceChildren();
            employeeListMessage.textContent =
                "Employee records could not be loaded: " + error.message;
            if (employeeListCount) {
                employeeListCount.textContent = "Records unavailable";
            }
        }
    }

    async function editEmployee(id) {
        const requestId = ++employeeSelectionRequestId;
        await companyProfilesReady;
        setEmployeeForm(null);
        employeeMessage.textContent = "Loading saved employee details...";
        const employeePreviewMessage = document.getElementById(
            "employeePreviewMessage"
        );
        if (employeePreviewMessage) {
            employeePreviewMessage.textContent =
                "Loading the selected employee's saved card details...";
        }
        try {
            const response = await fetch(
                "/api/employees/" + encodeURIComponent(id)
            );
            const employee = await readJsonResponse(response);
            if (requestId !== employeeSelectionRequestId) {
                return;
            }
            setEmployeeForm(employee);
            if (employeeMessage) {
                employeeMessage.textContent = "Editing " + employee.fullName;
            }
            if (employeePreviewMessage) {
                employeePreviewMessage.textContent =
                    "Preview loaded from this employee's saved record.";
            }
            if (typeof window.showAppPage === "function") {
                window.showAppPage("create-id");
            }
        } catch (error) {
            if (requestId !== employeeSelectionRequestId) {
                return;
            }
            setEmployeeForm(null);
            employeeMessage.textContent =
                "Could not load the selected employee: " + error.message;
            if (employeePreviewMessage) {
                employeePreviewMessage.textContent =
                    "The saved employee details could not be loaded.";
            }
            if (employeeListMessage) {
                employeeListMessage.textContent =
                    "Could not load the selected employee: " + error.message;
            }
        }
    }

    if (employeeListBody) {
        employeeListBody.addEventListener("click", async function (event) {
            const button = event.target.closest("button[data-action]");
            if (!button) {
                return;
            }

            if (button.dataset.action === "edit") {
                await editEmployee(button.dataset.id);
                return;
            }

            if (
                button.dataset.action === "delete" &&
                window.confirm("Delete this employee record?")
            ) {
                try {
                    const response = await fetch(
                        "/api/employees/"
                            + encodeURIComponent(button.dataset.id),
                        { method: "DELETE" }
                    );
                    await readJsonResponse(response);
                    await loadEmployees();
                    if (typeof window.updateDashboard === "function") {
                        window.updateDashboard();
                    }
                } catch (error) {
                    employeeListMessage.textContent = error.message;
                }
            }
        });
    }

    if (employeeSearch) {
        employeeSearch.addEventListener("input", function () {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(loadEmployees, 200);
        });
        employeeStatusFilter.addEventListener("change", loadEmployees);
        loadEmployees();
    }

    document.addEventListener("click", function (event) {
        const createEmployeeControl = event.target.closest(
            '[data-page="create-id"]'
        );
        if (!createEmployeeControl) {
            return;
        }

        employeeSelectionRequestId += 1;
        setEmployeeForm(null);
        employeeMessage.textContent = "";
        const employeePreviewMessage = document.getElementById(
            "employeePreviewMessage"
        );
        if (employeePreviewMessage) {
            employeePreviewMessage.textContent =
                "Enter employee details to update the card preview.";
        }
    });

    window.addEventListener("employeesupdated", loadEmployees);
});
