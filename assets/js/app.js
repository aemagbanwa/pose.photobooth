const menu = document.querySelector(".menu");
const nav = document.querySelector("#primary-nav");
menu?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menu.setAttribute("aria-expanded", open);
});
document
  .querySelectorAll("#primary-nav a")
  .forEach((a) =>
    a.addEventListener("click", () => nav.classList.remove("open")),
  );
const yearEl = document.querySelector("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

document.querySelectorAll(".package-carousel-shell").forEach((shell) => {
  const carousel = shell.querySelector(".package-carousel");
  const cards = carousel?.querySelectorAll(".price-card");
  if (!carousel || !cards?.length) return;
  const controls = [...shell.querySelectorAll("[data-carousel-direction]")];
  const status = shell.querySelector(".carousel-status");
  const updateCarouselState = () => {
    const maxScroll = carousel.scrollWidth - carousel.clientWidth;
    const atStart = carousel.scrollLeft <= 2;
    const atEnd = carousel.scrollLeft >= maxScroll - 2;
    controls.forEach((button) => {
      const isNext = button.dataset.carouselDirection === "next";
      button.disabled = isNext ? atEnd : atStart;
      button.setAttribute("aria-disabled", String(button.disabled));
    });
    const step = cards[0].getBoundingClientRect().width + 18;
    const current = Math.min(
      cards.length,
      Math.max(1, Math.round(carousel.scrollLeft / step) + 1),
    );
    if (status) status.textContent = `Package ${current} of ${cards.length}`;
  };
  controls.forEach((button) =>
    button.addEventListener("click", () => {
      const direction = button.dataset.carouselDirection === "next" ? 1 : -1;
      const distance = cards[0].getBoundingClientRect().width + 18;
      carousel.scrollBy({ left: direction * distance, behavior: "smooth" });
    }),
  );
  carousel.addEventListener("scroll", updateCarouselState, { passive: true });
  window.addEventListener("resize", updateCarouselState);
  updateCarouselState();
});

// Keep same-page navigation reliable during local preview and on the live site.
document.querySelectorAll('a[href^="#"]').forEach((a) =>
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href").slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      history.replaceState(null, "", "#" + id);
    } catch (_) {}
  }),
);

const form = document.querySelector("#leadForm");
const formHelp = document.querySelector("#formHelp");
const submitBtn = form?.querySelector('button[type="submit"]');
const packageSelect = document.querySelector("#packageSelect");

document.querySelectorAll("[data-package]").forEach((link) =>
  link.addEventListener("click", () => {
    if (packageSelect) packageSelect.value = link.dataset.package;
  }),
);

function setFormMessage(message, type = "info") {
  if (!formHelp) return;
  formHelp.textContent = message;
  formHelp.classList.remove("success", "error");
  if (type === "success") formHelp.classList.add("success");
  if (type === "error") formHelp.classList.add("error");
}

function submissionId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "pose-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  if (data.get("website")) return; // honeypot

  const payload = Object.fromEntries(data.entries());
  payload.consent = data.get("consent") === "yes";
  payload.submissionId = submissionId();
  payload.source = location.href.split("#")[0];
  payload.submittedAt = new Date().toISOString();

  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";
  setFormMessage("Sending your inquiry…");

  try {
    const response = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok)
      throw new Error(result?.error || "Inquiry submission failed.");

    form.reset();
    const successMessage =
      result.boothmateSynced === false
        ? "We received your inquiry, but Boothmate is not connected yet. Your details were saved, and the POSE team will follow up."
        : result.legacySynced === false
          ? "Your inquiry was saved to Boothmate, but the email and spreadsheet backup did not sync. The POSE team will follow up."
          : "Inquiry sent. Thank you! POSE has received your event details. If you provided an email address, a confirmation has also been sent there.";
    setFormMessage(successMessage, "success");
  } catch (err) {
    console.error("Inquiry submission failed:", err);
    setFormMessage(
      "We could not send your inquiry right now. Please try again, or message POSE Photobooth on Facebook.",
      "error",
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
});
