const { signJwt, verifyJwt } = require("../security");
const authTokenTtlHours = Number(process.env.AUTH_TOKEN_TTL_HOURS || 12);
const authJwtSecret = process.env.AUTH_JWT_SECRET || "";
const authCookieName = "access_token";
const isProduction = process.env.NODE_ENV === "production";

if (!Number.isFinite(authTokenTtlHours) || authTokenTtlHours <= 0) {
  throw new Error("AUTH_TOKEN_TTL_HOURS должен быть положительным числом.");
}

if (!authJwtSecret) {
  throw new Error("AUTH_JWT_SECRET обязателен.");
}
const parseCookies = (cookieHeader) => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((acc, item) => {
    const [rawKey, ...rawValueParts] = item.trim().split("=");
    if (!rawKey) {
      return acc;
    }

    const rawValue = rawValueParts.join("=");

    try {
      acc[rawKey] = decodeURIComponent(rawValue);
    } catch {
      acc[rawKey] = rawValue;
    }

    return acc;
  }, {});
};

const getAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  path: "/",
  maxAge: authTokenTtlHours * 60 * 60 * 1000,
});

const getEmptyAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  path: "/",
});

const getAuthPayload = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[authCookieName];

  if (!token) {
    return null;
  }

  return verifyJwt({ token, secret: authJwtSecret });
};

const requireAuth = (req, res, next) => {
  const payload = getAuthPayload(req);

  if (!payload) {
    res.status(401).json({
      message: "Требуется авторизация.",
    });
    return;
  }

  req.auth = payload;
  next();
};

const requireOwner = (req, res, next) => {
  const payload = getAuthPayload(req);

  if (!payload) {
    res.status(401).json({
      message: "Требуется авторизация.",
    });
    return;
  }

  if (payload.role !== "owner") {
    res.status(403).json({
      message: "Требуются права владельца.",
    });
    return;
  }

  req.auth = payload;
  next();
};

const issueAuthCookie = ({ res, user }) => {
  const token = signJwt({
    payload: {
      sub: String(user.id),
      username: user.username,
      role: user.role,
    },
    secret: authJwtSecret,
    expiresInSeconds: authTokenTtlHours * 60 * 60,
  });

  res.cookie(authCookieName, token, getAuthCookieOptions());
};
module.exports = {
  authCookieName,
  getEmptyAuthCookieOptions,
  issueAuthCookie,
  requireAuth,
  requireOwner,
};
