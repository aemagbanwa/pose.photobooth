(() => {
  "use strict";

  const config = window.POSE_GALLERY || {};
  const state = {
    photos: [],
    collections: [],
    visible: [],
    eventFilter: "all",
    search: "",
    sort: "newest",
    currentCollection: null,
    currentIndex: 0,
    visibleEntries: []
  };

  const els = {
    header: document.querySelector("[data-header]"),
    grid: document.querySelector("#collection-grid"),
    loading: document.querySelector("#loading-state"),
    empty: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyCopy: document.querySelector("#empty-copy"),
    clear: document.querySelector("#clear-filters"),
    count: document.querySelector("#results-count"),
    search: document.querySelector("#search"),
    sort: document.querySelector("#sort"),
    eventFilters: document.querySelector("#event-filters"),
    viewer: document.querySelector("#viewer"),
    viewerImage: document.querySelector("#viewer-image"),
    viewerTitle: document.querySelector("#viewer-title"),
    viewerCaption: document.querySelector("#viewer-caption"),
    viewerCounter: document.querySelector("#viewer-counter"),
    viewerThumbs: document.querySelector("#viewer-thumbs"),
    viewerPrev: document.querySelector("#viewer-prev"),
    viewerNext: document.querySelector("#viewer-next"),
    viewerStage: document.querySelector("#viewer-stage"),
    share: document.querySelector("#share-photo"),
    toast: document.querySelector("#toast")
  };

  const CATEGORY_RULES = [
    ["birthday", /birthday|bday|turns?\s*\d+|\d+(st|nd|rd|th)/i],
    ["wedding", /wedding|nuptial|bride|groom/i],
    ["debut", /debut|18th/i],
    ["corporate", /corporate|company|year[- ]?end|christmas party|team/i]
  ];

  function value(source, keys, fallback = "") {
    for (const key of keys) {
      const found = source?.[key];
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return fallback;
  }

  function driveIdFrom(input = "") {
    const text = String(input);
    return text.match(/\/d\/([\w-]{10,})/)?.[1]
      || text.match(/[?&]id=([\w-]{10,})/)?.[1]
      || (/^[\w-]{20,}$/.test(text) ? text : "");
  }

  function imageUrl(item, size = 1800) {
    const direct = value(item, ["imageUrl", "image_url", "thumbnailUrl", "thumbnail", "url", "src", "link", "webContentLink"]);
    const id = value(item, ["id", "fileId", "file_id"], driveIdFrom(direct));
    if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`;
    return direct;
  }

  function cleanName(raw = "") {
    return String(raw)
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inferredEvent(name) {
    const cleaned = cleanName(name);
    if (/^(img|dsc|dscf|dscn|photo|pxl|pose)[\s-]*\d+$/i.test(cleaned)) return "Recent celebrations";
    const parts = cleaned.split(/\s[-–—|]\s|__|\s{2,}/).filter(Boolean);
    const candidate = parts[0]?.replace(/\s?\(?\d{1,4}\)?$/, "").trim();
    return candidate && candidate.length > 2 ? candidate : "Recent celebrations";
  }

  function eventDetails(item, rawName) {
    const explicit = value(item, ["event", "eventName", "event_name", "album", "collection", "folderName", "folder_name"]);
    const category = String(value(item, ["category"], "")).trim();
    const genericCategories = /^(birthday|wedding|debut|corporate|other|all)$/i;
    const source = explicit || (category && !genericCategories.test(category) ? category : "") || inferredEvent(rawName);
    const datedFolder = String(source).match(/^(\d{4})(\d{2})(\d{2})[\s_-]+(.+)$/);

    return {
      name: cleanName(datedFolder ? datedFolder[4] : source),
      date: datedFolder ? `${datedFolder[1]}-${datedFolder[2]}-${datedFolder[3]}` : ""
    };
  }

  function categoryFor(item, eventName) {
    const explicit = String(value(item, ["category", "eventType", "event_type", "type"], "")).toLowerCase();
    const haystack = `${explicit} ${eventName} ${value(item, ["name", "title", "filename"], "")}`;
    return CATEGORY_RULES.find(([, test]) => test.test(haystack))?.[0] || "other";
  }

  function normalizeItem(item, index, parent = {}) {
    if (typeof item === "string") item = { url: item };
    if (!item || typeof item !== "object") return null;
    const merged = { ...parent, ...item };
    const url = imageUrl(merged);
    if (!url) return null;
    const rawName = value(merged, ["name", "title", "filename", "fileName"], `POSE moment ${index + 1}`);
    const event = eventDetails(merged, rawName);
    const eventName = event.name;
    const dateValue = value(merged, ["eventDate", "event_date", "date"], "")
      || event.date
      || value(merged, ["createdTime", "created_at", "modifiedTime", "updated", "timestamp"], "");
    const date = dateValue ? new Date(dateValue) : null;
    return {
      id: String(value(merged, ["id", "fileId", "file_id"], `${eventName}-${index}`)),
      url,
      original: value(merged, ["originalUrl", "original_url", "webViewLink", "viewUrl"], url),
      name: cleanName(rawName),
      event: eventName || "Recent celebrations",
      category: categoryFor(merged, eventName),
      date: date && !Number.isNaN(date.valueOf()) ? date : null,
      dateRaw: dateValue,
      description: cleanName(value(merged, ["description", "caption", "alt"], ""))
    };
  }

  function extractPhotos(payload) {
    const roots = Array.isArray(payload) ? payload : [
      payload?.events,
      payload?.collections,
      payload?.albums,
      payload?.photos,
      payload?.images,
      payload?.files,
      payload?.items,
      payload?.data,
      payload?.results
    ].find(Array.isArray) || [];

    const flattened = [];
    roots.forEach((entry) => {
      const children = [entry?.photos, entry?.images, entry?.files, entry?.items].find(Array.isArray);
      if (children) children.forEach(child => flattened.push({ child, parent: entry }));
      else flattened.push({ child: entry, parent: {} });
    });

    return flattened
      .map(({ child, parent }, index) => normalizeItem(child, index, parent))
      .filter(Boolean);
  }

  function groupCollections(photos) {
    const groups = new Map();
    const maxItemsPerEvent = Number(config.maxItemsPerEvent || config.maxItems) || 100;
    photos.forEach((photo) => {
      const key = photo.event.toLowerCase();
      if (!groups.has(key)) groups.set(key, { title: photo.event, category: photo.category, date: photo.date, photos: [] });
      const group = groups.get(key);
      if (group.photos.length < maxItemsPerEvent) group.photos.push(photo);
      if (!group.date || (photo.date && photo.date > group.date)) group.date = photo.date;
      if (group.category === "other" && photo.category !== "other") group.category = photo.category;
    });
    return [...groups.values()];
  }

  function formatDate(date) {
    return date ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date) : "POSE Photobooth";
  }

  function categoryLabel(category) {
    return ({ birthday: "Birthday", wedding: "Wedding", debut: "Debut", corporate: "Corporate", other: "Celebration" })[category] || "Celebration";
  }

  function applyFilters() {
    const query = state.search.toLowerCase().trim();
    state.visible = state.collections.filter((collection) => {
      const categoryMatch = state.eventFilter === "all" || collection.title.toLowerCase() === state.eventFilter;
      const searchMatch = !query || `${collection.title} ${collection.category} ${collection.photos.map(p => p.name).join(" ")}`.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });

    state.visible.sort((a, b) => {
      if (state.sort === "name") return a.title.localeCompare(b.title);
      const aTime = a.date?.valueOf() || 0;
      const bTime = b.date?.valueOf() || 0;
      return state.sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
    render();
  }

  function photoMarkup(entry, index) {
    const { collection, photo } = entry;
    const label = `${collection.title}, photo ${entry.photoIndex + 1} of ${collection.photos.length}`;
    return `
      <article class="photo-tile photo-tile--${(index % 5) + 1}">
        <button class="photo-tile__button" type="button" data-entry-index="${index}" aria-label="Open ${escapeHtml(label)}">
          <img src="${escapeAttr(photo.url)}" alt="${escapeAttr(photo.description || `${collection.title} — POSE Photobooth`)}" loading="lazy" decoding="async">
          <span class="photo-tile__overlay">
            <span><strong>${escapeHtml(collection.title)}</strong><small>${escapeHtml(formatDate(collection.date))}</small></span>
            <i aria-hidden="true">↗</i>
          </span>
        </button>
      </article>`;
  }

  function renderEventFilters() {
    els.eventFilters.innerHTML = [
      `<button class="event-filter is-active" type="button" data-event="all" aria-pressed="true">All events</button>`,
      ...state.collections.map(collection => `<button class="event-filter" type="button" data-event="${escapeAttr(collection.title.toLowerCase())}" aria-pressed="false">${escapeHtml(collection.title)}</button>`)
    ].join("");

    els.eventFilters.querySelectorAll("[data-event]").forEach(button => button.addEventListener("click", () => {
      state.eventFilter = button.dataset.event;
      els.eventFilters.querySelectorAll("[data-event]").forEach(item => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      applyFilters();
    }));
  }

  function render() {
    els.loading.hidden = true;
    const hasResults = state.visible.length > 0;
    els.grid.hidden = !hasResults;
    els.empty.hidden = hasResults;

    if (hasResults) {
      state.visibleEntries = state.visible.flatMap(collection => collection.photos.map((photo, photoIndex) => ({ collection, photo, photoIndex })));
      els.grid.innerHTML = state.visibleEntries.map(photoMarkup).join("");
      els.grid.querySelectorAll("[data-entry-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const entry = state.visibleEntries[Number(button.dataset.entryIndex)];
          openViewer(entry.collection, entry.photoIndex);
        });
      });
    }

    const photoCount = state.visible.reduce((sum, collection) => sum + collection.photos.length, 0);
    els.count.textContent = hasResults
      ? `${state.visible.length} ${state.visible.length === 1 ? "event" : "events"} · ${photoCount} ${photoCount === 1 ? "moment" : "moments"}`
      : "No matching events";
  }

  function renderViewer() {
    const collection = state.currentCollection;
    const photo = collection?.photos[state.currentIndex];
    if (!photo) return;
    els.viewerImage.classList.add("is-changing");
    requestAnimationFrame(() => {
      els.viewerImage.src = photo.url;
      els.viewerImage.alt = photo.description || `${collection.title}, photo ${state.currentIndex + 1}`;
      els.viewerTitle.textContent = collection.title;
      els.viewerCaption.textContent = photo.description || formatDate(photo.date || collection.date);
      els.viewerCounter.textContent = `${String(state.currentIndex + 1).padStart(2,"0")} / ${String(collection.photos.length).padStart(2,"0")}`;
      els.viewerImage.onload = () => els.viewerImage.classList.remove("is-changing");
    });
    els.viewerPrev.disabled = collection.photos.length < 2;
    els.viewerNext.disabled = collection.photos.length < 2;
    els.viewerThumbs.innerHTML = collection.photos.map((item, index) => `
      <button class="viewer__thumb ${index === state.currentIndex ? "is-active" : ""}" type="button" data-view-index="${index}" aria-label="Show photo ${index + 1}">
        <img src="${escapeAttr(item.url)}" alt="" loading="lazy">
      </button>`).join("");
    els.viewerThumbs.querySelectorAll("[data-view-index]").forEach(button => {
      button.addEventListener("click", () => { state.currentIndex = Number(button.dataset.viewIndex); renderViewer(); });
    });
    els.viewerThumbs.querySelector(".is-active")?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function openViewer(collection, index = 0) {
    state.currentCollection = collection;
    state.currentIndex = index;
    renderViewer();
    document.body.classList.add("is-locked");
    els.viewer.showModal();
  }

  function closeViewer() {
    if (els.viewer.open) els.viewer.close();
    document.body.classList.remove("is-locked");
  }

  function moveViewer(direction) {
    const length = state.currentCollection?.photos.length || 0;
    if (length < 2) return;
    state.currentIndex = (state.currentIndex + direction + length) % length;
    renderViewer();
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
  }

  async function shareCurrent() {
    const photo = state.currentCollection?.photos[state.currentIndex];
    if (!photo) return;
    const shareData = { title: `${state.currentCollection.title} — POSE Photobooth`, text: "A moment captured by POSE Photobooth.", url: photo.original || photo.url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Photo link copied");
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast("Sharing is unavailable right now");
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function escapeAttr(value = "") { return escapeHtml(value); }

  async function loadGallery() {
    if (!config.endpoint) return showLoadError();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(config.endpoint, { method: "GET", mode: "cors", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Gallery request failed (${response.status})`);
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); }
      catch { throw new Error("Gallery returned an unexpected format"); }
      state.photos = extractPhotos(payload);
      state.collections = groupCollections(state.photos);
      if (!state.collections.length) throw new Error("Gallery is currently empty");
      renderEventFilters();
      applyFilters();
    } catch (error) {
      console.warn("POSE gallery:", error.message);
      showLoadError();
    } finally {
      clearTimeout(timeout);
    }
  }

  function showLoadError() {
    els.loading.hidden = true;
    els.grid.hidden = true;
    els.empty.hidden = false;
    els.emptyTitle.textContent = "The gallery is taking a quick pause";
    els.emptyCopy.textContent = "You can still browse the latest POSE photos in the event archive.";
    els.clear.textContent = "Open event archive";
    els.clear.dataset.fallback = "true";
    els.count.textContent = "Gallery temporarily unavailable";
  }

  function resetFilters() {
    if (els.clear.dataset.fallback === "true") {
      window.open(config.folderUrl || config.homeUrl || "https://poseph.com/", "_blank", "noopener,noreferrer");
      return;
    }
    state.eventFilter = "all";
    state.search = "";
    els.search.value = "";
    els.eventFilters.querySelectorAll("[data-event]").forEach(button => {
      const active = button.dataset.event === "all";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    applyFilters();
  }

  function initInteractions() {
    const setHeader = () => els.header.classList.toggle("is-scrolled", scrollY > 24);
    addEventListener("scroll", setHeader, { passive: true });
    setHeader();

    let searchTimer;
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = els.search.value; applyFilters(); }, 140);
    });
    els.sort.addEventListener("change", () => { state.sort = els.sort.value; applyFilters(); });
    els.clear.addEventListener("click", resetFilters);
    document.querySelectorAll("[data-close-viewer]").forEach(button => button.addEventListener("click", closeViewer));
    els.viewerPrev.addEventListener("click", () => moveViewer(-1));
    els.viewerNext.addEventListener("click", () => moveViewer(1));
    els.share.addEventListener("click", shareCurrent);
    els.viewer.addEventListener("close", () => document.body.classList.remove("is-locked"));
    document.addEventListener("keydown", (event) => {
      if (!els.viewer.open) return;
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    });

    let touchStart = 0;
    els.viewerStage.addEventListener("touchstart", event => { touchStart = event.changedTouches[0].clientX; }, { passive: true });
    els.viewerStage.addEventListener("touchend", event => {
      const distance = event.changedTouches[0].clientX - touchStart;
      if (Math.abs(distance) > 55) moveViewer(distance > 0 ? -1 : 1);
    }, { passive: true });
  }

  initInteractions();
  loadGallery();
})();
