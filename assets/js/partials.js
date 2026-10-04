(() => {
  async function loadPartial(selector, url) {
    const mount = document.querySelector(selector);
    if (!mount) return;

    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      mount.outerHTML = html;
    } catch (error) {
      console.error(`Unable to load shared partial: ${url}`, error);
      mount.setAttribute("data-partial-error", "true");
    }
  }

  function initSharedHeader() {
    const menuButton = document.querySelector("#menu-button");
    const primaryNav = document.querySelector("#primary-nav");

    if (menuButton && primaryNav && !menuButton.dataset.sharedNavReady) {
      menuButton.dataset.sharedNavReady = "true";
      menuButton.addEventListener("click", () => {
        const open = primaryNav.classList.toggle("open");
        menuButton.setAttribute("aria-expanded", String(open));
      });

      primaryNav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          primaryNav.classList.remove("open");
          menuButton.setAttribute("aria-expanded", "false");
        });
      });
    }

    const pathname = window.location.pathname.replace(/\/+$/, "/");
    if (pathname === "/gallery/" || pathname.startsWith("/gallery/")) {
      const galleryLink = document.querySelector('[data-nav-page="gallery"]');
      galleryLink?.setAttribute("aria-current", "page");
    }
  }

  function initSharedFooter() {
    document.querySelectorAll("[data-current-year]").forEach((el) => {
      el.textContent = new Date().getFullYear();
    });
  }

  async function initSharedPartials() {
    await Promise.all([
      loadPartial("[data-shared-header]", "/partials/header.html"),
      loadPartial("[data-shared-footer]", "/partials/footer.html"),
    ]);

    initSharedHeader();
    initSharedFooter();
    document.dispatchEvent(new CustomEvent("pose:partials-ready"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSharedPartials, { once: true });
  } else {
    initSharedPartials();
  }
})();
