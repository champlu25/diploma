const express = require("express");

const { pool } = require("../db");
const { hashPassword } = require("../security");
const { requireOwner } = require("../middleware/auth");
const { generateTempPassword } = require("../utils/passwords");
const { isPersonNameValid, isUsernameValid, normalizeOptionalText, normalizeRole, normalizeUsername, parseUserId } = require("../utils/normalize");

const LEASING_COMPANY_NAME_MAX_LENGTH = 100;
const COMMUNICATION_CHANNEL_NAME_MAX_LENGTH = 50;
const PERSON_NAME_MAX_LENGTH = 100;

const router = express.Router();
router.patch("/api/owner/users/:userId", requireOwner, async (req, res) => {
  const userId = parseUserId(req.params?.userId);
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

  if (!userId) {
    res.status(400).json({
      message: "Некорректный userId.",
    });
    return;
  }

  if (!username || !roleName) {
    res.status(400).json({
      message: "Поля username и role обязательны.",
    });
    return;
  }

  if (!isUsernameValid(username)) {
    res.status(400).json({
      message:
        "Username должен содержать от 3 до 50 символов и состоять только из строчных латинских букв, цифр, точек, дефисов и символа подчеркивания.",
    });
    return;
  }

  if (
    lastName &&
    (!isPersonNameValid(lastName) || lastName.length > PERSON_NAME_MAX_LENGTH)
  ) {
    res.status(400).json({
      message:
        "Фамилия может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
    });
    return;
  }

  if (
    firstName &&
    (!isPersonNameValid(firstName) || firstName.length > PERSON_NAME_MAX_LENGTH)
  ) {
    res.status(400).json({
      message:
        "Имя может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
    });
    return;
  }

  if (
    middleName &&
    (!isPersonNameValid(middleName) || middleName.length > PERSON_NAME_MAX_LENGTH)
  ) {
    res.status(400).json({
      message:
        "Отчество может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
    });
    return;
  }

  if (roleName !== "owner" && roleName !== "manager" && roleName !== "group_lead") {
    res.status(400).json({
      message: "Роль должна быть owner, manager или group_lead.",
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

  if (roleName === "manager" && !groupLeadUserId) {
    res.status(400).json({
      message: "Для менеджера нужно указать руководителя группы.",
    });
    return;
  }

  if (roleName !== "manager" && groupLeadUserId !== null) {
    res.status(400).json({
      message: "Руководитель группы указывается только для роли manager.",
    });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const targetUserResult = await client.query(
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

    if (targetUserResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({
        message: "Пользователь не найден.",
      });
      return;
    }

    const targetUser = targetUserResult.rows[0];

    if (targetUser.role === "owner" && roleName !== "owner") {
      await client.query("ROLLBACK");
      res.status(400).json({
        message: "Нельзя изменить роль владельца системы.",
      });
      return;
    }

    if (targetUser.role !== "owner" && roleName === "owner") {
      await client.query("ROLLBACK");
      res.status(400).json({
        message: "Назначение роли owner не поддерживается.",
      });
      return;
    }

    const duplicateResult = await client.query(
      `
        SELECT 1
        FROM users
        WHERE username = $1
          AND id <> $2
        LIMIT 1
      `,
      [username, userId]
    );

    if (duplicateResult.rowCount > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        message: "Пользователь с таким username уже существует.",
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

    if (targetUser.role === "group_lead" && roleName !== "group_lead") {
      const subordinateManagersResult = await client.query(
        `
          SELECT 1
          FROM users AS u
          JOIN roles AS r ON r.id = u.role_id
          WHERE u.group_lead_user_id = $1
            AND r.name = 'manager'
          LIMIT 1
        `,
        [userId]
      );

      if (subordinateManagersResult.rowCount > 0) {
        await client.query("ROLLBACK");
        res.status(400).json({
          message:
            "Нельзя изменить роль руководителя группы, пока за ним закреплены менеджеры.",
        });
        return;
      }
    }

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

    const updateResult = await client.query(
      `
        UPDATE users
        SET
          username = $1,
          last_name = $2,
          first_name = $3,
          middle_name = $4,
          role_id = $5,
          group_lead_user_id = $6,
          updated_at = NOW()
        WHERE id = $7
        RETURNING id
      `,
      [
        username,
        lastName,
        firstName,
        middleName,
        roleResult.rows[0].id,
        roleName === "manager" ? groupLeadUserId : null,
        userId,
      ]
    );

    const updatedUserResult = await client.query(
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
        WHERE u.id = $1
        LIMIT 1
      `,
      [updateResult.rows[0].id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      message: "Пользователь обновлен.",
      user: updatedUserResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error?.code === "23505") {
      res.status(409).json({
        message: "Пользователь с таким username уже существует.",
      });
      return;
    }

    console.error("Не удалось обновить пользователя:", error);
    res.status(500).json({
      message: "Не удалось обновить пользователя.",
    });
  } finally {
    client.release();
  }
});

router.patch(
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

router.post("/api/owner/users", requireOwner, async (req, res) => {
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

  if (!isUsernameValid(username)) {
    res.status(400).json({
      message: "Username должен содержать от 3 до 50 символов и состоять только из строчных латинских букв, цифр, точек, дефисов и символа подчеркивания.",
    });
    return;
  }

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

router.post("/api/owner/users/:userId/reset-password", requireOwner, async (req, res) => {
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

router.get("/api/owner/leasing-companies", requireOwner, async (_req, res) => {
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

router.post("/api/owner/leasing-companies", requireOwner, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    res.status(400).json({
      message: "Поле name обязательно.",
    });
    return;
  }

  if (name.length > LEASING_COMPANY_NAME_MAX_LENGTH) {
    res.status(400).json({
      message: `Название не должно превышать ${LEASING_COMPANY_NAME_MAX_LENGTH} символов.`,
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

router.patch("/api/owner/leasing-companies/:leasingCompanyId", requireOwner, async (req, res) => {
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

    if (trimmed.length > LEASING_COMPANY_NAME_MAX_LENGTH) {
      res.status(400).json({
        message: `Название не должно превышать ${LEASING_COMPANY_NAME_MAX_LENGTH} символов.`,
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

router.delete("/api/owner/leasing-companies/:leasingCompanyId", requireOwner, async (req, res) => {
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

router.get("/api/owner/communication-channels", requireOwner, async (_req, res) => {
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

router.post("/api/owner/communication-channels", requireOwner, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    res.status(400).json({
      message: "Поле name обязательно.",
    });
    return;
  }

  if (name.length > COMMUNICATION_CHANNEL_NAME_MAX_LENGTH) {
    res.status(400).json({
      message: `Название не должно превышать ${COMMUNICATION_CHANNEL_NAME_MAX_LENGTH} символов.`,
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

router.patch("/api/owner/communication-channels/:channelId", requireOwner, async (req, res) => {
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

    if (trimmed.length > COMMUNICATION_CHANNEL_NAME_MAX_LENGTH) {
      res.status(400).json({
        message: `Название не должно превышать ${COMMUNICATION_CHANNEL_NAME_MAX_LENGTH} символов.`,
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

router.delete("/api/owner/communication-channels/:channelId", requireOwner, async (req, res) => {
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

module.exports = router;
