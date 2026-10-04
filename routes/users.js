// routes/users.js — User Management (Super Admin only)
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authenticate, requirePermission } = require('../middleware/auth');

// All user management requires authentication + manage_users permission (or super_admin)
router.use(authenticate, requirePermission('manage_users'));

// GET /api/users — list all users
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.role, u.is_active,
        u.permissions,
        u.created_at, u.last_login,
        m.id AS manager_id, m.name AS manager_name
      FROM users u
      LEFT JOIN managers m ON m.id = u.manager_id
      ORDER BY u.role DESC, u.name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users — create user
router.post('/', async (req, res) => {
  const { name, email, password, role, manager_id, permissions } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, error: 'Name, email, password and role are required.' });
  }
  if (!['super_admin', 'lead', 'manager'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role. Must be Lead or Manager.' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const permsJson = JSON.stringify(permissions || getDefaultPermissions(role));

    let finalMgrId = manager_id || null;
    if (!finalMgrId) {
      const [mRows] = await pool.query('SELECT id FROM managers WHERE name ILIKE ? LIMIT 1', [name.trim()]);
      if (mRows.length) {
        finalMgrId = mRows[0].id;
      } else {
        const mgrRole = role === 'manager' ? 'Squad Manager' : 'Operations Lead';
        const [mIns] = await pool.query('INSERT INTO managers (name, role) VALUES (?, ?) RETURNING id', [name.trim(), mgrRole]);
        finalMgrId = mIns.insertId || mIns[0]?.id;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, manager_id, permissions, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [name.trim(), email.toLowerCase().trim(), hash, role, finalMgrId, permsJson]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A user with that email already exists.' });
    }
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.is_active, u.permissions,
             u.created_at, u.last_login,
             m.id AS manager_id, m.name AS manager_name
      FROM users u
      LEFT JOIN managers m ON m.id = u.manager_id
      WHERE u.id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:id — update user
router.put('/:id', async (req, res) => {
  const { name, email, role, manager_id, permissions, is_active, password } = req.body;
  try {
    // Build dynamic update
    const sets = [];
    const vals = [];
    if (name !== undefined)       { sets.push('name = ?'); vals.push(name.trim()); }
    if (email !== undefined)      { sets.push('email = ?'); vals.push(email.toLowerCase().trim()); }
    if (role !== undefined) {
      if (!['super_admin', 'lead', 'manager'].includes(role)) {
        return res.status(400).json({ success: false, error: 'Invalid role. Must be Lead or Manager.' });
      }
      sets.push('role = ?'); vals.push(role);
      sets.push('permissions = ?'); vals.push(JSON.stringify(getDefaultPermissions(role)));
    }
    if (manager_id !== undefined) { sets.push('manager_id = ?'); vals.push(manager_id || null); }
    if (is_active !== undefined)  { sets.push('is_active = ?'); vals.push(Boolean(is_active)); }
    if (permissions !== undefined && role === undefined){ sets.push('permissions = ?'); vals.push(JSON.stringify(permissions)); }
    if (password)                 { sets.push('password_hash = ?'); vals.push(await bcrypt.hash(password, 12)); }

    if (!sets.length) return res.status(400).json({ success: false, error: 'Nothing to update.' });

    vals.push(req.params.id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:id — deactivate (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    // Prevent deleting yourself
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ success: false, error: 'You cannot deactivate your own account.' });
    }
    await pool.query('UPDATE users SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────
function getDefaultPermissions(role) {
  const lead = {
    view_dashboard: true, view_resources: true, view_projects: true,
    view_assignments: true, view_managers: true, view_reports: true,
    view_clients: true,
    edit_resources: true, edit_projects: true, edit_assignments: true,
    edit_managers: true, edit_clients: true,
    manage_users: true,
  };
  const manager = {
    view_dashboard: true, view_resources: true, view_projects: true,
    view_assignments: true, view_managers: false, view_reports: true,
    view_clients: true,
    edit_resources: true, edit_projects: false, edit_assignments: true,
    edit_managers: false, edit_clients: false,
    manage_users: false,
  };
  return ['super_admin', 'lead'].includes(role) ? lead : manager;
}

module.exports = router;
