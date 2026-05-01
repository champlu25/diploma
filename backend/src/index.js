const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const crypto = require("crypto");

dotenv.config();

const { pool } = require("./db");
const {
  hashPassword,
  signJwt,
  validatePassword,
  verifyJwt,
  verifyPassword,
} = require("./security");

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
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

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());

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
    // As a fallback, try parsing any ISO-like date/time string and keep only date part.
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

const generateTempPassword = () => {
  const raw = crypto.randomBytes(18).toString("base64");
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, "");
  return normalized.slice(0, 12);
};

app.get("/api/health", (_req, res) => {
  res.status(200).json({ message: "Сервис работает" });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.last_name,
          u.first_name,
          u.middle_name,
          u.must_change_password,
          r.name AS role,
          u.group_lead_user_id,
          gl.username AS group_lead_username
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        LEFT JOIN users AS gl ON gl.id = u.group_lead_user_id
        WHERE u.id = $1
        LIMIT 1
      `,
      [req.auth.sub]
    );

    if (result.rowCount === 0) {
      res.clearCookie(authCookieName, getEmptyAuthCookieOptions());
      res.status(401).json({
        message: "Сессия недействительна. Войдите снова.",
      });
      return;
    }

    const user = result.rows[0];

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        lastName: user.last_name,
        firstName: user.first_name,
        middleName: user.middle_name,
        role: user.role,
        mustChangePassword: user.must_change_password,
        groupLeadUserId: user.group_lead_user_id,
        groupLeadUsername: user.group_lead_username,
      },
    });
  } catch (error) {
    console.error("Не удалось получить текущую сессию:", error);
    res.status(500).json({
      message: "Не удалось получить текущую сессию.",
    });
  }
});

app.patch("/api/auth/me", requireAuth, async (req, res) => {
  const lastName = normalizeOptionalText(req.body?.lastName);
  const firstName = normalizeOptionalText(req.body?.firstName);
  const middleName = normalizeOptionalText(req.body?.middleName);

  try {
    const updatedResult = await pool.query(
      `
        UPDATE users
        SET
          last_name = $1,
          first_name = $2,
          middle_name = $3
        WHERE id = $4
        RETURNING id, username, last_name, first_name, middle_name, must_change_password, role_id, group_lead_user_id
      `,
      [lastName, firstName, middleName, req.auth.sub]
    );

    if (updatedResult.rowCount === 0) {
      res.clearCookie(authCookieName, getEmptyAuthCookieOptions());
      res.status(401).json({
        message: "Сессия недействительна. Войдите снова.",
      });
      return;
    }

    const user = updatedResult.rows[0];

    const roleResult = await pool.query(
      `
        SELECT name
        FROM roles
        WHERE id = $1
        LIMIT 1
      `,
      [user.role_id]
    );

    const role = roleResult.rowCount > 0 ? roleResult.rows[0].name : null;

    const groupLeadUsernameResult =
      user.group_lead_user_id === null
        ? null
        : await pool.query(
            `
              SELECT username
              FROM users
              WHERE id = $1
              LIMIT 1
            `,
            [user.group_lead_user_id]
          );

    const groupLeadUsername =
      groupLeadUsernameResult && groupLeadUsernameResult.rowCount > 0
        ? groupLeadUsernameResult.rows[0].username
        : null;

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        lastName: user.last_name,
        firstName: user.first_name,
        middleName: user.middle_name,
        role,
        mustChangePassword: user.must_change_password,
        groupLeadUserId: user.group_lead_user_id,
        groupLeadUsername,
      },
    });
  } catch (error) {
    console.error("Не удалось обновить профиль:", error);
    res.status(500).json({
      message: "Не удалось обновить профиль.",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !password) {
    res.status(400).json({
      message: "Поля username и password обязательны.",
    });
    return;
  }

  try {
    const userResult = await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.last_name,
          u.first_name,
          u.middle_name,
          u.must_change_password,
          u.password_hash,
          r.name AS role,
          u.group_lead_user_id,
          gl.username AS group_lead_username
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        LEFT JOIN users AS gl ON gl.id = u.group_lead_user_id
        WHERE u.username = $1
        LIMIT 1
      `,
      [username]
    );

    if (userResult.rowCount === 0) {
      res.status(401).json({
        message: "Неверный логин или пароль.",
      });
      return;
    }

    const user = userResult.rows[0];

    if (!verifyPassword(password, user.password_hash)) {
      res.status(401).json({
        message: "Неверный логин или пароль.",
      });
      return;
    }

    const authUser = {
      id: user.id,
      username: user.username,
      lastName: user.last_name,
      firstName: user.first_name,
      middleName: user.middle_name,
      role: user.role,
      mustChangePassword: user.must_change_password,
      groupLeadUserId: user.group_lead_user_id,
      groupLeadUsername: user.group_lead_username,
    };

    issueAuthCookie({ res, user: authUser });

    res.status(200).json({
      message: "Вход выполнен.",
      user: authUser,
    });
  } catch (error) {
    console.error("Не удалось выполнить вход:", error);
    res.status(500).json({
      message: "Не удалось выполнить вход.",
    });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(authCookieName, getEmptyAuthCookieOptions());
  res.status(200).json({
    message: "Выход выполнен.",
  });
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const oldPassword =
    typeof req.body?.oldPassword === "string" ? req.body.oldPassword : "";
  const newPassword =
    typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (!newPassword) {
    res.status(400).json({
      message: "Поле newPassword обязательно.",
    });
    return;
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    res.status(400).json({
      message: passwordError,
    });
    return;
  }

  try {
    const userResult = await pool.query(
      `
        SELECT
          id,
          password_hash,
          must_change_password
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.auth.sub]
    );

    if (userResult.rowCount === 0) {
      res.clearCookie(authCookieName, getEmptyAuthCookieOptions());
      res.status(401).json({
        message: "Сессия недействительна. Войдите снова.",
      });
      return;
    }

    const user = userResult.rows[0];
    const canSkipOldPassword = Boolean(user.must_change_password);

    if (!canSkipOldPassword) {
      if (!oldPassword) {
        res.status(400).json({
          message: "Поле oldPassword обязательно.",
        });
        return;
      }

      if (!verifyPassword(oldPassword, user.password_hash)) {
        res.status(400).json({
          message: "Старый пароль введён неверно.",
        });
        return;
      }
    }

    const nextHash = hashPassword(newPassword);

    await pool.query(
      `
        UPDATE users
        SET
          password_hash = $1,
          must_change_password = FALSE,
          updated_at = NOW()
        WHERE id = $2
      `,
      [nextHash, user.id]
    );

    res.status(200).json({
      message: "Пароль изменён.",
    });
  } catch (error) {
    console.error("Не удалось изменить пароль:", error);
    res.status(500).json({
      message: "Не удалось изменить пароль.",
    });
  }
});

app.get("/api/users", requireOwner, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.last_name,
          u.first_name,
          u.middle_name,
          r.name AS role,
          u.group_lead_user_id,
          gl.username AS group_lead_username,
          u.must_change_password,
          u.created_at,
          u.updated_at
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        LEFT JOIN users AS gl ON gl.id = u.group_lead_user_id
        ORDER BY u.id ASC
      `
    );

    res.status(200).json({ users: result.rows });
  } catch (error) {
    console.error("Не удалось получить пользователей:", error);
    res.status(500).json({
      message: "Не удалось получить пользователей.",
    });
  }
});

app.get("/api/companies", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);

  try {
    let params = [currentUserId];
    let whereSql = "WHERE c.manager_user_id = $1";

    if (req.auth.role === "owner") {
      params = [];
      whereSql = "";
    } else if (req.auth.role === "group_lead") {
      whereSql = `
        WHERE c.manager_user_id = $1
          OR c.manager_user_id IN (
            SELECT u.id
            FROM users AS u
            JOIN roles AS r ON r.id = u.role_id
            WHERE u.group_lead_user_id = $1
              AND r.name = 'manager'
          )
      `;
    }

    const result = await pool.query(
      `
        SELECT
          c.id,
          c.manager_user_id,
          COALESCE(
            NULLIF(trim(concat_ws(' ', u.last_name, u.first_name, u.middle_name)), ''),
            u.username
          ) AS manager_name,
          c.name,
          c.inn,
          c.contact_name,
          c.phone,
          c.email,
          c.comment,
          c.next_contact_at,
          c.created_at,
          c.updated_at
        FROM companies AS c
        JOIN users AS u ON u.id = c.manager_user_id
        ${whereSql}
        ORDER BY c.id ASC
      `,
      params
    );

    res.status(200).json({
      companies: result.rows,
    });
  } catch (error) {
    console.error("Не удалось получить компании:", error);
    res.status(500).json({
      message: "Не удалось получить компании.",
    });
  }
});

app.get("/api/companies/lookups", requireAuth, async (_req, res) => {
  try {
    const [taxSystemsResult, channelsResult] = await Promise.all([
      pool.query(
        `
          SELECT id, name
          FROM tax_systems
          ORDER BY id ASC
        `
      ),
      pool.query(
        `
          SELECT id, name, is_active AS "isActive"
          FROM communication_channels
          WHERE is_active = TRUE
          ORDER BY id ASC
        `
      ),
    ]);

    res.status(200).json({
      taxSystems: taxSystemsResult.rows,
      communicationChannels: channelsResult.rows,
    });
  } catch (error) {
    console.error("Не удалось получить справочники компаний:", error);
    res.status(500).json({
      message: "Не удалось получить справочники компаний.",
    });
  }
});

app.get("/api/companies/:companyId", requireAuth, async (req, res) => {
  const companyId = parseUserId(req.params?.companyId);
  const currentUserId = Number(req.auth.sub);

  if (!companyId) {
    res.status(400).json({
      message: "Некорректный companyId.",
    });
    return;
  }

  try {
    let params = [currentUserId, companyId];
    let whereSql = "WHERE c.id = $2 AND c.manager_user_id = $1";

    if (req.auth.role === "owner") {
      params = [companyId];
      whereSql = "WHERE c.id = $1";
    } else if (req.auth.role === "group_lead") {
      whereSql = `
        WHERE c.id = $2
          AND (
            c.manager_user_id = $1
            OR c.manager_user_id IN (
              SELECT u.id
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.group_lead_user_id = $1
                AND r.name = 'manager'
            )
          )
      `;
    }

    const result = await pool.query(
      `
        SELECT
          c.id,
          c.manager_user_id,
          COALESCE(
            NULLIF(trim(concat_ws(' ', u.last_name, u.first_name, u.middle_name)), ''),
            u.username
          ) AS manager_name,
          c.name,
          c.inn,
          c.contact_name,
          c.phone,
          c.email,
          c.comment,
          c.next_contact_at,
          c.legal_address,
          c.actual_address,
          c.director_birth_date,
          c.activity,
          c.revenue_rub,
          c.negative_info,
          c.bik,
          c.rs,
          c.ks,
          c.tax_system_id,
          ts.name AS tax_system_name,
          c.preferred_communication_channel_id,
          cc.name AS preferred_communication_channel_name,
          c.created_at,
          c.updated_at
        FROM companies AS c
        JOIN users AS u ON u.id = c.manager_user_id
        LEFT JOIN tax_systems AS ts ON ts.id = c.tax_system_id
        LEFT JOIN communication_channels AS cc ON cc.id = c.preferred_communication_channel_id
        ${whereSql}
        LIMIT 1
      `,
      params
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    res.status(200).json({
      company: result.rows[0],
    });
  } catch (error) {
    console.error("Не удалось получить компанию:", error);
    res.status(500).json({
      message: "Не удалось получить компанию.",
    });
  }
});

app.get("/api/users/transfer-targets", requireAuth, async (req, res) => {
  if (req.auth.role !== "owner" && req.auth.role !== "group_lead") {
    res.status(403).json({
      message: "Требуются права руководителя группы или владельца.",
    });
    return;
  }

  try {
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.last_name,
          u.first_name,
          u.middle_name,
          r.name AS role,
          u.group_lead_user_id,
          gl.username AS group_lead_username
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        LEFT JOIN users AS gl ON gl.id = u.group_lead_user_id
        ORDER BY u.id ASC
      `
    );

    res.status(200).json({
      users: result.rows,
    });
  } catch (error) {
    console.error("Не удалось получить список пользователей для передачи:", error);
    res.status(500).json({
      message: "Не удалось получить список пользователей.",
    });
  }
});

app.get("/api/group-lead/managers", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);

  if (req.auth.role !== "group_lead") {
    res.status(403).json({
      message: "Требуются права руководителя группы.",
    });
    return;
  }

  try {
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.last_name,
          u.first_name,
          u.middle_name,
          COUNT(c.id)::INT AS companies_count
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        LEFT JOIN companies AS c ON c.manager_user_id = u.id
        WHERE r.name = 'manager'
          AND u.group_lead_user_id = $1
        GROUP BY u.id, u.username, u.last_name, u.first_name, u.middle_name
        ORDER BY u.id ASC
      `,
      [currentUserId]
    );

    res.status(200).json({
      managers: result.rows,
    });
  } catch (error) {
    console.error("Не удалось получить менеджеров группы:", error);
    res.status(500).json({
      message: "Не удалось получить менеджеров группы.",
    });
  }
});

app.patch(
  "/api/owner/users/:userId/group-lead",
  requireOwner,
  async (req, res) => {
    const userId = parseUserId(req.params?.userId);
    const groupLeadUserIdRaw = req.body?.groupLeadUserId;
    const groupLeadUserId =
      groupLeadUserIdRaw === null || typeof groupLeadUserIdRaw === "undefined"
        ? null
        : parseUserId(groupLeadUserIdRaw);

    if (!userId) {
      res.status(400).json({
        message: "Некорректный userId.",
      });
      return;
    }

    if (
      groupLeadUserIdRaw !== null &&
      typeof groupLeadUserIdRaw !== "undefined" &&
      !groupLeadUserId
    ) {
      res.status(400).json({
        message: "Некорректный groupLeadUserId.",
      });
      return;
    }

    if (groupLeadUserId && groupLeadUserId === userId) {
      res.status(400).json({
        message: "Пользователь не может быть руководителем своей же группы.",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const managerResult = await client.query(
        `
        SELECT
          u.id,
          u.username,
          r.name AS role
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        WHERE u.id = $1
        LIMIT 1
      `,
        [userId]
      );

      if (managerResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({
          message: "Пользователь не найден.",
        });
        return;
      }

      const targetUser = managerResult.rows[0];
      if (targetUser.role !== "manager") {
        await client.query("ROLLBACK");
        res.status(400).json({
          message:
            "Назначать руководителя группы можно только пользователю с ролью manager.",
        });
        return;
      }

      if (!groupLeadUserId) {
        await client.query("ROLLBACK");
        res.status(400).json({
          message:
            "У менеджера обязательно должен быть закреплен руководитель группы.",
        });
        return;
      }

      if (groupLeadUserId) {
        const leadResult = await client.query(
          `
          SELECT
            u.id,
            u.username,
            r.name AS role
          FROM users AS u
          JOIN roles AS r ON r.id = u.role_id
          WHERE u.id = $1
          LIMIT 1
        `,
          [groupLeadUserId]
        );

        if (leadResult.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(404).json({
            message: "Руководитель группы не найден.",
          });
          return;
        }

        if (leadResult.rows[0].role !== "group_lead") {
          await client.query("ROLLBACK");
          res.status(400).json({
            message: "Указанный пользователь не является руководителем группы.",
          });
          return;
        }
      }

      const updateResult = await client.query(
        `
        UPDATE users
        SET group_lead_user_id = $1
        WHERE id = $2
        RETURNING id, username, last_name, first_name, middle_name, group_lead_user_id
      `,
        [groupLeadUserId, userId]
      );

      await client.query("COMMIT");

      res.status(200).json({
        message: "Руководитель группы назначен.",
        user: updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Не удалось назначить руководителя группы:", error);
      res.status(500).json({
        message: "Не удалось назначить руководителя группы.",
      });
    } finally {
      client.release();
    }
  }
);

app.post("/api/companies", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);
  const name = normalizeRequiredText(req.body?.name);
  const inn = normalizeInn(req.body?.inn);
  const contactName = normalizeOptionalText(req.body?.contactName);
  const phone = normalizeOptionalText(req.body?.phone);
  const email = normalizeOptionalEmail(req.body?.email);
  const comment = normalizeOptionalText(req.body?.comment);
  const nextContactAt = normalizeOptionalTimestamp(req.body?.nextContactAt);
  const legalAddress = normalizeOptionalText(req.body?.legalAddress);
  const actualAddress = normalizeOptionalText(req.body?.actualAddress);
  const directorBirthDate = normalizeOptionalDate(req.body?.directorBirthDate);
  const activity = normalizeOptionalText(req.body?.activity);
  const negativeInfo = normalizeOptionalText(req.body?.negativeInfo);
  const preferredCommunicationChannelId = normalizeOptionalId(req.body?.preferredCommunicationChannelId);
  const taxSystemIdInput = normalizeOptionalId(req.body?.taxSystemId);
  const bik = normalizeOptionalText(req.body?.bik);
  const rs = normalizeOptionalText(req.body?.rs);
  const ks = normalizeOptionalText(req.body?.ks);
  const revenueRub =
    Object.prototype.hasOwnProperty.call(req.body ?? {}, "revenueRub")
      ? normalizeRequiredNonNegativeInteger(req.body?.revenueRub)
      : null;

  if (!name) {
    res.status(400).json({
      message: "Наименование компании обязательно.",
    });
    return;
  }

  if (!isInnValid(inn)) {
    res.status(400).json({
      message: "ИНН должен содержать только цифры и иметь длину 10 или 12.",
    });
    return;
  }

  if (email && !isEmailValid(email)) {
    res.status(400).json({
      message: "Некорректный формат email.",
    });
    return;
  }

  if (Number.isNaN(nextContactAt?.getTime?.())) {
    res.status(400).json({
      message: "Некорректная дата следующего контакта.",
    });
    return;
  }

  if (Number.isNaN(directorBirthDate)) {
    res.status(400).json({
      message: "Некорректная дата рождения директора.",
    });
    return;
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body ?? {}, "preferredCommunicationChannelId") &&
    req.body?.preferredCommunicationChannelId !== null &&
    typeof req.body?.preferredCommunicationChannelId !== "undefined" &&
    typeof req.body?.preferredCommunicationChannelId !== "string" &&
    typeof req.body?.preferredCommunicationChannelId !== "number"
  ) {
    res.status(400).json({
      message: "Некорректный preferredCommunicationChannelId.",
    });
    return;
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body ?? {}, "preferredCommunicationChannelId") &&
    req.body?.preferredCommunicationChannelId &&
    !preferredCommunicationChannelId
  ) {
    res.status(400).json({
      message: "Некорректный preferredCommunicationChannelId.",
    });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "revenueRub") && req.body?.revenueRub && revenueRub === null) {
    res.status(400).json({
      message: "Некорректная выручка.",
    });
    return;
  }

  const hasAnyRequisites = Boolean(bik || rs || ks);
  if (hasAnyRequisites && (!bik || !rs || !ks)) {
    res.status(400).json({
      message: "Реквизиты должны быть заполнены полностью (БИК, Р/С, К/С) или не заполнены вовсе.",
    });
    return;
  }

  try {
    const taxSystemResult = await pool.query(
      `SELECT id FROM tax_systems ORDER BY id ASC LIMIT 1`
    );

    const fallbackTaxSystemId = taxSystemResult.rows[0]?.id ?? null;
    const taxSystemId = taxSystemIdInput ?? fallbackTaxSystemId;

    if (taxSystemId) {
      const existsResult = await pool.query(`SELECT 1 FROM tax_systems WHERE id = $1 LIMIT 1`, [taxSystemId]);
      if (existsResult.rowCount === 0) {
        res.status(400).json({
          message: "Некорректная система налогообложения.",
        });
        return;
      }
    }

    const result = await pool.query(
      `
        INSERT INTO companies (
          manager_user_id,
          name,
          inn,
          contact_name,
          phone,
          email,
          comment,
          next_contact_at,
          legal_address,
          actual_address,
          director_birth_date,
          activity,
          revenue_rub,
          negative_info,
          bik,
          rs,
          ks,
          tax_system_id,
          preferred_communication_channel_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING
          id,
          manager_user_id,
          (
            SELECT
              COALESCE(
                NULLIF(trim(concat_ws(' ', last_name, first_name, middle_name)), ''),
                email
              )
            FROM users
            WHERE id = manager_user_id
          ) AS manager_name,
          name,
          inn,
          contact_name,
          phone,
          email,
          comment,
          next_contact_at,
          legal_address,
          actual_address,
          director_birth_date,
          activity,
          revenue_rub,
          negative_info,
          bik,
          rs,
          ks,
          tax_system_id,
          preferred_communication_channel_id,
          created_at,
          updated_at
      `,
      [
        currentUserId,
        name,
        inn,
        contactName,
        phone,
        email,
        comment,
        nextContactAt,
        legalAddress,
        actualAddress,
        directorBirthDate,
        activity,
        revenueRub,
        negativeInfo,
        bik,
        rs,
        ks,
        taxSystemId,
        preferredCommunicationChannelId,
      ]
    );

    res.status(201).json({
      message: "Компания успешно создана.",
      company: result.rows[0],
    });
  } catch (error) {
    if (error?.code === "23505") {
      res.status(409).json({
        message: "Компания с таким ИНН уже существует.",
      });
      return;
    }

    console.error("Не удалось создать компанию:", error);
    res.status(500).json({
      message: "Не удалось создать компанию.",
    });
  }
});

app.patch("/api/companies/:companyId", requireAuth, async (req, res) => {
  const companyId = parseUserId(req.params?.companyId);
  const currentUserId = Number(req.auth.sub);

  if (!companyId) {
    res.status(400).json({
      message: "Некорректный companyId.",
    });
    return;
  }

  const fieldsToUpdate = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequiredText(req.body?.name);
    if (!name) {
      res.status(400).json({
        message: "Наименование компании обязательно.",
      });
      return;
    }
    fieldsToUpdate.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "inn")) {
    const inn = normalizeInn(req.body?.inn);
    if (!isInnValid(inn)) {
      res.status(400).json({
        message: "ИНН должен содержать только цифры и иметь длину 10 или 12.",
      });
      return;
    }
    fieldsToUpdate.inn = inn;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "contactName")) {
    fieldsToUpdate.contact_name = normalizeOptionalText(req.body?.contactName);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
    fieldsToUpdate.phone = normalizeOptionalText(req.body?.phone);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
    const email = normalizeOptionalEmail(req.body?.email);
    if (email && !isEmailValid(email)) {
      res.status(400).json({
        message: "Некорректный формат email.",
      });
      return;
    }
    fieldsToUpdate.email = email;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "comment")) {
    fieldsToUpdate.comment = normalizeOptionalText(req.body?.comment);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "nextContactAt")) {
    const nextContactAt = normalizeOptionalTimestamp(req.body?.nextContactAt);
    if (Number.isNaN(nextContactAt?.getTime?.())) {
      res.status(400).json({
        message: "Некорректная дата следующего контакта.",
      });
      return;
    }
    fieldsToUpdate.next_contact_at = nextContactAt;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "legalAddress")) {
    fieldsToUpdate.legal_address = normalizeOptionalText(req.body?.legalAddress);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "actualAddress")) {
    fieldsToUpdate.actual_address = normalizeOptionalText(req.body?.actualAddress);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "directorBirthDate")) {
    const directorBirthDate = normalizeOptionalDate(req.body?.directorBirthDate);
    if (Number.isNaN(directorBirthDate)) {
      res.status(400).json({
        message: "Некорректная дата рождения директора.",
      });
      return;
    }

    fieldsToUpdate.director_birth_date = directorBirthDate;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "activity")) {
    fieldsToUpdate.activity = normalizeOptionalText(req.body?.activity);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "negativeInfo")) {
    fieldsToUpdate.negative_info = normalizeOptionalText(req.body?.negativeInfo);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "revenueRub")) {
    const raw = req.body?.revenueRub;
    const revenueRub = normalizeRequiredNonNegativeInteger(raw);

    if (raw && revenueRub === null) {
      res.status(400).json({
        message: "Некорректная выручка.",
      });
      return;
    }

    fieldsToUpdate.revenue_rub = revenueRub;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "preferredCommunicationChannelId")) {
    const raw = req.body?.preferredCommunicationChannelId;
    const preferredCommunicationChannelId = normalizeOptionalId(raw);

    if (raw && !preferredCommunicationChannelId) {
      res.status(400).json({
        message: "Некорректный preferredCommunicationChannelId.",
      });
      return;
    }

    fieldsToUpdate.preferred_communication_channel_id = preferredCommunicationChannelId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "taxSystemId")) {
    const raw = req.body?.taxSystemId;
    const taxSystemId = normalizeOptionalId(raw);

    if (raw && !taxSystemId) {
      res.status(400).json({
        message: "Некорректная система налогообложения.",
      });
      return;
    }

    fieldsToUpdate.tax_system_id = taxSystemId;
  }

  const bik = Object.prototype.hasOwnProperty.call(req.body, "bik") ? normalizeOptionalText(req.body?.bik) : undefined;
  const rs = Object.prototype.hasOwnProperty.call(req.body, "rs") ? normalizeOptionalText(req.body?.rs) : undefined;
  const ks = Object.prototype.hasOwnProperty.call(req.body, "ks") ? normalizeOptionalText(req.body?.ks) : undefined;

  if (typeof bik !== "undefined") fieldsToUpdate.bik = bik;
  if (typeof rs !== "undefined") fieldsToUpdate.rs = rs;
  if (typeof ks !== "undefined") fieldsToUpdate.ks = ks;

  const updateKeys = Object.keys(fieldsToUpdate);
  if (updateKeys.length === 0) {
    res.status(400).json({
      message: "Нет полей для обновления.",
    });
    return;
  }

  try {
    const companyResult = await pool.query(
      `
        SELECT
          c.id,
          c.manager_user_id,
          c.bik,
          c.rs,
          c.ks,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.manager_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.manager_user_id
                AND u.group_lead_user_id = $1
                AND r.name = 'manager'
            ) THEN TRUE
            ELSE FALSE
          END AS can_manage
        FROM companies AS c
        WHERE c.id = $3
        LIMIT 1
      `,
      [currentUserId, req.auth.role, companyId]
    );

    if (companyResult.rowCount === 0) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    const company = companyResult.rows[0];
    if (!company.can_manage) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    const nextBik = Object.prototype.hasOwnProperty.call(fieldsToUpdate, "bik") ? fieldsToUpdate.bik : company.bik;
    const nextRs = Object.prototype.hasOwnProperty.call(fieldsToUpdate, "rs") ? fieldsToUpdate.rs : company.rs;
    const nextKs = Object.prototype.hasOwnProperty.call(fieldsToUpdate, "ks") ? fieldsToUpdate.ks : company.ks;

    const hasAnyRequisites = Boolean(nextBik || nextRs || nextKs);
    const hasAllRequisites = Boolean(nextBik && nextRs && nextKs);

    if (hasAnyRequisites && !hasAllRequisites) {
      res.status(400).json({
        message: "Реквизиты должны быть заполнены полностью (БИК, Р/С, К/С) или не заполнены вовсе.",
      });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(fieldsToUpdate, "tax_system_id")) {
      const taxSystemId = fieldsToUpdate.tax_system_id;
      if (taxSystemId) {
        const existsResult = await pool.query(`SELECT 1 FROM tax_systems WHERE id = $1 LIMIT 1`, [taxSystemId]);
        if (existsResult.rowCount === 0) {
          res.status(400).json({
            message: "Некорректная система налогообложения.",
          });
          return;
        }
      }
    }

    const values = [];
    const assignments = updateKeys.map((key, index) => {
      values.push(fieldsToUpdate[key]);
      return `${key} = $${index + 1}`;
    });
    values.push(companyId);

    const updateResult = await pool.query(
      `
        UPDATE companies
        SET ${assignments.join(", ")}
        WHERE id = $${values.length}
        RETURNING
          id,
          manager_user_id,
          (
            SELECT
              COALESCE(
                NULLIF(trim(concat_ws(' ', last_name, first_name, middle_name)), ''),
                email
              )
            FROM users
            WHERE id = manager_user_id
          ) AS manager_name,
          name,
          inn,
          contact_name,
          phone,
          email,
          comment,
          next_contact_at,
          legal_address,
          actual_address,
          director_birth_date,
          activity,
          revenue_rub,
          negative_info,
          bik,
          rs,
          ks,
          tax_system_id,
          preferred_communication_channel_id,
          created_at,
          updated_at
      `,
      values
    );

    res.status(200).json({
      message: "Компания обновлена.",
      company: updateResult.rows[0],
    });
  } catch (error) {
    if (error?.code === "23505") {
      res.status(409).json({
        message: "Компания с таким ИНН уже существует.",
      });
      return;
    }

    console.error("Не удалось обновить компанию:", error);
    res.status(500).json({
      message: "Не удалось обновить компанию.",
    });
  }
});

app.post("/api/companies/:companyId/transfer", requireAuth, async (req, res) => {
  if (req.auth.role !== "owner" && req.auth.role !== "group_lead") {
    res.status(403).json({
      message: "Требуются права руководителя группы или владельца.",
    });
    return;
  }

  const companyId = parseUserId(req.params?.companyId);
  const currentUserId = Number(req.auth.sub);
  const targetUserId = parseUserId(req.body?.targetUserId);

  if (!companyId) {
    res.status(400).json({
      message: "Некорректный companyId.",
    });
    return;
  }

  if (!targetUserId) {
    res.status(400).json({
      message: "Некорректный targetUserId.",
    });
    return;
  }

  try {
    const targetUserResult = await pool.query(
      `
        SELECT id
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [targetUserId]
    );

    if (targetUserResult.rowCount === 0) {
      res.status(404).json({
        message: "Пользователь-получатель не найден.",
      });
      return;
    }

    const companyResult = await pool.query(
      `
        SELECT
          c.id,
          c.manager_user_id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN $2 = 'group_lead' AND (
              c.manager_user_id = $1
              OR EXISTS (
                SELECT 1
                FROM users AS u
                JOIN roles AS r ON r.id = u.role_id
                WHERE u.id = c.manager_user_id
                  AND u.group_lead_user_id = $1
                  AND r.name = 'manager'
              )
            ) THEN TRUE
            ELSE FALSE
          END AS can_transfer
        FROM companies AS c
        WHERE c.id = $3
        LIMIT 1
      `,
      [currentUserId, req.auth.role, companyId]
    );

    if (companyResult.rowCount === 0) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    const company = companyResult.rows[0];
    if (!company.can_transfer) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    const updateResult = await pool.query(
      `
        UPDATE companies
        SET manager_user_id = $1
        WHERE id = $2
        RETURNING
          id,
          manager_user_id,
          (
            SELECT
              COALESCE(
                NULLIF(trim(concat_ws(' ', last_name, first_name, middle_name)), ''),
                email
              )
            FROM users
            WHERE id = manager_user_id
          ) AS manager_name,
          name,
          inn,
          contact_name,
          phone,
          email,
          comment,
          next_contact_at,
          created_at,
          updated_at
      `,
      [targetUserId, companyId]
    );

    res.status(200).json({
      message: "Компания передана.",
      company: updateResult.rows[0],
    });
  } catch (error) {
    console.error("Не удалось передать компанию:", error);
    res.status(500).json({
      message: "Не удалось передать компанию.",
    });
  }
});

app.delete("/api/companies/:companyId", requireAuth, async (req, res) => {
  const companyId = parseUserId(req.params?.companyId);
  const currentUserId = Number(req.auth.sub);

  if (!companyId) {
    res.status(400).json({
      message: "Некорректный companyId.",
    });
    return;
  }

  try {
    const companyResult = await pool.query(
      `
        SELECT
          c.id,
          c.manager_user_id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.manager_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.manager_user_id
                AND u.group_lead_user_id = $1
                AND r.name = 'manager'
            ) THEN TRUE
            ELSE FALSE
          END AS can_manage
        FROM companies AS c
        WHERE c.id = $3
        LIMIT 1
      `,
      [currentUserId, req.auth.role, companyId]
    );

    if (companyResult.rowCount === 0) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    const company = companyResult.rows[0];
    if (!company.can_manage) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    await pool.query(
      `
        DELETE FROM companies
        WHERE id = $1
      `,
      [companyId]
    );

    res.status(200).json({
      message: "Компания удалена.",
    });
  } catch (error) {
    console.error("Не удалось удалить компанию:", error);
    res.status(500).json({
      message: "Не удалось удалить компанию.",
    });
  }
});

app.get("/api/deals/lookups", requireAuth, async (_req, res) => {
  try {
    const [
      statusesResult,
      lifecycleStatusesResult,
      leasingCompaniesResult,
      stagesResult,
    ] =
      await Promise.all([
        pool.query(
          `
          SELECT
            id,
            name
          FROM deal_statuses
          ORDER BY id ASC
        `
        ),
        pool.query(
          `
          SELECT
            id,
            name
          FROM deal_lifecycle_statuses
          ORDER BY id ASC
        `
        ),
        pool.query(
          `
          SELECT
            id,
            name
          FROM leasing_companies
          WHERE is_active = TRUE
          ORDER BY id ASC
        `
        ),
        pool.query(
          `
          SELECT
            id,
            name
          FROM deal_stages
          ORDER BY id ASC
        `
        ),
      ]);

    res.status(200).json({
      dealStatuses: statusesResult.rows,
      dealLifecycleStatuses: lifecycleStatusesResult.rows,
      leasingCompanies: leasingCompaniesResult.rows,
      dealStages: stagesResult.rows,
    });
  } catch (error) {
    console.error("Не удалось получить справочники сделок:", error);
    res.status(500).json({
      message: "Не удалось получить справочники сделок.",
    });
  }
});

app.get("/api/dashboards/chart-view-settings", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);

  try {
    const [chartTypesResult, settingsResult] = await Promise.all([
      pool.query(
        `
          SELECT
            id::INT AS id,
            name
          FROM chart_types
          ORDER BY id ASC
        `
      ),
      pool.query(
        `
          SELECT
            s.chart_key AS "chartKey",
            s.chart_type_id::INT AS "chartTypeId"
          FROM user_chart_view_settings AS s
          WHERE s.user_id = $1
          ORDER BY s.chart_key ASC
        `,
        [currentUserId]
      ),
    ]);

    res.status(200).json({
      chartTypes: chartTypesResult.rows,
      settings: settingsResult.rows,
    });
  } catch (error) {
    console.error("Не удалось получить настройки отображения графиков:", error);
    res.status(500).json({
      message: "Не удалось получить настройки отображения графиков.",
    });
  }
});

app.put("/api/dashboards/chart-view-settings/:chartKey", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);
  const chartKey = typeof req.params?.chartKey === "string" ? req.params.chartKey.trim() : "";
  const chartTypeId = parseUserId(req.body?.chartTypeId);

  if (!chartKey || !/^[a-z0-9_]+$/.test(chartKey) || chartKey.length > 80) {
    res.status(400).json({
      message: "Некорректный chartKey.",
    });
    return;
  }

  if (!chartTypeId) {
    res.status(400).json({
      message: "Некорректный chartTypeId.",
    });
    return;
  }

  try {
    const chartTypeResult = await pool.query(`SELECT id FROM chart_types WHERE id = $1 LIMIT 1`, [
      chartTypeId,
    ]);

    if (chartTypeResult.rowCount === 0) {
      res.status(404).json({
        message: "Тип графика не найден.",
      });
      return;
    }

    const upsertResult = await pool.query(
      `
        INSERT INTO user_chart_view_settings (user_id, chart_key, chart_type_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, chart_key)
        DO UPDATE SET
          chart_type_id = EXCLUDED.chart_type_id
        RETURNING
          chart_key AS "chartKey",
          chart_type_id AS "chartTypeId"
      `,
      [currentUserId, chartKey, chartTypeId]
    );

    res.status(200).json({
      message: "Настройка сохранена.",
      setting: {
        chartKey: upsertResult.rows[0].chartKey,
        chartTypeId,
      },
    });
  } catch (error) {
    console.error("Не удалось сохранить настройки отображения графиков:", error);
    res.status(500).json({
      message: "Не удалось сохранить настройки отображения графиков.",
    });
  }
});

app.get("/api/deals", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);
  const companyIdFilter = parseUserId(req.query?.companyId);

  try {
    let params = [currentUserId];
    const whereParts = ["c.manager_user_id = $1"];

    if (req.auth.role === "owner") {
      params = [];
      whereParts.length = 0;
    } else if (req.auth.role === "group_lead") {
      whereParts.length = 0;
      whereParts.push(`
        (
          c.manager_user_id = $1
          OR c.manager_user_id IN (
            SELECT u.id
            FROM users AS u
            JOIN roles AS r ON r.id = u.role_id
            WHERE u.group_lead_user_id = $1
              AND r.name = 'manager'
          )
        )
      `);
    }

    if (companyIdFilter) {
      params.push(companyIdFilter);
      whereParts.push(`d.company_id = $${params.length}`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT
          d.id,
          d.company_id,
          c.manager_user_id AS company_manager_user_id,
          COALESCE(
            NULLIF(trim(concat_ws(' ', u.last_name, u.first_name, u.middle_name)), ''),
            u.username
          ) AS manager_name,
          c.name AS company_name,
          c.inn AS company_inn,
          d.need,
          d.deal_status_id,
          ds.name AS deal_status_name,
          d.deal_lifecycle_status_id,
          dls.name AS deal_lifecycle_status_name,
          d.completed_at,
          d.pl_cost_rub,
          d.leasing_company_id,
          lc.name AS leasing_company_name,
          d.agent_fee_percent::DOUBLE PRECISION AS agent_fee_percent,
          ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0)::BIGINT AS advance_total_rub,
          d.deal_stage_id,
          st.name AS deal_stage_name,
          d.comment,
          d.created_at,
          d.updated_at
        FROM deals AS d
        JOIN companies AS c ON c.id = d.company_id
        JOIN users AS u ON u.id = c.manager_user_id
        JOIN deal_statuses AS ds ON ds.id = d.deal_status_id
        JOIN deal_lifecycle_statuses AS dls ON dls.id = d.deal_lifecycle_status_id
        JOIN leasing_companies AS lc ON lc.id = d.leasing_company_id
        JOIN deal_stages AS st ON st.id = d.deal_stage_id
        ${whereSql}
        ORDER BY d.id ASC
      `,
      params
    );

    res.status(200).json({
      deals: result.rows,
    });
  } catch (error) {
    console.error("Не удалось получить сделки:", error);
    res.status(500).json({
      message: "Не удалось получить сделки.",
    });
  }
});

app.post("/api/companies/:companyId/deals", requireAuth, async (req, res) => {
  const companyId = parseUserId(req.params?.companyId);
  const currentUserId = Number(req.auth.sub);

  if (!companyId) {
    res.status(400).json({
      message: "Некорректный companyId.",
    });
    return;
  }

  const need = normalizeRequiredText(req.body?.need);
  const comment = normalizeOptionalText(req.body?.comment);
  const dealStatusId = parseUserId(req.body?.dealStatusId);
  const leasingCompanyId = parseUserId(req.body?.leasingCompanyId);
  const dealStageId = parseUserId(req.body?.dealStageId);
  const plCostRub = normalizeRequiredNonNegativeInteger(req.body?.plCostRub);
  const agentFeePercent = normalizeRequiredPercent(req.body?.agentFeePercent);

  if (!need) {
    res.status(400).json({
      message: 'Поле "Потребность" обязательно.',
    });
    return;
  }

  if (!dealStatusId) {
    res.status(400).json({
      message: "Выберите статус сделки.",
    });
    return;
  }

  if (!leasingCompanyId) {
    res.status(400).json({
      message: "Выберите лизинговую компанию.",
    });
    return;
  }

  if (!dealStageId) {
    res.status(400).json({
      message: "Выберите этап сделки.",
    });
    return;
  }

  if (plCostRub === null) {
    res.status(400).json({
      message: "Некорректная стоимость ПЛ.",
    });
    return;
  }

  if (agentFeePercent === null) {
    res.status(400).json({
      message: "Некорректный АВ, %.",
    });
    return;
  }

  try {
    const selectDealByIdSql = `
      SELECT
        d.id,
        d.company_id,
        c.manager_user_id AS company_manager_user_id,
        COALESCE(
          NULLIF(trim(concat_ws(' ', u.last_name, u.first_name, u.middle_name)), ''),
          u.username
        ) AS manager_name,
        c.name AS company_name,
        c.inn AS company_inn,
        d.need,
        d.deal_status_id,
        ds.name AS deal_status_name,
        d.deal_lifecycle_status_id,
        dls.name AS deal_lifecycle_status_name,
        d.completed_at,
        d.pl_cost_rub,
        d.leasing_company_id,
        lc.name AS leasing_company_name,
        d.agent_fee_percent::DOUBLE PRECISION AS agent_fee_percent,
        ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0)::BIGINT AS advance_total_rub,
        d.deal_stage_id,
        st.name AS deal_stage_name,
        d.comment,
        d.created_at,
        d.updated_at
      FROM deals AS d
      JOIN companies AS c ON c.id = d.company_id
      JOIN users AS u ON u.id = c.manager_user_id
      JOIN deal_statuses AS ds ON ds.id = d.deal_status_id
      JOIN deal_lifecycle_statuses AS dls ON dls.id = d.deal_lifecycle_status_id
      JOIN leasing_companies AS lc ON lc.id = d.leasing_company_id
      JOIN deal_stages AS st ON st.id = d.deal_stage_id
      WHERE d.id = $1
      LIMIT 1
    `;

    const companyResult = await pool.query(
      `
        SELECT
          c.id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.manager_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.manager_user_id
                AND u.group_lead_user_id = $1
                AND r.name = 'manager'
            ) THEN TRUE
            ELSE FALSE
          END AS can_manage
        FROM companies AS c
        WHERE c.id = $3
        LIMIT 1
      `,
      [currentUserId, req.auth.role, companyId]
    );

    if (companyResult.rowCount === 0) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    const company = companyResult.rows[0];
    if (!company.can_manage) {
      res.status(404).json({
        message: "Компания не найдена.",
      });
      return;
    }

    const insertResult = await pool.query(
      `
        INSERT INTO deals (
          company_id,
          need,
          deal_status_id,
          deal_lifecycle_status_id,
          completed_at,
          pl_cost_rub,
          leasing_company_id,
          agent_fee_percent,
          deal_stage_id,
          comment
        )
        VALUES (
          $1,
          $2,
          $3,
          (SELECT id FROM deal_lifecycle_statuses WHERE name = 'Активные' LIMIT 1),
          NULL,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING
          id,
          company_id
      `,
      [
        companyId,
        need,
        dealStatusId,
        plCostRub,
        leasingCompanyId,
        agentFeePercent,
        dealStageId,
        comment,
      ]
    );

    const dealResult = await pool.query(selectDealByIdSql, [
      insertResult.rows[0].id,
    ]);

    res.status(201).json({
      message: "Сделка успешно создана.",
      deal: dealResult.rows[0],
    });
  } catch (error) {
    if (error?.code === "23503") {
      res.status(400).json({
        message: "Некорректные значения справочников для сделки.",
      });
      return;
    }

    console.error("Не удалось создать сделку:", error);
    res.status(500).json({
      message: "Не удалось создать сделку.",
    });
  }
});

app.patch("/api/deals/:dealId", requireAuth, async (req, res) => {
  const dealId = parseUserId(req.params?.dealId);
  const currentUserId = Number(req.auth.sub);

  if (!dealId) {
    res.status(400).json({
      message: "Некорректный dealId.",
    });
    return;
  }

  const fieldsToUpdate = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "need")) {
    const need = normalizeRequiredText(req.body?.need);
    if (!need) {
      res.status(400).json({
        message: 'Поле "Потребность" обязательно.',
      });
      return;
    }
    fieldsToUpdate.need = need;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "dealStatusId")) {
    const dealStatusId = parseUserId(req.body?.dealStatusId);
    if (!dealStatusId) {
      res.status(400).json({
        message: "Некорректный статус сделки.",
      });
      return;
    }
    fieldsToUpdate.deal_status_id = dealStatusId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "plCostRub")) {
    const plCostRub = normalizeRequiredNonNegativeInteger(req.body?.plCostRub);
    if (plCostRub === null) {
      res.status(400).json({
        message: "Некорректная стоимость ПЛ.",
      });
      return;
    }
    fieldsToUpdate.pl_cost_rub = plCostRub;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "leasingCompanyId")) {
    const leasingCompanyId = parseUserId(req.body?.leasingCompanyId);
    if (!leasingCompanyId) {
      res.status(400).json({
        message: "Некорректная лизинговая компания.",
      });
      return;
    }
    fieldsToUpdate.leasing_company_id = leasingCompanyId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "agentFeePercent")) {
    const agentFeePercent = normalizeRequiredPercent(req.body?.agentFeePercent);
    if (agentFeePercent === null) {
      res.status(400).json({
        message: "Некорректный АВ, %.",
      });
      return;
    }
    fieldsToUpdate.agent_fee_percent = agentFeePercent;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "dealStageId")) {
    const dealStageId = parseUserId(req.body?.dealStageId);
    if (!dealStageId) {
      res.status(400).json({
        message: "Некорректный этап сделки.",
      });
      return;
    }
    fieldsToUpdate.deal_stage_id = dealStageId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "comment")) {
    fieldsToUpdate.comment = normalizeOptionalText(req.body?.comment);
  }

  const updateKeys = Object.keys(fieldsToUpdate);
  if (updateKeys.length === 0) {
    res.status(400).json({
      message: "Нет полей для обновления.",
    });
    return;
  }

  try {
    const selectDealByIdSql = `
      SELECT
        d.id,
        d.company_id,
        c.manager_user_id AS company_manager_user_id,
        COALESCE(
          NULLIF(trim(concat_ws(' ', u.last_name, u.first_name, u.middle_name)), ''),
          u.username
        ) AS manager_name,
        c.name AS company_name,
        c.inn AS company_inn,
        d.need,
        d.deal_status_id,
        ds.name AS deal_status_name,
        d.deal_lifecycle_status_id,
        dls.name AS deal_lifecycle_status_name,
        d.completed_at,
        d.pl_cost_rub,
        d.leasing_company_id,
        lc.name AS leasing_company_name,
        d.agent_fee_percent::DOUBLE PRECISION AS agent_fee_percent,
        ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0)::BIGINT AS advance_total_rub,
        d.deal_stage_id,
        st.name AS deal_stage_name,
        d.comment,
        d.created_at,
        d.updated_at
      FROM deals AS d
      JOIN companies AS c ON c.id = d.company_id
      JOIN users AS u ON u.id = c.manager_user_id
      JOIN deal_statuses AS ds ON ds.id = d.deal_status_id
      JOIN deal_lifecycle_statuses AS dls ON dls.id = d.deal_lifecycle_status_id
      JOIN leasing_companies AS lc ON lc.id = d.leasing_company_id
      JOIN deal_stages AS st ON st.id = d.deal_stage_id
      WHERE d.id = $1
      LIMIT 1
    `;

    const dealAccessResult = await pool.query(
      `
        SELECT
          d.id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.manager_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.manager_user_id
                AND u.group_lead_user_id = $1
                AND r.name = 'manager'
            ) THEN TRUE
            ELSE FALSE
          END AS can_manage
        FROM deals AS d
        JOIN companies AS c ON c.id = d.company_id
        WHERE d.id = $3
        LIMIT 1
      `,
      [currentUserId, req.auth.role, dealId]
    );

    if (dealAccessResult.rowCount === 0) {
      res.status(404).json({
        message: "Сделка не найдена.",
      });
      return;
    }

    const dealAccess = dealAccessResult.rows[0];
    if (!dealAccess.can_manage) {
      res.status(404).json({
        message: "Сделка не найдена.",
      });
      return;
    }

    const values = [];
    const assignments = updateKeys.map((key, index) => {
      values.push(fieldsToUpdate[key]);
      return `${key} = $${index + 1}`;
    });
    values.push(dealId);

    const updateResult = await pool.query(
      `
        UPDATE deals
        SET ${assignments.join(", ")}
        WHERE id = $${values.length}
        RETURNING
          id,
          company_id,
          need,
          deal_status_id,
          pl_cost_rub,
          leasing_company_id,
          agent_fee_percent,
          deal_stage_id,
          comment,
          created_at,
          updated_at
      `,
      values
    );

    const updatedRowId = updateResult.rows[0]?.id;
    const dealResult = updatedRowId
      ? await pool.query(selectDealByIdSql, [updatedRowId])
      : null;

    res.status(200).json({
      message: "Сделка обновлена.",
      deal: dealResult?.rows?.[0] ?? updateResult.rows[0],
    });
  } catch (error) {
    if (error?.code === "23503") {
      res.status(400).json({
        message: "Некорректные значения справочников для сделки.",
      });
      return;
    }

    console.error("Не удалось обновить сделку:", error);
    res.status(500).json({
      message: "Не удалось обновить сделку.",
    });
  }
});

app.patch("/api/deals/:dealId/lifecycle-status", requireAuth, async (req, res) => {
  const dealId = parseUserId(req.params?.dealId);
  const currentUserId = Number(req.auth.sub);
  const dealLifecycleStatusId = parseUserId(req.body?.dealLifecycleStatusId);

  if (!dealId) {
    res.status(400).json({
      message: "Некорректный dealId.",
    });
    return;
  }

  if (!dealLifecycleStatusId) {
    res.status(400).json({
      message: "Некорректный статус жизненного цикла сделки.",
    });
    return;
  }

  try {
    const selectDealByIdSql = `
      SELECT
        d.id,
        d.company_id,
        c.manager_user_id AS company_manager_user_id,
        COALESCE(
          NULLIF(trim(concat_ws(' ', u.last_name, u.first_name, u.middle_name)), ''),
          u.username
        ) AS manager_name,
        c.name AS company_name,
        c.inn AS company_inn,
        d.need,
        d.deal_status_id,
        ds.name AS deal_status_name,
        d.deal_lifecycle_status_id,
        dls.name AS deal_lifecycle_status_name,
        d.completed_at,
        d.pl_cost_rub,
        d.leasing_company_id,
        lc.name AS leasing_company_name,
        d.agent_fee_percent::DOUBLE PRECISION AS agent_fee_percent,
        ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0)::BIGINT AS advance_total_rub,
        d.deal_stage_id,
        st.name AS deal_stage_name,
        d.comment,
        d.created_at,
        d.updated_at
      FROM deals AS d
      JOIN companies AS c ON c.id = d.company_id
      JOIN users AS u ON u.id = c.manager_user_id
      JOIN deal_statuses AS ds ON ds.id = d.deal_status_id
      JOIN deal_lifecycle_statuses AS dls ON dls.id = d.deal_lifecycle_status_id
      JOIN leasing_companies AS lc ON lc.id = d.leasing_company_id
      JOIN deal_stages AS st ON st.id = d.deal_stage_id
      WHERE d.id = $1
      LIMIT 1
    `;

    const dealAccessResult = await pool.query(
      `
        SELECT
          d.id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.manager_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.manager_user_id
                AND u.group_lead_user_id = $1
                AND r.name = 'manager'
            ) THEN TRUE
            ELSE FALSE
          END AS can_manage
        FROM deals AS d
        JOIN companies AS c ON c.id = d.company_id
        WHERE d.id = $3
        LIMIT 1
      `,
      [currentUserId, req.auth.role, dealId]
    );

    if (dealAccessResult.rowCount === 0) {
      res.status(404).json({
        message: "Сделка не найдена.",
      });
      return;
    }

    const dealAccess = dealAccessResult.rows[0];
    if (!dealAccess.can_manage) {
      res.status(404).json({
        message: "Сделка не найдена.",
      });
      return;
    }

    const statusResult = await pool.query(
      `
        SELECT
          id,
          name
        FROM deal_lifecycle_statuses
        WHERE id = $1
        LIMIT 1
      `,
      [dealLifecycleStatusId]
    );

    if (statusResult.rowCount === 0) {
      res.status(400).json({
        message: "Статус жизненного цикла сделки не найден.",
      });
      return;
    }

    const statusName = statusResult.rows[0].name;
    const isActiveStatus = statusName === "Активные";

    await pool.query(
      `
        UPDATE deals
        SET
          deal_lifecycle_status_id = $1,
          completed_at = CASE WHEN $2 THEN NULL ELSE NOW() END
        WHERE id = $3
      `,
      [dealLifecycleStatusId, isActiveStatus, dealId]
    );

    const dealResult = await pool.query(selectDealByIdSql, [dealId]);
    if (dealResult.rowCount === 0) {
      res.status(404).json({
        message: "Сделка не найдена.",
      });
      return;
    }

    res.status(200).json({
      message: "Статус сделки обновлён.",
      deal: dealResult.rows[0],
    });
  } catch (error) {
    if (error?.code === "23503") {
      res.status(400).json({
        message: "Некорректный статус жизненного цикла сделки.",
      });
      return;
    }

    console.error("Не удалось обновить статус сделки:", error);
    res.status(500).json({
      message: "Не удалось обновить статус сделки.",
    });
  }
});

app.delete("/api/deals/:dealId", requireAuth, async (req, res) => {
  const dealId = parseUserId(req.params?.dealId);
  const currentUserId = Number(req.auth.sub);

  if (!dealId) {
    res.status(400).json({
      message: "Некорректный dealId.",
    });
    return;
  }

  try {
    const dealAccessResult = await pool.query(
      `
        SELECT
          d.id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.manager_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.manager_user_id
                AND u.group_lead_user_id = $1
                AND r.name = 'manager'
            ) THEN TRUE
            ELSE FALSE
          END AS can_manage
        FROM deals AS d
        JOIN companies AS c ON c.id = d.company_id
        WHERE d.id = $3
        LIMIT 1
      `,
      [currentUserId, req.auth.role, dealId]
    );

    if (dealAccessResult.rowCount === 0) {
      res.status(404).json({
        message: "Сделка не найдена.",
      });
      return;
    }

    const dealAccess = dealAccessResult.rows[0];
    if (!dealAccess.can_manage) {
      res.status(404).json({
        message: "Сделка не найдена.",
      });
      return;
    }

    await pool.query(
      `
        DELETE FROM deals
        WHERE id = $1
      `,
      [dealId]
    );

    res.status(200).json({
      message: "Сделка удалена.",
    });
  } catch (error) {
    console.error("Не удалось удалить сделку:", error);
    res.status(500).json({
      message: "Не удалось удалить сделку.",
    });
  }
});

app.post("/api/owner/users", requireOwner, async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const roleName = normalizeRole(req.body?.role);
  const lastName = normalizeOptionalText(req.body?.lastName);
  const firstName = normalizeOptionalText(req.body?.firstName);
  const middleName = normalizeOptionalText(req.body?.middleName);

  const groupLeadUserIdRaw = req.body?.groupLeadUserId;
  const groupLeadUserId =
    groupLeadUserIdRaw === null || typeof groupLeadUserIdRaw === "undefined"
      ? null
      : parseUserId(groupLeadUserIdRaw);

  if (!username || !roleName) {
    res.status(400).json({
      message: "Поля username и role обязательны.",
    });
    return;
  }

  if (roleName !== "manager" && roleName !== "group_lead") {
    res.status(400).json({
      message: "Роль должна быть manager или group_lead.",
    });
    return;
  }

  if (roleName === "manager" && !groupLeadUserId) {
    res.status(400).json({
      message: "Для менеджера нужно указать руководителя группы.",
    });
    return;
  }

  if (roleName === "group_lead" && groupLeadUserId !== null) {
    res.status(400).json({
      message:
        "Для роли руководителя группы нельзя указывать руководителя группы.",
    });
    return;
  }

  if (
    groupLeadUserIdRaw !== null &&
    typeof groupLeadUserIdRaw !== "undefined" &&
    !groupLeadUserId
  ) {
    res.status(400).json({
      message: "Некорректный groupLeadUserId.",
    });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roleResult = await client.query(
      `
        SELECT id
        FROM roles
        WHERE name = $1
        LIMIT 1
      `,
      [roleName]
    );

    if (roleResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({
        message: "Роль не найдена в базе данных.",
      });
      return;
    }

    if (roleName === "manager") {
      const groupLeadResult = await client.query(
        `
          SELECT
            u.id,
            r.name AS role
          FROM users AS u
          JOIN roles AS r ON r.id = u.role_id
          WHERE u.id = $1
          LIMIT 1
        `,
        [groupLeadUserId]
      );

      if (groupLeadResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({
          message: "Руководитель группы не найден.",
        });
        return;
      }

      if (groupLeadResult.rows[0].role !== "group_lead") {
        await client.query("ROLLBACK");
        res.status(400).json({
          message: "Указанный пользователь не является руководителем группы.",
        });
        return;
      }
    }

    const existingUserResult = await client.query(
      `
        SELECT id
        FROM users
        WHERE username = $1
        LIMIT 1
      `,
      [username]
    );

    if (existingUserResult.rowCount > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        message: "Пользователь с таким username уже существует.",
      });
      return;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = hashPassword(tempPassword);

    const userInsertResult = await client.query(
      `
        INSERT INTO users (
          username,
          last_name,
          first_name,
          middle_name,
          password_hash,
          must_change_password,
          role_id,
          group_lead_user_id
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
        RETURNING
          id,
          username,
          last_name,
          first_name,
          middle_name,
          must_change_password,
          group_lead_user_id
      `,
      [
        username,
        lastName,
        firstName,
        middleName,
        passwordHash,
        roleResult.rows[0].id,
        roleName === "manager" ? groupLeadUserId : null,
      ]
    );

    await client.query("COMMIT");

    const createdUser = userInsertResult.rows[0];

    res.status(201).json({
      message: "Пользователь создан. Передайте временный пароль сотруднику.",
      user: {
        id: createdUser.id,
        username: createdUser.username,
        lastName: createdUser.last_name,
        firstName: createdUser.first_name,
        middleName: createdUser.middle_name,
        role: roleName,
        groupLeadUserId: createdUser.group_lead_user_id,
        mustChangePassword: createdUser.must_change_password,
      },
      tempPassword,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error?.code === "23505") {
      res.status(409).json({
        message: "Пользователь с таким username уже существует.",
      });
      return;
    }

    console.error("Не удалось создать пользователя:", error);
    res.status(500).json({
      message: "Не удалось создать пользователя.",
    });
  } finally {
    client.release();
  }
});

app.post("/api/owner/users/:userId/reset-password", requireOwner, async (req, res) => {
  const userId = parseUserId(req.params?.userId);

  if (!userId) {
    res.status(400).json({
      message: "Некорректный userId.",
    });
    return;
  }

  const tempPassword = generateTempPassword();
  const nextHash = hashPassword(tempPassword);

  try {
    const result = await pool.query(
      `
        UPDATE users
        SET
          password_hash = $1,
          must_change_password = TRUE,
          updated_at = NOW()
        WHERE id = $2
        RETURNING id, username
      `,
      [nextHash, userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        message: "Пользователь не найден.",
      });
      return;
    }

    res.status(200).json({
      message: "Временный пароль создан. Передайте его сотруднику.",
      user: result.rows[0],
      tempPassword,
    });
  } catch (error) {
    console.error("Не удалось сбросить пароль:", error);
    res.status(500).json({
      message: "Не удалось сбросить пароль.",
    });
  }
});

app.get("/api/owner/leasing-companies", requireOwner, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM leasing_companies
        ORDER BY is_active DESC, id ASC
      `
    );

    res.status(200).json({
      leasingCompanies: result.rows,
    });
  } catch (error) {
    console.error("Не удалось получить лизинговые компании:", error);
    res.status(500).json({
      message: "Не удалось получить лизинговые компании.",
    });
  }
});

app.post("/api/owner/leasing-companies", requireOwner, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    res.status(400).json({
      message: "Поле name обязательно.",
    });
    return;
  }

  if (name.length > 160) {
    res.status(400).json({
      message: "Название слишком длинное.",
    });
    return;
  }

  try {
    const duplicateResult = await pool.query(
      `
        SELECT 1
        FROM leasing_companies
        WHERE LOWER(name) = LOWER($1)
        LIMIT 1
      `,
      [name]
    );

    if (duplicateResult.rowCount > 0) {
      res.status(409).json({
        message: "Такая лизинговая компания уже существует.",
      });
      return;
    }

    const createdResult = await pool.query(
      `
        INSERT INTO leasing_companies (name, is_active)
        VALUES ($1, TRUE)
        RETURNING
          id,
          name,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [name]
    );

    res.status(201).json({
      leasingCompany: createdResult.rows[0],
    });
  } catch (error) {
    console.error("Не удалось создать лизинговую компанию:", error);
    res.status(500).json({
      message: "Не удалось создать лизинговую компанию.",
    });
  }
});

app.patch("/api/owner/leasing-companies/:leasingCompanyId", requireOwner, async (req, res) => {
  const leasingCompanyId = parseUserId(req.params?.leasingCompanyId);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  const isActive =
    typeof req.body?.isActive === "boolean" ? req.body.isActive : null;

  if (!leasingCompanyId) {
    res.status(400).json({
      message: "Некорректный leasingCompanyId.",
    });
    return;
  }

  if (name === null && isActive === null) {
    res.status(400).json({
      message: "Нечего обновлять.",
    });
    return;
  }

  if (name !== null) {
    const trimmed = name.trim();
    if (!trimmed) {
      res.status(400).json({
        message: "Поле name обязательно.",
      });
      return;
    }

    if (trimmed.length > 160) {
      res.status(400).json({
        message: "Название слишком длинное.",
      });
      return;
    }
  }

  try {
    const nextName = name === null ? null : name.trim();

    if (nextName !== null) {
      const duplicateResult = await pool.query(
        `
          SELECT 1
          FROM leasing_companies
          WHERE LOWER(name) = LOWER($1)
            AND id <> $2
          LIMIT 1
        `,
        [nextName, leasingCompanyId]
      );

      if (duplicateResult.rowCount > 0) {
        res.status(409).json({
          message: "Такая лизинговая компания уже существует.",
        });
        return;
      }
    }

    const updatedResult = await pool.query(
      `
        UPDATE leasing_companies
        SET
          name = COALESCE($1, name),
          is_active = COALESCE($2, is_active),
          updated_at = NOW()
        WHERE id = $3
        RETURNING
          id,
          name,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [nextName, isActive, leasingCompanyId]
    );

    if (updatedResult.rowCount === 0) {
      res.status(404).json({
        message: "Лизинговая компания не найдена.",
      });
      return;
    }

    res.status(200).json({
      leasingCompany: updatedResult.rows[0],
    });
  } catch (error) {
    console.error("Не удалось обновить лизинговую компанию:", error);
    res.status(500).json({
      message: "Не удалось обновить лизинговую компанию.",
    });
  }
});

app.delete("/api/owner/leasing-companies/:leasingCompanyId", requireOwner, async (req, res) => {
  const leasingCompanyId = parseUserId(req.params?.leasingCompanyId);

  if (!leasingCompanyId) {
    res.status(400).json({
      message: "Некорректный leasingCompanyId.",
    });
    return;
  }

  try {
    const result = await pool.query(
      `
        DELETE FROM leasing_companies
        WHERE id = $1
        RETURNING id
      `,
      [leasingCompanyId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        message: "Лизинговая компания не найдена.",
      });
      return;
    }

    res.status(200).json({
      message: "Лизинговая компания удалена.",
    });
  } catch (error) {
    if (error?.code === "23503") {
      res.status(409).json({
        message:
          "Нельзя удалить: лизинговая компания используется в сделках. Архивируйте её или удалите/измените связанные сделки.",
      });
      return;
    }

    console.error("Не удалось удалить лизинговую компанию:", error);
    res.status(500).json({
      message: "Не удалось удалить лизинговую компанию.",
    });
  }
});

app.get("/api/owner/communication-channels", requireOwner, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM communication_channels
        ORDER BY is_active DESC, id ASC
      `
    );

    res.status(200).json({
      communicationChannels: result.rows,
    });
  } catch (error) {
    console.error("Не удалось получить каналы связи:", error);
    res.status(500).json({
      message: "Не удалось получить каналы связи.",
    });
  }
});

app.post("/api/owner/communication-channels", requireOwner, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    res.status(400).json({
      message: "Поле name обязательно.",
    });
    return;
  }

  if (name.length > 160) {
    res.status(400).json({
      message: "Название слишком длинное.",
    });
    return;
  }

  try {
    const duplicateResult = await pool.query(
      `
        SELECT 1
        FROM communication_channels
        WHERE LOWER(name) = LOWER($1)
        LIMIT 1
      `,
      [name]
    );

    if (duplicateResult.rowCount > 0) {
      res.status(409).json({
        message: "Такой канал связи уже существует.",
      });
      return;
    }

    const createdResult = await pool.query(
      `
        INSERT INTO communication_channels (name, is_active)
        VALUES ($1, TRUE)
        RETURNING
          id,
          name,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [name]
    );

    res.status(201).json({
      communicationChannel: createdResult.rows[0],
    });
  } catch (error) {
    console.error("Не удалось создать канал связи:", error);
    res.status(500).json({
      message: "Не удалось создать канал связи.",
    });
  }
});

app.patch("/api/owner/communication-channels/:channelId", requireOwner, async (req, res) => {
  const channelId = parseUserId(req.params?.channelId);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : null;

  if (!channelId) {
    res.status(400).json({
      message: "Некорректный channelId.",
    });
    return;
  }

  if (name === null && isActive === null) {
    res.status(400).json({
      message: "Нечего обновлять.",
    });
    return;
  }

  if (name !== null) {
    const trimmed = name.trim();
    if (!trimmed) {
      res.status(400).json({
        message: "Поле name обязательно.",
      });
      return;
    }

    if (trimmed.length > 160) {
      res.status(400).json({
        message: "Название слишком длинное.",
      });
      return;
    }
  }

  try {
    const nextName = name === null ? null : name.trim();

    if (nextName !== null) {
      const duplicateResult = await pool.query(
        `
          SELECT 1
          FROM communication_channels
          WHERE LOWER(name) = LOWER($1)
            AND id <> $2
          LIMIT 1
        `,
        [nextName, channelId]
      );

      if (duplicateResult.rowCount > 0) {
        res.status(409).json({
          message: "Такой канал связи уже существует.",
        });
        return;
      }
    }

    const updatedResult = await pool.query(
      `
        UPDATE communication_channels
        SET
          name = COALESCE($1, name),
          is_active = COALESCE($2, is_active),
          updated_at = NOW()
        WHERE id = $3
        RETURNING
          id,
          name,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [nextName, isActive, channelId]
    );

    if (updatedResult.rowCount === 0) {
      res.status(404).json({
        message: "Канал связи не найден.",
      });
      return;
    }

    res.status(200).json({
      communicationChannel: updatedResult.rows[0],
    });
  } catch (error) {
    console.error("Не удалось обновить канал связи:", error);
    res.status(500).json({
      message: "Не удалось обновить канал связи.",
    });
  }
});

app.delete("/api/owner/communication-channels/:channelId", requireOwner, async (req, res) => {
  const channelId = parseUserId(req.params?.channelId);

  if (!channelId) {
    res.status(400).json({
      message: "Некорректный channelId.",
    });
    return;
  }

  try {
    const usageResult = await pool.query(
      `
        SELECT 1
        FROM companies
        WHERE preferred_communication_channel_id = $1
        LIMIT 1
      `,
      [channelId]
    );

    if (usageResult.rowCount > 0) {
      res.status(409).json({
        message:
          "Нельзя удалить: канал связи используется в компаниях. Архивируйте его или измените канал в связанных компаниях.",
      });
      return;
    }

    const result = await pool.query(
      `
        DELETE FROM communication_channels
        WHERE id = $1
        RETURNING id
      `,
      [channelId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        message: "Канал связи не найден.",
      });
      return;
    }

    res.status(200).json({
      message: "Канал связи удалён.",
    });
  } catch (error) {
    if (error?.code === "23503") {
      res.status(409).json({
        message: "Нельзя удалить: канал связи используется в компаниях.",
      });
      return;
    }

    console.error("Не удалось удалить канал связи:", error);
    res.status(500).json({
      message: "Не удалось удалить канал связи.",
    });
  }
});

const start = async () => {
  app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
  });
};

start().catch((error) => {
  console.error("Не удалось запустить сервер:", error);
  process.exit(1);
});
