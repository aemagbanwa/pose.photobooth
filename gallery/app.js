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
    albumPage: 1,
    failedPinAttempts: 0,
    pinCooldownUntil: 0,
    serverPagination: false,
    totalEvents: 0,
    totalItems: 0,
    totalPages: 1,
    facets: {},
    listController: null,
    sharedEventSlug: "",
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
    albumPagination: document.querySelector("#album-pagination"),
    filterToggle: document.querySelector("#gallery-filter-toggle"),
    controlsPanel: document.querySelector("#gallery-controls-panel"),
    viewer: document.querySelector("#viewer"),
    viewerImage: document.querySelector("#viewer-image"),
    viewerVideo: document.querySelector("#viewer-video"),
    viewerTitle: document.querySelector("#viewer-title"),
    viewerCaption: document.querySelector("#viewer-caption"),
    viewerCounter: document.querySelector("#viewer-counter"),
    viewerThumbs: document.querySelector("#viewer-thumbs"),
    viewerPagination: document.querySelector("#viewer-pagination"),
    viewerLoadMore: document.querySelector("#viewer-load-more"),
    viewerLoadStatus: document.querySelector("#viewer-load-status"),
    viewerPrev: document.querySelector("#viewer-prev"),
    viewerNext: document.querySelector("#viewer-next"),
    viewerStage: document.querySelector("#viewer-stage"),
    share: document.querySelector("#share-photo"),
    shareAlbum: document.querySelector("#share-album"),
    download: document.querySelector("#download-media"),
    albumDownload: document.querySelector("#download-album"),
    pinDialog: document.querySelector("#pin-dialog"),
    pinForm: document.querySelector("#pin-form"),
    pinInput: document.querySelector("#pin-input"),
    pinToggle: document.querySelector("#pin-toggle"),
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
          slug: String(value(entry, ["slug", "eventSlug", "event_slug"], "")),
          category: categoryFor(entry, details.name),
          date: date && !Number.isNaN(date.valueOf()) ? date : null,
          photos: items,
          loaded: items.length > 0,
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
          loadedCount: items.length,
          nextPageToken: null,
          hasMore: false,
          localRemainder: [],
          accessPin: "",
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

  function albumPageSize() {
    const configured = Number(config.albumPageSize || 12);
    return Number.isFinite(configured)
      ? Math.min(Math.max(Math.round(configured), 4), 48)
      : 12;
  }

  function albumPageCount() {
    if (state.serverPagination) return Math.max(1, Number(state.totalPages || 1));
    return Math.max(1, Math.ceil(state.visible.length / albumPageSize()));
  }

  function albumPageItems() {
    if (state.serverPagination) return state.visible;
    const size = albumPageSize();
    const start = (state.albumPage - 1) * size;
    return state.visible.slice(start, start + size);
  }

  function albumPageWindow(totalPages, currentPage) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push('ellipsis-start');
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (end < totalPages - 1) pages.push('ellipsis-end');
    pages.push(totalPages);
    return pages;
  }

  function renderAlbumPagination() {
    if (!els.albumPagination) return;
    const totalPages = albumPageCount();
    const shouldShow = state.serverPagination
      ? albumPageCount() > 1
      : state.visible.length > albumPageSize();
    els.albumPagination.hidden = !shouldShow;
    if (!shouldShow) {
      els.albumPagination.innerHTML = '';
      return;
    }

    const pages = albumPageWindow(totalPages, state.albumPage);
    els.albumPagination.innerHTML = `
      <button class="album-pagination__nav" type="button" data-album-page="${state.albumPage - 1}" ${state.albumPage <= 1 ? 'disabled' : ''} aria-label="Previous album page">
        <span aria-hidden="true">←</span><span class="album-pagination__nav-label">Previous</span>
      </button>
      <div class="album-pagination__pages" aria-label="Album pages">
        ${pages.map((page) => {
          if (typeof page !== 'number') return '<span class="album-pagination__ellipsis" aria-hidden="true">…</span>';
          const current = page === state.albumPage;
          return `<button class="album-pagination__page${current ? ' is-active' : ''}" type="button" data-album-page="${page}" ${current ? 'aria-current="page"' : ''} aria-label="Go to album page ${page}">${page}</button>`;
        }).join('')}
      </div>
      <button class="album-pagination__nav" type="button" data-album-page="${state.albumPage + 1}" ${state.albumPage >= totalPages ? 'disabled' : ''} aria-label="Next album page">
        <span class="album-pagination__nav-label">Next</span><span aria-hidden="true">→</span>
      </button>`;

    els.albumPagination.querySelectorAll('[data-album-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const page = Number(button.dataset.albumPage);
        if (!Number.isInteger(page) || page < 1 || page > totalPages || page === state.albumPage) return;
        state.albumPage = page;
        writeUrlState();
        if (state.serverPagination) {
          loadGallery({ restoreScroll: false, preserveSharedEvent: true });
        } else {
          render();
        }
        document.querySelector(".results-line")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function readUrlState() {
    const params = new URLSearchParams(location.search);
    const category = String(params.get("category") || "all").toLowerCase();
    const media = String(params.get("media") || "all").toLowerCase();
    const sort = String(params.get("sort") || "newest").toLowerCase();
    const page = Number(params.get("page") || 1);
    state.eventFilter = category;
    state.mediaFilter = ["all", "image", "video"].includes(media) ? media : "all";
    state.sort = ["newest", "oldest", "name"].includes(sort) ? sort : "newest";
    state.search = String(params.get("q") || "").slice(0, 120);
    state.albumPage = Number.isInteger(page) && page > 0 ? page : 1;
    state.sharedEventSlug = String(params.get("event") || "").trim().slice(0, 120);
  }

  function writeUrlState({ replace = false } = {}) {
    const params = new URLSearchParams();
    if (state.eventFilter !== "all") params.set("category", state.eventFilter);
    if (state.mediaFilter !== "all") params.set("media", state.mediaFilter);
    if (state.sort !== "newest") params.set("sort", state.sort);
    if (state.search.trim()) params.set("q", state.search.trim());
    if (state.albumPage > 1) params.set("page", String(state.albumPage));
    if (state.sharedEventSlug) params.set("event", state.sharedEventSlug);
    const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash || ""}`;
    history[replace ? "replaceState" : "pushState"]({ poseGallery: true }, "", next);
  }

  function syncControlsFromState() {
    if (els.search) els.search.value = state.search;
    if (els.sort) els.sort.value = state.sort;
    els.eventFilters?.querySelectorAll("[data-event]").forEach((button) => {
      const active = button.dataset.event === state.eventFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    els.mediaFilter?.querySelectorAll("[data-media]").forEach((button) => {
      const active = button.dataset.media === state.mediaFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function saveScrollPosition() {
    try {
      sessionStorage.setItem("pose.gallery.scroll", String(Math.max(0, Math.round(scrollY))));
    } catch {}
  }

  function restoreScrollPosition() {
    try {
      const saved = Number(sessionStorage.getItem("pose.gallery.scroll"));
      if (Number.isFinite(saved) && saved > 0) {
        requestAnimationFrame(() => scrollTo({ top: saved, behavior: "auto" }));
      }
    } catch {}
  }

  function applyFilters({ resetPage = true, updateUrl = true, replaceUrl = false } = {}) {
    if (resetPage) state.albumPage = 1;

    if (state.serverPagination) {
      if (updateUrl) writeUrlState({ replace: replaceUrl });
      loadGallery({ restoreScroll: false, preserveSharedEvent: true });
      return;
    }

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
    const pages = Math.max(1, Math.ceil(state.visible.length / albumPageSize()));
    state.albumPage = Math.min(Math.max(state.albumPage, 1), pages);
    render();
    syncControlsFromState();
    if (updateUrl) writeUrlState({ replace: replaceUrl });
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
            ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(`${collection.title} event thumbnail`)}" loading="${index < 4 ? "eager" : "lazy"}" decoding="async" onload="if(this.naturalHeight>this.naturalWidth)this.dataset.portrait='true'" fetchpriority="${index < 2 ? "high" : "auto"}" onerror="this.hidden=true;this.nextElementSibling?.classList.add('is-visible')"><span class="event-card__image-fallback" aria-hidden="true">POSE</span>` : `<span class="event-card__placeholder">POSE</span>`}
            <span class="event-card__shade"></span>
            <span class="event-card__type">${escapeHtml(categoryLabel(collection.category))}</span>
            ${collection.locked ? `<span class="event-card__lock" title="PIN protected" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>` : ""}
          </span>
          <span class="event-card__title"><strong>${escapeHtml(collection.title)}</strong></span>
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

    let available;
    if (state.serverPagination && state.facets) {
      available = new Set(
        categoryOrder.filter((category) => Number(state.facets[category] || 0) > 0),
      );
    } else {
      available = new Set(
        state.collections.map((collection) => collection.category),
      );
    }

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
        applyFilters();
      }),
    );
    syncControlsFromState();
  }

  // Keep DOM, keyboard and sort order intact while packing variable-height cards.
  let wallFrame;
  const wallObserver = new ResizeObserver(() => layoutPhotoWall());
  function layoutPhotoWall() {
    cancelAnimationFrame(wallFrame);
    wallFrame = requestAnimationFrame(() => {
      els.grid.querySelectorAll(".event-card").forEach(card => {
        const button = card.querySelector(".event-card__button");
        card.style.gridRowEnd = `span ${Math.ceil((button.getBoundingClientRect().height + 24) / 8)}`;
      });
    });
  }

  function render() {
    els.loading.hidden = true;
    const hasResults = state.visible.length > 0;
    els.grid.hidden = !hasResults;
    els.empty.hidden = hasResults;

    if (hasResults) {
      const totalPages = albumPageCount();
      state.albumPage = Math.min(Math.max(state.albumPage, 1), totalPages);
      const size = albumPageSize();
      const startIndex = state.serverPagination ? 0 : (state.albumPage - 1) * size;
      const pageItems = albumPageItems();
      wallObserver.disconnect();
      els.grid.innerHTML = pageItems
        .map((collection, pageIndex) => collectionMarkup(collection, startIndex + pageIndex))
        .join("");
      els.grid.querySelectorAll("[data-collection-index]").forEach((button) => {
        wallObserver.observe(button);
        button.addEventListener("click", () => {
          const collection = state.serverPagination
            ? state.visible[Number(button.dataset.collectionIndex)]
            : state.visible[Number(button.dataset.collectionIndex)];
          openViewer(collection, 0);
        });
      });
    }

    layoutPhotoWall();
    renderAlbumPagination();

    const eventCount = state.serverPagination ? state.totalEvents : state.visible.length;
    const itemCount = state.serverPagination
      ? state.totalItems
      : state.visible.reduce(
          (sum, collection) =>
            sum + (collection.itemCount || collection.photos.length),
          0,
        );

    els.count.textContent = hasResults
      ? `${eventCount} ${eventCount === 1 ? "event" : "events"} · ${itemCount} ${itemCount === 1 ? "moment" : "photos & videos"}${albumPageCount() > 1 ? ` · Page ${state.albumPage} of ${albumPageCount()}` : ""}`
      : "No matching events";
  }

  function preloadViewerNeighbors() {
    const collection = state.currentCollection;
    if (!collection?.photos?.length) return;
    const indexes = [state.currentIndex - 1, state.currentIndex + 1]
      .filter((index) => index >= 0 && index < collection.photos.length);
    indexes.forEach((index) => {
      const item = collection.photos[index];
      if (!item || item.mediaType === "video" || !item.url) return;
      const img = new Image();
      img.decoding = "async";
      img.src = item.url;
    });
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
      els.viewerImage.dataset.retryCount = "0";
      els.viewerImage.onerror = () => {
        if (isVideo) return;
        const attempts = Number(els.viewerImage.dataset.retryCount || "0");
        if (attempts < 1) {
          els.viewerImage.dataset.retryCount = "1";
          setTimeout(() => {
            const retryUrl = new URL(photo.url, location.href);
            retryUrl.searchParams.set("_poseRetry", String(Date.now()));
            els.viewerImage.src = retryUrl.toString();
          }, 500);
          return;
        }
        els.viewerImage.classList.remove("is-changing");
        showToast("This image could not be loaded. Try the next photo.");
      };
      els.viewerImage.src = isVideo ? "" : photo.url;
      els.viewerImage.alt =
        photo.description ||
        `${collection.title}, item ${state.currentIndex + 1}`;
      els.viewerTitle.textContent = collection.title;
      els.viewerCaption.textContent =
        photo.description || formatDate(photo.date || collection.date);
      const total = collection.itemCount || collection.photos.length;
      els.viewerCounter.textContent = `${String(state.currentIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
      els.viewerImage.onload = () =>
        els.viewerImage.classList.remove("is-changing");
    });
    els.download.hidden = !collection.downloadsEnabled || !photo.download;
    els.download.href = photo.download || photo.original;
    els.albumDownload.hidden =
      !collection.downloadsEnabled ||
      (!collection.photos.some((item) => item.download) && !collection.hasMore);
    els.viewerPrev.disabled = collection.photos.length < 2 && !collection.hasMore;
    els.viewerNext.disabled = collection.photos.length < 2 && !collection.hasMore;
    els.viewerThumbs.innerHTML = collection.photos
      .map(
        (item, index) => `
      <button class="viewer__thumb ${index === state.currentIndex ? "is-active" : ""}" type="button" data-view-index="${index}" aria-label="Show item ${index + 1}">
        <img src="${escapeAttr(item.thumbnailUrl || item.url)}" alt="" loading="lazy" decoding="async"><span class="viewer__thumb-play" ${item.mediaType === "video" ? "" : "hidden"}>▶</span>
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
    renderViewerPagination(collection);
    preloadViewerNeighbors();
  }

  function pageSize() {
    const configured = Number(config.pageSize || config.itemsPerPage || 30);
    return Number.isFinite(configured) ? Math.min(Math.max(configured, 12), 60) : 30;
  }

  function payloadPageToken(payload, event) {
    return String(
      payload?.nextPageToken ??
        payload?.next_page_token ??
        event?.nextPageToken ??
        event?.next_page_token ??
        "",
    );
  }

  function payloadHasMore(payload, event) {
    const explicit =
      payload?.hasMore ??
      payload?.has_more ??
      event?.hasMore ??
      event?.has_more;
    return typeof explicit === "boolean" ? explicit : null;
  }

  function rawMedia(event) {
    return [event?.items, event?.photos, event?.images, event?.files].find(Array.isArray) || [];
  }

  function appendUniquePhotos(collection, items) {
    const seen = new Set(collection.photos.map((item) => item.id));
    for (const item of items) {
      if (!seen.has(item.id)) {
        collection.photos.push(item);
        seen.add(item.id);
      }
    }
    collection.loadedCount = collection.photos.length;
  }

  function clientKey() {
    const storageKey = "pose.gallery.clientKey";
    try {
      let key = sessionStorage.getItem(storageKey);
      if (!key) {
        key =
          (crypto?.randomUUID?.() ||
            `pose-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`)
            .replace(/[^a-zA-Z0-9_-]/g, "")
            .slice(0, 64);
        sessionStorage.setItem(storageKey, key);
      }
      return key;
    } catch {
      return `pose-${Date.now()}`;
    }
  }

  async function fetchCollectionPage(collection, pin = "", reset = false) {
    const limit = pageSize();
    if (reset) {
      collection.photos = [];
      collection.loadedCount = 0;
      collection.nextPageToken = null;
      collection.hasMore = false;
      collection.localRemainder = [];
    }

    if (!reset && collection.localRemainder?.length) {
      const chunk = collection.localRemainder.splice(0, limit);
      appendUniquePhotos(collection, chunk);
      collection.hasMore = collection.localRemainder.length > 0 || collection.loadedCount < collection.itemCount;
      return;
    }

    const url = new URL(config.endpoint);
    url.searchParams.set("eventId", collection.id);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(collection.loadedCount || 0));
    if (collection.nextPageToken) url.searchParams.set("pageToken", collection.nextPageToken);
    const activePin = pin || collection.accessPin || "";
    if (activePin) url.searchParams.set("pin", activePin);
    url.searchParams.set("clientKey", clientKey());

    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.event) {
      throw new Error(payload.message || "Unable to open this gallery.");
    }

    const event = payload.event;
    const raw = rawMedia(event);
    if (!raw.length && reset) throw new Error("This album did not return any media.");
    const normalized = raw
      .map((child, index) => normalizeItem(child, (collection.loadedCount || 0) + index, event))
      .filter(Boolean);

    const token = payloadPageToken(payload, event);
    const explicitHasMore = payloadHasMore(payload, event);
    const total = Number(event.itemCount ?? payload.itemCount ?? collection.itemCount ?? normalized.length);
    if (Number.isFinite(total) && total >= 0) collection.itemCount = total;

    // Backward compatibility: older endpoints may ignore limit/offset and return
    // the entire album. Keep only one page in the UI and progressively reveal the rest.
    if (normalized.length > limit && !token && explicitHasMore === null) {
      appendUniquePhotos(collection, normalized.slice(0, limit));
      collection.localRemainder = normalized.slice(limit);
      collection.hasMore = collection.localRemainder.length > 0;
    } else {
      appendUniquePhotos(collection, normalized);
      collection.nextPageToken = token || null;
      collection.hasMore =
        explicitHasMore !== null
          ? explicitHasMore
          : Boolean(token) || collection.loadedCount < collection.itemCount;
    }

    collection.loaded = true;
    collection.locked = false;
    if (event.slug) collection.slug = String(event.slug);
    if (activePin) collection.accessPin = activePin;
    collection.photoCount = Number(event.photoCount ?? collection.photoCount);
    collection.videoCount = Number(event.videoCount ?? collection.videoCount);
    collection.downloadsEnabled = event.downloadsEnabled !== false;
  }

  async function ensureCollectionLoaded(collection, pin = "") {
    if (collection.loaded && collection.photos.length) return;
    if (!collection.loadPromise) {
      collection.loadPromise = fetchCollectionPage(collection, pin, true);
    }
    try {
      await collection.loadPromise;
    } finally {
      collection.loadPromise = null;
    }
  }

  async function loadMoreCurrentCollection({ quiet = false } = {}) {
    const collection = state.currentCollection;
    if (!collection || !collection.hasMore || collection.loadingMore) return false;
    collection.loadingMore = true;
    renderViewerPagination(collection);
    try {
      await fetchCollectionPage(collection);
      renderViewer();
      return true;
    } catch (error) {
      if (!quiet) showToast(error.message || "Unable to load more photos.");
      return false;
    } finally {
      collection.loadingMore = false;
      renderViewerPagination(collection);
    }
  }

  function renderViewerPagination(collection) {
    if (!els.viewerPagination || !els.viewerLoadMore || !els.viewerLoadStatus) return;
    const total = collection.itemCount || collection.photos.length;
    const loaded = collection.photos.length;
    els.viewerPagination.hidden = !collection.hasMore && loaded >= total;
    els.viewerLoadMore.hidden = !collection.hasMore;
    els.viewerLoadMore.disabled = Boolean(collection.loadingMore);
    els.viewerLoadMore.textContent = collection.loadingMore ? "Loading…" : "Load more";
    els.viewerLoadStatus.textContent = `${Math.min(loaded, total)} of ${total} items loaded`;
  }

  async function openViewer(collection, index = 0) {
    saveScrollPosition();
    if (collection.locked) {
      state.pendingCollection = collection;
      els.pinError.textContent = "";
      els.pinInput.value = "";
      els.pinInput.type = "password";
      if (els.pinToggle) {
        els.pinToggle.textContent = "Show";
        els.pinToggle.setAttribute("aria-pressed", "false");
      }
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
    if (collection.slug) {
      state.sharedEventSlug = collection.slug;
      writeUrlState({ replace: true });
    }
    renderViewer();
    document.body.classList.add("is-locked");
    els.viewer.showModal();
  }

  function closeViewer() {
    if (els.viewer.open) els.viewer.close();
    els.viewerVideo.src = "about:blank";
    document.body.classList.remove("is-locked");
    if (state.sharedEventSlug) {
      state.sharedEventSlug = "";
      writeUrlState({ replace: true });
    }
  }

  async function moveViewer(direction) {
    const collection = state.currentCollection;
    let length = collection?.photos.length || 0;
    if (!collection || length < 1) return;

    if (direction > 0 && state.currentIndex === length - 1 && collection.hasMore) {
      const loaded = await loadMoreCurrentCollection({ quiet: true });
      length = collection.photos.length;
      if (loaded && state.currentIndex < length - 1) {
        state.currentIndex += 1;
        renderViewer();
        return;
      }
    }

    if (length < 2) return;
    if (direction < 0 && state.currentIndex === 0 && collection.hasMore) return;
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

  function albumShareUrl(collection = state.currentCollection) {
    const url = new URL(location.origin + location.pathname);
    if (collection?.slug) url.searchParams.set("event", collection.slug);
    return url.toString();
  }

  async function shareAlbum() {
    const collection = state.currentCollection;
    if (!collection) return;
    const shareData = {
      title: `${collection.title} — POSE Photobooth`,
      text: `View ${collection.title} on the POSE Photobooth gallery.`,
      url: albumShareUrl(collection),
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Album link copied");
      }
    } catch (error) {
      if (error?.name !== "AbortError")
        showToast("Sharing is unavailable right now");
    }
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

    if (collection.hasMore) {
      showToast("Preparing the full album…");
      while (collection.hasMore) {
        const ok = await loadMoreCurrentCollection({ quiet: true });
        if (!ok) break;
      }
    }

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
    const now = Date.now();
    if (state.pinCooldownUntil > now) {
      const seconds = Math.ceil((state.pinCooldownUntil - now) / 1000);
      els.pinError.textContent = `Too many attempts. Try again in ${seconds}s.`;
      return;
    }
    els.pinSubmit.disabled = true;
    els.pinSubmit.textContent = "Checking…";
    els.pinError.textContent = "";
    try {
      await ensureCollectionLoaded(collection, els.pinInput.value);
      state.failedPinAttempts = 0;
      state.pinCooldownUntil = 0;
      els.pinDialog.close();
      render();
      await openViewer(collection, 0);
    } catch (error) {
      state.failedPinAttempts += 1;
      if (state.failedPinAttempts >= 5) {
        state.pinCooldownUntil = Date.now() + 30000;
        state.failedPinAttempts = 0;
        els.pinError.textContent = "Too many incorrect attempts. Please wait 30 seconds.";
      } else {
        els.pinError.textContent = error.message || "That PIN is not correct.";
      }
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

  async function loadGallery({ restoreScroll = false, preserveSharedEvent = true } = {}) {
    if (!config.endpoint) return showLoadError();

    if (state.listController) state.listController.abort();
    const controller = new AbortController();
    state.listController = controller;

    els.loading.hidden = false;
    els.grid.hidden = true;
    els.empty.hidden = true;
    els.albumPagination.hidden = true;

    const slowNotice = setTimeout(() => {
      els.count.textContent = "Preparing your photos and videos…";
    }, 10000);
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const url = new URL(config.endpoint);
      url.searchParams.set("page", String(state.albumPage || 1));
      url.searchParams.set("limit", String(albumPageSize()));
      if (state.eventFilter !== "all") url.searchParams.set("category", state.eventFilter);
      if (state.mediaFilter !== "all") url.searchParams.set("media", state.mediaFilter);
      if (state.sort !== "newest") url.searchParams.set("sort", state.sort);
      if (state.search.trim()) url.searchParams.set("q", state.search.trim());

      const response = await fetch(url, {
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
      if (payload?.ok === false) throw new Error(payload.message || "Unable to load gallery.");

      state.collections = extractCollections(payload);
      state.visible = state.collections.slice();

      const pagination = payload?.pagination;
      state.serverPagination = Boolean(
        pagination &&
          Number.isFinite(Number(pagination.totalEvents)) &&
          Number.isFinite(Number(pagination.totalPages)),
      );

      if (state.serverPagination) {
        state.totalEvents = Number(pagination.totalEvents || 0);
        state.totalItems = Number(pagination.totalItems || 0);
        state.totalPages = Math.max(1, Number(pagination.totalPages || 1));
        state.albumPage = Math.min(
          Math.max(1, Number(pagination.page || state.albumPage || 1)),
          state.totalPages,
        );
        state.facets = payload?.facets || {};
      } else {
        state.totalEvents = state.collections.length;
        state.totalItems = state.collections.reduce(
          (sum, collection) => sum + (collection.itemCount || 0),
          0,
        );
        state.totalPages = Math.max(
          1,
          Math.ceil(state.collections.length / albumPageSize()),
        );
      }

      if (!state.collections.length && !state.serverPagination) {
        throw new Error("Gallery is currently empty");
      }

      renderEventFilters();
      syncControlsFromState();

      if (state.serverPagination) {
        render();
      } else {
        applyFilters({ resetPage: false, updateUrl: false });
      }

      writeUrlState({ replace: true });

      if (restoreScroll) restoreScrollPosition();

      if (preserveSharedEvent && state.sharedEventSlug) {
        await openSharedEvent(state.sharedEventSlug);
      }
    } catch (error) {
      if (error?.name === "AbortError" && state.listController !== controller) return;
      const message =
        error && error.name === "AbortError"
          ? "The gallery request timed out"
          : error.message || "The gallery could not be loaded";
      console.warn("POSE gallery:", message);
      showLoadError(message);
    } finally {
      clearTimeout(slowNotice);
      clearTimeout(timeout);
      if (state.listController === controller) state.listController = null;
    }
  }

  async function openSharedEvent(slug) {
    if (!slug) return;
    const existing = state.collections.find((collection) => collection.slug === slug);
    if (existing) {
      if (!els.viewer.open && !els.pinDialog.open) await openViewer(existing, 0);
      return;
    }

    try {
      const url = new URL(config.endpoint);
      url.searchParams.set("slug", slug);
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !payload?.event) return;
      const [collection] = extractCollections({ events: [payload.event] });
      if (!collection) return;
      if (!els.viewer.open && !els.pinDialog.open) await openViewer(collection, 0);
    } catch (error) {
      console.warn("POSE shared gallery:", error);
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
    state.mediaFilter = "all";
    state.sort = "newest";
    state.search = "";
    state.albumPage = 1;
    syncControlsFromState();
    applyFilters({ resetPage: true, updateUrl: true });
  }

  function initInteractions() {
    const setHeader = () => {
      const header = document.querySelector("[data-header]");
      header?.classList.toggle("is-scrolled", scrollY > 24);
    };
    addEventListener("scroll", setHeader, { passive: true });
    setHeader();
    document.addEventListener("pose:partials-ready", setHeader, { once: true });

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
        applyFilters({ resetPage: true, updateUrl: true, replaceUrl: true });
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
      applyFilters();
    });
    els.pinToggle?.addEventListener("click", () => {
      const show = els.pinInput.type === "password";
      els.pinInput.type = show ? "text" : "password";
      els.pinToggle.textContent = show ? "Hide" : "Show";
      els.pinToggle.setAttribute("aria-pressed", String(show));
      els.pinInput.focus();
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
    els.shareAlbum?.addEventListener("click", shareAlbum);
    els.albumDownload.addEventListener("click", downloadCurrentAlbum);
    els.viewerLoadMore?.addEventListener("click", () => loadMoreCurrentCollection());
    els.viewer.addEventListener("close", () =>
      document.body.classList.remove("is-locked"),
    );
    document.addEventListener("keydown", (event) => {
      if (!els.viewer.open) return;
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
      if (event.key === "Escape") closeViewer();
    });
    addEventListener("pagehide", saveScrollPosition);
    addEventListener("popstate", () => {
      readUrlState();
      syncControlsFromState();
      if (state.serverPagination) {
        loadGallery({ restoreScroll: false, preserveSharedEvent: true });
      } else {
        applyFilters({ resetPage: false, updateUrl: false });
      }
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

  readUrlState();
  syncControlsFromState();
  initInteractions();
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (error) {
    console.warn("POSE gallery ad could not be initialized.", error);
  }
  loadGallery({ restoreScroll: true, preserveSharedEvent: true });
})();
