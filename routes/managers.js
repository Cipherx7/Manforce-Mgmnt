const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requirePermission } = require('../middleware/auth');

// GET all managers (authenticated users can read directory for dropdowns/filters)
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*,
        COUNT(r.id) AS total_resources,
        SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN r.status='on_leave' THEN 1 ELSE 0 END) AS on_leave,
        SUM(CASE WHEN r.status='unavailable' THEN 1 ELSE 0 END) AS unavailable
      FROM managers m
      LEFT JOIN resources r ON r.reporting_manager_id = m.id
      GROUP BY m.id
      ORDER BY m.name
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET manager by ID
router.get('/:id', requirePermission('view_managers'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM managers WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Manager not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET manager's team with breakdown
router.get('/:id/team', requirePermission('view_managers'), async (req, res) => {
  try {
    const mgr_id = req.params.id;

    const [manager] = await pool.query(`SELECT * FROM managers WHERE id = ?`, [mgr_id]);
    if (!manager.length) return res.status(404).json({ success: false, error: 'Manager not found' });

    const [team] = await pool.query(`
      SELECT r.*, rc.name AS category_name,
             p.name AS current_project_name
      FROM resources r
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN projects p ON p.id = r.current_project_id
      WHERE r.reporting_manager_id = ?
      ORDER BY r.name
    `, [mgr_id]);

    const [summary] = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN r.status='on_leave' THEN 1 ELSE 0 END) AS on_leave,
        SUM(CASE WHEN r.status='unavailable' THEN 1 ELSE 0 END) AS unavailable
      FROM resources r WHERE r.reporting_manager_id = ?
    `, [mgr_id]);

    // Project-wise breakdown
    const [projectBreakdown] = await pool.query(`
      SELECT p.id, p.name, COUNT(r.id) AS staff_count
      FROM projects p
      JOIN resources r ON r.current_project_id = p.id
      WHERE r.reporting_manager_id = ?
      GROUP BY p.id, p.name
    `, [mgr_id]);

    // Category-wise breakdown
    const [categoryBreakdown] = await pool.query(`
      SELECT rc.name AS category,
             COUNT(r.id) AS total,
             SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
             SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) AS assigned
      FROM resources r
      JOIN resource_categories rc ON rc.id = r.category_id
      WHERE r.reporting_manager_id = ?
      GROUP BY rc.id, rc.name
    `, [mgr_id]);

    res.json({
      success: true,
      data: {
        manager: manager[0],
        summary: summary[0],
        team,
        project_breakdown: projectBreakdown,
        category_breakdown: categoryBreakdown,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create manager
router.post('/', requirePermission('edit_managers'), async (req, res) => {
  try {
    const { name, contact, role } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    const [result] = await pool.query(
      `INSERT INTO managers (name, contact, role) VALUES (?, ?, ?)`,
      [name, contact || null, role || 'Manager']
    );
    const [row] = await pool.query(`SELECT * FROM managers WHERE id = ?`, [result.insertId]);
    res.status(201).json({ success: true, data: row[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update manager
router.put('/:id', requirePermission('edit_managers'), async (req, res) => {
  try {
    const { name, contact, role } = req.body;
    await pool.query(
      `UPDATE managers SET name=?, contact=?, role=? WHERE id=?`,
      [name, contact, role, req.params.id]
    );
    const [row] = await pool.query(`SELECT * FROM managers WHERE id = ?`, [req.params.id]);
    res.json({ success: true, data: row[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE manager
router.delete('/:id', requirePermission('edit_managers'), async (req, res) => {
  try {
    await pool.query(`UPDATE resources SET reporting_manager_id=NULL WHERE reporting_manager_id=?`, [req.params.id]);
    await pool.query(`DELETE FROM managers WHERE id=?`, [req.params.id]);
    res.json({ success: true, message: 'Manager deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
