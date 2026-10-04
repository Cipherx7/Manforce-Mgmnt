// routes/nominations.js — Nomination workflow
// Lead: nominate any resource, review all nominations, approve/reject
// Manager: nominate own resources, view own nominations only
const router = require('express').Router();
const { pool } = require('../db');
const { isLead } = require('../middleware/auth');

// GET /api/nominations?project_id=&status=&manager_id=
router.get('/', async (req, res) => {
  try {
    const { project_id, status, manager_id } = req.query;
    const where = [];
    const params = [];

    if (project_id) { where.push('n.project_id = ?'); params.push(project_id); }
    if (status)     { where.push('n.status = ?');     params.push(status); }

    // Managers only see their own nominations
    if (!isLead(req.user)) {
      where.push('n.manager_id = ?');
      params.push(req.user.manager_id);
    } else if (manager_id) {
      where.push('n.manager_id = ?');
      params.push(manager_id);
    }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await pool.query(`
      SELECT n.*,
             r.name AS resource_name, r.staff_id, r.contact_info, r.skills,
             rc.name AS category_name,
             p.name AS project_name,
             m.name AS manager_name,
             u.name AS nominated_by_name
      FROM nominations n
      JOIN resources r ON r.id = n.resource_id
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      JOIN projects p ON p.id = n.project_id
      LEFT JOIN managers m ON m.id = n.manager_id
      LEFT JOIN users u ON u.id = n.nominated_by_user_id
      ${wc}
      ORDER BY n.created_at DESC
    `, params);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/nominations — nominate a resource for a project
router.post('/', async (req, res) => {
  const { project_id, resource_id, notes } = req.body;
  if (!project_id || !resource_id) {
    return res.status(400).json({ success: false, error: 'project_id and resource_id are required.' });
  }
  try {
    // Managers can only nominate their own resources
    if (!isLead(req.user)) {
      const [r] = await pool.query('SELECT reporting_manager_id FROM resources WHERE id = ?', [resource_id]);
      if (!r.length || r[0].reporting_manager_id !== req.user.manager_id) {
        return res.status(403).json({ success: false, error: 'You can only nominate your own resources.' });
      }
    }

    // Prevent duplicate nomination on same project
    const [existing] = await pool.query(
      'SELECT id, status FROM nominations WHERE project_id = ? AND resource_id = ?',
      [project_id, resource_id]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, error: `Already nominated (status: ${existing[0].status}).` });
    }

    // Get resource's manager_id
    const [rr] = await pool.query('SELECT reporting_manager_id FROM resources WHERE id = ?', [resource_id]);
    const manager_id = rr[0]?.reporting_manager_id || null;

    // Lead nominations go straight to pending_approval; manager nominations start as nominated
    const initialStatus = isLead(req.user) ? 'pending_approval' : 'nominated';

    const [result] = await pool.query(
      `INSERT INTO nominations (project_id, resource_id, nominated_by_user_id, manager_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [project_id, resource_id, req.user.id, manager_id, initialStatus, notes || null]
    );

    // Update resource status
    await pool.query("UPDATE resources SET status = ? WHERE id = ?", [initialStatus, resource_id]);

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/nominations/:id — update status (approve/reject — Lead only)
router.put('/:id', async (req, res) => {
  const { status, notes } = req.body;
  const validStatuses = ['nominated', 'pending_approval', 'approved', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  // Only Lead can approve/reject
  if (['approved', 'rejected'].includes(status) && !isLead(req.user)) {
    return res.status(403).json({ success: false, error: 'Only a Lead can approve or reject nominations.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM nominations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Nomination not found.' });

    const nom = rows[0];

    await conn.query(
      `UPDATE nominations SET status=?, notes=COALESCE(?, notes), reviewed_by=?, reviewed_at=? WHERE id=?`,
      [status, notes, req.user.id, new Date(), req.params.id]
    );

    // Sync resource status
    const resourceStatus = status === 'approved' ? 'confirmed' : status === 'rejected' ? 'available' : status;
    await conn.query('UPDATE resources SET status=? WHERE id=?', [resourceStatus, nom.resource_id]);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/nominations/:id — withdraw nomination
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM nominations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Nomination not found.' });
    const nom = rows[0];

    // Manager can only withdraw their own; lead can withdraw any
    if (!isLead(req.user) && nom.manager_id !== req.user.manager_id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    await pool.query('DELETE FROM nominations WHERE id = ?', [req.params.id]);
    await pool.query("UPDATE resources SET status='available' WHERE id=? AND status != 'deployed'", [nom.resource_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
