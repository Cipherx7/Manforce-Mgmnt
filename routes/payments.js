// routes/payments.js — Compensation tracking per resource per project
const router = require('express').Router();
const { pool } = require('../db');
const { isLead } = require('../middleware/auth');

// GET /api/payments?project_id=&resource_id=&payment_status=
router.get('/', async (req, res) => {
  try {
    const { project_id, resource_id, payment_status } = req.query;
    const where = [];
    const params = [];

    if (project_id)     { where.push('pay.project_id = ?');     params.push(project_id); }
    if (resource_id)    { where.push('pay.resource_id = ?');     params.push(resource_id); }
    if (payment_status) { where.push('pay.payment_status = ?'); params.push(payment_status); }

    // Managers only see payments for their own resources
    if (!isLead(req.user)) {
      where.push('r.reporting_manager_id = ?');
      params.push(req.user.manager_id);
    }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await pool.query(`
      SELECT pay.*,
             r.name AS resource_name, r.staff_id,
             p.name AS project_name
      FROM payments pay
      JOIN resources r ON r.id = pay.resource_id
      JOIN projects  p ON p.id = pay.project_id
      ${wc}
      ORDER BY pay.created_at DESC
    `, params);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/payments/summary/:project_id — financial summary for a project
router.get('/summary/:project_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COUNT(*)                                          AS total_records,
        SUM(COALESCE(final_amount, calculated_amount, 0)) AS total_manpower_cost,
        SUM(CASE WHEN payment_status='paid'    THEN COALESCE(final_amount, calculated_amount, 0) ELSE 0 END) AS paid,
        SUM(CASE WHEN payment_status='pending' THEN COALESCE(final_amount, calculated_amount, 0) ELSE 0 END) AS pending
      FROM payments WHERE project_id = ?
    `, [req.params.project_id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/payments — create payment record (Lead only)
router.post('/', async (req, res) => {
  if (!isLead(req.user)) {
    return res.status(403).json({ success: false, error: 'Only a Lead can create payment records.' });
  }
  const { project_id, resource_id, assignment_id, rate_type, rate_amount, attendance_status,
          payable_units, calculated_amount, adjustment, final_amount, notes } = req.body;
  if (!project_id || !resource_id || !rate_type || rate_amount == null) {
    return res.status(400).json({ success: false, error: 'project_id, resource_id, rate_type, rate_amount are required.' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO payments
       (project_id, resource_id, assignment_id, rate_type, rate_amount, attendance_status,
        payable_units, calculated_amount, adjustment, final_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [project_id, resource_id, assignment_id || null, rate_type, rate_amount,
       attendance_status || null, payable_units || null, calculated_amount || null,
       adjustment || 0, final_amount || null, notes || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/payments/:id — update payment (status, amounts, reference)
router.put('/:id', async (req, res) => {
  if (!isLead(req.user)) {
    return res.status(403).json({ success: false, error: 'Only a Lead can update payment records.' });
  }
  const { payment_status, payment_date, payment_reference, final_amount, adjustment, notes } = req.body;
  try {
    const sets = [];
    const vals = [];
    if (payment_status    !== undefined) { sets.push('payment_status = ?');    vals.push(payment_status); }
    if (payment_date      !== undefined) { sets.push('payment_date = ?');      vals.push(payment_date); }
    if (payment_reference !== undefined) { sets.push('payment_reference = ?'); vals.push(payment_reference); }
    if (final_amount      !== undefined) { sets.push('final_amount = ?');      vals.push(final_amount); }
    if (adjustment        !== undefined) { sets.push('adjustment = ?');        vals.push(adjustment); }
    if (notes             !== undefined) { sets.push('notes = ?');             vals.push(notes); }
    if (!sets.length) return res.status(400).json({ success: false, error: 'Nothing to update.' });
    vals.push(req.params.id);
    await pool.query(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
