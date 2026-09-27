const DEFAULT_INQUIRY_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbygLcbHGJ_aaHnmoEd1kNjhlCZ3TScMuOcbCeOxsUL2WQrxh2raInzekjNm_YWUS8c-/exec";
const UPSTREAM_TIMEOUT_MS = 10000;

function responseJson(response, text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return null;
  }
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const result = responseJson(response, text);
    if (!response.ok || result?.ok === false) {
      throw new Error(`Upstream request failed (${response.status})`);
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function postLegacyInquiry(endpoint, inquiry) {
  const fields = {
    submissionId: inquiry.submissionId,
    date: inquiry.date,
    type: inquiry.type,
    location: inquiry.location,
    service: inquiry.service,
    package: inquiry.package,
    name: inquiry.name,
    contact: inquiry.contact,
    email: inquiry.email,
    consent: "yes",
    source: inquiry.source,
    submittedAt: inquiry.submittedAt,
  };
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => body.set(key, value || ""));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body,
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    const result = responseJson(response, text);
    if (!response.ok || result?.ok === false) {
      throw new Error(`Legacy inquiry sync failed (${response.status})`);
    }
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

function splitName(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { firstName: parts.shift() || "", lastName: parts.join(" ") };
}

function getPackageId(packageName) {
  let packageIds;
  try {
    packageIds = JSON.parse(process.env.BOOTHMATE_PACKAGE_IDS || "{}");
  } catch (_) {
    throw new Error("BOOTHMATE_PACKAGE_IDS must be valid JSON.");
  }
  if (
    !packageIds ||
    typeof packageIds !== "object" ||
    Array.isArray(packageIds)
  ) {
    throw new Error("BOOTHMATE_PACKAGE_IDS must be a JSON object.");
  }
  return String(packageIds[String(packageName || "").trim()] || "").trim();
}

function buildBoothmatePayload(input, packageId) {
  const name = splitName(input.name);
  const notes = [
    input.notes && String(input.notes).trim(),
    input.type && `Event type: ${String(input.type).trim()}`,
    input.service && `Interested in: ${String(input.service).trim()}`,
    input.submissionId &&
      `Website reference: ${String(input.submissionId).trim()}`,
  ]
    .filter(Boolean)
    .join("\n");
  const payload = {
    ...name,
    email: String(input.email || "").trim(),
    phone: String(input.contact || "").trim(),
    packageId,
    eventDate: String(input.date || "").trim(),
    venue: String(input.location || "").trim(),
    notes,
    consent: true,
  };
  const guestCount = String(input.guestCount || "").trim();
  if (guestCount) payload.guestCount = Number(guestCount);
  return payload;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let input = req.body;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch (_) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body." });
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return res.status(400).json({ ok: false, error: "Invalid inquiry body." });
  }
  if (String(input.website || "").trim()) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const required = [
    "name",
    "date",
    "type",
    "location",
    "service",
    "package",
    "contact",
  ];
  const missing = required.filter((key) => !String(input[key] || "").trim());
  if (missing.length || ![true, "yes", "true"].includes(input.consent)) {
    return res.status(400).json({
      ok: false,
      error: missing.length
        ? `Missing required fields: ${missing.join(", ")}.`
        : "Consent is required.",
    });
  }

  let boothmateUrl;
  let packageId;
  let boothmateConfigError;
  try {
    const baseUrl = String(process.env.BOOTHMATE_API_BASE_URL || "").trim();
    const organizationKey = String(
      process.env.BOOTHMATE_ORGANIZATION_KEY || "",
    ).trim();
    if (!baseUrl || !organizationKey) {
      throw new Error("Boothmate environment variables are not configured.");
    }
    const base = new URL(baseUrl);
    if (base.protocol !== "https:")
      throw new Error("Boothmate API base URL must use HTTPS.");
    packageId = getPackageId(input.package);
    if (!packageId)
      throw new Error(
        `No Boothmate package ID is configured for "${input.package}".`,
      );
    boothmateUrl = new URL(
      `/api/public/storefront/${encodeURIComponent(organizationKey)}/inquiries`,
      base,
    ).toString();
  } catch (error) {
    boothmateConfigError = error;
  }

  const inquiry = {
    ...input,
    name: String(input.name).trim(),
    email: String(input.email || "").trim(),
    contact: String(input.contact).trim(),
    submissionId: String(input.submissionId || "").trim(),
    source: String(input.source || "POSE website").trim(),
    submittedAt: String(input.submittedAt || new Date().toISOString()),
  };
  const boothmatePayload = buildBoothmatePayload(inquiry, packageId);
  if (!boothmatePayload.firstName) {
    return res
      .status(400)
      .json({ ok: false, error: "Please provide your name." });
  }
  if (
    boothmatePayload.guestCount !== undefined &&
    (!Number.isInteger(boothmatePayload.guestCount) ||
      boothmatePayload.guestCount < 1)
  ) {
    return res
      .status(400)
      .json({
        ok: false,
        error: "Guest count must be a positive whole number.",
      });
  }

  const legacyEndpoint = String(
    process.env.POSE_INQUIRY_ENDPOINT || DEFAULT_INQUIRY_ENDPOINT,
  ).trim();
  const [boothmateResult, legacyResult] = await Promise.allSettled([
    boothmateUrl
      ? postJson(boothmateUrl, boothmatePayload)
      : Promise.reject(boothmateConfigError),
    postLegacyInquiry(legacyEndpoint, inquiry),
  ]);

  if (boothmateResult.status === "rejected") {
    console.error("Boothmate inquiry creation failed:", boothmateResult.reason);
    if (legacyResult.status === "fulfilled") {
      return res.status(201).json({
        ok: true,
        boothmateSynced: false,
        legacySynced: true,
      });
    }
    return res.status(502).json({
      ok: false,
      boothmateSynced: false,
      legacySynced: false,
      error:
        "We could not save this inquiry to Boothmate. Please try again or contact POSE directly.",
    });
  }

  const legacySynced = legacyResult.status === "fulfilled";
  if (!legacySynced) {
    console.error("Legacy inquiry sync failed:", legacyResult.reason);
  }
  return res
    .status(201)
    .json({ ok: true, boothmateSynced: true, legacySynced });
};
