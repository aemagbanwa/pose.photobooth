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

// Single source of truth for inquiry categories, package choices and indicative pricing.
// Keep the package IDs unchanged for compatibility with existing CTA links and inquiry backend.
const POSE_PACKAGES = [
  ['Photobooth 4R', 'Classic Photobooth', 2999, 1000, '4R Photobooth · ₱2,999'],
  ['Photobooth Strip', 'Classic Photobooth', 3499, 1000, 'Strip Photobooth · ₱3,499'],
  ['Photobooth Dedication', 'Classic Photobooth', 3499, 1000, 'Dedication Photobooth · ₱3,499'],
  ['Photobooth Polaroid', 'Classic Photobooth', 3999, 1500, 'Polaroid Photobooth · ₱3,999'],
  ['Signature Booth', 'Signature Photobooth', 6999, 1500, 'Signature Photobooth · ₱6,999'],
  ['Photoman Unlimited', 'Photoman', 4999, 1500, 'Photoman Unlimited · ₱4,999'],
  ['Photoman Premium', 'Photoman', 7499, 2000, 'Photoman Premium · ₱7,499'],
  ['360 Package', '360 Video Booth', 12000, 2000, '360 Video Booth · ₱12,000'],
  ['Trading Card Photobooth', 'Trading Card Photobooth', 9999, null, 'Trading Card Photobooth · ₱9,999'],
  ['Event Photography Inquiry', 'Event Photography', 3000, null, 'Event Photography (up to 3 hrs) · ₱3,000'],
  ['Studio Promo', 'On-site Photo Studio', 7999, 2000, 'On-site Photo Studio · ₱7,999'],
  ['AI Photobooth', 'AI Photobooth', null, null, 'AI Photobooth · Price on request'],
  ['Photoman + Free Video Guestbook', 'Event Bundles', 5500, null, 'Photoman + Free Video Guestbook · ₱5,500'],
  ['Photobooth + Event Photographer', 'Event Bundles', 5000, null, 'Photobooth + Event Photography · ₱5,000'],
  ['360 Video Booth + Classic Photobooth', 'Event Bundles', 15000, null, '360 + Classic Photobooth · ₱15,000'],
  ['Photobooth + Free Video Guestbook', 'Event Bundles', 5000, null, 'Photobooth + Free Video Guestbook · ₱5,000'],
  ['POSE Celebration — Classic Photobooth + Projector (₱5,999)', 'Event Bundles', 5999, null, 'POSE Celebration: Classic + Projector · ₱5,999'],
  ['POSE Memories — Event Photography + Projector (₱5,999)', 'Event Bundles', 5999, null, 'POSE Memories: Photography + Projector · ₱5,999'],
  ['POSE Interactive — Photoman + Projector + Free Video Guestbook (₱7,999)', 'Event Bundles', 7999, null, 'POSE Interactive: Photoman + Projector + Guestbook · ₱7,999'],
  ['Help Me Choose', 'Not sure yet', null, null, 'Help me choose a package']
].map(([id, category, price, extraHourRate, label]) => ({id, category, price, extraHourRate, label}));
const posePackageById = new Map(POSE_PACKAGES.map(p => [p.id, p]));
const packageServices = Object.fromEntries(POSE_PACKAGES.map(p => [p.id, p.category]));
const serviceSelect = form?.querySelector('[name="service"]');
const packageHint = document.getElementById('packageHint');
function populatePackages(category, selectedId = '') {
  if (!packageSelect) return;
  packageSelect.replaceChildren();
  const options = POSE_PACKAGES.filter(p => p.category === category);
  if (!options.length) {
    packageSelect.add(new Option('Choose a service category first', ''));
    packageSelect.disabled = true;
    if (packageHint) packageHint.textContent = 'Select a service above to view packages.';
    packageSelect.dispatchEvent(new Event('change', {bubbles:true}));
    return;
  }
  packageSelect.disabled = false;
  packageSelect.add(new Option('Select a package', ''));
  options.forEach(p => packageSelect.add(new Option(p.label, p.id)));
  packageSelect.value = options.some(p=>p.id === selectedId) ? selectedId : (category === 'Not sure yet' ? 'Help Me Choose' : '');
  if (packageHint) packageHint.textContent = category === 'Not sure yet'
    ? 'Tell us about your event and POSE will recommend a package.'
    : `${options.length} available ${options.length === 1 ? 'package' : 'packages'} for ${category}.`;
  packageSelect.dispatchEvent(new Event('change', {bubbles:true}));
}
function selectPosePackage(id) {
  const p = posePackageById.get(id);
  if (!p || !serviceSelect) return false;
  serviceSelect.value = p.category;
  populatePackages(p.category, id);
  return true;
}
serviceSelect?.addEventListener('change', () => populatePackages(serviceSelect.value));
// CTA and finder links may be inserted dynamically; delegate clicks to preserve their selections.
document.addEventListener('click', e => {
  const link = e.target.closest('[data-package]');
  if (!link) return;
  if (link.dataset.package === 'Projector Presentation Add-on (+₱2,500)') {
    // The projector is an add-on, not a standalone primary package.
    if (packageHint) packageHint.textContent = 'Select a primary package, then tick the projector add-on below.';
    document.getElementById('addonProjector')?.focus();
    return;
  }
  const selected = selectPosePackage(link.dataset.package);
  if (selected && link.dataset.souvenir) {
    const souvenir = document.getElementById('quoteSouvenir');
    if (souvenir && !souvenir.disabled) {
      souvenir.value = link.dataset.souvenir;
      souvenir.dispatchEvent(new Event('change', {bubbles:true}));
    }
  }
});
populatePackages(serviceSelect?.value || '');
form?.addEventListener('reset', () => setTimeout(() => populatePackages(serviceSelect?.value || ''), 0));

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

// V2.3 review step: customers explicitly confirm their summary before the existing submission runs.
const poseReviewDialog = document.getElementById('poseReviewDialog');
const poseReviewFields = document.getElementById('poseReviewFields');
let poseReviewApproved = false;
const reviewFieldNames = [
  ['name', 'Client'], ['contact', 'Mobile / Messenger'], ['email', 'Email'],
  ['date', 'Event date'], ['type', 'Event type'], ['location', 'Venue / location'],
  ['service', 'Service'], ['package', 'Selected package'], ['addons', 'Requested add-ons'],
  ['extraHours', 'Extra hours']
];
function populatePoseReview() {
  if (!form || !poseReviewFields) return;
  const data = new FormData(form);
  const rows = reviewFieldNames.map(([key, label]) => {
    let value = String(data.get(key) || '').trim();
    if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      value = new Intl.DateTimeFormat('en-PH', {year:'numeric',month:'long',day:'numeric'}).format(new Date(year,month-1,day));
    }
    if (key === 'extraHours') value = value === '0' || !value ? 'None' : value;
    if (key === 'addons' && !value) value = 'None';
    if (!value) value = 'Not provided';
    return [label, value];
  });
  poseReviewFields.replaceChildren();
  rows.forEach(([label, value]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    poseReviewFields.append(dt, dd);
  });
  document.getElementById('poseReviewTotal').textContent = String(data.get('estimate') || 'Price on request');
}
form?.addEventListener('input', () => { poseReviewApproved = false; });
form?.addEventListener('change', () => { poseReviewApproved = false; });
document.getElementById('poseReviewEdit')?.addEventListener('click', () => poseReviewDialog?.close());
document.getElementById('poseReviewConfirm')?.addEventListener('click', () => {
  if (!form || !form.reportValidity()) { poseReviewDialog?.close(); return; }
  poseReviewApproved = true;
  poseReviewDialog?.close();
  form.requestSubmit();
});
poseReviewDialog?.addEventListener('close', () => {
  if (!poseReviewApproved) submitBtn?.focus();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  if (!poseReviewApproved && poseReviewDialog?.showModal) {
    populatePoseReview();
    poseReviewDialog.showModal();
    poseTrack('pose_inquiry_review_opened', {package_name: packageSelect?.value || ''});
    return;
  }
  poseReviewApproved = false; // A later attempt must always require a fresh review.

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
  // The delegated CTA listener handles synchronization for package recommendations.

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


// V2.2: transparent, client-side indicative prices; not a payment or booking system.
(() => {
  const prices = Object.fromEntries(POSE_PACKAGES.map(p => [p.id, [p.price, p.extraHourRate]]));
  const $ = id => document.getElementById(id);
  const opt = { projector:$('addonProjector'), enclosure:$('addonEnclosure'), magnets:$('addonMagnets'), video:$('addonVideoGuestbook') };
  const souvenir = $('quoteSouvenir');
  const souvenirPrices = {keychain50:2500,keychain100:4000,magnet50:3000,magnet100:5000};
  const souvenirLabels = {keychain50:'50 acrylic keychain souvenir sets',keychain100:'100 acrylic keychain souvenir sets',magnet50:'50 magnetic strip + acrylic keychain souvenir sets',magnet100:'100 magnetic strip + acrylic keychain souvenir sets'};
  const hours = $('quoteExtraHours');
  const format = amount => '₱' + amount.toLocaleString('en-PH');
  function updateQuote() {
    const selected = packageSelect?.value || '';
    const base = prices[selected];
    const hasPublishedPrice = Number.isFinite(base?.[0]);
    const is360 = selected === '360 Package';
    const isPhotoman = selected === 'Photoman Unlimited' || selected === 'Photoman Premium';
    const includesProjector = /Projector/.test(selected);
    const includesGuestbook = /Video Guestbook/.test(selected);
    const standaloneProjector = selected === 'Projector Presentation Add-on (+₱2,500)';
    const setAvailable = (input, available) => {input.disabled = !available; if(!available) input.checked = false;};
    setAvailable(opt.projector, Boolean(selected && hasPublishedPrice && !includesProjector));
    setAvailable(opt.enclosure, is360);
    setAvailable(opt.magnets, isPhotoman);
    setAvailable(opt.video, Boolean(selected && hasPublishedPrice && !includesGuestbook && !standaloneProjector));
    const isStrip = selected === 'Photobooth Strip';
    // Hide unrelated add-ons entirely rather than displaying disabled controls.
    const visibleOptions = {
      projector: Boolean(selected && hasPublishedPrice && !includesProjector),
      enclosure: is360,
      magnets: isPhotoman,
      video: Boolean(selected && hasPublishedPrice && !includesGuestbook && !standaloneProjector)
    };
    Object.entries(opt).forEach(([key, input]) => { input.closest('.pose-quote-option').hidden = !visibleOptions[key]; });
    const relevant = $('poseRelevantAddons');
    if (relevant) relevant.hidden = !Object.values(visibleOptions).some(Boolean);
    $('souvenirQuoteWrap').hidden = !isStrip;
    $('souvenirQuantityPolicy').hidden = !(isStrip && souvenir.value);
    $('poseExtraHoursWrap').hidden = !Number.isFinite(base?.[1]);
    souvenir.disabled = !isStrip;
    if (!isStrip) souvenir.value = '';
    $('souvenirQuantityPolicy').hidden = !(isStrip && souvenir.value);
    const hourRate = base?.[1];
    hours.disabled = !Number.isFinite(hourRate);
    if (hours.disabled) hours.value = '0';
    $('quoteHourRate').textContent = Number.isFinite(hourRate)
      ? `${format(hourRate)} per additional hour of the selected primary service.`
      : 'Additional hours for this package are quoted on request.';
    let total = hasPublishedPrice ? base[0] : null;
    const additions = [];
    if (opt.projector.checked) {total += 2500; additions.push('Projector presentation (4 hours): +₱2,500');}
    if (opt.enclosure.checked) {total += 5000; additions.push('360 LED enclosure: +₱5,000');}
    if (opt.magnets.checked) {total += 1000; additions.push('Photoman magnets / 50 prints: +₱1,000');}
    if (opt.video.checked) additions.push('Video Guestbook: price on request');
    if (isStrip && souvenirPrices[souvenir.value]) {
      const cost = souvenirPrices[souvenir.value];
      total += cost;
      additions.push(`${souvenirLabels[souvenir.value]}: +${format(cost)}`);
    }
    const count = Number(hours.value) || 0;
    if (count && Number.isFinite(hourRate)) {total += count * hourRate; additions.push(`${count} additional hour(s): +${format(count * hourRate)}`);}
    $('quoteTotal').textContent = total == null ? (standaloneProjector ? 'Select a primary package' : selected ? 'Price on request' : 'Select a package') : format(total);
    $('quoteDetails').textContent = total == null ? 'Choose a priced package to calculate an estimate.' : `${posePackageById.get(selected)?.label || selected}: ${format(base[0])}${additions.length ? ' · ' + additions.join(' · ') : ' · No extras selected'}`;
    $('quoteAddonsField').value = additions.join('; ');
    $('quoteEstimateField').value = total == null ? 'Price on request' : format(total) + (opt.video.checked ? ' + guestbook quote' : '');
    $('quoteExtraHoursField').value = String(count);
  }
  packageSelect?.addEventListener('change', updateQuote);
  Object.values(opt).forEach(el => el.addEventListener('change', updateQuote));
  hours?.addEventListener('change', updateQuote);
  souvenir?.addEventListener('change', updateQuote);
  // Finder buttons also populate the package; their handlers are registered earlier.
  form?.addEventListener('reset', () => setTimeout(updateQuote, 0));
  updateQuote();
})();
