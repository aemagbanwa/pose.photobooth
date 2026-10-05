const ROOT_FOLDER_ID = '13TDUiu_rKxJJrdkQTGhn-o2nVFv6-ZjI';
const CACHE_SECONDS = 300;
const CONFIG_SHEET_ID_PROPERTY = 'POSE_GALLERY_CONFIG_SHEET_ID';
const CONFIG_SHEET_ID = '1F6c8ndtnvJ6F_40JGO9kj5VfbkQMIxLBIgXegXMt2vU';
const PIN_SALT_PROPERTY = 'POSE_GALLERY_PIN_SALT';
const MANAGE_SALT_PROPERTY = 'POSE_GALLERY_MANAGE_SALT';
const CLIENT_MANAGE_URL = 'https://poseph.com/gallery/manage/';
const ADMIN_URL = 'https://poseph.com/gallery/admin/';
const ADMIN_TOKEN_HASH_PROPERTY = 'POSE_GALLERY_ADMIN_TOKEN_HASH';
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
  'Generate Link',
  'Published',
  'Event Date',
  'Event Type'
];

function doGet(request) {
  try {
    requestConfigMemo_ = undefined;
    const params = (request && request.parameter) || {};

    if (params.admin === '1' && params.token) return adminDashboardData_(params.token);
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
    if (settings.published === false) return false;
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
    ? { pinEnabled: false, downloadsEnabled: true, published: true, expires: '' }
    : settingsFor_(row.id);
  if (!isRootFolder && (!settings.configured || settings.published !== true)) {
    return jsonResponse_({ ok: false, code: 'EVENT_NOT_FOUND', message: 'That event could not be found.' });
  }
  if (settings.expires && new Date(settings.expires + 'T23:59:59') < new Date()) {
    return jsonResponse_({ ok: false, code: 'EVENT_NOT_FOUND', message: 'That event could not be found.' });
  }
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
  const indexSheet = prepareIndexSheet_(spreadsheet);
  const configSheet = prepareConfigSheet_(spreadsheet);
  const configRows = configuredEventRecords_(configSheet);
  const rows = [];

  configRows.forEach(function (record) {
    try {
      const folder = DriveApp.getFolderById(record.id);
      if (!isEventFolder_(record.id)) return;
      const indexed = buildIndexRow_(folder, false, record);
      if (indexed) rows.push(indexed);
    } catch (error) {
      console.warn('Unable to index configured gallery ' + record.id + ': ' + error.message);
    }
  });

  rows.sort(function (a, b) { return String(b[3] || '').localeCompare(String(a[3] || '')); });
  const oldRows = Math.max(0, indexSheet.getLastRow() - 1);
  if (oldRows) indexSheet.getRange(2, 1, oldRows, INDEX_HEADERS.length).clearContent();
  if (rows.length) indexSheet.getRange(2, 1, rows.length, INDEX_HEADERS.length).setValues(rows);
  clearGalleryCache_();
  SpreadsheetApp.flush();
  return rows.length;
}

function buildIndexRow_(folder, isRoot, configRecord) {
  const id = folder.getId();
  const settings = isRoot ? { coverFileId: '', expires: '' } : settingsFor_(id);
  if (!isRoot && settings.expires && new Date(settings.expires + 'T23:59:59') < new Date()) return null;

  const parsed = parseEventFolder_(folder.getName());
  const details = isRoot ? { eventName: 'Recent celebrations', eventDate: '' } : {
    eventName: String((configRecord && configRecord.eventName) || parsed.eventName || folder.getName()).trim(),
    eventDate: String((configRecord && configRecord.eventDate) || parsed.eventDate || '').trim()
  };
  const eventType = String((configRecord && configRecord.eventType) || detectEventType_(details.eventName) || 'other').toLowerCase();
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
    eventType,
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
    if (body.action === 'adminUpdateEvent') return adminUpdateEvent_(body);
    if (body.action === 'adminRefreshIndex') return adminRefreshIndex_(body.token || '');
    if (body.action === 'adminGenerateClientLink') return adminGenerateClientLink_(body.token || '', body.eventId || '');
    if (body.action === 'adminCreateEvent') return adminCreateEvent_(body);
    if (body.action === 'adminDeleteEvent') return adminDeleteEvent_(body);
    return jsonResponse_({ ok: false, code: 'BAD_REQUEST', message: 'Unsupported request.' });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, code: 'BAD_REQUEST', message: 'Unable to process the gallery request: ' + error.message });
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
    ? { pinEnabled: false, coverFileId: '', downloadsEnabled: true, published: true, expires: '' }
    : settingsFor_(folderId);
  if (!isRootFolder && (!settings.configured || settings.published !== true)) {
    return jsonResponse_({ ok: false, code: 'EVENT_NOT_FOUND', message: 'That event could not be found.' });
  }
  if (settings.expires && new Date(settings.expires + 'T23:59:59') < new Date()) {
    return jsonResponse_({ ok: false, code: 'EVENT_NOT_FOUND', message: 'That event could not be found.' });
  }
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
      isRootFolder ? 'Recent celebrations' : (settings.eventName || parseEventFolder_(folder.getName()).eventName),
      isRootFolder ? '' : (settings.eventDate || parseEventFolder_(folder.getName()).eventDate),
      folder.getId()
    ),
    eventName: isRootFolder ? 'Recent celebrations' : (settings.eventName || parseEventFolder_(folder.getName()).eventName),
    eventDate: isRootFolder ? '' : (settings.eventDate || parseEventFolder_(folder.getName()).eventDate),
    eventType: isRootFolder ? 'other' : normalizeEventType_(settings.eventType || detectEventType_(settings.eventName || parseEventFolder_(folder.getName()).eventName)),
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
  const configured = config && config[folderId];
  if (!configured) {
    return { configured:false, pinHash:'', pinEnabled:true, published:false, coverFileId:'', downloadsEnabled:false, expires:'', eventName:'', eventDate:'', eventType:'other' };
  }
  return {
    configured:true,
    pinHash:String(configured.pinHash || ''),
    pinEnabled:configured.pinEnabled === true,
    published:configured.published === true,
    coverFileId:String(configured.coverFileId || ''),
    downloadsEnabled:configured.downloadsEnabled !== false,
    expires:String(configured.expires || ''),
    eventName:String(configured.eventName || ''),
    eventDate:String(configured.eventDate || ''),
    eventType:normalizeEventType_(configured.eventType)
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
    installConfigTrigger_(spreadsheet);
    clearGalleryCache_();
    console.log('POSE Gallery configuration: ' + spreadsheet.getUrl());
    return spreadsheet.getUrl();
  } finally {
    lock.releaseLock();
  }
}




function setupGalleryAdmin() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(ADMIN_TOKEN_HASH_PROPERTY, hashManageToken_(token));
  const url = ADMIN_URL + '?token=' + encodeURIComponent(token);
  console.log('POSE Gallery Admin: ' + url);
  return url;
}

function adminTokenValid_(token) {
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_TOKEN_HASH_PROPERTY) || '';
  return stored && secureEquals_(hashManageToken_(String(token || '').trim()), stored);
}

function adminDashboardData_(token) {
  if (!adminTokenValid_(token)) return jsonResponse_({ ok:false, code:'INVALID_ADMIN_TOKEN', message:'Admin link is invalid or has been replaced.' });
  const rows = readGalleryIndex_();
  const config = galleryConfig_() || {};
  const rowMap = {};
  rows.forEach(function(r){ rowMap[r.id] = r; });
  const spreadsheet = configSpreadsheet_();
  const sheet = spreadsheet ? prepareConfigSheet_(spreadsheet) : null;
  const records = sheet ? configuredEventRecords_(sheet) : [];
  const events = records.map(function(record){
    const r = rowMap[record.id] || {};
    const c = config[record.id] || {};
    return {
      id:record.id,
      slug:r.slug || '',
      eventName:record.eventName || r.eventName || '',
      eventDate:record.eventDate || r.eventDate || '',
      eventType:record.eventType || r.eventType || 'other',
      itemCount:Number(r.itemCount || 0),
      photoCount:Number(r.photoCount || 0),
      videoCount:Number(r.videoCount || 0),
      coverFileId:c.coverFileId || r.coverFileId || '',
      coverUrl:r.coverUrl || '',
      pinEnabled:c.pinEnabled === true,
      downloadsEnabled:c.downloadsEnabled !== false,
      expires:String(c.expires || ''),
      published:c.published === true
    };
  });
  return jsonResponse_({
    ok:true,
    events:events,
    unregisteredFolders:listUnregisteredFolders_(),
    updatedAt:new Date().toISOString()
  });
}

function adminBoolean_(value, fallback) {
  if (value === true || value === false) return value;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return Boolean(fallback);
}

function adminUpdateEvent_(body) {
  if (!adminTokenValid_(body.token || '')) {
    return jsonResponse_({ok:false, code:'INVALID_ADMIN_TOKEN', message:'Admin link is invalid.'});
  }

  const id = String(body.eventId || '').trim();
  if (!id) return jsonResponse_({ok:false, code:'INVALID_EVENT', message:'Event ID is missing.'});

  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) return jsonResponse_({ok:false, code:'CONFIG_UNAVAILABLE', message:'Gallery configuration is unavailable.'});

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Fast save path: do not run schema formatting, checkbox validation,
    // column hiding, or auto-resize on every Save click. Those operations are
    // intentionally reserved for setup/migration and were the main source of
    // admin save latency.
    const sheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
    if (!sheet) return jsonResponse_({ok:false, code:'CONFIG_UNAVAILABLE', message:'Events sheet is unavailable. Run setupGalleryConfig() once.'});
    if (sheet.getLastRow() < 2) return jsonResponse_({ok:false, message:'No events are configured.'});

    const columns = configColumnMap_(sheet);
    const folderColumn = columns['Folder ID'];
    const ids = sheet.getRange(2, folderColumn, sheet.getLastRow() - 1, 1).getDisplayValues();
    let row = 0;
    for (let i = 0; i < ids.length; i += 1) {
      if (String(ids[i][0] || '').trim() === id) { row = i + 2; break; }
    }
    if (!row) return jsonResponse_({ok:false, code:'EVENT_NOT_FOUND', message:'Event not found.'});

    const currentPinHash = String(sheet.getRange(row, columns['PIN Hash']).getDisplayValue() || '').trim();
    const currentPinEnabled = checkboxValue_(sheet.getRange(row, columns['PIN Enabled']).getValue());
    const currentDownloadsValue = sheet.getRange(row, columns['Downloads Enabled']).getValue();
    const currentDownloads = currentDownloadsValue === '' ? true : checkboxValue_(currentDownloadsValue);
    const currentPublishedValue = sheet.getRange(row, columns['Published']).getValue();
    const currentPublished = currentPublishedValue === '' ? true : checkboxValue_(currentPublishedValue);

    const pinEnabled = adminBoolean_(body.pinEnabled, currentPinEnabled);
    const downloadsEnabled = adminBoolean_(body.downloadsEnabled, currentDownloads);
    const published = adminBoolean_(body.published, currentPublished);
    const eventName = String(body.eventName || '').trim();
    const eventDate = String(body.eventDate || '').trim();
    const eventType = normalizeEventType_(body.eventType);
    const expires = String(body.expires || '').trim();
    const coverFileId = String(body.coverFileId || '').trim();
    const newPin = String(body.newPin || '').trim();

    if (!eventName) return jsonResponse_({ok:false, code:'EVENT_NAME_REQUIRED', message:'Event name is required.'});
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return jsonResponse_({ok:false, code:'INVALID_DATE', message:'Event date must use YYYY-MM-DD.'});
    if (newPin && (newPin.length < 4 || newPin.length > 32)) {
      return jsonResponse_({ok:false, code:'INVALID_PIN', message:'PIN must contain 4–32 characters.'});
    }
    if (pinEnabled && !newPin && !currentPinHash) {
      return jsonResponse_({ok:false, code:'PIN_REQUIRED', message:'Set a PIN before enabling PIN protection.'});
    }

    // Batch the whole record into one Sheet write. Apps Script calls to Sheets
    // are comparatively expensive, so one setValues() is much faster than
    // issuing a separate setValue() call for every field.
    const width = Math.max(sheet.getLastColumn(), CONFIG_HEADERS.length);
    const rowRange = sheet.getRange(row, 1, 1, width);
    const rowValues = rowRange.getValues()[0];
    const set = function(name, value) { rowValues[(columns[name] || 1) - 1] = value; };
    set('Event Name', eventName);
    set('Event Date', eventDate || '');
    set('Event Type', eventType);
    if (newPin) set('PIN Hash', hashPin_(newPin));
    set('PIN Enabled', pinEnabled);
    set('Downloads Enabled', downloadsEnabled);
    set('Expiry Date', expires || '');
    set('Cover File ID', coverFileId);
    set('Updated At', new Date());
    set('Published', published);
    rowRange.setValues([rowValues]);
    SpreadsheetApp.flush();

    // Verify with one row read instead of several individual cell reads.
    const savedRow = rowRange.getValues()[0];
    const get = function(name) { return savedRow[(columns[name] || 1) - 1]; };
    const savedPinEnabled = checkboxValue_(get('PIN Enabled'));
    const savedDownloadsRaw = get('Downloads Enabled');
    const savedDownloadsEnabled = savedDownloadsRaw === '' ? true : checkboxValue_(savedDownloadsRaw);
    const savedPublishedRaw = get('Published');
    const savedPublished = savedPublishedRaw === '' ? true : checkboxValue_(savedPublishedRaw);
    const savedExpires = dateValue_(get('Expiry Date'));
    const savedCoverFileId = String(get('Cover File ID') || '').trim();

    if (savedPinEnabled !== pinEnabled || savedDownloadsEnabled !== downloadsEnabled || savedPublished !== published) {
      return jsonResponse_({
        ok:false,
        code:'SAVE_VERIFY_FAILED',
        message:'Settings were written but did not read back correctly.',
        debug:{requested:{published:published,pinEnabled:pinEnabled,downloadsEnabled:downloadsEnabled},saved:{published:savedPublished,pinEnabled:savedPinEnabled,downloadsEnabled:savedDownloadsEnabled},row:row}
      });
    }

    clearGalleryCache_();
    requestConfigMemo_ = undefined;

    return jsonResponse_({
      ok:true,
      message:'Event settings saved.',
      event:{
        id:id,
        pinEnabled:savedPinEnabled,
        downloadsEnabled:savedDownloadsEnabled,
        published:savedPublished,
        expires:savedExpires,
        coverFileId:savedCoverFileId,
        eventName:eventName,
        eventDate:eventDate,
        eventType:eventType
      }
    });
  } catch (error) {
    console.error('adminUpdateEvent_ failed: ' + error.stack);
    return jsonResponse_({ok:false, code:'SAVE_FAILED', message:'Unable to save event settings: ' + error.message});
  } finally {
    lock.releaseLock();
  }
}

function adminRefreshIndex_(token) {
  if (!adminTokenValid_(token)) return jsonResponse_({ok:false, message:'Admin link is invalid.'});
  const count = refreshGalleryIndex();
  return jsonResponse_({ok:true, count:count, message:'Gallery index refreshed.'});
}

function adminGenerateClientLink_(token, eventId) {
  if (!adminTokenValid_(token)) return jsonResponse_({ok:false, message:'Admin link is invalid.'});
  const spreadsheet=configSpreadsheet_(); const sheet=spreadsheet && spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) return jsonResponse_({ok:false,message:'Events sheet is unavailable.'});
  if (sheet.getLastRow() < 2) return jsonResponse_({ok:false,message:'No events are configured.'});
  const vals=sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues();
  for (let i=0;i<vals.length;i++) if(String(vals[i][0]||'')===String(eventId||'')) {
    const link=generateClientManagementLinkForRow_(sheet,i+2); return jsonResponse_({ok:true,link:link});
  }
  return jsonResponse_({ok:false,message:'Event not found.'});
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
  prepareConfigSheet_(spreadsheet);
  refreshGalleryIndex();
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
  if (!spreadsheet) { requestConfigMemo_ = null; return requestConfigMemo_; }
  const sheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) { requestConfigMemo_ = {}; return requestConfigMemo_; }
  const columns = configColumnMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), CONFIG_HEADERS.length)).getValues();
  const config = {};
  values.forEach(function (row) {
    const at = function(name){ return row[(columns[name] || 1) - 1]; };
    const folderId = String(at('Folder ID') || '').trim();
    if (!folderId || Object.prototype.hasOwnProperty.call(config, folderId)) return;
    const publishedRaw = at('Published');
    config[folderId] = {
      pinHash: String(at('PIN Hash') || ''),
      pinEnabled: checkboxValue_(at('PIN Enabled')),
      downloadsEnabled: at('Downloads Enabled') === '' ? true : checkboxValue_(at('Downloads Enabled')),
      published: publishedRaw === '' ? false : checkboxValue_(publishedRaw),
      expires: dateValue_(at('Expiry Date')),
      coverFileId: String(at('Cover File ID') || '').trim(),
      eventName: String(at('Event Name') || '').trim(),
      eventDate: dateValue_(at('Event Date')),
      eventType: normalizeEventType_(at('Event Type'))
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
  if (sheet.getMaxColumns() < CONFIG_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), CONFIG_HEADERS.length - sheet.getMaxColumns());
  }

  // Keep the schema current without using insertCheckboxes() on whole columns.
  // insertCheckboxes() can replace existing checkbox values in some sheets;
  // data validation is applied instead so TRUE/FALSE values are preserved.
  sheet.getRange(1, 1, 1, CONFIG_HEADERS.length).setValues([CONFIG_HEADERS]);
  sheet.setFrozenRows(1);

  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  const maxDataRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 5, maxDataRows, 2).setDataValidation(checkboxRule);   // E:F
  sheet.getRange(2, 12, maxDataRows, 2).setDataValidation(checkboxRule); // L:M

  sheet.getRange('G2:G').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('I2:I').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  try { sheet.hideColumns(4); } catch (_) {}
  try { sheet.hideColumns(11); } catch (_) {}
  sheet.autoResizeColumns(1, CONFIG_HEADERS.length);
  return sheet;
}

function configColumnMap_(sheet) {
  const width = Math.max(sheet.getLastColumn(), CONFIG_HEADERS.length);
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const map = {};
  headers.forEach(function (name, index) {
    const key = String(name || '').trim();
    if (key && !map[key]) map[key] = index + 1;
  });
  CONFIG_HEADERS.forEach(function (name, index) {
    if (!map[name]) map[name] = index + 1;
  });
  return map;
}

function configuredEventRecords_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const columns = configColumnMap_(sheet);
  const width = Math.max(sheet.getLastColumn(), CONFIG_HEADERS.length);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().map(function(row, index){
    const at = function(name){ return row[(columns[name] || 1) - 1]; };
    return {
      row:index + 2,
      id:String(at('Folder ID') || '').trim(),
      eventName:String(at('Event Name') || '').trim(),
      eventDate:dateValue_(at('Event Date')),
      eventType:String(at('Event Type') || '').trim().toLowerCase() || detectEventType_(String(at('Event Name') || '').trim()),
      published:checkboxValue_(at('Published'))
    };
  }).filter(function(record){ return record.id; });
}

function listUnregisteredFolders_() {
  const spreadsheet = configSpreadsheet_();
  const sheet = spreadsheet ? prepareConfigSheet_(spreadsheet) : null;
  const registered = {};
  configuredEventRecords_(sheet).forEach(function(record){ registered[record.id] = true; });
  const result = [];
  const folders = DriveApp.getFolderById(ROOT_FOLDER_ID).getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (registered[folder.getId()]) continue;
    const parsed = parseEventFolder_(folder.getName());
    result.push({
      id:folder.getId(),
      folderName:folder.getName(),
      eventName:parsed.eventName,
      eventDate:parsed.eventDate,
      eventType:detectEventType_(parsed.eventName)
    });
  }
  result.sort(function(a,b){ return String(b.eventDate || '').localeCompare(String(a.eventDate || '')) || a.eventName.localeCompare(b.eventName); });
  return result;
}

function normalizeEventType_(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['birthday','wedding','debut','corporate','dedication','other'].indexOf(v) >= 0 ? v : 'other';
}

function syncConfigRows_(sheet) {
  // Deprecated intentionally. Drive folders are no longer auto-added to the
  // configuration. Gallery Admin is the single CRUD entry point.
  return configuredEventRecords_(sheet).length;
}

function adminCreateEvent_(body) {
  if (!adminTokenValid_(body.token || '')) return jsonResponse_({ok:false, code:'INVALID_ADMIN_TOKEN', message:'Admin link is invalid.'});
  const folderId = String(body.folderId || '').trim();
  if (!folderId || !isEventFolder_(folderId)) return jsonResponse_({ok:false, code:'INVALID_FOLDER', message:'Choose a valid folder from the POSE gallery Drive root.'});
  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) return jsonResponse_({ok:false, code:'CONFIG_UNAVAILABLE', message:'Gallery configuration is unavailable.'});
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sheet = prepareConfigSheet_(spreadsheet);
    const existing = configuredEventRecords_(sheet).some(function(record){ return record.id === folderId; });
    if (existing) return jsonResponse_({ok:false, code:'ALREADY_EXISTS', message:'This Drive folder is already registered.'});
    const folder = DriveApp.getFolderById(folderId);
    const parsed = parseEventFolder_(folder.getName());
    const eventName = String(body.eventName || parsed.eventName || folder.getName()).trim();
    const eventDate = String(body.eventDate || parsed.eventDate || '').trim();
    const eventType = normalizeEventType_(body.eventType || detectEventType_(eventName));
    const columns = configColumnMap_(sheet);
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, columns['Folder ID']).setValue(folderId);
    sheet.getRange(row, columns['Event Name']).setValue(eventName);
    sheet.getRange(row, columns['PIN Enabled']).setValue(false);
    sheet.getRange(row, columns['Downloads Enabled']).setValue(true);
    sheet.getRange(row, columns['Published']).setValue(false);
    sheet.getRange(row, columns['Event Date']).setValue(eventDate || '');
    sheet.getRange(row, columns['Event Type']).setValue(eventType);
    sheet.getRange(row, columns['Updated At']).setValue(new Date());
    SpreadsheetApp.flush();
    requestConfigMemo_ = undefined;
    refreshGalleryIndex();
    return jsonResponse_({ok:true, message:'Album added as an unpublished draft.', eventId:folderId});
  } catch(error) {
    return jsonResponse_({ok:false, code:'CREATE_FAILED', message:'Unable to add album: ' + error.message});
  } finally { lock.releaseLock(); }
}

function adminDeleteEvent_(body) {
  if (!adminTokenValid_(body.token || '')) return jsonResponse_({ok:false, code:'INVALID_ADMIN_TOKEN', message:'Admin link is invalid.'});
  const eventId = String(body.eventId || '').trim();
  const spreadsheet = configSpreadsheet_();
  if (!spreadsheet) return jsonResponse_({ok:false, message:'Gallery configuration is unavailable.'});
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sheet = prepareConfigSheet_(spreadsheet);
    const record = configuredEventRecords_(sheet).find(function(item){ return item.id === eventId; });
    if (!record) return jsonResponse_({ok:false, code:'EVENT_NOT_FOUND', message:'Album is not registered.'});
    sheet.deleteRow(record.row);
    SpreadsheetApp.flush();
    requestConfigMemo_ = undefined;
    refreshGalleryIndex();
    return jsonResponse_({ok:true, message:'Album removed from POSE Gallery. Google Drive files were not deleted.'});
  } catch(error) {
    return jsonResponse_({ok:false, code:'DELETE_FAILED', message:'Unable to remove album: ' + error.message});
  } finally { lock.releaseLock(); }
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
