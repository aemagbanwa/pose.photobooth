const ROOT_FOLDER_ID = '13TDUiu_rKxJJrdkQTGhn-o2nVFv6-ZjI';
const CACHE_SECONDS = 300;
const CONFIG_SHEET_ID_PROPERTY = 'POSE_GALLERY_CONFIG_SHEET_ID';
const CONFIG_SHEET_ID = '1F6c8ndtnvJ6F_40JGO9kj5VfbkQMIxLBIgXegXMt2vU';
const PIN_SALT_PROPERTY = 'POSE_GALLERY_PIN_SALT';
const MANAGE_SALT_PROPERTY = 'POSE_GALLERY_MANAGE_SALT';
const CLIENT_MANAGE_URL = 'https://poseph.com/gallery/manage/';
const CONFIG_SHEET_NAME = 'Events';
const GALLERY_CACHE_KEY = 'pose-gallery-index-v9';
const INDEX_SHEET_NAME = 'Gallery Index';
const INDEX_HEADERS = [
  'Folder ID',
  'Slug',
  'Event Name',
  'Event Date',
  'Event Type',
  'Item Count',
  'Photo Count',
  'Video Count',
  'Cover File ID',
  'Cover URL',
  'Updated At'
];
const PIN_RATE_LIMIT_ATTEMPTS = 5;
const PIN_RATE_LIMIT_SECONDS = 60;
let requestConfigMemo_;
const CONFIG_HEADERS = [
  'Folder ID',
  'Event Name',
  'New PIN',
  'PIN Hash',
  'PIN Enabled',
  'Downloads Enabled',
  'Expiry Date',
  'Cover File ID',
  'Updated At',
  'Client Management Link',
  'Management Token Hash',
  'Generate Link'
];

function doGet(request) {
  try {
    requestConfigMemo_ = undefined;
    const params = (request && request.parameter) || {};

    if (params.manage === '1' && params.token) return managementEvent_(params.token);
    if (params.eventId) return unlockEvent_(params.eventId, params.pin || '', params);
    if (params.slug) return eventBySlug_(params.slug);

    return galleryIndexResponse_(params);
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      updatedAt: new Date().toISOString(),
      events: [],
      message: 'The gallery is temporarily unavailable.'
    });
  }
}

function galleryIndexResponse_(params) {
  params = params || {};
  const limitRaw = Number(params.limit || 12);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 12, 4), 48);
  const pageRaw = Number(params.page || 1);
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const category = String(params.category || 'all').toLowerCase();
  const media = String(params.media || 'all').toLowerCase();
  const sort = String(params.sort || 'newest').toLowerCase();
  const query = String(params.q || '').trim().toLowerCase().slice(0, 120);

  let rows = readGalleryIndex_();
  if (!rows.length) {
    refreshGalleryIndex();
    rows = readGalleryIndex_();
  }

  const now = new Date();
  const config = galleryConfig_() || {};
  const visible = rows.filter(function (row) {
    const settings = config[row.id] || {};
    if (settings.expires && new Date(settings.expires + 'T23:59:59') < now) return false;
    if (category !== 'all' && row.eventType !== category) return false;
    if (media === 'image' && row.photoCount < 1) return false;
    if (media === 'video' && row.videoCount < 1) return false;
    if (query && (row.eventName + ' ' + row.eventType).toLowerCase().indexOf(query) === -1) return false;
    return row.itemCount > 0;
  });

  visible.sort(function (a, b) {
    if (sort === 'name') return a.eventName.localeCompare(b.eventName);
    const compare = String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
    return sort === 'oldest' ? compare : -compare;
  });

  const totalEvents = visible.length;
  const totalItems = visible.reduce(function (sum, row) { return sum + row.itemCount; }, 0);
  const totalPages = Math.max(1, Math.ceil(totalEvents / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const pageRows = visible.slice(start, start + limit);

  const facets = {};
  rows.forEach(function (row) {
    if (row.itemCount < 1) return;
    facets[row.eventType] = (facets[row.eventType] || 0) + 1;
  });

  const events = pageRows.map(function (row) {
    const settings = row.id === ROOT_FOLDER_ID
      ? { pinEnabled: false, downloadsEnabled: true }
      : settingsFor_(row.id);
    return {
      id: row.id,
      slug: row.slug,
      eventName: row.eventName,
      eventDate: row.eventDate,
      eventType: row.eventType,
      locked: Boolean(settings.pinEnabled),
      downloadsEnabled: settings.downloadsEnabled !== false,
      coverUrl: row.coverUrl,
      itemCount: row.itemCount,
      photoCount: row.photoCount,
      videoCount: row.videoCount,
      items: []
    };
  });

  return jsonResponse_({
    ok: true,
    updatedAt: new Date().toISOString(),
    events: events,
    pagination: {
      page: safePage,
      limit: limit,
      totalEvents: totalEvents,
      totalItems: totalItems,
      totalPages: totalPages,
      hasPrevious: safePage > 1,
      hasNext: safePage < totalPages
    },
    facets: facets
  });
}

function eventBySlug_(slug) {
  slug = slugify_(slug);
  if (!slug) return jsonResponse_({ ok: false, code: 'EVENT_NOT_FOUND', message: 'That event could not be found.' });
  const rows = readGalleryIndex_();
  const row = rows.find(function (item) { return item.slug === slug; });
  if (!row) return jsonResponse_({ ok: false, code: 'EVENT_NOT_FOUND', message: 'That event could not be found.' });
  const settings = row.id === ROOT_FOLDER_ID
    ? { pinEnabled: false, downloadsEnabled: true }
    : settingsFor_(row.id);
  return jsonResponse_({
    ok: true,
    event: {
      id: row.id,
      slug: row.slug,
      eventName: row.eventName,
      eventDate: row.eventDate,
      eventType: row.eventType,
      locked: Boolean(settings.pinEnabled),
      downloadsEnabled: settings.downloadsEnabled !== false,
      coverUrl: row.coverUrl,
      itemCount: row.itemCount,
      photoCount: row.photoCount,
      videoCount: row.videoCount,
      items: []
    }
  });
}

function prepareIndexSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(INDEX_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(INDEX_SHEET_NAME);
  sheet.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('K2:K').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.autoResizeColumns(1, INDEX_HEADERS.length);
  return sheet;
}

function refreshGalleryIndex() {
  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) throw new Error('Gallery configuration spreadsheet is unavailable.');
  const sheet = prepareIndexSheet_(spreadsheet);
  const rows = [];
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

  const folders = root.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    const indexed = buildIndexRow_(folder, false);
    if (indexed) rows.push(indexed);
  }

  const rootIndexed = buildIndexRow_(root, true);
  if (rootIndexed && rootIndexed[5] > 0) rows.push(rootIndexed);

  rows.sort(function (a, b) { return String(b[3] || '').localeCompare(String(a[3] || '')); });
  const oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (oldRows) sheet.getRange(2, 1, oldRows, INDEX_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, INDEX_HEADERS.length).setValues(rows);
  clearGalleryCache_();
  SpreadsheetApp.flush();
  return rows.length;
}

function buildIndexRow_(folder, isRoot) {
  const id = folder.getId();
  const settings = isRoot
    ? { coverFileId: '', expires: '' }
    : settingsFor_(id);
  if (!isRoot && settings.expires && new Date(settings.expires + 'T23:59:59') < new Date()) return null;

  const details = isRoot
    ? { eventName: 'Recent celebrations', eventDate: '' }
    : parseEventFolder_(folder.getName());
  const items = readMedia_(folder, false);
  const photoCount = items.filter(function (item) { return item.mediaType === 'image'; }).length;
  const videoCount = items.length - photoCount;
  const cover = selectCover_(items, settings.coverFileId);
  const slug = uniqueSlugForFolder_(details.eventName, details.eventDate, id);
  return [
    id,
    slug,
    details.eventName,
    details.eventDate,
    detectEventType_(details.eventName),
    items.length,
    photoCount,
    videoCount,
    cover ? cover.id : '',
    cover ? driveThumbnailUrl_(cover.id, 640) : '',
    new Date()
  ];
}

function readGalleryIndex_() {
  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) return [];
  const sheet = spreadsheet.getSheetByName(INDEX_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, INDEX_HEADERS.length).getValues();
  return values.map(function (row) {
    return {
      id: String(row[0] || ''),
      slug: String(row[1] || ''),
      eventName: String(row[2] || ''),
      eventDate: dateValue_(row[3]),
      eventType: String(row[4] || 'other'),
      itemCount: Number(row[5] || 0),
      photoCount: Number(row[6] || 0),
      videoCount: Number(row[7] || 0),
      coverFileId: String(row[8] || ''),
      coverUrl: String(row[9] || ''),
      updatedAt: row[10] ? String(row[10]) : ''
    };
  }).filter(function (row) { return row.id && row.eventName; });
}

function uniqueSlugForFolder_(eventName, eventDate, folderId) {
  const base = slugify_((eventDate ? eventDate + '-' : '') + eventName);
  const suffix = String(folderId || '').slice(-6).toLowerCase();
  return (base || 'event') + '-' + suffix;
}

function slugify_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

function pinRateKey_(folderId, clientKey) {
  const safeClient = String(clientKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return 'pose-pin-rate-' + String(folderId).slice(-12) + '-' + safeClient;
}

function pinRateState_(folderId, clientKey) {
  const cache = CacheService.getScriptCache();
  const key = pinRateKey_(folderId, clientKey);
  const raw = cache.get(key);
  if (!raw) return { attempts: 0, blockedUntil: 0, key: key };
  try {
    const parsed = JSON.parse(raw);
    return {
      attempts: Number(parsed.attempts || 0),
      blockedUntil: Number(parsed.blockedUntil || 0),
      key: key
    };
  } catch (error) {
    return { attempts: 0, blockedUntil: 0, key: key };
  }
}

function recordPinFailure_(folderId, clientKey) {
  const cache = CacheService.getScriptCache();
  const state = pinRateState_(folderId, clientKey);
  state.attempts += 1;
  if (state.attempts >= PIN_RATE_LIMIT_ATTEMPTS) {
    state.blockedUntil = Date.now() + PIN_RATE_LIMIT_SECONDS * 1000;
    state.attempts = 0;
  }
  cache.put(state.key, JSON.stringify({
    attempts: state.attempts,
    blockedUntil: state.blockedUntil
  }), PIN_RATE_LIMIT_SECONDS);
  return state;
}

function clearPinFailures_(folderId, clientKey) {
  CacheService.getScriptCache().remove(pinRateKey_(folderId, clientKey));
}

function doPost(request) {
  try {
    const body = JSON.parse((request && request.postData && request.postData.contents) || '{}');
    if (body.action === 'setClientPin') return setClientPin_(body.token || '', body.pin || '');
    return jsonResponse_({ ok: false, code: 'BAD_REQUEST', message: 'Unsupported request.' });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, code: 'BAD_REQUEST', message: 'Unable to update the gallery PIN.' });
  }
}

function managementEvent_(token) {
  const row = managementRowForToken_(token);
  if (!row) return jsonResponse_({ ok: false, code: 'INVALID_TOKEN', message: 'This management link is invalid or has been replaced.' });
  return jsonResponse_({ ok: true, event: { id: row.folderId, eventName: row.eventName, pinEnabled: row.pinEnabled } });
}

function setClientPin_(token, pin) {
  pin = String(pin || '').trim();
  if (pin.length < 4 || pin.length > 32) {
    return jsonResponse_({ ok: false, code: 'INVALID_PIN', message: 'Use a PIN with 4 to 32 characters.' });
  }
  const match = managementRowForToken_(token);
  if (!match) return jsonResponse_({ ok: false, code: 'INVALID_TOKEN', message: 'This management link is invalid or has been replaced.' });
  const spreadsheet = configSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet.getRange(match.row, 4).setValue(hashPin_(pin));
    sheet.getRange(match.row, 5).setValue(true);
    sheet.getRange(match.row, 9).setValue(new Date());
    clearGalleryCache_();
  } finally {
    lock.releaseLock();
  }
  return jsonResponse_({ ok: true, message: 'Your gallery PIN has been updated.' });
}

function managementRowForToken_(token) {
  token = String(token || '').trim();
  if (!token) return null;
  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) return null;
  const sheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const wanted = hashManageToken_(token);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG_HEADERS.length).getValues();
  for (let index = 0; index < values.length; index += 1) {
    const stored = String(values[index][10] || '');
    if (stored && secureEquals_(wanted, stored)) {
      return { row: index + 2, folderId: String(values[index][0] || ''), eventName: String(values[index][1] || ''), pinEnabled: checkboxValue_(values[index][4]) };
    }
  }
  return null;
}

/**
 * Generates/replaces a client management link for a specific row.
 * Safe to call from the installed spreadsheet edit trigger.
 */
function generateClientManagementLinkForRow_(sheet, row) {
  const folderId = String(sheet.getRange(row, 1).getValue() || '').trim();
  if (!folderId) throw new Error('The selected row does not contain an event.');

  const token =
    Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');

  const link = CLIENT_MANAGE_URL + '?token=' + encodeURIComponent(token);

  // J = visible client management link
  sheet.getRange(row, 10).setValue(link);
  // K = private hashed management token
  sheet.getRange(row, 11).setValue(hashManageToken_(token));
  // I = updated timestamp
  sheet.getRange(row, 9).setValue(new Date());
  // L = Generate Link checkbox; reset after generation
  sheet.getRange(row, 12).setValue(false);

  SpreadsheetApp.flush();
  return link;
}

/**
 * Optional helper for testing from the Apps Script editor.
 * Pass a row number explicitly, e.g. generateClientManagementLinkForRow(3).
 */
function generateClientManagementLinkForRow(row) {
  row = Number(row);
  if (!Number.isInteger(row) || row < 2) {
    throw new Error('Provide an event row number, for example: generateClientManagementLinkForRow(3).');
  }

  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) throw new Error('Gallery configuration spreadsheet is unavailable.');

  const sheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) throw new Error('Events sheet was not found.');

  return generateClientManagementLinkForRow_(sheet, row);
}

function unlockEvent_(folderId, suppliedPin, params) {
  const isRootFolder = folderId === ROOT_FOLDER_ID;
  if (!isRootFolder && !isEventFolder_(folderId)) {
    return jsonResponse_({ ok: false, code: 'EVENT_NOT_FOUND', message: 'That event could not be found.' });
  }
  const folder = DriveApp.getFolderById(folderId);
  const settings = isRootFolder
    ? { pinEnabled: false, coverFileId: '', downloadsEnabled: true, expires: '' }
    : settingsFor_(folderId);
  params = params || {};
  const clientKey = String(params.clientKey || '');
  if (settings.pinEnabled) {
    const rate = pinRateState_(folderId, clientKey);
    if (rate.blockedUntil > Date.now()) {
      return jsonResponse_({
        ok: false,
        code: 'RATE_LIMITED',
        retryAfter: Math.max(1, Math.ceil((rate.blockedUntil - Date.now()) / 1000)),
        message: 'Too many incorrect PIN attempts. Please try again shortly.'
      });
    }
    if (!settings.pinHash || !secureEquals_(hashPin_(suppliedPin), settings.pinHash)) {
      const failed = recordPinFailure_(folderId, clientKey);
      if (failed.blockedUntil > Date.now()) {
        return jsonResponse_({
          ok: false,
          code: 'RATE_LIMITED',
          retryAfter: PIN_RATE_LIMIT_SECONDS,
          message: 'Too many incorrect PIN attempts. Please try again shortly.'
        });
      }
      return jsonResponse_({ ok: false, code: 'INVALID_PIN', message: 'That PIN is not correct.' });
    }
    clearPinFailures_(folderId, clientKey);
  }

  const requestedLimit = Number(params.limit || 30);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 30, 12), 60);
  const tokenOffset = Number(params.pageToken || '');
  const requestedOffset = Number(params.offset || 0);
  const offset = Math.max(0, Number.isFinite(tokenOffset) && String(params.pageToken || '') !== '' ? Math.floor(tokenOffset) : (Number.isFinite(requestedOffset) ? Math.floor(requestedOffset) : 0));

  return jsonResponse_({ ok: true, event: paginatedEvent_(folder, settings, offset, limit) });
}

function buildEvent_(folder, unlocked, includeItems) {
  const isRootFolder = folder.getId() === ROOT_FOLDER_ID;
  const settings = isRootFolder
    ? { pinEnabled: false, coverFileId: '', downloadsEnabled: true, expires: '' }
    : settingsFor_(folder.getId());
  if (settings.expires && new Date(settings.expires + 'T23:59:59') < new Date()) return null;
  const items = includeItems ? cachedEventMedia_(folder) : readMedia_(folder, false);
  return eventPayload_({
    folder: folder,
    details: isRootFolder
      ? { eventName: 'Recent celebrations', eventDate: '' }
      : parseEventFolder_(folder.getName()),
    settings: settings,
    items: items,
    protectedView: Boolean(settings.pinEnabled) && !unlocked,
    includeItems: includeItems
  });
}

function paginatedEvent_(folder, settings, offset, limit) {
  if (settings.expires && new Date(settings.expires + 'T23:59:59') < new Date()) {
    return null;
  }
  const isRootFolder = folder.getId() === ROOT_FOLDER_ID;
  const allItems = cachedEventMedia_(folder);
  const total = allItems.length;
  const pageItems = allItems.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  const photoCount = allItems.filter(function (item) { return item.mediaType === 'image'; }).length;
  const videoCount = total - photoCount;
  const cover = selectCover_(allItems, settings.coverFileId);
  return {
    id: folder.getId(),
    slug: uniqueSlugForFolder_(
      isRootFolder ? 'Recent celebrations' : parseEventFolder_(folder.getName()).eventName,
      isRootFolder ? '' : parseEventFolder_(folder.getName()).eventDate,
      folder.getId()
    ),
    eventName: isRootFolder ? 'Recent celebrations' : parseEventFolder_(folder.getName()).eventName,
    eventDate: isRootFolder ? '' : parseEventFolder_(folder.getName()).eventDate,
    eventType: detectEventType_(isRootFolder ? 'Recent celebrations' : parseEventFolder_(folder.getName()).eventName),
    locked: false,
    downloadsEnabled: settings.downloadsEnabled !== false,
    coverUrl: cover ? driveThumbnailUrl_(cover.id, 640) : '',
    itemCount: total,
    photoCount: photoCount,
    videoCount: videoCount,
    items: pageItems,
    offset: offset,
    limit: limit,
    hasMore: nextOffset < total,
    nextPageToken: nextOffset < total ? String(nextOffset) : ''
  };
}

function cachedEventMedia_(folder) {
  const cache = CacheService.getScriptCache();
  const key = 'pose-gallery-media-v2-' + folder.getId();
  const cached = cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      cache.remove(key);
    }
  }

  const items = readMedia_(folder, true);
  try {
    cache.put(key, JSON.stringify(items), CACHE_SECONDS);
  } catch (cacheError) {
    console.warn('POSE gallery event cache skipped: ' + cacheError.message);
  }
  return items;
}

function eventPayload_(context) {
  const cover = selectCover_(context.items, context.settings.coverFileId);
  const photoCount = context.items.filter(function (item) { return item.mediaType === 'image'; }).length;
  const videoCount = context.items.filter(function (item) { return item.mediaType === 'video'; }).length;
  const payload = {
    id: context.folder.getId(),
    eventName: context.details.eventName,
    eventDate: context.details.eventDate,
    eventType: detectEventType_(context.details.eventName),
    locked: context.protectedView,
    downloadsEnabled: context.settings.downloadsEnabled !== false,
    coverUrl: cover ? driveThumbnailUrl_(cover.id, 640) : '',
    itemCount: context.items.length,
    photoCount: photoCount,
    videoCount: videoCount
  };
  if (context.includeItems) payload.items = context.protectedView ? [] : context.items;
  return payload;
}

function settingsFor_(folderId) {
  const config = galleryConfig_();
  const configured = (config && config[folderId]) || {};
  return {
    pinHash: String(configured.pinHash || ''),
    // If the private configuration cannot be read, lock event folders rather
    // than accidentally exposing a protected gallery.
    pinEnabled: config === null || configured.pinEnabled === true,
    coverFileId: String(configured.coverFileId || ''),
    downloadsEnabled: configured.downloadsEnabled !== false,
    expires: String(configured.expires || '')
  };
}

/**
 * Run once from the Apps Script editor. It creates a private configuration
 * spreadsheet in the script owner's Drive and returns its URL.
 */
function setupGalleryConfig() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    let spreadsheet;
    const existingId = properties.getProperty(CONFIG_SHEET_ID_PROPERTY);
    if (existingId) {
      try {
        spreadsheet = SpreadsheetApp.openById(existingId);
      } catch (error) {
        console.warn('Existing gallery configuration could not be opened; creating a new one.');
      }
    }

    if (!spreadsheet) {
      spreadsheet = SpreadsheetApp.create('POSE Gallery Configuration');
      properties.setProperty(CONFIG_SHEET_ID_PROPERTY, spreadsheet.getId());
    }
    if (!properties.getProperty(PIN_SALT_PROPERTY)) {
      properties.setProperty(PIN_SALT_PROPERTY, Utilities.getUuid() + Utilities.getUuid());
    }
    if (!properties.getProperty(MANAGE_SALT_PROPERTY)) {
      properties.setProperty(MANAGE_SALT_PROPERTY, Utilities.getUuid() + Utilities.getUuid());
    }

    const sheet = prepareConfigSheet_(spreadsheet);
    syncConfigRows_(sheet);
    installConfigTrigger_(spreadsheet);
    clearGalleryCache_();
    console.log('POSE Gallery configuration: ' + spreadsheet.getUrl());
    return spreadsheet.getUrl();
  } finally {
    lock.releaseLock();
  }
}


/**
 * Run once after deploying this version. It builds the lightweight gallery
 * index and installs a time-based refresh every 10 minutes.
 */
function setupGalleryIndex() {
  refreshGalleryIndex();
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'refreshGalleryIndex';
  });
  if (!exists) {
    ScriptApp.newTrigger('refreshGalleryIndex').timeBased().everyMinutes(10).create();
  }
  return 'Gallery index ready.';
}

/** Run after adding Drive event folders so they appear in the config sheet. */
function refreshGalleryConfig() {
  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) throw new Error('Run setupGalleryConfig first.');
  const sheet = prepareConfigSheet_(spreadsheet);
  syncConfigRows_(sheet);
  clearGalleryCache_();
  return spreadsheet.getUrl();
}

/** Installed spreadsheet trigger; hashes PINs and generates client links. */
function onGalleryConfigEdit(event) {
  if (!event || !event.range || event.range.getSheet().getName() !== CONFIG_SHEET_NAME) return;

  const range = event.range;
  if (range.getRow() < 2) return;

  const sheet = range.getSheet();
  const firstRow = range.getRow();
  const lastRow = range.getLastRow();
  const firstColumn = range.getColumn();
  const lastColumn = range.getLastColumn();

  // Column C: New PIN -> hash it, enable protection, then clear plaintext.
  if (firstColumn <= 3 && lastColumn >= 3) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      const pinCell = sheet.getRange(row, 3);
      const newPin = String(pinCell.getDisplayValue() || '').trim();
      if (!newPin) continue;

      sheet.getRange(row, 4).setValue(hashPin_(newPin));
      sheet.getRange(row, 5).setValue(true);
      pinCell.clearContent();
    }
  }

  // Column L: Generate Link checkbox.
  if (firstColumn <= 12 && lastColumn >= 12) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      const generateCell = sheet.getRange(row, 12);
      if (checkboxValue_(generateCell.getValue())) {
        generateClientManagementLinkForRow_(sheet, row);
      }
    }
  }

  sheet.getRange(firstRow, 9, lastRow - firstRow + 1, 1).setValue(new Date());
  clearGalleryCache_();
}

function galleryConfig_() {
  if (requestConfigMemo_ !== undefined) return requestConfigMemo_;

  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) {
    requestConfigMemo_ = null;
    return requestConfigMemo_;
  }
  const sheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    requestConfigMemo_ = {};
    return requestConfigMemo_;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG_HEADERS.length).getValues();
  const config = {};
  values.forEach(function (row) {
    const folderId = String(row[0] || '').trim();
    // The first row is authoritative. This prevents old duplicate rows farther
    // down the Sheet from silently overriding the visible configuration.
    if (!folderId || Object.prototype.hasOwnProperty.call(config, folderId)) return;
    config[folderId] = {
      pinHash: String(row[3] || ''),
      pinEnabled: checkboxValue_(row[4]),
      downloadsEnabled: row[5] === '' ? true : checkboxValue_(row[5]),
      expires: dateValue_(row[6]),
      coverFileId: String(row[7] || '').trim()
    };
  });
  requestConfigMemo_ = config;
  return requestConfigMemo_;
}

function configSpreadsheet_() {
  // Keep the non-secret configuration document location stable across web-app
  // versions. PINs themselves remain only as salted hashes in the private Sheet.
  const id = CONFIG_SHEET_ID || PropertiesService.getScriptProperties().getProperty(CONFIG_SHEET_ID_PROPERTY);
  if (!id) return null;
  try {
    return SpreadsheetApp.openById(id);
  } catch (error) {
    console.error('POSE Gallery configuration is unavailable: ' + error.message);
    return null;
  }
}

function prepareConfigSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.getSheets()[0];
    sheet.setName(CONFIG_SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, CONFIG_HEADERS.length).setValues([CONFIG_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('E2:F').insertCheckboxes();
  sheet.getRange('L2:L').insertCheckboxes();
  sheet.getRange('G2:G').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('I2:I').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.hideColumns(4);
  sheet.hideColumns(11);
  sheet.autoResizeColumns(1, CONFIG_HEADERS.length);
  return sheet;
}

function syncConfigRows_(sheet) {
  const existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (row, index) {
      const id = String(row[0] || '').trim();
      if (id && !existing[id]) existing[id] = index + 2;
    });
  }

  const folders = DriveApp.getFolderById(ROOT_FOLDER_ID).getFolders();
  const newRows = [];
  while (folders.hasNext()) {
    const folder = folders.next();
    const id = folder.getId();
    if (existing[id]) {
      sheet.getRange(existing[id], 2).setValue(parseEventFolder_(folder.getName()).eventName);
    } else {
      newRows.push([id, parseEventFolder_(folder.getName()).eventName, '', '', false, true, '', '', new Date(), '', '', false]);
    }
  }
  if (newRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, CONFIG_HEADERS.length).setValues(newRows);
  }
}

function installConfigTrigger_(spreadsheet) {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'onGalleryConfigEdit';
  });
  if (!exists) ScriptApp.newTrigger('onGalleryConfigEdit').forSpreadsheet(spreadsheet).onEdit().create();
}

function hashPin_(pin) {
  const properties = PropertiesService.getScriptProperties();
  let salt = properties.getProperty(PIN_SALT_PROPERTY);
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(PIN_SALT_PROPERTY, salt);
  }
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + String(pin),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (value) {
    const normalized = value < 0 ? value + 256 : value;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function hashManageToken_(token) {
  const properties = PropertiesService.getScriptProperties();
  let salt = properties.getProperty(MANAGE_SALT_PROPERTY);
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(MANAGE_SALT_PROPERTY, salt);
  }
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + String(token), Utilities.Charset.UTF_8);
  return bytes.map(function (value) {
    const normalized = value < 0 ? value + 256 : value;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function secureEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index % Math.max(left.length, 1)) || 0)
      ^ (right.charCodeAt(index % Math.max(right.length, 1)) || 0);
  }
  return mismatch === 0;
}

function checkboxValue_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function dateValue_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).trim();
}

function isEventFolder_(folderId) {
  try {
    const rootId = DriveApp.getFolderById(ROOT_FOLDER_ID).getId();
    const parents = DriveApp.getFolderById(folderId).getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === rootId) return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

function clearGalleryCache_() {
  const cache = CacheService.getScriptCache();
  cache.remove(GALLERY_CACHE_KEY);
  requestConfigMemo_ = undefined;
}

function readMedia_(folder, includeDetails) {
  const items = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType() || '';
    const isImage = mimeType.indexOf('image/') === 0;
    const isVideo = mimeType.indexOf('video/') === 0;
    if (!isImage && !isVideo) continue;
    const id = file.getId();
    const item = {
      id: id,
      name: file.getName(),
      mimeType: mimeType,
      mediaType: isVideo ? 'video' : 'image'
    };
    if (includeDetails) {
      item.description = file.getDescription() || '';
      item.thumbnailUrl = driveThumbnailUrl_(id, 240);
      item.imageUrl = isImage ? driveThumbnailUrl_(id, 1600) : '';
      item.previewUrl = isVideo ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
      item.originalUrl = 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';
      item.downloadUrl = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id);
      item.modifiedTime = file.getLastUpdated().toISOString();
    }
    items.push(item);
  }
  if (includeDetails) {
    items.sort(function (a, b) { return String(b.modifiedTime).localeCompare(String(a.modifiedTime)); });
  }
  return items;
}

function driveThumbnailUrl_(fileId, size) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + size;
}

function selectCover_(items, configuredId) {
  return items.find(function (item) { return configuredId && item.id === configuredId; })
    || items.find(function (item) { return /^cover[\s_.-]/i.test(item.name) && item.mediaType === 'image'; })
    || items.find(function (item) { return item.mediaType === 'image'; })
    || items[0] || null;
}

function parseEventFolder_(folderName) {
  const match = String(folderName).trim().match(/^(\d{4})(\d{2})(\d{2})[\s_-]+(.+)$/);
  return match ? { eventName: match[4].trim(), eventDate: match[1] + '-' + match[2] + '-' + match[3] } : { eventName: String(folderName).trim(), eventDate: '' };
}

function detectEventType_(eventName) {
  const name = String(eventName).toLowerCase();
  if (/dedication|christening|baptism|baptismal/.test(name)) return 'dedication';
  if (/wedding|nuptial|bride|groom/.test(name)) return 'wedding';
  if (/debut|18th/.test(name)) return 'debut';
  if (/corporate|company|year[- ]?end|christmas party|team/.test(name)) return 'corporate';
  if (/birthday|bday|\d+(st|nd|rd|th)/.test(name)) return 'birthday';
  return 'other';
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
