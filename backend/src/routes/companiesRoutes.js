const express = require("express");

const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  isAccountNumberValid,
  isBikValid,
  isEmailValid,
  isInnValid,
  isPersonNameValid,
  isPhoneValid,
  normalizeInn,
  normalizeOptionalDate,
  normalizeOptionalEmail,
  normalizeOptionalId,
  normalizeOptionalText,
  normalizeOptionalTimestamp,
  normalizeRequiredNonNegativeInteger,
  normalizeRequiredText,
  parseUserId,
} = require("../utils/normalize");

const COMPANY_NAME_MAX_LENGTH = 255;
const CONTACT_NAME_MAX_LENGTH = 100;
const COMPANY_COMMENT_MAX_LENGTH = 2000;
const ADDRESS_MAX_LENGTH = 500;
const ACTIVITY_MAX_LENGTH = 200;
const NEGATIVE_INFO_MAX_LENGTH = 2000;

const router = express.Router();
router.get("/api/companies", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);
  const searchName = typeof req.query?.searchName === "string" ? req.query.searchName.trim() : "";
  const searchInn = typeof req.query?.searchInn === "string" ? req.query.searchInn.trim() : "";
  const managerUserId = parseUserId(req.query?.managerUserId);
  const sortMode = typeof req.query?.sort === "string" ? req.query.sort : "created_desc";

  try {
    const params = [];
    const whereParts = [];

    if (req.auth.role === "owner") {
      // no manager scope restriction
    } else if (req.auth.role === "group_lead") {
      params.push(currentUserId);
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
    } else {
      params.push(currentUserId);
      whereParts.push("c.manager_user_id = $1");
    }

    if (searchName) {
      params.push(`%${searchName}%`);
      whereParts.push(`c.name ILIKE $${params.length}`);
    }

    if (searchInn) {
      params.push(`%${searchInn}%`);
      whereParts.push(`c.inn ILIKE $${params.length}`);
    }

    if (managerUserId) {
      params.push(managerUserId);
      whereParts.push(`c.manager_user_id = $${params.length}`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const orderBySql =
      sortMode === "name_asc"
        ? "ORDER BY c.name ASC, c.id ASC"
        : "ORDER BY c.created_at DESC, c.id DESC";

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
          c.revenue_rub,
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
        ${orderBySql}
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

router.get("/api/companies/lookups", requireAuth, async (_req, res) => {
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

router.get("/api/companies/:companyId", requireAuth, async (req, res) => {
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

router.post("/api/companies", requireAuth, async (req, res) => {
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

  if (name.length > COMPANY_NAME_MAX_LENGTH) {
    res.status(400).json({
      message: `Наименование компании не должно превышать ${COMPANY_NAME_MAX_LENGTH} символов.`,
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

  if (contactName && (!isPersonNameValid(contactName) || contactName.length > CONTACT_NAME_MAX_LENGTH)) {
    res.status(400).json({
      message: "Контактное лицо может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
    });
    return;
  }

  if (phone && !isPhoneValid(phone)) {
    res.status(400).json({
      message: "Некорректный формат телефона.",
    });
    return;
  }

  if (comment && comment.length > COMPANY_COMMENT_MAX_LENGTH) {
    res.status(400).json({
      message: `Комментарий не должен превышать ${COMPANY_COMMENT_MAX_LENGTH} символов.`,
    });
    return;
  }

  if (legalAddress && legalAddress.length > ADDRESS_MAX_LENGTH) {
    res.status(400).json({
      message: `Юридический адрес не должен превышать ${ADDRESS_MAX_LENGTH} символов.`,
    });
    return;
  }

  if (actualAddress && actualAddress.length > ADDRESS_MAX_LENGTH) {
    res.status(400).json({
      message: `Фактический адрес не должен превышать ${ADDRESS_MAX_LENGTH} символов.`,
    });
    return;
  }

  if (activity && activity.length > ACTIVITY_MAX_LENGTH) {
    res.status(400).json({
      message: `Вид деятельности не должен превышать ${ACTIVITY_MAX_LENGTH} символов.`,
    });
    return;
  }

  if (negativeInfo && negativeInfo.length > NEGATIVE_INFO_MAX_LENGTH) {
    res.status(400).json({
      message: `Поле "Выявленный негатив" не должно превышать ${NEGATIVE_INFO_MAX_LENGTH} символов.`,
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
    directorBirthDate &&
    (directorBirthDate < "1900-01-01" || directorBirthDate > new Date().toISOString().slice(0, 10))
  ) {
    res.status(400).json({
      message: "Дата рождения директора не может быть в будущем.",
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

  if (bik && !isBikValid(bik)) {
    res.status(400).json({
      message: "БИК должен содержать ровно 9 цифр.",
    });
    return;
  }

  if (rs && !isAccountNumberValid(rs)) {
    res.status(400).json({
      message: "Расчетный счет должен содержать ровно 20 цифр.",
    });
    return;
  }

  if (ks && !isAccountNumberValid(ks)) {
    res.status(400).json({
      message: "Корреспондентский счет должен содержать ровно 20 цифр.",
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

router.patch("/api/companies/:companyId", requireAuth, async (req, res) => {
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

    if (name.length > COMPANY_NAME_MAX_LENGTH) {
      res.status(400).json({
        message: `Наименование компании не должно превышать ${COMPANY_NAME_MAX_LENGTH} символов.`,
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
    const contactName = normalizeOptionalText(req.body?.contactName);
    if (contactName && (!isPersonNameValid(contactName) || contactName.length > CONTACT_NAME_MAX_LENGTH)) {
      res.status(400).json({
        message: "Контактное лицо может содержать только буквы, пробелы и дефис, длина - до 100 символов.",
      });
      return;
    }
    fieldsToUpdate.contact_name = contactName;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
    const phone = normalizeOptionalText(req.body?.phone);
    if (phone && !isPhoneValid(phone)) {
      res.status(400).json({
        message: "Некорректный формат телефона.",
      });
      return;
    }
    fieldsToUpdate.phone = phone;
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
    const comment = normalizeOptionalText(req.body?.comment);
    if (comment && comment.length > COMPANY_COMMENT_MAX_LENGTH) {
      res.status(400).json({
        message: `Комментарий не должен превышать ${COMPANY_COMMENT_MAX_LENGTH} символов.`,
      });
      return;
    }
    fieldsToUpdate.comment = comment;
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
    const legalAddress = normalizeOptionalText(req.body?.legalAddress);
    if (legalAddress && legalAddress.length > ADDRESS_MAX_LENGTH) {
      res.status(400).json({
        message: `Юридический адрес не должен превышать ${ADDRESS_MAX_LENGTH} символов.`,
      });
      return;
    }
    fieldsToUpdate.legal_address = legalAddress;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "actualAddress")) {
    const actualAddress = normalizeOptionalText(req.body?.actualAddress);
    if (actualAddress && actualAddress.length > ADDRESS_MAX_LENGTH) {
      res.status(400).json({
        message: `Фактический адрес не должен превышать ${ADDRESS_MAX_LENGTH} символов.`,
      });
      return;
    }
    fieldsToUpdate.actual_address = actualAddress;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "directorBirthDate")) {
    const directorBirthDate = normalizeOptionalDate(req.body?.directorBirthDate);
    if (Number.isNaN(directorBirthDate)) {
      res.status(400).json({
        message: "Некорректная дата рождения директора.",
      });
      return;
    }

    if (
      directorBirthDate &&
      (directorBirthDate < "1900-01-01" || directorBirthDate > new Date().toISOString().slice(0, 10))
    ) {
      res.status(400).json({
        message: "Дата рождения директора не может быть в будущем.",
      });
      return;
    }

    fieldsToUpdate.director_birth_date = directorBirthDate;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "activity")) {
    const activity = normalizeOptionalText(req.body?.activity);
    if (activity && activity.length > ACTIVITY_MAX_LENGTH) {
      res.status(400).json({
        message: `Вид деятельности не должен превышать ${ACTIVITY_MAX_LENGTH} символов.`,
      });
      return;
    }
    fieldsToUpdate.activity = activity;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "negativeInfo")) {
    const negativeInfo = normalizeOptionalText(req.body?.negativeInfo);
    if (negativeInfo && negativeInfo.length > NEGATIVE_INFO_MAX_LENGTH) {
      res.status(400).json({
        message: `Поле "Выявленный негатив" не должно превышать ${NEGATIVE_INFO_MAX_LENGTH} символов.`,
      });
      return;
    }
    fieldsToUpdate.negative_info = negativeInfo;
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

  if (typeof bik !== "undefined" && bik && !isBikValid(bik)) {
    res.status(400).json({
      message: "БИК должен содержать ровно 9 цифр.",
    });
    return;
  }

  if (typeof rs !== "undefined" && rs && !isAccountNumberValid(rs)) {
    res.status(400).json({
      message: "Расчетный счет должен содержать ровно 20 цифр.",
    });
    return;
  }

  if (typeof ks !== "undefined" && ks && !isAccountNumberValid(ks)) {
    res.status(400).json({
      message: "Корреспондентский счет должен содержать ровно 20 цифр.",
    });
    return;
  }

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

router.post("/api/companies/:companyId/transfer", requireAuth, async (req, res) => {
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

router.delete("/api/companies/:companyId", requireAuth, async (req, res) => {
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

module.exports = router;
