/**
 * POSE Photobooth website inquiry backend — v19 diagnostic HTML email + Roaming Photobooth.
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Saves inquiries to Google Sheets, emails the POSE owner, and—when the
 * visitor provides an email address—sends a simple confirmation email.
 */

const SYSTEM_VERSION = "v20.0";
const NOTIFY_EMAIL = "adrian.magbanwa@gmail.com";
const SPREADSHEET_NAME = "POSE Website Inquiries";
const SHEET_NAME = "Inquiries";
const PROP_SPREADSHEET_ID = "POSE_INQUIRY_SPREADSHEET_ID";

const HEADERS = [
  "Received",
  "Submission ID",
  "Name",
  "Contact",
  "Email",
  "Event Date",
  "Event Type",
  "Venue / Location",
  "Interested In",
  "Status",
  "Source",
  "Client Submitted At",
  "Notes",
  "Package",
];

function doGet() {
  return json_({
    ok: true,
    service: "POSE Photobooth inquiry endpoint",
    version: SYSTEM_VERSION,
    htmlEmail: true,
    message: "The inquiry service is online.",
  });
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};

    // Honeypot: real visitors never fill this hidden field.
    if (String(p.website || "").trim()) {
      return json_({ ok: true, version: SYSTEM_VERSION });
    }

    const inquiry = {
      submissionId: clean_(p.submissionId, 120),
      date: clean_(p.date, 40),
      type: clean_(p.type, 80),
      location: clean_(p.location, 200),
      service: clean_(p.service, 120),
      package: clean_(p.package, 120),
      name: clean_(p.name, 120),
      contact: clean_(p.contact, 160),
      email: clean_(p.email, 180).toLowerCase(),
      consent: clean_(p.consent, 20),
      source: clean_(p.source, 500),
      clientSubmittedAt: clean_(p.submittedAt, 80),
    };

    validate_(inquiry);

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheet = getInquirySheet_();
      if (isDuplicate_(sheet, inquiry.submissionId)) {
        return json_({ ok: true, duplicate: true, version: SYSTEM_VERSION });
      }

      const received = new Date();
      appendInquiryRow_(sheet, inquiry, received);
      SpreadsheetApp.flush();

      const sheetUrl = sheet.getParent().getUrl();
      sendOwnerNotification_(inquiry, received, sheetUrl);
      if (inquiry.email) {
        sendCustomerConfirmation_(inquiry);
      }
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true, version: SYSTEM_VERSION });
  } catch (err) {
    console.error(err);
    return json_({
      ok: false,
      version: SYSTEM_VERSION,
      error: String(err && err.message ? err.message : err),
    });
  }
}

/** Run once from the Apps Script editor to create/migrate the sheet and approve permissions. */
function setup() {
  const sheet = getInquirySheet_();
  const url = sheet.getParent().getUrl();
  console.log("POSE inquiry sheet: " + url);
  console.log(
    "Headers: " +
      sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getDisplayValues()[0]
        .join(" | "),
  );
  return url;
}

function getInquirySheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_SPREADSHEET_ID);
  let ss;

  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (_) {
      id = "";
    }
  }

  if (!id) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    props.setProperty(PROP_SPREADSHEET_ID, ss.getId());
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
  }

  ensureHeaders_(sheet);
  return sheet;
}

/**
 * Migrates a v13 inquiry sheet safely by inserting Email after Contact.
 * Existing inquiry rows are preserved.
 */
function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  } else {
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const existing = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];

    // v13 had Contact in column D and Event Date in column E.
    if (!existing.includes("Email")) {
      sheet.insertColumnAfter(4);
      sheet.getRange(1, 5).setValue("Email");
    }

    // Normalize expected headers so new rows line up correctly.
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  sheet.autoResizeColumns(1, HEADERS.length);
}

/**
 * Writes an inquiry by header name instead of relying on fixed column numbers.
 * This keeps Email and future fields aligned even if an older sheet was migrated
 * or columns were manually moved.
 */
function appendInquiryRow_(sheet, inquiry, received) {
  ensureHeaders_(sheet);
  const headerValues = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];
  const valuesByHeader = {
    Received: received,
    "Submission ID": inquiry.submissionId,
    Name: inquiry.name,
    Contact: inquiry.contact,
    Email: inquiry.email,
    "Event Date": inquiry.date,
    "Event Type": inquiry.type,
    "Venue / Location": inquiry.location,
    "Interested In": inquiry.service,
    Status: "New",
    Source: inquiry.source,
    "Client Submitted At": inquiry.clientSubmittedAt,
    Notes: "",
    Package: inquiry.package,
  };

  const row = headerValues.map((h) =>
    Object.prototype.hasOwnProperty.call(valuesByHeader, h)
      ? valuesByHeader[h]
      : "",
  );
  sheet.appendRow(row);

  // Defensive verification: explicitly persist Email into the column named Email.
  const emailCol = headerValues.indexOf("Email") + 1;
  if (emailCol > 0) {
    sheet.getRange(sheet.getLastRow(), emailCol).setValue(inquiry.email || "");
  }
}

function isDuplicate_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return false;
  const start = Math.max(2, sheet.getLastRow() - 99);
  const values = sheet
    .getRange(start, 2, sheet.getLastRow() - start + 1, 1)
    .getDisplayValues();
  return values.some((r) => r[0] === id);
}

function validate_(i) {
  const required = ["date", "type", "location", "service", "name", "contact"];
  required.forEach((k) => {
    if (!i[k]) throw new Error("Missing required field: " + k);
  });
  if (i.consent !== "yes") throw new Error("Consent is required.");
  if (i.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) {
    throw new Error("Please enter a valid email address.");
  }
}

function sendOwnerNotification_(i, received, sheetUrl) {
  const receivedText = Utilities.formatDate(
    received,
    Session.getScriptTimeZone(),
    "MMM d, yyyy • h:mm a",
  );
  const eventDateText = formatEventDate_(i.date);
  const subject =
    "[POSE " +
    SYSTEM_VERSION +
    "] New inquiry • " +
    i.type +
    " • " +
    eventDateText +
    " • " +
    i.name;
  const phoneHref = "tel:" + String(i.contact || "").replace(/[^\d+]/g, "");
  const emailHref = i.email
    ? "mailto:" +
      encodeURIComponent(i.email) +
      "?subject=" +
      encodeURIComponent("POSE Photobooth inquiry — " + eventDateText)
    : "";
  const ref = i.submissionId ? i.submissionId.slice(0, 18) : "Website inquiry";

  const html = emailShell_(
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0c0c0d">' +
      '<tr><td style="padding:28px 32px 24px 32px">' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
      '<td valign="middle">' +
      brandLogo_() +
      "</td>" +
      '<td align="right" valign="middle"><span style="display:inline-block;background:#ff0068;color:#ffffff;padding:8px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:1.1px">NEW WEBSITE LEAD</span></td>' +
      "</tr></table>" +
      '<div style="margin-top:26px;color:#ffffff;font-size:30px;line-height:1.16;font-weight:800;letter-spacing:-.4px">New event inquiry</div>' +
      '<div style="margin-top:8px;color:#c7c7cc;font-size:14px;line-height:1.6">A new customer is interested in ' +
      esc_(i.service) +
      ".</div>" +
      "</td></tr>" +
      "</table>" +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' +
      '<tr><td style="padding:30px 32px 8px 32px">' +
      '<div style="font-size:12px;color:#8a8a91;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Customer</div>' +
      '<div style="margin-top:7px;font-size:27px;line-height:1.2;font-weight:800;color:#111111">' +
      esc_(i.name) +
      "</div>" +
      '<div style="margin-top:7px;color:#626268;font-size:14px;line-height:1.55">' +
      esc_(i.type) +
      " • " +
      esc_(eventDateText) +
      " • " +
      esc_(i.location) +
      "</div>" +
      "</td></tr>" +
      '<tr><td style="padding:18px 32px 0 32px">' +
      sectionTitle_("Event details") +
      detailsTable_([
        ["Service", i.service],
        ["Package", i.package],
        ["Event date", eventDateText],
        ["Event type", i.type],
        ["Venue / location", i.location],
      ]) +
      "</td></tr>" +
      '<tr><td style="padding:24px 32px 0 32px">' +
      sectionTitle_("Contact details") +
      detailsTable_([
        ["Mobile / Messenger", i.contact],
        ["Email", i.email || "Not provided"],
        ["Received", receivedText],
      ]) +
      "</td></tr>" +
      '<tr><td style="padding:28px 32px 4px 32px">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' +
      actionButton_(phoneHref, "Call customer", "#ff0068", "#ffffff") +
      (i.email
        ? actionButton_(
            emailHref,
            "Email customer",
            "#ffffff",
            "#111111",
            "#d9d9df",
          )
        : "") +
      actionButton_(sheetUrl, "Open Google Sheet", "#111111", "#ffffff") +
      "</tr></table>" +
      "</td></tr>" +
      '<tr><td style="padding:24px 32px 32px 32px">' +
      '<div style="background:#fff4f8;border:1px solid #ffd2e3;border-radius:14px;padding:17px 18px;color:#4d4d54;font-size:13px;line-height:1.65">' +
      '<strong style="color:#d90059">Recommended next step</strong><br>' +
      "Reply while the inquiry is fresh, confirm the event date and venue, then recommend the best package." +
      "</div>" +
      "</td></tr>" +
      "</table>" +
      emailFooter_(
        "Reference: " + esc_(ref) + " • Inquiry System " + SYSTEM_VERSION,
      ),
  );

  const plain = [
    "NEW POSE WEBSITE INQUIRY",
    "",
    i.name + " — " + i.type + " — " + eventDateText,
    "",
    "Service: " + i.service,
    "Package: " + i.package,
    "Venue / location: " + i.location,
    "Mobile / Messenger: " + i.contact,
    "Email: " + (i.email || "Not provided"),
    "Received: " + receivedText,
    "",
    "Google Sheet: " + sheetUrl,
  ].join("\n");

  GmailApp.sendEmail(NOTIFY_EMAIL, subject, plain, {
    htmlBody: html,
    name: "POSE Photobooth Website",
    replyTo: i.email || NOTIFY_EMAIL,
  });
}

function sendCustomerConfirmation_(i) {
  const eventDateText = formatEventDate_(i.date);
  const subject =
    "We received your POSE Photobooth inquiry • " + SYSTEM_VERSION;
  const facebookUrl = "https://www.facebook.com/pose.photobooth.2017";
  const websiteUrl = "https://poseph.com/";

  const html = emailShell_(
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0c0c0d">' +
      '<tr><td align="center" style="padding:30px 32px 26px 32px">' +
      brandLogo_() +
      '<div style="margin-top:24px;color:#ffffff;font-size:29px;line-height:1.2;font-weight:800;letter-spacing:-.35px">Thanks for reaching out, ' +
      esc_(firstName_(i.name)) +
      ".</div>" +
      '<div style="margin-top:9px;color:#c7c7cc;font-size:14px;line-height:1.6">Your event inquiry has been received by POSE Photobooth.</div>' +
      "</td></tr>" +
      "</table>" +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' +
      '<tr><td style="padding:30px 32px 0 32px;color:#4f4f55;font-size:15px;line-height:1.75">' +
      "We’ll review your event details, check availability, and get back to you using the contact information you provided." +
      "</td></tr>" +
      '<tr><td style="padding:24px 32px 0 32px">' +
      sectionTitle_("Your inquiry") +
      detailsTable_([
        ["Service", i.service],
        ["Package", i.package],
        ["Event date", eventDateText],
        ["Event type", i.type],
        ["Venue / location", i.location],
      ]) +
      "</td></tr>" +
      '<tr><td style="padding:24px 32px 0 32px">' +
      '<div style="background:#fff4f8;border:1px solid #ffd2e3;border-radius:14px;padding:18px 19px;color:#4d4d54;font-size:13px;line-height:1.7">' +
      '<strong style="display:block;color:#d90059;font-size:14px;margin-bottom:4px">What happens next?</strong>' +
      "We’ll confirm your date, answer any questions, and recommend the POSE experience that best fits your event." +
      "</div>" +
      "</td></tr>" +
      '<tr><td align="center" style="padding:28px 32px 8px 32px">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' +
      actionButton_(
        facebookUrl,
        "Message us on Facebook",
        "#ff0068",
        "#ffffff",
      ) +
      actionButton_(websiteUrl, "Visit poseph.com", "#111111", "#ffffff") +
      "</tr></table>" +
      "</td></tr>" +
      '<tr><td style="padding:18px 32px 32px 32px;color:#77777e;font-size:12px;line-height:1.7;text-align:center">' +
      "Need to add or correct something? Simply reply to this email." +
      "</td></tr>" +
      "</table>" +
      emailFooter_(
        "Capture • Print • Create Memories • Inquiry System " + SYSTEM_VERSION,
      ),
  );

  const plain =
    "Hi " +
    i.name +
    ",\n\n" +
    "We received your POSE Photobooth inquiry.\n\n" +
    "Service: " +
    i.service +
    "\n" +
    "Package: " +
    i.package +
    "\n" +
    "Event date: " +
    eventDateText +
    "\n" +
    "Event type: " +
    i.type +
    "\n" +
    "Venue / location: " +
    i.location +
    "\n\n" +
    "We will check availability and contact you with the best package options.\n\n" +
    "POSE Photobooth\nCapture • Print • Create Memories";

  GmailApp.sendEmail(i.email, subject, plain, {
    htmlBody: html,
    name: "POSE Photobooth",
    replyTo: NOTIFY_EMAIL,
  });
}

/**
 * Run this directly from the Apps Script editor after saving v19.
 * It sends BOTH branded HTML templates to NOTIFY_EMAIL without using the website.
 */
function sendV19TestEmails() {
  const now = new Date();
  const sample = {
    submissionId:
      "TEST-" +
      Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss"),
    date: Utilities.formatDate(
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    ),
    type: "Birthday",
    location: "Binangonan, Rizal",
    service: "Roaming Photobooth",
    name: "Adrian Magbanwa",
    contact: "09178760929",
    email: NOTIFY_EMAIL,
    consent: "yes",
    source: "Apps Script v19 diagnostic test",
    clientSubmittedAt: now.toISOString(),
  };
  const sheet = getInquirySheet_();
  sendOwnerNotification_(sample, now, sheet.getParent().getUrl());
  sendCustomerConfirmation_(sample);
  console.log("Sent v19 HTML diagnostic emails to " + NOTIFY_EMAIL);
  console.log("Expected subjects contain: " + SYSTEM_VERSION);
}

function emailShell_(content) {
  return (
    '<!doctype html><html><body style="margin:0;padding:0;background:#f3f3f5;font-family:Arial,Helvetica,sans-serif;color:#171719">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">POSE Photobooth inquiry update</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f3f5">' +
    '<tr><td align="center" style="padding:34px 12px">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e4e4e8;box-shadow:0 10px 28px rgba(0,0,0,.06)">' +
    "<tr><td>" +
    content +
    "</td></tr>" +
    "</table>" +
    "</td></tr>" +
    "</table>" +
    "</body></html>"
  );
}

function brandLogo_() {
  // Remote images are proxied by Gmail. Text fallback keeps the brand visible if images are blocked.
  return (
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td valign="middle"><img src="https://poseph.com/assets/images/pose-logo.png" width="138" alt="POSE Photobooth" style="display:block;border:0;outline:none;text-decoration:none;max-width:138px;height:auto"></td>' +
    '<td valign="middle" style="padding-left:14px;color:#ffffff">' +
    '<div style="font-size:11px;font-weight:700;letter-spacing:2.2px">POSE PHOTOBOOTH</div>' +
    '<div style="margin-top:4px;font-size:9px;color:#bcbcc2;letter-spacing:1.6px">CAPTURE • PRINT • CREATE MEMORIES</div>' +
    "</td>" +
    "</tr></table>"
  );
}

function sectionTitle_(text) {
  return (
    '<div style="margin-bottom:10px;font-size:11px;color:#8a8a91;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">' +
    esc_(text) +
    "</div>"
  );
}

function detailsTable_(rows) {
  let html =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e7e7eb;border-radius:14px;overflow:hidden">';
  rows.forEach(function (row, idx) {
    html +=
      "<tr>" +
      '<td width="38%" valign="top" style="padding:14px 16px;' +
      (idx ? "border-top:1px solid #ededf0;" : "") +
      'background:#fafafa;color:#87878e;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase">' +
      esc_(row[0]) +
      "</td>" +
      '<td valign="top" style="padding:14px 16px;' +
      (idx ? "border-top:1px solid #ededf0;" : "") +
      'color:#171719;font-size:14px;font-weight:700;line-height:1.5;word-break:break-word">' +
      esc_(row[1]) +
      "</td>" +
      "</tr>";
  });
  return html + "</table>";
}

function actionButton_(href, label, bg, color, border) {
  return (
    '<td style="padding:0 8px 8px 0"><a href="' +
    esc_(href) +
    '" style="display:inline-block;background:' +
    bg +
    ";color:" +
    color +
    ";text-decoration:none;padding:12px 16px;border-radius:10px;" +
    (border ? "border:1px solid " + border + ";" : "") +
    'font-size:13px;font-weight:800;white-space:nowrap">' +
    esc_(label) +
    "</a></td>"
  );
}

function emailFooter_(line2) {
  return (
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fafafa;border-top:1px solid #ededf0">' +
    '<tr><td align="center" style="padding:19px 30px;color:#8b8b91;font-size:11px;line-height:1.7">' +
    '<strong style="color:#44444a">POSE Photobooth</strong><br>' +
    esc_(line2) +
    "<br>" +
    '<span style="color:#a5a5aa">poseph.com</span>' +
    "</td></tr>" +
    "</table>"
  );
}

function formatEventDate_(value) {
  const s = String(value || "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM d, yyyy");
}

function firstName_(name) {
  const s = String(name || "").trim();
  return s ? s.split(/\s+/)[0] : "there";
}

function clean_(value, max) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .slice(0, max || 500);
}

function esc_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
