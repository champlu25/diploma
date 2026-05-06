const crypto = require("crypto");

const generateTempPassword = () => {
  const raw = crypto.randomBytes(18).toString("base64");
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, "");
  return normalized.slice(0, 12);
};

module.exports = { generateTempPassword };
