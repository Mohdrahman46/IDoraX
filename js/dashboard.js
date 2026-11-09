let dashboardRequestId = 0;

async function updateDashboard() {
    const requestId = ++dashboardRequestId;
    const dashboard = document.getElementById("dashboard");
    const totalEmployees = document.getElementById("totalEmployees");
    const totalCards = document.getElementById("totalCards");
    const companyName = document.getElementById("dashboardCompanyName");
    const companyLogo = document.getElementById("dashboardCompanyLogo");
    const companyIcon = companyLogo
        ? companyLogo.closest(".stat-icon")
        : null;
    const companySymbol = companyIcon
        ? companyIcon.querySelector("svg")
        : null;
    const recentEmployees = document.getElementById("recentEmployees");
    const dashboardMessage = document.getElementById("dashboardMessage");

    function showCompanyLogo(logoUrl) {
        if (!companyLogo) {
            return;
        }

        companyLogo.onerror = null;
        companyLogo.hidden = true;
        companyLogo.removeAttribute("src");

        if (!logoUrl) {
            if (companySymbol) {
                companySymbol.removeAttribute("hidden");
            }
            return;
        }

        companyLogo.onerror = function () {
            if (companyLogo.getAttribute("src") !== logoUrl) {
                return;
            }
            companyLogo.onerror = null;
            companyLogo.removeAttribute("src");
            companyLogo.hidden = true;
            if (companySymbol) {
                companySymbol.removeAttribute("hidden");
            }
        };
        companyLogo.src = logoUrl;
        companyLogo.hidden = false;
        if (companySymbol) {
            companySymbol.setAttribute("hidden", "");
        }
    }

    if (dashboard) {
        dashboard.setAttribute("aria-busy", "true");
    }
    if (dashboardMessage) {
        dashboardMessage.textContent = "";
    }
    [totalEmployees, totalCards, companyName].forEach(function (element) {
        if (element) {
            element.textContent = "Loading";
        }
    });

    try {
        const response = await fetch("/api/dashboard");
        let result;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error("The server returned an invalid dashboard response.");
        }
        if (!response.ok) {
            throw new Error(
                result.error || "Could not load dashboard information."
            );
        }
        if (requestId !== dashboardRequestId) {
            return;
        }

        const numberFormatter = new Intl.NumberFormat();
        const formatCount = function (value) {
            const count = Number(value);
            return Number.isFinite(count)
                ? numberFormatter.format(count)
                : "Unavailable";
        };

        const updateCount = function (element, value) {
            if (!element) {
                return;
            }

            const count = Number(value);
            if (!Number.isFinite(count)) {
                element.textContent = "Unavailable";
                return;
            }

            const formattedCount = formatCount(count);
            if (
                element.dataset.countAnimated === "true" ||
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ) {
                element.textContent = formattedCount;
                element.dataset.countAnimated = "true";
                return;
            }

            element.dataset.countAnimated = "true";
            const startTime = performance.now();
            const duration = 650;
            const animate = function (currentTime) {
                if (requestId !== dashboardRequestId) {
                    return;
                }

                const progress = Math.min((currentTime - startTime) / duration, 1);
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                element.textContent = numberFormatter.format(
                    Math.round(count * easedProgress)
                );

                if (progress < 1) {
                    window.requestAnimationFrame(animate);
                } else {
                    element.textContent = formattedCount;
                }
            };

            window.requestAnimationFrame(animate);
        };

        updateCount(totalEmployees, result.totalEmployees);
        updateCount(totalCards, result.totalCards);
        if (companyName) {
            companyName.textContent =
                !result.companyName || result.companyName === "My Company"
                    ? "Not configured"
                    : result.companyName;
        }
        showCompanyLogo(result.companyLogoUrl);

        if (recentEmployees) {
            recentEmployees.replaceChildren();
            const records = Array.isArray(result.recentEmployees)
                ? result.recentEmployees
                : [];

            if (records.length === 0) {
                const row = document.createElement("tr");
                const cell = document.createElement("td");
                cell.colSpan = 4;
                cell.className = "empty-state";
                cell.textContent =
                    "No employee records yet. Create an employee ID to get started.";
                row.appendChild(cell);
                recentEmployees.appendChild(row);
            } else {
                records.forEach(function (employee) {
                    const row = document.createElement("tr");
                    [
                        employee.employeeName || "Unnamed employee",
                        employee.employeeId || "—",
                        employee.department || "—",
                        employee.jobTitle || "—"
                    ].forEach(function (value) {
                        const cell = document.createElement("td");
                        cell.textContent = value;
                        row.appendChild(cell);
                    });
                    recentEmployees.appendChild(row);
                });
            }
        }
    } catch (error) {
        if (requestId !== dashboardRequestId) {
            return;
        }
        console.error("Dashboard error:", error);
        [totalEmployees, totalCards].forEach(function (element) {
            if (element) {
                element.textContent = "Unavailable";
            }
        });
        if (companyName) {
            companyName.textContent = "Unavailable";
        }
        showCompanyLogo("");
        if (dashboardMessage) {
            dashboardMessage.textContent =
                "Dashboard information could not be loaded. " + error.message;
        }
        if (recentEmployees) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 4;
            cell.className = "empty-state";
            cell.textContent =
                "Recent employee records could not be loaded.";
            row.appendChild(cell);
            recentEmployees.replaceChildren(row);
        }
    } finally {
        if (requestId === dashboardRequestId && dashboard) {
            dashboard.setAttribute("aria-busy", "false");
        }
    }
}

document.addEventListener("DOMContentLoaded", updateDashboard);
window.updateDashboard = updateDashboard;
window.addEventListener("employeesupdated", updateDashboard);
window.addEventListener("companybrandingupdated", updateDashboard);
