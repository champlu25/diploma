const normalizeUsername = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeToken = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeRole = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const parseUserId = (value) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const normalizeOptionalText = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
};

const normalizeRequiredText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeInn = (value) => normalizeRequiredText(value);

const normalizeRequiredNonNegativeInteger = (value) => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  return null;
};

const normalizeRequiredPercent = (value) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value.trim())
      : NaN;

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
};

const normalizeOptionalEmail = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
};

const normalizeOptionalTimestamp = (value) => {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return Number.NaN;
  }

  return parsed;
};

const normalizeOptionalDate = (value) => {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.includes("T") ? raw.slice(0, raw.indexOf("T")) : raw;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const parsedFallback = new Date(raw);
    if (Number.isNaN(parsedFallback.getTime())) {
      return Number.NaN;
    }

    const iso = parsedFallback.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return Number.NaN;
    }

    return iso;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return Number.NaN;
  }

  return normalized;
};

const normalizeOptionalId = (value) => {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return parseUserId(trimmed);
  }

  return parseUserId(value);
};

const isInnValid = (inn) => /^\d{10}(\d{2})?$/.test(inn);

const isEmailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
module.exports = {
  isEmailValid,
  isInnValid,
  normalizeInn,
  normalizeOptionalDate,
  normalizeOptionalEmail,
  normalizeOptionalId,
  normalizeOptionalText,
  normalizeOptionalTimestamp,
  normalizeRequiredNonNegativeInteger,
  normalizeRequiredPercent,
  normalizeRequiredText,
  normalizeRole,
  normalizeToken,
  normalizeUsername,
  parseUserId,
};
