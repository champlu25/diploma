const express = require("express");

const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  normalizeOptionalDate,
  normalizeOptionalId,
  normalizeOptionalText,
  normalizeRequiredNonNegativeDecimal,
  normalizeRequiredNonNegativeInteger,
  normalizeRequiredPercent,
  normalizeRequiredText,
  parseUserId,
} = require("../utils/normalize");

const DEAL_NEED_MAX_LENGTH = 500;
const DEAL_COMMENT_MAX_LENGTH = 2000;

const router = express.Router();
router.get("/api/deals/lookups", requireAuth, async (_req, res) => {
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

router.get("/api/deals", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);
  const companyIdFilter = parseUserId(req.query?.companyId);
  const searchCompanyName =
    typeof req.query?.searchCompanyName === "string" ? req.query.searchCompanyName.trim() : "";
  const searchInn = typeof req.query?.searchInn === "string" ? req.query.searchInn.trim() : "";
  const managerUserId = parseUserId(req.query?.managerUserId);
  const lifecycleStatusId = parseUserId(req.query?.lifecycleStatusId);
  const dealStageId = parseUserId(req.query?.dealStageId);
  const hotColdFilter = typeof req.query?.hotCold === "string" ? req.query.hotCold : "";
  const sortMode = typeof req.query?.sort === "string" ? req.query.sort : "created_desc";

  try {
    const params = [];
    const whereParts = [];
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (req.auth.role === "owner") {
      // no scope restriction
    } else if (req.auth.role === "group_lead") {
      const scopeParam = addParam(currentUserId);
      whereParts.push(`
        (
          c.manager_user_id = ${scopeParam}
          OR c.manager_user_id IN (
            SELECT u.id
            FROM users AS u
            JOIN roles AS r ON r.id = u.role_id
            WHERE u.group_lead_user_id = ${scopeParam}
              AND r.name = 'manager'
          )
        )
      `);
    } else {
      whereParts.push(`c.manager_user_id = ${addParam(currentUserId)}`);
    }

    if (companyIdFilter) {
      whereParts.push(`d.company_id = ${addParam(companyIdFilter)}`);
    }

    if (searchCompanyName) {
      whereParts.push(`c.name ILIKE ${addParam(`%${searchCompanyName}%`)}`);
    }

    if (searchInn) {
      whereParts.push(`c.inn ILIKE ${addParam(`%${searchInn}%`)}`);
    }

    if (managerUserId) {
      whereParts.push(`c.manager_user_id = ${addParam(managerUserId)}`);
    }

    if (lifecycleStatusId) {
      whereParts.push(`d.deal_lifecycle_status_id = ${addParam(lifecycleStatusId)}`);
    }

    if (dealStageId) {
      whereParts.push(`d.deal_stage_id = ${addParam(dealStageId)}`);
    }

    if (hotColdFilter === "hot") {
      whereParts.push(`ds.name ILIKE ${addParam("%горяч%")}`);
    } else if (hotColdFilter === "cold") {
      whereParts.push(`ds.name ILIKE ${addParam("%холод%")}`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const orderBySql =
      sortMode === "company_asc"
        ? "ORDER BY c.name ASC, d.id DESC"
        : sortMode === "advance_desc"
          ? "ORDER BY ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0, 2) DESC, d.id DESC"
          : "ORDER BY d.created_at DESC, d.id DESC";

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
          ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0, 2) AS advance_total_rub,
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
        ${orderBySql}
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

router.post("/api/companies/:companyId/deals", requireAuth, async (req, res) => {
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
  const plCostRub = normalizeRequiredNonNegativeDecimal(req.body?.plCostRub);
  const agentFeePercent = normalizeRequiredPercent(req.body?.agentFeePercent);

  if (!need) {
    res.status(400).json({
      message: 'Поле "Потребность" обязательно.',
    });
    return;
  }

  if (need.length > DEAL_NEED_MAX_LENGTH) {
    res.status(400).json({
      message: `Поле "Потребность" не должно превышать ${DEAL_NEED_MAX_LENGTH} символов.`,
    });
    return;
  }

  if (comment && comment.length > DEAL_COMMENT_MAX_LENGTH) {
    res.status(400).json({
      message: `Комментарий не должен превышать ${DEAL_COMMENT_MAX_LENGTH} символов.`,
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
        ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0, 2) AS advance_total_rub,
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

router.patch("/api/deals/:dealId", requireAuth, async (req, res) => {
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
    if (need.length > DEAL_NEED_MAX_LENGTH) {
      res.status(400).json({
        message: `Поле "Потребность" не должно превышать ${DEAL_NEED_MAX_LENGTH} символов.`,
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
    const plCostRub = normalizeRequiredNonNegativeDecimal(req.body?.plCostRub);
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
    const comment = normalizeOptionalText(req.body?.comment);
    if (comment && comment.length > DEAL_COMMENT_MAX_LENGTH) {
      res.status(400).json({
        message: `Комментарий не должен превышать ${DEAL_COMMENT_MAX_LENGTH} символов.`,
      });
      return;
    }
    fieldsToUpdate.comment = comment;
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
        ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0, 2) AS advance_total_rub,
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

router.patch("/api/deals/:dealId/lifecycle-status", requireAuth, async (req, res) => {
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
        ROUND((d.pl_cost_rub::NUMERIC * d.agent_fee_percent) / 100.0, 2) AS advance_total_rub,
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

router.delete("/api/deals/:dealId", requireAuth, async (req, res) => {
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

module.exports = router;
