document.addEventListener("DOMContentLoaded", function () {

    const fileInput = document.getElementById("bulkFileInput");
    const browseButton = document.getElementById("bulkBrowseButton");
    const dropZone = document.getElementById("bulkDropZone");
    const fileList = document.getElementById("bulkFileList");
    const emptyState = document.getElementById("bulkFilesEmpty");
    const message = document.getElementById("bulkImportMessage");
    const startButton = document.getElementById("bulkStartButton");
    const closeButton = document.getElementById("bulkCloseButton");
    const exportFormat = document.getElementById("bulkExportFormat");
    const exportButton = document.getElementById("bulkExportButton");
    const exportMessage = document.getElementById("bulkExportMessage");
    const files = [];
    let importing = false;
    let exporting = false;

    document.getElementById("bulkJobId").textContent =
        "JOB-" + (
            window.crypto && typeof window.crypto.randomUUID === "function"
                ? window.crypto.randomUUID().slice(0, 8).toUpperCase()
                : Date.now().toString(36).toUpperCase()
        );

    function setMessage(text, type) {
        message.textContent = text;
        message.classList.toggle("is-error", type === "error");
        message.classList.toggle("is-success", type === "success");
    }

    function setExportMessage(text, type) {
        exportMessage.textContent = text;
        exportMessage.classList.toggle("is-error", type === "error");
        exportMessage.classList.toggle("is-success", type === "success");
    }

    function renderFiles() {

        fileList.replaceChildren();
        emptyState.hidden = files.length > 0;

        if (files.length === 0) {
            fileList.appendChild(emptyState);
            return;
        }

        files.forEach(function (item, index) {

            const row = document.createElement("li");
            row.className = "bulk-file-row";

            const details = document.createElement("div");
            details.className = "bulk-file-details";

            const name = document.createElement("span");
            name.className = "bulk-file-name";
            name.textContent = item.file.name;
            name.title = item.file.name;

            const progress = document.createElement("span");
            progress.className = "bulk-file-progress";
            progress.textContent = item.progress + "%";

            const description = document.createElement("span");
            description.className = "bulk-file-description";
            description.textContent = /\.xlsx$/i.test(item.file.name)
                ? "Employee file · Excel"
                : "Employee file · CSV";

            details.append(name, progress, description);

            const actions = document.createElement("div");
            actions.className = "bulk-file-actions";

            const downloadButton = document.createElement("button");
            downloadButton.className = "bulk-file-action";
            downloadButton.type = "button";
            downloadButton.textContent = "↓";
            downloadButton.setAttribute(
                "aria-label",
                "Download " + item.file.name
            );
            downloadButton.title = "Download file";
            downloadButton.disabled = importing;
            downloadButton.addEventListener("click", function () {
                const url = URL.createObjectURL(item.file);
                const link = document.createElement("a");
                link.href = url;
                link.download = item.file.name;
                link.click();
                URL.revokeObjectURL(url);
            });

            const removeButton = document.createElement("button");
            removeButton.className = "bulk-file-action";
            removeButton.type = "button";
            removeButton.textContent = "×";
            removeButton.setAttribute(
                "aria-label",
                "Remove " + item.file.name
            );
            removeButton.title = "Remove file";
            removeButton.disabled = importing;
            removeButton.addEventListener("click", function () {
                files.splice(index, 1);
                renderFiles();
                setMessage("", "");
            });

            actions.append(downloadButton, removeButton);
            row.append(details, actions);
            fileList.appendChild(row);

        });

    }

    function addFiles(fileCollection) {

        const incomingFiles = Array.from(fileCollection);

        if (incomingFiles.length === 0) {
            return;
        }

        const errors = [];

        incomingFiles.forEach(function (file) {

            const isCsvFile = /\.csv$/i.test(file.name);
            const isExcelFile = /\.xlsx$/i.test(file.name);
            const allowedMimeTypes = isCsvFile
                ? [
                    "",
                    "text/csv",
                    "application/csv",
                    "application/vnd.ms-excel",
                    "application/octet-stream",
                    "text/plain"
                ]
                : [
                    "",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/zip",
                    "application/octet-stream"
                ];

            if (
                (!isCsvFile && !isExcelFile) ||
                !allowedMimeTypes.includes(file.type)
            ) {
                errors.push(file.name + " is not a valid .csv or .xlsx file.");
                return;
            }

            if (file.size === 0) {
                errors.push(file.name + " is empty.");
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                errors.push(file.name + " exceeds the 5 MB limit.");
                return;
            }

            const alreadyAdded = files.some(function (item) {
                return item.file.name === file.name
                    && item.file.size === file.size
                    && item.file.lastModified === file.lastModified;
            });

            if (!alreadyAdded) {
                files.push({ file: file, progress: 0 });
            }
        });

        if (files.length > 10) {
            files.splice(10);
            errors.push("You can select up to 10 CSV or XLSX files.");
        }

        renderFiles();
        setMessage(errors.join(" "), errors.length > 0 ? "error" : "");
    }

    browseButton.addEventListener("click", function () {
        if (!importing) {
            fileInput.click();
        }
    });

    dropZone.addEventListener("click", function (event) {
        if (
            !importing &&
            !event.target.closest("button")
        ) {
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", function () {
        addFiles(fileInput.files);
        fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (event) {
            event.preventDefault();
            if (!importing) {
                dropZone.classList.add("is-dragging");
            }
        });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (event) {
            event.preventDefault();
            dropZone.classList.remove("is-dragging");
        });
    });

    dropZone.addEventListener("drop", function (event) {
        if (!importing && event.dataTransfer) {
            addFiles(event.dataTransfer.files);
        }
    });

    closeButton.addEventListener("click", function () {
        if (!importing && typeof window.showPreviousAppPage === "function") {
            window.showPreviousAppPage();
        }
    });

    startButton.addEventListener("click", function () {

        if (importing) {
            return;
        }

        if (files.length === 0) {
            setMessage("Select at least one CSV or XLSX file to import.", "error");
            return;
        }

        importing = true;
        startButton.disabled = true;
        closeButton.disabled = true;
        startButton.textContent = "Importing...";
        setMessage("Uploading and validating CSV and Excel files...", "");
        renderFiles();

        const formData = new FormData();
        formData.append(
            "jobId",
            document.getElementById("bulkJobId").textContent
        );
        files.forEach(function (item) {
            formData.append("files", item.file, item.file.name);
        });

        const request = new XMLHttpRequest();
        request.open("POST", "/api/employees/import");

        request.upload.addEventListener("progress", function (event) {
            if (!event.lengthComputable) {
                return;
            }

            const percent = Math.floor(
                (event.loaded / event.total) * 100
            );

            files.forEach(function (item) {
                item.progress = percent;
            });
            renderFiles();
        });

        request.addEventListener("load", function () {

            let result;

            try {
                result = JSON.parse(request.responseText);
            } catch (error) {
                setMessage(
                    "The server returned an invalid response. Please try again.",
                    "error"
                );
                finishImport();
                return;
            }

            if (request.status < 200 || request.status >= 300) {
                const details = Array.isArray(result.errors)
                    ? " " + result.errors.join(" ")
                    : "";
                setMessage(
                    (result.error || "Import failed.") + details,
                    "error"
                );
                finishImport();
                return;
            }

            files.forEach(function (item) {
                item.progress = 100;
            });
            renderFiles();
            setMessage(
                "Import completed successfully. "
                    + result.importedCount
                    + " employee record(s) imported.",
                "success"
            );
            window.dispatchEvent(new Event("employeesupdated"));
            if (typeof window.updateDashboard === "function") {
                window.updateDashboard();
            }
            finishImport();
        });

        request.addEventListener("error", function () {
            setMessage(
                "Could not reach the server. No import was confirmed.",
                "error"
            );
            finishImport();
        });

        request.addEventListener("abort", function () {
            setMessage("The import request was cancelled.", "error");
            finishImport();
        });

        request.send(formData);
    });

    exportButton.addEventListener("click", async function () {

        if (exporting) {
            return;
        }

        exporting = true;
        exportButton.disabled = true;
        exportButton.textContent = "Preparing export...";
        setExportMessage("Fetching employee records...", "");

        try {

            const format = exportFormat.value;
            const response = await fetch(
                "/api/employees/export?format=" + encodeURIComponent(format)
            );

            if (!response.ok) {
                let errorMessage = "Export failed. Please try again.";

                try {
                    const errorBody = await response.json();
                    errorMessage = errorBody.error || errorMessage;
                } catch (error) {
                    console.error("Could not read export error:", error);
                }

                throw new Error(errorMessage);
            }

            const fileBlob = await response.blob();

            if (fileBlob.size === 0) {
                throw new Error("The server returned an empty export file.");
            }

            const extension = format === "xlsx" ? "xlsx" : "csv";
            const filename = "employees_export." + extension;
            const objectUrl = URL.createObjectURL(fileBlob);
            const downloadLink = document.createElement("a");

            downloadLink.href = objectUrl;
            downloadLink.download = filename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            window.setTimeout(function () {
                URL.revokeObjectURL(objectUrl);
            }, 1000);

            setExportMessage(
                "Download started: " + filename,
                "success"
            );

        } catch (error) {
            setExportMessage(error.message, "error");
        } finally {
            exporting = false;
            exportButton.disabled = false;
            exportButton.textContent = "Export All Employees";
        }
    });

     // Download Blank Excel Template
document.getElementById("bulkTemplateButton")?.addEventListener("click", async function () {
    const message = document.getElementById("bulkTemplateMessage");
    const button = document.getElementById("bulkTemplateButton");

    try {
        button.disabled = true;
        message.textContent = "Preparing Excel template...";
        message.classList.remove("is-error", "is-success");

        const response = await fetch("/api/employees/import-template");

        if (!response.ok) {
            let errorMessage = "Could not download the template.";
            try {
                const result = await response.json();
                errorMessage = result.error || errorMessage;
            } catch (error) {
                console.error("Could not read template error response:", error);
            }
            throw new Error(errorMessage);
        }

        const blob = await response.blob();
        if (blob.size === 0) {
            throw new Error("The server returned an empty template.");
        }
        const downloadUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "employee_import_template.xlsx";

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(function () {
            URL.revokeObjectURL(downloadUrl);
        }, 1000);

        message.textContent = "Excel template downloaded successfully!";
        message.classList.add("is-success");
    } catch (error) {
        message.textContent = "Template download failed: " + error.message;
        message.classList.add("is-error");
        console.error("Template download error:", error);
    } finally {
        button.disabled = false;
    }
});



    function finishImport() {
        importing = false;
        startButton.disabled = false;
        closeButton.disabled = false;
        startButton.textContent = "Start Import";
        renderFiles();
    }

    renderFiles();

});