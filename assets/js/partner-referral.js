(() => {"use strict";
  const key = "pose_partner_ref", query = new URLSearchParams(location.search);
  const proposed = (query.get("ref") || "").trim().toUpperCase();
  if (/^POSE[0-9A-F]{8}$/.test(proposed)) {
    try { localStorage.setItem(key, JSON.stringify({ code: proposed, at: Date.now() })); } catch (_) {}
  }
  let saved = "";
  try { const item = JSON.parse(localStorage.getItem(key) || "null"); if (item && (Date.now() - item.at) < 30 * 86400000 && /^POSE[0-9A-F]{8}$/.test(item.code)) saved = item.code; else localStorage.removeItem(key); } catch (_) {}
  const field = document.querySelector("#affiliateReferral"); if (field && saved && !field.value) field.value = saved;
})();
