const express = require("express");

const { pool } = require("../db");
const { requireAuth, requireOwner } = require("../middleware/auth");

const router = express.Router();
router.get("/api/users", requireOwner, async (_req, res) => {
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

router.get("/api/users/transfer-targets", requireAuth, async (req, res) => {
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

router.get("/api/group-lead/managers", requireAuth, async (req, res) => {
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

module.exports = router;
