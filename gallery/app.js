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
    mediaFilter: "all",
    currentCollection: null,
    currentIndex: 0,
    pendingCollection: null,
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
    mediaFilter: document.querySelector("#media-filter"),
    eventFilters: document.querySelector("#event-filters"),
    filterToggle: document.querySelector("#gallery-filter-toggle"),
    controlsPanel: document.querySelector("#gallery-controls-panel"),
    viewer: document.querySelector("#viewer"),
    viewerImage: document.querySelector("#viewer-image"),
    viewerVideo: document.querySelector("#viewer-video"),
    viewerTitle: document.querySelector("#viewer-title"),
    viewerCaption: document.querySelector("#viewer-caption"),
    viewerCounter: document.querySelector("#viewer-counter"),
    viewerThumbs: document.querySelector("#viewer-thumbs"),
    viewerPrev: document.querySelector("#viewer-prev"),
    viewerNext: document.querySelector("#viewer-next"),
    viewerStage: document.querySelector("#viewer-stage"),
    share: document.querySelector("#share-photo"),
    download: document.querySelector("#download-media"),
    albumDownload: document.querySelector("#download-album"),
    pinDialog: document.querySelector("#pin-dialog"),
    pinForm: document.querySelector("#pin-form"),
    pinInput: document.querySelector("#pin-input"),
    pinError: document.querySelector("#pin-error"),
    pinSubmit: document.querySelector("#pin-submit"),
    toast: document.querySelector("#toast"),
  };

  const CATEGORY_RULES = [
    ["dedication", /dedication|christening|baptism|baptismal/i],
    ["birthday", /birthday|bday|turns?\s*\d+|\d+(st|nd|rd|th)/i],
    ["wedding", /wedding|nuptial|bride|groom/i],
    ["debut", /debut|18th/i],
    ["corporate", /corporate|company|year[- ]?end|christmas party|team/i],
  ];

  const menuButton = document.querySelector("#menu-button");
  const primaryNav = document.querySelector("#primary-nav");
  menuButton?.addEventListener("click", () => {
    const open = primaryNav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  primaryNav?.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      primaryNav.classList.remove("open");
      menuButton?.setAttribute("aria-expanded", "false");
    }),
  );

  function value(source, keys, fallback = "") {
    for (const key of keys) {
      const found = source?.[key];
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return fallback;
  }

  function driveIdFrom(input = "") {
    const text = String(input);
    return (
      text.match(/\/d\/([\w-]{10,})/)?.[1] ||
      text.match(/[?&]id=([\w-]{10,})/)?.[1] ||
      (/^[\w-]{20,}$/.test(text) ? text : "")
    );
  }

  function imageUrl(item, size = 1800) {
    const direct = value(item, [
      "imageUrl",
      "image_url",
      "thumbnailUrl",
      "thumbnail",
      "url",
      "src",
      "link",
      "webContentLink",
    ]);
    const id = value(item, ["id", "fileId", "file_id"], driveIdFrom(direct));
    if (id)
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`;
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
    if (/^(img|dsc|dscf|dscn|photo|pxl|pose)[\s-]*\d+$/i.test(cleaned))
      return "Recent celebrations";
    const parts = cleaned.split(/\s[-–—|]\s|__|\s{2,}/).filter(Boolean);
    const candidate = parts[0]?.replace(/\s?\(?\d{1,4}\)?$/, "").trim();
    return candidate && candidate.length > 2
      ? candidate
      : "Recent celebrations";
  }

  function eventDetails(item, rawName) {
    const explicit = value(item, [
      "event",
      "eventName",
      "event_name",
      "album",
      "collection",
      "folderName",
      "folder_name",
    ]);
    const category = String(value(item, ["category"], "")).trim();
    const genericCategories = /^(birthday|wedding|debut|corporate|other|all)$/i;
    const source =
      explicit ||
      (category && !genericCategories.test(category) ? category : "") ||
      inferredEvent(rawName);
    const datedFolder = String(source).match(
      /^(\d{4})(\d{2})(\d{2})[\s_-]+(.+)$/,
    );

    return {
      name: cleanName(datedFolder ? datedFolder[4] : source),
      date: datedFolder
        ? `${datedFolder[1]}-${datedFolder[2]}-${datedFolder[3]}`
        : "",
    };
  }

  function categoryFor(item, eventName) {
    const explicit = String(
      value(item, ["category", "eventType", "event_type", "type"], ""),
    ).toLowerCase();
    const haystack = `${explicit} ${eventName} ${value(item, ["name", "title", "filename"], "")}`;
    return (
      CATEGORY_RULES.find(([, test]) => test.test(haystack))?.[0] || "other"
    );
  }

  function normalizeItem(item, index, parent = {}) {
    if (typeof item === "string") item = { url: item };
    if (!item || typeof item !== "object") return null;
    const merged = { ...parent, ...item };
    const mediaType =
      String(value(merged, ["mediaType", "media_type"], "")).toLowerCase() ||
      (String(value(merged, ["mimeType", "mime_type"], "")).startsWith("video/")
        ? "video"
        : "image");
    const url = imageUrl(merged);
    if (!url) return null;
    const rawName = value(
      merged,
      ["name", "title", "filename", "fileName"],
      `POSE moment ${index + 1}`,
    );
    const event = eventDetails(merged, rawName);
    const eventName = event.name;
    const dateValue =
      value(merged, ["eventDate", "event_date", "date"], "") ||
      event.date ||
      value(
        merged,
        ["createdTime", "created_at", "modifiedTime", "updated", "timestamp"],
        "",
      );
    const date = dateValue ? new Date(dateValue) : null;
    return {
      id: String(
        value(merged, ["id", "fileId", "file_id"], `${eventName}-${index}`),
      ),
      url,
      thumbnailUrl: imageUrl(merged, 240),
      mediaType,
      preview: value(
        merged,
        ["previewUrl", "preview_url"],
        mediaType === "video" && value(merged, ["id", "fileId", "file_id"], "")
          ? `https://drive.google.com/file/d/${encodeURIComponent(value(merged, ["id", "fileId", "file_id"]))}/preview`
          : "",
      ),
      original: value(
        merged,
        ["originalUrl", "original_url", "webViewLink", "viewUrl"],
        url,
      ),
      download: value(merged, ["downloadUrl", "download_url"], ""),
      name: cleanName(rawName),
      event: eventName || "Recent celebrations",
      category: categoryFor(merged, eventName),
      date: date && !Number.isNaN(date.valueOf()) ? date : null,
      dateRaw: dateValue,
      description: cleanName(
        value(merged, ["description", "caption", "alt"], ""),
      ),
    };
  }

  function extractCollections(payload) {
    const roots = Array.isArray(payload)
      ? payload
      : [
          payload?.events,
          payload?.collections,
          payload?.albums,
          payload?.photos,
          payload?.images,
          payload?.files,
          payload?.items,
          payload?.data,
          payload?.results,
        ].find(Array.isArray) || [];

    const maxItemsPerEvent =
      Number(config.maxItemsPerEvent || config.maxItems) || 100;
    return roots
      .map((entry, eventIndex) => {
        const mediaList = [
          entry?.items,
          entry?.photos,
          entry?.images,
          entry?.files,
        ].find(Array.isArray);
        const children = mediaList || [];
        const items = children
          .slice(0, maxItemsPerEvent)
          .map((child, index) => normalizeItem(child, index, entry))
          .filter(Boolean);
        const rawName = value(
          entry,
          ["eventName", "event_name", "name", "title", "folderName"],
          `Event ${eventIndex + 1}`,
        );
        const details = eventDetails(entry, rawName);
        const dateValue = value(
          entry,
          ["eventDate", "event_date", "date"],
          details.date,
        );
        const date = dateValue ? new Date(dateValue) : null;
        return {
          id: String(
            value(
              entry,
              ["id", "folderId", "folder_id"],
              details.name.toLowerCase(),
            ),
          ),
          title: details.name,
          category: categoryFor(entry, details.name),
          date: date && !Number.isNaN(date.valueOf()) ? date : null,
          photos: items,
          loaded: Boolean(mediaList),
          locked: Boolean(entry?.locked),
          downloadsEnabled: entry?.downloadsEnabled !== false,
          coverUrl: imageUrl(
            {
              url: value(
                entry,
                ["coverUrl", "cover_url"],
                items[0]?.thumbnailUrl || items[0]?.url || "",
              ),
            },
            640,
          ),
          itemCount: Number(entry?.itemCount ?? items.length),
          photoCount: Number(
            entry?.photoCount ??
              items.filter((item) => item.mediaType === "image").length,
          ),
          videoCount: Number(
            entry?.videoCount ??
              items.filter((item) => item.mediaType === "video").length,
          ),
        };
      })
      .filter(
        (collection) =>
          collection.itemCount > 0 || collection.photos.length > 0,
      );
  }

  function formatDate(date) {
    return date
      ? new Intl.DateTimeFormat("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(date)
      : "POSE Photobooth";
  }

  function categoryLabel(category) {
    return (
      {
        birthday: "Birthday",
        wedding: "Wedding",
        dedication: "Dedication",
        debut: "Debut",
        corporate: "Corporate",
        other: "Celebration",
      }[category] || "Celebration"
    );
  }

  function applyFilters() {
    const query = state.search.toLowerCase().trim();
    state.visible = state.collections.filter((collection) => {
      const categoryMatch =
        state.eventFilter === "all" ||
        collection.category === state.eventFilter;
      const searchMatch =
        !query ||
        `${collection.title} ${collection.category} ${collection.photos.map((p) => p.name).join(" ")}`
          .toLowerCase()
          .includes(query);
      const mediaMatch =
        state.mediaFilter === "all" ||
        (state.mediaFilter === "video"
          ? collection.videoCount > 0
          : collection.photoCount > 0);
      return categoryMatch && searchMatch && mediaMatch;
    });

    state.visible.sort((a, b) => {
      if (state.sort === "name") return a.title.localeCompare(b.title);
      const aTime = a.date?.valueOf() || 0;
      const bTime = b.date?.valueOf() || 0;
      return state.sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
    render();
  }

  function collectionMarkup(collection, index) {
    const cover =
      collection.coverUrl ||
      collection.photos[0]?.thumbnailUrl ||
      collection.photos[0]?.url ||
      "";
    const total = collection.itemCount || collection.photos.length;
    const label = `Open ${collection.title}, ${total} items${collection.locked ? ", PIN required" : ""}`;
    return `
      <article class="event-card">
        <button class="event-card__button" type="button" data-collection-index="${index}" aria-label="${escapeAttr(label)}">
          <span class="event-card__cover">
            ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(`${collection.title} event thumbnail`)}" loading="${index < 3 ? "eager" : "lazy"}" decoding="async">` : `<span class="event-card__placeholder">POSE</span>`}
            <span class="event-card__shade"></span>
            <span class="event-card__type">${escapeHtml(categoryLabel(collection.category))}</span>
            <span class="event-card__title"><strong title="${escapeAttr(collection.title)}">${escapeHtml(collection.title)}</strong></span>
          </span>
          <span class="event-card__footer">
            <span class="event-card__meta">
              <span>${escapeHtml(formatDate(collection.date))}</span>
              <span aria-hidden="true">·</span>
              <span><strong>${total}</strong> ${total === 1 ? "item" : "photos & videos"}</span>
            </span>
            <span class="event-card__cta">${collection.locked ? "Enter PIN" : "View gallery"} <span aria-hidden="true">→</span></span>
          </span>
        </button>
      </article>`;
  }

  function renderEventFilters() {
    const categoryOrder = [
      "birthday",
      "wedding",
      "dedication",
      "debut",
      "corporate",
      "other",
    ];
    const available = new Set(
      state.collections.map((collection) => collection.category),
    );
    els.eventFilters.innerHTML = [
      `<button class="event-filter is-active" type="button" data-event="all" aria-pressed="true">All events</button>`,
      ...categoryOrder
        .filter((category) => available.has(category))
        .map(
          (category) =>
            `<button class="event-filter" type="button" data-event="${category}" aria-pressed="false">${escapeHtml(categoryLabel(category))}</button>`,
        ),
    ].join("");

    els.eventFilters.querySelectorAll("[data-event]").forEach((button) =>
      button.addEventListener("click", () => {
        state.eventFilter = button.dataset.event;
        els.eventFilters.querySelectorAll("[data-event]").forEach((item) => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        applyFilters();
      }),
    );
  }

  function render() {
    els.loading.hidden = true;
    const hasResults = state.visible.length > 0;
    els.grid.hidden = !hasResults;
    els.empty.hidden = hasResults;

    if (hasResults) {
      els.grid.innerHTML = state.visible.map(collectionMarkup).join("");
      els.grid.querySelectorAll("[data-collection-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const collection =
            state.visible[Number(button.dataset.collectionIndex)];
          openViewer(collection, 0);
        });
      });
    }

    const photoCount = state.visible.reduce(
      (sum, collection) =>
        sum + (collection.itemCount || collection.photos.length),
      0,
    );
    els.count.textContent = hasResults
      ? `${state.visible.length} ${state.visible.length === 1 ? "event" : "events"} · ${photoCount} ${photoCount === 1 ? "moment" : "photos & videos"}`
      : "No matching events";
  }

  function renderViewer() {
    const collection = state.currentCollection;
    const photo = collection?.photos[state.currentIndex];
    if (!photo) return;
    const isVideo = photo.mediaType === "video";
    els.viewerImage.classList.add("is-changing");
    els.viewerImage.fetchPriority = "high";
    els.viewerImage.decoding = "async";
    requestAnimationFrame(() => {
      els.viewerImage.hidden = isVideo;
      els.viewerVideo.hidden = !isVideo;
      els.viewerVideo.src = isVideo ? photo.preview : "about:blank";
      els.viewerImage.src = isVideo ? "" : photo.url;
      els.viewerImage.alt =
        photo.description ||
        `${collection.title}, item ${state.currentIndex + 1}`;
      els.viewerTitle.textContent = collection.title;
      els.viewerCaption.textContent =
        photo.description || formatDate(photo.date || collection.date);
      els.viewerCounter.textContent = `${String(state.currentIndex + 1).padStart(2, "0")} / ${String(collection.photos.length).padStart(2, "0")}`;
      els.viewerImage.onload = () =>
        els.viewerImage.classList.remove("is-changing");
    });
    els.download.hidden = !collection.downloadsEnabled || !photo.download;
    els.download.href = photo.download || photo.original;
    els.albumDownload.hidden =
      !collection.downloadsEnabled ||
      !collection.photos.some((item) => item.download);
    els.viewerPrev.disabled = collection.photos.length < 2;
    els.viewerNext.disabled = collection.photos.length < 2;
    els.viewerThumbs.innerHTML = collection.photos
      .map(
        (item, index) => `
      <button class="viewer__thumb ${index === state.currentIndex ? "is-active" : ""}" type="button" data-view-index="${index}" aria-label="Show photo ${index + 1}">
        <img src="${escapeAttr(item.thumbnailUrl || item.url)}" alt="" loading="lazy"><span class="viewer__thumb-play" ${item.mediaType === "video" ? "" : "hidden"}>▶</span>
      </button>`,
      )
      .join("");
    els.viewerThumbs.querySelectorAll("[data-view-index]").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentIndex = Number(button.dataset.viewIndex);
        renderViewer();
      });
    });
    els.viewerThumbs.querySelector(".is-active")?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

  async function fetchCollection(collection, pin = "") {
    const url = new URL(config.endpoint);
    url.searchParams.set("eventId", collection.id);
    if (pin) url.searchParams.set("pin", pin);
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.event) {
      throw new Error(payload.message || "Unable to open this gallery.");
    }
    const details = extractCollections({ events: [payload.event] })[0];
    if (!details || !details.loaded || !details.photos.length) {
      throw new Error("This album did not return any media.");
    }
    Object.assign(collection, details, { locked: false });
  }

  async function ensureCollectionLoaded(collection, pin = "") {
    if (collection.loaded) return;
    if (!collection.loadPromise) {
      collection.loadPromise = fetchCollection(collection, pin);
    }
    try {
      await collection.loadPromise;
    } finally {
      collection.loadPromise = null;
    }
  }

  async function openViewer(collection, index = 0) {
    if (collection.locked) {
      state.pendingCollection = collection;
      els.pinError.textContent = "";
      els.pinInput.value = "";
      els.pinDialog.showModal();
      setTimeout(() => els.pinInput.focus(), 50);
      return;
    }
    if (!collection.loaded) {
      showToast("Loading album…");
      try {
        await ensureCollectionLoaded(collection);
      } catch (error) {
        showToast(error.message || "Unable to open this gallery.");
        return;
      }
      hideToast();
    }
    state.currentCollection = collection;
    state.currentIndex = index;
    renderViewer();
    document.body.classList.add("is-locked");
    els.viewer.showModal();
  }

  function closeViewer() {
    if (els.viewer.open) els.viewer.close();
    els.viewerVideo.src = "about:blank";
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
    showToast.timer = setTimeout(
      () => els.toast.classList.remove("is-visible"),
      2200,
    );
  }

  function hideToast() {
    clearTimeout(showToast.timer);
    els.toast.classList.remove("is-visible");
  }

  async function shareCurrent() {
    const photo = state.currentCollection?.photos[state.currentIndex];
    if (!photo) return;
    const shareData = {
      title: `${state.currentCollection.title} — POSE Photobooth`,
      text: "A moment captured by POSE Photobooth.",
      url: photo.original || photo.url,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Photo link copied");
      }
    } catch (error) {
      if (error?.name !== "AbortError")
        showToast("Sharing is unavailable right now");
    }
  }

  async function downloadCurrentAlbum() {
    const collection = state.currentCollection;
    if (!collection || collection.locked || !collection.downloadsEnabled)
      return;
    const files = collection.photos.filter((item) => item.download);
    if (!files.length) return showToast("Album downloads are unavailable");

    const label = els.albumDownload.querySelector("span");
    els.albumDownload.disabled = true;
    els.albumDownload.setAttribute("aria-busy", "true");
    if (label) label.textContent = "Starting…";

    try {
      files.forEach((file, index) => {
        setTimeout(() => {
          const frame = document.createElement("iframe");
          frame.hidden = true;
          frame.title = "";
          frame.src = file.download;
          document.body.append(frame);
          setTimeout(() => frame.remove(), 60000);
        }, index * 700);
      });
      showToast(
        files.length === 1
          ? "Download started"
          : `${files.length} downloads started — allow multiple downloads if asked`,
      );
    } finally {
      setTimeout(
        () => {
          els.albumDownload.disabled = false;
          els.albumDownload.removeAttribute("aria-busy");
          if (label) label.textContent = "Download album";
        },
        Math.min(files.length * 700 + 800, 12000),
      );
    }
  }

  async function unlockPendingEvent() {
    const collection = state.pendingCollection;
    if (!collection) return;
    els.pinSubmit.disabled = true;
    els.pinSubmit.textContent = "Checking…";
    els.pinError.textContent = "";
    try {
      await ensureCollectionLoaded(collection, els.pinInput.value);
      els.pinDialog.close();
      render();
      await openViewer(collection, 0);
    } catch (error) {
      els.pinError.textContent = error.message || "That PIN is not correct.";
      els.pinInput.select();
    } finally {
      els.pinSubmit.disabled = false;
      els.pinSubmit.textContent = "Open gallery";
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }
  function escapeAttr(value = "") {
    return escapeHtml(value);
  }

  async function loadGallery() {
    if (!config.endpoint) return showLoadError();
    const controller = new AbortController();
    const slowNotice = setTimeout(() => {
      els.count.textContent = "Preparing your photos and videos…";
    }, 10000);
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(config.endpoint, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Gallery request failed (${response.status})`);
      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Gallery returned an unexpected format");
      }
      state.collections = extractCollections(payload);
      if (!state.collections.length)
        throw new Error("Gallery is currently empty");
      renderEventFilters();
      applyFilters();
    } catch (error) {
      const message =
        error && error.name === "AbortError"
          ? "The gallery request timed out"
          : error.message || "The gallery could not be loaded";
      console.warn("POSE gallery:", message);
      showLoadError(message);
    } finally {
      clearTimeout(slowNotice);
      clearTimeout(timeout);
    }
  }

  function showLoadError(reason = "") {
    els.loading.hidden = true;
    els.grid.hidden = true;
    els.empty.hidden = false;
    els.emptyTitle.textContent = "The gallery is taking a quick pause";
    els.emptyCopy.textContent =
      "Please try again shortly or return to the POSE website.";
    els.clear.textContent = "Visit POSE website";
    els.clear.dataset.fallback = "true";
    els.count.textContent =
      reason === "Gallery is currently empty"
        ? "No events found"
        : "Gallery temporarily unavailable";
  }

  function resetFilters() {
    if (els.clear.dataset.fallback === "true") {
      window.open(
        config.homeUrl || "https://poseph.com/",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    state.eventFilter = "all";
    state.search = "";
    els.search.value = "";
    els.eventFilters.querySelectorAll("[data-event]").forEach((button) => {
      const active = button.dataset.event === "all";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    applyFilters();
  }

  function initInteractions() {
    const setHeader = () =>
      els.header.classList.toggle("is-scrolled", scrollY > 24);
    addEventListener("scroll", setHeader, { passive: true });
    setHeader();

    els.filterToggle?.addEventListener("click", () => {
      const open = els.controlsPanel.classList.toggle("is-open");
      els.filterToggle.setAttribute("aria-expanded", String(open));
      els.filterToggle.lastElementChild.textContent = open ? "−" : "+";
    });

    let searchTimer;
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = els.search.value;
        applyFilters();
      }, 140);
    });
    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      applyFilters();
    });
    els.mediaFilter.addEventListener("click", (event) => {
      const button = event.target.closest("[data-media]");
      if (!button) return;
      state.mediaFilter = button.dataset.media;
      els.mediaFilter.querySelectorAll("[data-media]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      applyFilters();
    });
    els.pinForm.addEventListener("submit", (event) => {
      if (event.submitter?.value === "cancel") return;
      event.preventDefault();
      unlockPendingEvent();
    });
    els.clear.addEventListener("click", resetFilters);
    document
      .querySelectorAll("[data-close-viewer]")
      .forEach((button) => button.addEventListener("click", closeViewer));
    els.viewerPrev.addEventListener("click", () => moveViewer(-1));
    els.viewerNext.addEventListener("click", () => moveViewer(1));
    els.share.addEventListener("click", shareCurrent);
    els.albumDownload.addEventListener("click", downloadCurrentAlbum);
    els.viewer.addEventListener("close", () =>
      document.body.classList.remove("is-locked"),
    );
    document.addEventListener("keydown", (event) => {
      if (!els.viewer.open) return;
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    });

    let touchStart = 0;
    els.viewerStage.addEventListener(
      "touchstart",
      (event) => {
        touchStart = event.changedTouches[0].clientX;
      },
      { passive: true },
    );
    els.viewerStage.addEventListener(
      "touchend",
      (event) => {
        const distance = event.changedTouches[0].clientX - touchStart;
        if (Math.abs(distance) > 55) moveViewer(distance > 0 ? -1 : 1);
      },
      { passive: true },
    );
  }

  initInteractions();
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (error) {
    console.warn("POSE gallery ad could not be initialized.", error);
  }
  loadGallery();
})();
