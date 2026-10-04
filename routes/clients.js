// routes/clients.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requirePermission } = require('../middleware/auth');

// GET all clients
router.get('/', requirePermission('view_clients'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, COUNT(p.id) AS total_projects,
             SUM(CASE WHEN p.status='active' THEN 1 ELSE 0 END) AS active_projects
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id
      GROUP BY c.id
      ORDER BY c.name
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET client by ID with projects
router.get('/:id', requirePermission('view_clients'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM clients WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Client not found' });

    const [projects] = await pool.query(`
      SELECT p.*, m.name AS manager_name, COUNT(pa.id) AS assigned_count
      FROM projects p
      LEFT JOIN managers m ON m.id = p.project_manager_id
      LEFT JOIN project_assignments pa ON pa.project_id = p.id AND pa.unassigned_on IS NULL
      WHERE p.client_id = ?
      GROUP BY p.id, m.name
      ORDER BY p.start_date DESC
    `, [req.params.id]);

    res.json({ success: true, data: { ...rows[0], projects } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create client
router.post('/', requirePermission('edit_clients'), async (req, res) => {
  try {
    const { name, contact_info } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    const [result] = await pool.query(`INSERT INTO clients (name, contact_info) VALUES (?, ?)`, [name, contact_info || null]);
    const [row] = await pool.query(`SELECT * FROM clients WHERE id = ?`, [result.insertId]);
    res.status(201).json({ success: true, data: row[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update client
router.put('/:id', requirePermission('edit_clients'), async (req, res) => {
  try {
    const { name, contact_info } = req.body;
    await pool.query(`UPDATE clients SET name=?, contact_info=? WHERE id=?`, [name, contact_info, req.params.id]);
    const [row] = await pool.query(`SELECT * FROM clients WHERE id = ?`, [req.params.id]);
    res.json({ success: true, data: row[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE client
router.delete('/:id', requirePermission('edit_clients'), async (req, res) => {
  try {
    const [proj] = await pool.query(`SELECT id FROM projects WHERE client_id = ? AND status='active'`, [req.params.id]);
    if (proj.length) return res.status(409).json({ success: false, error: 'Client has active projects. Cannot delete.' });
    await pool.query(`DELETE FROM clients WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
