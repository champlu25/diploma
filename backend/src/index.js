const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config();

const { pool } = require('./db');
const { sendPasswordSetupEmail } = require('./email');
const {
  generateInviteToken,
  hashInviteToken,
  hashPassword,
  signJwt,
  validatePassword,
  verifyJwt,
  verifyPassword,
} = require('./security');

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const inviteLinkBase = (process.env.INVITE_LINK_BASE || frontendOrigin).replace(/\/+$/, '');
const authTokenTtlHours = Number(process.env.AUTH_TOKEN_TTL_HOURS || 12);
const inviteTtlHours = Number(process.env.INVITE_TTL_HOURS || 24);
const ownerPasswordLinkTtlMinutes = Number(process.env.RESET_TTL_MINUTES || 30);
const showInviteLinkInResponse = process.env.SHOW_INVITE_LINK_IN_RESPONSE === 'true';
const authJwtSecret = process.env.AUTH_JWT_SECRET || '';
const authCookieName = 'access_token';
const isProduction = process.env.NODE_ENV === 'production';
const inviteAllowedRoles = new Set(['manager', 'group_lead']);

if (!Number.isFinite(authTokenTtlHours) || authTokenTtlHours <= 0) {
  throw new Error('AUTH_TOKEN_TTL_HOURS должен быть положительным числом.');
}

if (!Number.isFinite(inviteTtlHours) || inviteTtlHours <= 0) {
  throw new Error('INVITE_TTL_HOURS должен быть положительным числом.');
}

if (!Number.isFinite(ownerPasswordLinkTtlMinutes) || ownerPasswordLinkTtlMinutes <= 0) {
  throw new Error('RESET_TTL_MINUTES должен быть положительным числом.');
}

if (!authJwtSecret) {
  throw new Error('AUTH_JWT_SECRET обязателен.');
}

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json());

const normalizeEmail = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeToken = (value) =>
  typeof value === 'string' ? value.trim() : '';

const normalizeRole = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const parseUserId = (value) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, item) => {
    const [rawKey, ...rawValueParts] = item.trim().split('=');
    if (!rawKey) {
      return acc;
    }

    const rawValue = rawValueParts.join('=');

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
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
  maxAge: authTokenTtlHours * 60 * 60 * 1000,
});

const getEmptyAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
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
      message: 'Требуется авторизация.',
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
      message: 'Требуется авторизация.',
    });
    return;
  }

  if (payload.role !== 'owner') {
    res.status(403).json({
      message: 'Требуются права владельца.',
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

const createPasswordSetupToken = async ({
  client,
  userId,
  kind,
  issuedByUserId,
  ttlMinutes,
}) => {
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
    [userId],
  );

  await client.query(
    `
      INSERT INTO password_setup_tokens (
        user_id,
        token_hash,
        kind,
        expires_at,
        issued_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [userId, tokenHash, kind, expiresAt, issuedByUserId],
  );

  return {
    rawToken,
    expiresAt,
  };
};

app.get('/api/health', (_req, res) => {
  res.status(200).json({ message: 'Сервис работает' });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
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
      [req.auth.sub],
    );

    if (result.rowCount === 0) {
      res.clearCookie(authCookieName, getEmptyAuthCookieOptions());
      res.status(401).json({
        message: 'Сессия недействительна. Войдите снова.',
      });
      return;
    }

    const user = result.rows[0];

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Не удалось получить текущую сессию:', error);
    res.status(500).json({
      message: 'Не удалось получить текущую сессию.',
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({
      message: 'Поля email и password обязательны.',
    });
    return;
  }

  try {
    const userResult = await pool.query(
      `
        SELECT
          u.id,
          u.email,
          u.password_hash,
          r.name AS role
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        WHERE u.email = $1
        LIMIT 1
      `,
      [email],
    );

    if (userResult.rowCount === 0) {
      res.status(401).json({
        message: 'Неверный email или пароль.',
      });
      return;
    }

    const user = userResult.rows[0];

    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({
        message: 'Неверный email или пароль.',
      });
      return;
    }

    const authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    issueAuthCookie({ res, user: authUser });

    res.status(200).json({
      message: 'Вход выполнен.',
      user: authUser,
    });
  } catch (error) {
    console.error('Не удалось выполнить вход:', error);
    res.status(500).json({
      message: 'Не удалось выполнить вход.',
    });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(authCookieName, getEmptyAuthCookieOptions());
  res.status(200).json({
    message: 'Выход выполнен.',
  });
});

app.get('/api/users', requireOwner, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.email,
          r.name AS role
        FROM users AS u
        JOIN roles AS r ON r.id = u.role_id
        ORDER BY u.id ASC
      `,
    );

    res.status(200).json({ users: result.rows });
  } catch (error) {
    console.error('Не удалось получить пользователей:', error);
    res.status(500).json({
      message: 'Не удалось получить пользователей.',
    });
  }
});

app.post('/api/owner/users/invite', requireOwner, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const roleName = normalizeRole(req.body?.role);

  if (!email || !roleName) {
    res.status(400).json({
      message: 'Поля email и role обязательны.',
    });
    return;
  }

  if (!inviteAllowedRoles.has(roleName)) {
    res.status(400).json({
      message: 'Роль должна быть manager или group_lead.',
    });
    return;
  }

  const client = await pool.connect();

  let invitedUser = null;
  let setupLink = null;
  let expiresAt = null;

  try {
    await client.query('BEGIN');

    const roleResult = await client.query(
      `
        SELECT id
        FROM roles
        WHERE name = $1
        LIMIT 1
      `,
      [roleName],
    );

    if (roleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        message: 'Роль не найдена в базе данных.',
      });
      return;
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
      [email],
    );

    if (existingUserResult.rowCount > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        message: 'Пользователь с таким email уже существует.',
      });
      return;
    }

    const userInsertResult = await client.query(
      `
        INSERT INTO users (email, password_hash, role_id)
        VALUES ($1, NULL, $2)
        RETURNING id, email
      `,
      [email, roleResult.rows[0].id],
    );

    invitedUser = {
      id: userInsertResult.rows[0].id,
      email: userInsertResult.rows[0].email,
      role: roleName,
    };

    const tokenData = await createPasswordSetupToken({
      client,
      userId: invitedUser.id,
      kind: 'invite',
      issuedByUserId: Number(req.auth.sub),
      ttlMinutes: inviteTtlHours * 60,
    });

    setupLink = buildPasswordSetupLink(tokenData.rawToken);
    expiresAt = tokenData.expiresAt;

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');

    if (error?.code === '23505') {
      res.status(409).json({
        message: 'Пользователь с таким email уже существует.',
      });
      return;
    }

    console.error('Не удалось создать приглашение:', error);
    res.status(500).json({
      message: 'Не удалось создать приглашение.',
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
    console.error('Не удалось отправить письмо с приглашением:', error);
    res.status(502).json({
      message: 'Пользователь создан, но письмо с приглашением не отправлено.',
      invitedUser,
      ...(showInviteLinkInResponse ? { inviteLink: setupLink } : {}),
    });
    return;
  }

  res.status(201).json({
    message: 'Приглашение успешно отправлено.',
    invitedUser,
    ...(showInviteLinkInResponse ? { inviteLink: setupLink } : {}),
  });
});

app.post('/api/owner/users/:userId/password-link', requireOwner, async (req, res) => {
  const userId = parseUserId(req.params?.userId);

  if (!userId) {
    res.status(400).json({
      message: 'Некорректный userId.',
    });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
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
      [userId],
    );

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        message: 'Пользователь не найден.',
      });
      return;
    }

    const targetUser = userResult.rows[0];

    const tokenData = await createPasswordSetupToken({
      client,
      userId,
      kind: 'owner_reset',
      issuedByUserId: Number(req.auth.sub),
      ttlMinutes: ownerPasswordLinkTtlMinutes,
    });

    await client.query('COMMIT');

    const setupLink = buildPasswordSetupLink(tokenData.rawToken);

    res.status(200).json({
      message: 'Ссылка для смены пароля сгенерирована.',
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
      },
      setupLink,
      expiresAt: tokenData.expiresAt.toISOString(),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Не удалось сгенерировать ссылку для смены пароля:', error);
    res.status(500).json({
      message: 'Не удалось сгенерировать ссылку для смены пароля.',
    });
  } finally {
    client.release();
  }
});

app.get('/api/password-setup/session', async (req, res) => {
  const token = normalizeToken(req.query?.token);

  if (!token) {
    res.status(400).json({
      message: 'Требуется token.',
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
          r.name AS role
        FROM password_setup_tokens AS pst
        JOIN users AS u ON u.id = pst.user_id
        JOIN roles AS r ON r.id = u.role_id
        WHERE pst.token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        message: 'Ссылка для установки пароля не найдена.',
      });
      return;
    }

    const tokenRecord = result.rows[0];

    if (tokenRecord.used_at) {
      res.status(410).json({
        message: 'Эта ссылка уже использована.',
      });
      return;
    }

    if (new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
      res.status(410).json({
        message: 'Срок действия ссылки истек.',
      });
      return;
    }

    res.status(200).json({
      session: {
        email: tokenRecord.email,
        role: tokenRecord.role,
        expiresAt: new Date(tokenRecord.expires_at).toISOString(),
      },
    });
  } catch (error) {
    console.error('Не удалось проверить токен установки пароля:', error);
    res.status(500).json({
      message: 'Не удалось проверить токен установки пароля.',
    });
  }
});

app.post('/api/password-setup/complete', async (req, res) => {
  const token = normalizeToken(req.body?.token);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!token || !password) {
    res.status(400).json({
      message: 'Поля token и password обязательны.',
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
    await client.query('BEGIN');

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
      [tokenHash],
    );

    if (tokenResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        message: 'Ссылка для установки пароля не найдена.',
      });
      return;
    }

    const tokenRecord = tokenResult.rows[0];

    if (tokenRecord.used_at) {
      await client.query('ROLLBACK');
      res.status(410).json({
        message: 'Эта ссылка уже использована.',
      });
      return;
    }

    if (new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      res.status(410).json({
        message: 'Срок действия ссылки истек.',
      });
      return;
    }

    const nextPasswordHash = hashPassword(password);

    const updateUserResult = await client.query(
      `
        UPDATE users
        SET
          password_hash = $1,
          updated_at = NOW()
        WHERE id = $2
      `,
      [nextPasswordHash, tokenRecord.user_id],
    );

    if (updateUserResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        message: 'Пользователь для этой ссылки не найден.',
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
      [tokenRecord.id],
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
      [tokenRecord.user_id, tokenRecord.id],
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: 'Пароль успешно установлен. Теперь можно войти.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Не удалось завершить установку пароля:', error);
    res.status(500).json({
      message: 'Не удалось завершить установку пароля.',
    });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});
