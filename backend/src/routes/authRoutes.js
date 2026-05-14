const express = require("express");

const { pool } = require("../db");
const { hashPassword, validatePassword, verifyPassword } = require("../security");
const { authCookieName, getEmptyAuthCookieOptions, issueAuthCookie, requireAuth } = require("../middleware/auth");
const { isPersonNameValid, normalizeOptionalText, normalizeUsername } = require("../utils/normalize");

const PERSON_NAME_MAX_LENGTH = 100;

const router = express.Router();
router.get("/api/health", (_req, res) => {
  res.status(200).json({ message: "Сервис работает" });
});

router.get("/api/auth/me", requireAuth, async (req, res) => {
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

router.patch("/api/auth/me", requireAuth, async (req, res) => {
  const lastName = normalizeOptionalText(req.body?.lastName);
  const firstName = normalizeOptionalText(req.body?.firstName);
  const middleName = normalizeOptionalText(req.body?.middleName);

  if (lastName && (!isPersonNameValid(lastName) || lastName.length > PERSON_NAME_MAX_LENGTH)) {
    res.status(400).json({
      message: "Фамилия может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
    });
    return;
  }

  if (firstName && (!isPersonNameValid(firstName) || firstName.length > PERSON_NAME_MAX_LENGTH)) {
    res.status(400).json({
      message: "Имя может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
    });
    return;
  }

  if (middleName && (!isPersonNameValid(middleName) || middleName.length > PERSON_NAME_MAX_LENGTH)) {
    res.status(400).json({
      message: "Отчество может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
    });
    return;
  }

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

router.post("/api/auth/login", async (req, res) => {
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

router.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(authCookieName, getEmptyAuthCookieOptions());
  res.status(200).json({
    message: "Выход выполнен.",
  });
});

router.post("/api/auth/change-password", requireAuth, async (req, res) => {
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

module.exports = router;
