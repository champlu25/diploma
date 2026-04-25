const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();

const { pool } = require("./db");
const { sendPasswordSetupEmail } = require("./email");
const {
  generateInviteToken,
  hashInviteToken,
  hashPassword,
  signJwt,
  validatePassword,
  verifyJwt,
  verifyPassword,
} = require("./security");

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const inviteLinkBase = (process.env.INVITE_LINK_BASE || frontendOrigin).replace(
  /\/+$/,
  ""
);
const authTokenTtlHours = Number(process.env.AUTH_TOKEN_TTL_HOURS || 12);
const inviteTtlHours = Number(process.env.INVITE_TTL_HOURS || 24);
const ownerPasswordLinkTtlMinutes = Number(process.env.RESET_TTL_MINUTES || 30);
const showInviteLinkInResponse =
  process.env.SHOW_INVITE_LINK_IN_RESPONSE === "true";
const authJwtSecret = process.env.AUTH_JWT_SECRET || "";
const authCookieName = "access_token";
const isProduction = process.env.NODE_ENV === "production";
const inviteAllowedRoles = new Set(["manager", "group_lead"]);

if (!Number.isFinite(authTokenTtlHours) || authTokenTtlHours <= 0) {
  throw new Error("AUTH_TOKEN_TTL_HOURS должен быть положительным числом.");
}

if (!Number.isFinite(inviteTtlHours) || inviteTtlHours <= 0) {
  throw new Error("INVITE_TTL_HOURS должен быть положительным числом.");
}

if (
  !Number.isFinite(ownerPasswordLinkTtlMinutes) ||
  ownerPasswordLinkTtlMinutes <= 0
) {
  throw new Error("RESET_TTL_MINUTES должен быть положительным числом.");
}

if (!authJwtSecret) {
  throw new Error("AUTH_JWT_SECRET обязателен.");
}

const ensureInviteSchemaCompatibility = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const columnsResult = await client.query(
      `
        SELECT
          column_name,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name IN ('last_name', 'first_name')
      `
    );

    const columns = new Map(
      columnsResult.rows.map((row) => [row.column_name, row.is_nullable])
    );

    const alterStatements = [];

    if (columns.get("last_name") === "NO") {
      alterStatements.push(
        "ALTER TABLE users ALTER COLUMN last_name DROP NOT NULL"
      );
    }

    if (columns.get("first_name") === "NO") {
      alterStatements.push(
        "ALTER TABLE users ALTER COLUMN first_name DROP NOT NULL"
      );
    }

    if (alterStatements.length > 0) {
      for (const statement of alterStatements) {
        await client.query(statement);
      }

      console.warn(
        "Схема БД обновлена автоматически: users.last_name/first_name теперь допускают NULL (для приглашений)."
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.warn(
      "Не удалось автоматически поправить схему БД для приглашений (users.last_name/first_name). " +
        "Если приглашения не работают, примените миграции из backend/sql.",
      error
    );
  } finally {
    client.release();
  }
};

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());

const normalizeEmail = (value) =>
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
      email: user.email,
      role: user.role,
    },
    secret: authJwtSecret,
    expiresInSeconds: authTokenTtlHours * 60 * 60,
  });

  res.cookie(authCookieName, token, getAuthCookieOptions());
};

const buildPasswordSetupLink = (rawToken) =>
  `${inviteLinkBase}/set-password?token=${encodeURIComponent(rawToken)}`;

const createPasswordSetupToken = async ({ client, userId, ttlMinutes }) => {
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await client.query(
    `
      UPDATE password_setup_tokens
      SET
        used_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [userId]
  );

  await client.query(
    `
      INSERT INTO password_setup_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );

  return {
    rawToken,
    expiresAt,
  };
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
          u.email,
          u.last_name,
          u.first_name,
          u.middle_name,
          r.name AS role
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
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
        email: user.email,
        lastName: user.last_name,
        firstName: user.first_name,
        middleName: user.middle_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Не удалось получить текущую сессию:", error);
    res.status(500).json({
      message: "Не удалось получить текущую сессию.",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400).json({
      message: "Поля email и password обязательны.",
    });
    return;
  }

  try {
    const userResult = await pool.query(
      `
        SELECT
          u.id,
          u.email,
          u.last_name,
          u.first_name,
          u.middle_name,
          u.password_hash,
          r.name AS role
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        WHERE u.email = $1
        LIMIT 1
      `,
      [email]
    );

    if (userResult.rowCount === 0) {
      res.status(401).json({
        message: "Неверный email или пароль.",
      });
      return;
    }

    const user = userResult.rows[0];

    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({
        message: "Неверный email или пароль.",
      });
      return;
    }

    const authUser = {
      id: user.id,
      email: user.email,
      lastName: user.last_name,
      firstName: user.first_name,
      middleName: user.middle_name,
      role: user.role,
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

app.get("/api/users", requireOwner, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.email,
          u.last_name,
          u.first_name,
          u.middle_name,
          r.name AS role,
          u.group_lead_user_id,
          gl.email AS group_lead_email
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
    let whereSql = "WHERE c.owner_user_id = $1";

    if (req.auth.role === "owner") {
      params = [];
      whereSql = "";
    } else if (req.auth.role === "group_lead") {
      whereSql = `
        WHERE c.owner_user_id = $1
          OR c.owner_user_id IN (
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
          c.owner_user_id,
          u.email AS owner_email,
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
        JOIN users AS u ON u.id = c.owner_user_id
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
          u.email,
          u.last_name,
          u.first_name,
          u.middle_name,
          COUNT(c.id)::INT AS companies_count
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        LEFT JOIN companies AS c ON c.owner_user_id = u.id
        WHERE r.name = 'manager'
          AND u.group_lead_user_id = $1
        GROUP BY u.id, u.email, u.last_name, u.first_name, u.middle_name
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
          u.email,
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
            u.email,
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
        RETURNING id, email, last_name, first_name, middle_name, group_lead_user_id
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

  try {
    const result = await pool.query(
      `
        INSERT INTO companies (
          owner_user_id,
          name,
          inn,
          contact_name,
          phone,
          email,
          comment,
          next_contact_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          owner_user_id,
          (SELECT email FROM users WHERE id = owner_user_id) AS owner_email,
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
      [
        currentUserId,
        name,
        inn,
        contactName,
        phone,
        email,
        comment,
        nextContactAt,
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
          c.owner_user_id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.owner_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.owner_user_id
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
          owner_user_id,
          (SELECT email FROM users WHERE id = owner_user_id) AS owner_email,
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
          c.owner_user_id,
          CASE
            WHEN $2 = 'owner' THEN TRUE
            WHEN c.owner_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.owner_user_id
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
    const [statusesResult, leasingCompaniesResult, stagesResult] =
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
          FROM leasing_companies
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

app.get("/api/deals", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);

  try {
    let params = [currentUserId];
    let whereSql = "WHERE c.owner_user_id = $1";

    if (req.auth.role === "owner") {
      params = [];
      whereSql = "";
    } else if (req.auth.role === "group_lead") {
      whereSql = `
        WHERE c.owner_user_id = $1
          OR c.owner_user_id IN (
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
          d.id,
          d.company_id,
          c.owner_user_id AS company_owner_user_id,
          u.email AS manager_email,
          c.name AS company_name,
          c.inn AS company_inn,
          d.need,
          d.deal_status_id,
          ds.name AS deal_status_name,
          d.pl_cost_rub,
          d.leasing_company_id,
          lc.name AS leasing_company_name,
          d.advance_percent::DOUBLE PRECISION AS advance_percent,
          d.advance_total_rub,
          d.deal_stage_id,
          st.name AS deal_stage_name,
          d.comment,
          d.created_at,
          d.updated_at
        FROM deals AS d
        JOIN companies AS c ON c.id = d.company_id
        JOIN users AS u ON u.id = c.owner_user_id
        JOIN deal_statuses AS ds ON ds.id = d.deal_status_id
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
  const advanceTotalRub = normalizeRequiredNonNegativeInteger(
    req.body?.advanceTotalRub
  );
  const advancePercent = normalizeRequiredPercent(req.body?.advancePercent);

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

  if (advanceTotalRub === null) {
    res.status(400).json({
      message: "Некорректный общий АВ.",
    });
    return;
  }

  if (advancePercent === null) {
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
        c.owner_user_id AS company_owner_user_id,
        u.email AS manager_email,
        c.name AS company_name,
        c.inn AS company_inn,
        d.need,
        d.deal_status_id,
        ds.name AS deal_status_name,
        d.pl_cost_rub,
        d.leasing_company_id,
        lc.name AS leasing_company_name,
        d.advance_percent::DOUBLE PRECISION AS advance_percent,
        d.advance_total_rub,
        d.deal_stage_id,
        st.name AS deal_stage_name,
        d.comment,
        d.created_at,
        d.updated_at
      FROM deals AS d
      JOIN companies AS c ON c.id = d.company_id
      JOIN users AS u ON u.id = c.owner_user_id
      JOIN deal_statuses AS ds ON ds.id = d.deal_status_id
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
            WHEN c.owner_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.owner_user_id
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
          pl_cost_rub,
          leasing_company_id,
          advance_percent,
          advance_total_rub,
          deal_stage_id,
          comment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          company_id,
          need,
          deal_status_id,
          pl_cost_rub,
          leasing_company_id,
          advance_percent,
          advance_total_rub,
          deal_stage_id,
          comment,
          created_at,
          updated_at
      `,
      [
        companyId,
        need,
        dealStatusId,
        plCostRub,
        leasingCompanyId,
        advancePercent,
        advanceTotalRub,
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

  if (Object.prototype.hasOwnProperty.call(req.body, "advancePercent")) {
    const advancePercent = normalizeRequiredPercent(req.body?.advancePercent);
    if (advancePercent === null) {
      res.status(400).json({
        message: "Некорректный АВ, %.",
      });
      return;
    }
    fieldsToUpdate.advance_percent = advancePercent;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "advanceTotalRub")) {
    const advanceTotalRub = normalizeRequiredNonNegativeInteger(
      req.body?.advanceTotalRub
    );
    if (advanceTotalRub === null) {
      res.status(400).json({
        message: "Некорректный общий АВ.",
      });
      return;
    }
    fieldsToUpdate.advance_total_rub = advanceTotalRub;
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
        c.owner_user_id AS company_owner_user_id,
        u.email AS manager_email,
        c.name AS company_name,
        c.inn AS company_inn,
        d.need,
        d.deal_status_id,
        ds.name AS deal_status_name,
        d.pl_cost_rub,
        d.leasing_company_id,
        lc.name AS leasing_company_name,
        d.advance_percent::DOUBLE PRECISION AS advance_percent,
        d.advance_total_rub,
        d.deal_stage_id,
        st.name AS deal_stage_name,
        d.comment,
        d.created_at,
        d.updated_at
      FROM deals AS d
      JOIN companies AS c ON c.id = d.company_id
      JOIN users AS u ON u.id = c.owner_user_id
      JOIN deal_statuses AS ds ON ds.id = d.deal_status_id
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
            WHEN c.owner_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.owner_user_id
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
          advance_percent,
          advance_total_rub,
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
            WHEN c.owner_user_id = $1 THEN TRUE
            WHEN $2 = 'group_lead' AND EXISTS (
              SELECT 1
              FROM users AS u
              JOIN roles AS r ON r.id = u.role_id
              WHERE u.id = c.owner_user_id
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

app.post("/api/owner/users/invite", requireOwner, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const roleName = normalizeRole(req.body?.role);
  const groupLeadUserIdRaw = req.body?.groupLeadUserId;
  const groupLeadUserId =
    groupLeadUserIdRaw === null || typeof groupLeadUserIdRaw === "undefined"
      ? null
      : parseUserId(groupLeadUserIdRaw);

  if (!email || !roleName) {
    res.status(400).json({
      message: "Поля email и role обязательны.",
    });
    return;
  }

  if (!inviteAllowedRoles.has(roleName)) {
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

  let invitedUser = null;
  let setupLink = null;
  let expiresAt = null;

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
        SELECT
          u.id,
          u.email,
          r.name AS role
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        WHERE u.email = $1
        LIMIT 1
      `,
      [email]
    );

    if (existingUserResult.rowCount > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        message: "Пользователь с таким email уже существует.",
      });
      return;
    }

    const userInsertResult = await client.query(
      `
        INSERT INTO users (email, last_name, first_name, middle_name, password_hash, role_id, group_lead_user_id)
        VALUES ($1, NULL, NULL, NULL, NULL, $2, $3)
        RETURNING id, email, last_name, first_name, middle_name, group_lead_user_id
      `,
      [
        email,
        roleResult.rows[0].id,
        roleName === "manager" ? groupLeadUserId : null,
      ]
    );

    invitedUser = {
      id: userInsertResult.rows[0].id,
      email: userInsertResult.rows[0].email,
      lastName: userInsertResult.rows[0].last_name,
      firstName: userInsertResult.rows[0].first_name,
      middleName: userInsertResult.rows[0].middle_name,
      role: roleName,
      groupLeadUserId: userInsertResult.rows[0].group_lead_user_id,
    };

    const tokenData = await createPasswordSetupToken({
      client,
      userId: invitedUser.id,
      ttlMinutes: inviteTtlHours * 60,
    });

    setupLink = buildPasswordSetupLink(tokenData.rawToken);
    expiresAt = tokenData.expiresAt;

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    if (
      error?.code === "23502" &&
      (error?.column === "last_name" || error?.column === "first_name")
    ) {
      res.status(500).json({
        message:
          "База данных не готова для приглашений: поля last_name/first_name в таблице users должны допускать NULL. " +
          "Примените миграции из backend/sql и перезапустите сервер.",
      });
      return;
    }

    if (error?.code === "23505") {
      res.status(409).json({
        message: "Пользователь с таким email уже существует.",
      });
      return;
    }

    console.error("Не удалось создать приглашение:", error);
    res.status(500).json({
      message: "Не удалось создать приглашение.",
    });
    return;
  } finally {
    client.release();
  }

  try {
    await sendPasswordSetupEmail({
      email,
      setupLink,
      expiresAt,
      isInvite: true,
    });
  } catch (error) {
    console.error("Не удалось отправить письмо с приглашением:", error);
    res.status(502).json({
      message: "Пользователь создан, но письмо с приглашением не отправлено.",
      invitedUser,
      ...(showInviteLinkInResponse ? { inviteLink: setupLink } : {}),
    });
    return;
  }

  res.status(201).json({
    message: "Приглашение успешно отправлено.",
    invitedUser,
    ...(showInviteLinkInResponse ? { inviteLink: setupLink } : {}),
  });
});

app.post(
  "/api/owner/users/:userId/password-link",
  requireOwner,
  async (req, res) => {
    const userId = parseUserId(req.params?.userId);

    if (!userId) {
      res.status(400).json({
        message: "Некорректный userId.",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `
        SELECT
          u.id,
          u.email,
          u.last_name,
          u.first_name,
          u.middle_name,
          r.name AS role
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        WHERE u.id = $1
        LIMIT 1
      `,
        [userId]
      );

      if (userResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({
          message: "Пользователь не найден.",
        });
        return;
      }

      const targetUser = userResult.rows[0];

      const tokenData = await createPasswordSetupToken({
        client,
        userId,
        ttlMinutes: ownerPasswordLinkTtlMinutes,
      });

      await client.query("COMMIT");

      const setupLink = buildPasswordSetupLink(tokenData.rawToken);

      res.status(200).json({
        message: "Ссылка для смены пароля сгенерирована.",
        user: {
          id: targetUser.id,
          email: targetUser.email,
          lastName: targetUser.last_name,
          firstName: targetUser.first_name,
          middleName: targetUser.middle_name,
          role: targetUser.role,
        },
        setupLink,
        expiresAt: tokenData.expiresAt.toISOString(),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Не удалось сгенерировать ссылку для смены пароля:", error);
      res.status(500).json({
        message: "Не удалось сгенерировать ссылку для смены пароля.",
      });
    } finally {
      client.release();
    }
  }
);

app.get("/api/password-setup/session", async (req, res) => {
  const token = normalizeToken(req.query?.token);

  if (!token) {
    res.status(400).json({
      message: "Требуется token.",
    });
    return;
  }

  const tokenHash = hashInviteToken(token);

  try {
    const result = await pool.query(
      `
        SELECT
          pst.id,
          pst.expires_at,
          pst.used_at,
          u.email,
          u.last_name,
          u.first_name,
          u.middle_name,
          r.name AS role
        FROM password_setup_tokens AS pst
        JOIN users AS u ON u.id = pst.user_id
        JOIN roles AS r ON r.id = u.role_id
        WHERE pst.token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        message: "Ссылка для установки пароля не найдена.",
      });
      return;
    }

    const tokenRecord = result.rows[0];

    if (tokenRecord.used_at) {
      res.status(410).json({
        message: "Эта ссылка уже использована.",
      });
      return;
    }

    if (new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
      res.status(410).json({
        message: "Срок действия ссылки истек.",
      });
      return;
    }

    res.status(200).json({
      session: {
        email: tokenRecord.email,
        lastName: tokenRecord.last_name,
        firstName: tokenRecord.first_name,
        middleName: tokenRecord.middle_name,
        role: tokenRecord.role,
        expiresAt: new Date(tokenRecord.expires_at).toISOString(),
      },
    });
  } catch (error) {
    console.error("Не удалось проверить токен установки пароля:", error);
    res.status(500).json({
      message: "Не удалось проверить токен установки пароля.",
    });
  }
});

app.post("/api/password-setup/complete", async (req, res) => {
  const token = normalizeToken(req.body?.token);
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const lastName = normalizeOptionalText(req.body?.lastName);
  const firstName = normalizeOptionalText(req.body?.firstName);
  const middleName = normalizeOptionalText(req.body?.middleName);

  if (!token || !password) {
    res.status(400).json({
      message: "Поля token и password обязательны.",
    });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({
      message: passwordError,
    });
    return;
  }

  const tokenHash = hashInviteToken(token);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `
        SELECT
          id,
          user_id,
          expires_at,
          used_at
        FROM password_setup_tokens
        WHERE token_hash = $1
        LIMIT 1
        FOR UPDATE
      `,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({
        message: "Ссылка для установки пароля не найдена.",
      });
      return;
    }

    const tokenRecord = tokenResult.rows[0];

    if (tokenRecord.used_at) {
      await client.query("ROLLBACK");
      res.status(410).json({
        message: "Эта ссылка уже использована.",
      });
      return;
    }

    if (new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      res.status(410).json({
        message: "Срок действия ссылки истек.",
      });
      return;
    }

    const userNameResult = await client.query(
      `
        SELECT
          last_name,
          first_name
        FROM users
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [tokenRecord.user_id]
    );

    if (userNameResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({
        message: "Пользователь для этой ссылки не найден.",
      });
      return;
    }

    const existingNames = userNameResult.rows[0];
    const effectiveLastName = lastName ?? existingNames.last_name;
    const effectiveFirstName = firstName ?? existingNames.first_name;

    if (!effectiveLastName || !effectiveFirstName) {
      await client.query("ROLLBACK");
      res.status(400).json({
        message: "Укажите фамилию и имя.",
      });
      return;
    }

    const nextPasswordHash = hashPassword(password);

    const updateUserResult = await client.query(
      `
        UPDATE users
        SET
          password_hash = $1,
          last_name = $2,
          first_name = $3,
          middle_name = COALESCE($4, middle_name),
          updated_at = NOW()
        WHERE id = $5
      `,
      [
        nextPasswordHash,
        effectiveLastName,
        effectiveFirstName,
        middleName,
        tokenRecord.user_id,
      ]
    );

    if (updateUserResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({
        message: "Пользователь для этой ссылки не найден.",
      });
      return;
    }

    await client.query(
      `
        UPDATE password_setup_tokens
        SET
          used_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [tokenRecord.id]
    );

    await client.query(
      `
        UPDATE password_setup_tokens
        SET
          used_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
          AND id <> $2
      `,
      [tokenRecord.user_id, tokenRecord.id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      message: "Пароль успешно установлен. Теперь можно войти.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Не удалось завершить установку пароля:", error);
    res.status(500).json({
      message: "Не удалось завершить установку пароля.",
    });
  } finally {
    client.release();
  }
});

const start = async () => {
  await ensureInviteSchemaCompatibility();

  app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
  });
};

start().catch((error) => {
  console.error("Не удалось запустить сервер:", error);
  process.exit(1);
});
