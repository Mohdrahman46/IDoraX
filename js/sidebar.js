// Wait until the HTML has loaded.
document.addEventListener("DOMContentLoaded", function () {

    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menuToggle");
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");
    const navLinks = document.querySelectorAll(".nav-link");
    const pageSections = document.querySelectorAll(".page-section");
    const pageTitle = document.getElementById("pageTitle");
    const breadcrumbPage = document.getElementById("breadcrumbPage");
    const settingsOverview = document.getElementById("settingsOverview");
    const brandingView = document.getElementById("branding");
    let previousPage = "dashboard";

    // Page names displayed in the top bar.
    const pageTitles = {
        dashboard: "Dashboard",
        "create-id": "Create Employee ID",
        "bulk-generator": "Bulk ID Generator",
        employees: "Employee List",
        branding: "Company Branding",
        settings: "Settings"
    };

    // Show the selected page.
    function showPage(pageId) {

        const isBrandingView = pageId === "branding";
        const sectionId = isBrandingView ? "settings" : pageId;
        const selectedPage = document.getElementById(sectionId);

        if (!selectedPage || !selectedPage.classList.contains("page-section")) {
            return;
        }

        const currentPage = document.querySelector(".page-section.active");

        if (currentPage && currentPage.id !== sectionId) {
            previousPage = currentPage.id;
        }

        // Hide other pages.
        pageSections.forEach(function (section) {
            section.classList.toggle("active", section.id === sectionId);
        });

        // Highlight the selected sidebar item.
        navLinks.forEach(function (link) {
            const isCurrentPage = link.dataset.page === sectionId;
            link.classList.toggle("active", isCurrentPage);
            if (isCurrentPage) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });

        // Update the page heading.
        const title = pageTitles[sectionId] || "Dashboard";
        if (pageTitle) {
            pageTitle.textContent = title;
        }
        if (breadcrumbPage) {
            breadcrumbPage.textContent = isBrandingView
                ? "Company Branding"
                : title;
        }
        if (settingsOverview) {
            settingsOverview.hidden = isBrandingView;
        }
        if (brandingView) {
            brandingView.hidden = !isBrandingView;
        }

        // Close the sidebar on mobile.
        setSidebarOpen(false);

        // Update the URL.
        if (window.location.hash !== "#" + pageId) {
            window.history.replaceState(null, "", "#" + pageId);
        }
    }

    function setSidebarOpen(isOpen) {
        if (sidebar) {
            sidebar.classList.toggle("open", isOpen);
        }
        if (menuToggle) {
            menuToggle.setAttribute("aria-expanded", String(isOpen));
            menuToggle.setAttribute(
                "aria-label",
                isOpen ? "Close navigation menu" : "Open navigation menu"
            );
        }
        if (sidebarBackdrop) {
            sidebarBackdrop.hidden = !isOpen;
        }
    }

    // Sidebar navigation clicks.
    navLinks.forEach(function (link) {

        link.addEventListener("click", function (event) {

            event.preventDefault();

            showPage(link.dataset.page);

        });

    });

    // Dashboard buttons that navigate to another page.
    document.querySelectorAll("[data-page]").forEach(function (button) {

        if (button.classList.contains("nav-link")) {
            return;
        }

        button.addEventListener("click", function () {

            showPage(button.dataset.page);

        });

    });

    // Mobile sidebar toggle.
    if (menuToggle) {

        menuToggle.addEventListener("click", function () {
            setSidebarOpen(!sidebar.classList.contains("open"));
        });
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener("click", function () {
            setSidebarOpen(false);
            menuToggle.focus();
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && sidebar && sidebar.classList.contains("open")) {
            setSidebarOpen(false);
            menuToggle.focus();
        }
    });

    // Open the page specified in the URL.
    const initialPage = window.location.hash.substring(1);

    if (initialPage && document.getElementById(initialPage)) {
        showPage(initialPage);
    } else {
        showPage("dashboard");
    }

    // Allow other JavaScript files to navigate between pages.
    window.showAppPage = showPage;
    window.showPreviousAppPage = function () {
        showPage(previousPage || "dashboard");
    };

});