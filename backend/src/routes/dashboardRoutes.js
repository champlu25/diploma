const express = require("express");

const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { normalizeToken, parseUserId } = require("../utils/normalize");

const router = express.Router();
router.get("/api/dashboards/chart-view-settings", requireAuth, async (req, res) => {
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

router.put("/api/dashboards/chart-view-settings/:chartKey", requireAuth, async (req, res) => {
  const currentUserId = Number(req.auth.sub);
  const chartKey = typeof req.params?.chartKey === "string" ? req.params.chartKey.trim() : "";
  const chartTypeId = parseUserId(req.body?.chartTypeId);

  if (!chartKey || !/^[a-z0-9_]+$/.test(chartKey) || chartKey.length > 50) {
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

module.exports = router;
