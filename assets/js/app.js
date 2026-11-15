// Shared header menu behavior is owned by assets/js/partials.js.
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

const packageServices = {
  "Photobooth 4R": "Classic Photobooth", "Photobooth Strip": "Classic Photobooth",
  "Photobooth Dedication": "Classic Photobooth", "Photobooth Polaroid": "Classic Photobooth",
  "Signature Booth": "Premium Photobooth", "Photoman Unlimited": "Photoman",
  "Photoman Premium": "Photoman", "Studio Promo": "Onsite Photo Studio",
  "360 Package": "360 Video Booth", "AI Photobooth": "AI Photobooth",
  "Event Photography Inquiry": "Event Photography", "Trading Card Photobooth": "Trading Card Photobooth",
  "Photoman + Free Video Guestbook": "Event Bundles",
  "Photobooth + Event Photographer": "Event Bundles",
  "360 Video Booth + Classic Photobooth": "Event Bundles",
  "Photobooth + Free Video Guestbook": "Event Bundles",
  "POSE Celebration — Classic Photobooth + Projector (₱5,999)": "Event Bundles",
  "POSE Memories — Event Photography + Projector (₱5,999)": "Event Bundles",
  "POSE Interactive — Photoman + Projector + Free Video Guestbook (₱7,999)": "Event Bundles",
  "Projector Presentation Add-on (+₱2,500)": "Event Add-ons"
};
document.querySelectorAll("[data-package]").forEach((link) =>
  link.addEventListener("click", () => {
    if (packageSelect && link.dataset.package) {
      const selected = link.dataset.package;
      if (![...packageSelect.options].some(o => o.value === selected)) packageSelect.add(new Option(selected, selected));
      packageSelect.value = selected;
    }
    const serviceSelect = form?.querySelector('[name="service"]');
    if (serviceSelect) serviceSelect.value = link.dataset.service || packageServices[link.dataset.package] || "";
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

  const endpoint = window.POSE_INQUIRY?.endpoint?.trim();
  if (!endpoint) {
    setFormMessage(
      "Online inquiry is not configured yet. Please message POSE on Facebook instead.",
      "error",
    );
    return;
  }

  const data = new FormData(form);
  if (data.get("website")) return; // honeypot

  const payload = new URLSearchParams();
  for (const [key, value] of data.entries()) payload.append(key, String(value));
  payload.set("submissionId", submissionId());
  payload.set("source", location.href.split("#")[0]);
  payload.set("submittedAt", new Date().toISOString());

  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";
  setFormMessage("Sending your inquiry…");

  try {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        body: payload,
        redirect: "follow",
      });
      if (response.type !== "opaque" && !response.ok)
        throw new Error("HTTP " + response.status);
      if (response.type !== "opaque") {
        const result = await response.json().catch(() => null);
        if (result && result.ok === false)
          throw new Error(result.error || "Submission failed");
      }
    } catch (firstError) {
      // Apps Script may not expose CORS response headers in every hosting setup.
      // A no-cors retry still delivers the form to the Web App.
      await fetch(endpoint, { method: "POST", body: payload, mode: "no-cors" });
    }

    // A no-cors response is opaque and cannot prove server acceptance.
    const receiptStatus = response?.type === 'opaque' || !response ? 'unverified' : 'http_ok';
    poseTrack('pose_inquiry_posted', {package_name: String(data.get('package') || ''), receipt_status: receiptStatus});
    form.reset();
    setFormMessage(
      "Your inquiry was submitted. If you don’t receive a confirmation, please message POSE on Facebook to verify receipt.",
      "success",
    );
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

// Keep the service and package aligned whether selected from a CTA or directly.
const serviceSelect = form?.querySelector('[name="service"]');
serviceSelect?.addEventListener('change', () => {
  if (!packageSelect) return;
  const options = Object.entries(packageServices).filter(([, service]) => service === serviceSelect.value);
  if (options.length === 1) packageSelect.value = options[0][0];
  else if (packageServices[packageSelect.value] !== serviceSelect.value) packageSelect.value = '';
});
packageSelect?.addEventListener('change', () => {
  if (serviceSelect && packageServices[packageSelect.value]) serviceSelect.value = packageServices[packageSelect.value];
});

// Small, client-side guide to help visitors choose existing packages.
(() => {
  const goal = document.querySelector('#finderGoal');
  const budget = document.querySelector('#finderBudget');
  const result = document.querySelector('#finderResult');
  const inquire = document.querySelector('#finderInquire');
  if (!goal || !budget || !result || !inquire) return;
  const options = {
    prints: {low:['Photobooth 4R','₱2,999 · 2 hours'],mid:['Photobooth + Event Photographer','₱5,000 · 2 hrs photobooth + 3 hrs photography'],high:['360 Video Booth + Classic Photobooth','₱15,000 · 3 hrs each']},
    roaming: {low:['Photoman Unlimited','See current standalone package'],mid:['Photoman + Free Video Guestbook','₱5,500 · 2 hours + video greetings'],high:['POSE Interactive — Photoman + Projector + Free Video Guestbook (₱7,999)','₱7,999 · Photoman, projector & video guestbook']},
    coverage: {low:['Event Photography Inquiry','₱3,000 · up to 3 hours'],mid:['POSE Memories — Event Photography + Projector (₱5,999)','₱5,999 · Photography + multimedia'],high:['POSE Memories — Event Photography + Projector (₱5,999)','₱5,999 · Photography + multimedia']},
    video: {low:['360 Package','360 video booth · ask about available options'],mid:['360 Package','360 video booth · ask about available options'],high:['360 Video Booth + Classic Photobooth','₱15,000 · 3 hrs each']}
  };
  const update = () => {
    const [name, detail] = options[goal.value][budget.value];
    result.querySelector('strong').textContent = name;
    result.querySelector('span').textContent = detail;
    inquire.dataset.package = name;
    inquire.dataset.service = packageServices[name] || (name === 'Event Photography Inquiry' ? 'Event Photography' : 'Event Bundles');
  };
  goal.addEventListener('change',update); budget.addEventListener('change',update); update();
  inquire.addEventListener('click', () => {
    if (packageSelect) {
      if (![...packageSelect.options].some(o => o.value === inquire.dataset.package)) packageSelect.add(new Option(inquire.dataset.package,inquire.dataset.package));
      packageSelect.value = inquire.dataset.package;
    }
    const serviceField = form?.querySelector('[name="service"]');
    if (serviceField) serviceField.value = inquire.dataset.service;
  });
})();


// V2.1: optional conversion events. The website does not load GA4/Meta Pixel by default.
// If an analytics platform is configured with the appropriate privacy notice/consent,
// it may listen for these dataLayer or custom events. No contact information is emitted.
function poseTrack(eventName, parameters = {}) {
  const detail = {event: eventName, ...parameters};
  window.dispatchEvent(new CustomEvent('pose:analytics', {detail}));
  if (Array.isArray(window.dataLayer)) window.dataLayer.push(detail);
}

// Accessible portfolio category buttons (the old category labels were non-interactive).
const poseGalleryFilters = document.querySelectorAll('[data-gallery-filter]');
poseGalleryFilters.forEach(button => button.addEventListener('click', () => {
  const category = button.dataset.galleryFilter;
  poseGalleryFilters.forEach(item => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-gallery-category]').forEach(card => {
    card.hidden = category !== 'all' && card.dataset.galleryCategory !== category;
  });
  poseTrack('pose_gallery_filter', {category});
}));

document.querySelectorAll('[data-package]').forEach(link => link.addEventListener('click', () => {
  poseTrack('pose_package_inquiry_click', {package_name: link.dataset.package || 'unspecified'});
}));
document.querySelectorAll('a[href*="m.me/"], a[href*="facebook.com/pose.photobooth"]').forEach(link => {
  link.addEventListener('click', () => poseTrack('pose_messenger_click', {placement: link.className || 'link'}));
});
