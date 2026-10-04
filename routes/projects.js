const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requirePermission } = require('../middleware/auth');

// GET all projects with summary
router.get('/', requirePermission('view_projects'), async (req, res) => {
  try {
    const { status, client_id, manager_id } = req.query;
    let where = [];
    let params = [];

    if (status) { where.push('p.status = ?'); params.push(status); }
    if (client_id) { where.push('p.client_id = ?'); params.push(client_id); }
    if (manager_id) { where.push('p.project_manager_id = ?'); params.push(manager_id); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await pool.query(`
      SELECT p.*, c.name AS client_name, m.name AS manager_name,
             COUNT(DISTINCT pa.id) AS total_assigned
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN managers m ON m.id = p.project_manager_id
      LEFT JOIN project_assignments pa ON pa.project_id = p.id AND pa.unassigned_on IS NULL
      ${whereClause}
      GROUP BY p.id, c.name, m.name
      ORDER BY p.start_date DESC
    `, params);

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET project by ID with full details
router.get('/:id', requirePermission('view_projects'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, c.name AS client_name, m.name AS manager_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN managers m ON m.id = p.project_manager_id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'Project not found' });
    const project = rows[0];

    // Requirements vs assigned per category
    const [requirements] = await pool.query(`
      SELECT rc.id AS category_id, rc.name AS category,
             COALESCE(pr.quantity_required, 0) AS required,
             COUNT(pa.id) AS assigned,
             COALESCE(pr.quantity_required, 0) - COUNT(pa.id) AS gap
      FROM resource_categories rc
      LEFT JOIN project_requirements pr ON pr.category_id = rc.id AND pr.project_id = ?
      LEFT JOIN project_assignments pa ON pa.project_id = ? 
             AND pa.unassigned_on IS NULL
             AND pa.resource_id IN (
               SELECT id FROM resources WHERE category_id = rc.id
             )
      WHERE pr.project_id IS NOT NULL
      GROUP BY rc.id, rc.name, pr.quantity_required
      ORDER BY rc.name
    `, [req.params.id, req.params.id]);

    // Currently assigned resources
    const [assigned] = await pool.query(`
      SELECT r.id, r.staff_id, r.name, r.contact_info, r.skills, rc.name AS category,
             m.name AS manager_name, pa.id AS assignment_id, pa.assigned_on, pa.notes
      FROM project_assignments pa
      JOIN resources r ON r.id = pa.resource_id
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN managers m ON m.id = r.reporting_manager_id
      WHERE pa.project_id = ? AND pa.unassigned_on IS NULL
      ORDER BY rc.name, r.name
    `, [req.params.id]);

    // All project staff (all personnel ever deployed on this project)
    const [allStaff] = await pool.query(`
      SELECT pa.*, r.staff_id, r.name AS resource_name, r.name, r.contact_info, r.skills,
             rc.name AS category, m.name AS assigned_by_name
      FROM project_assignments pa
      JOIN resources r ON r.id = pa.resource_id
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN managers m ON m.id = pa.assigned_by
      WHERE pa.project_id = ?
      ORDER BY pa.assigned_on DESC
    `, [req.params.id]);

    res.json({
      success: true,
      data: {
        ...project,
        requirements,
        assigned_resources: assigned,
        assigned: assigned,
        total_assigned: assigned.length,
        assignment_history: allStaff,
        all_project_staff: allStaff,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create project
router.post('/', requirePermission('edit_projects'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      name, client_id, location, start_date, end_date, start_time, end_time,
      deadline, status, project_manager_id, notes, requirements,
      poc_name, poc_phone, poc_email
    } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Project name is required' });

    let totalRequired = 0;
    if (requirements && Array.isArray(requirements)) {
      totalRequired = requirements.reduce((acc, r) => acc + (parseInt(r.quantity_required, 10) || 0), 0);
    }

    const [result] = await conn.query(
      `INSERT INTO projects (
        name, client_id, location, start_date, end_date, start_time, end_time,
        deadline, status, project_manager_id, required_manpower, notes,
        poc_name, poc_phone, poc_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(), client_id || null, location ? location.trim() : null,
        start_date || null, end_date || null, start_time || null, end_time || null,
        deadline || null, status || 'planned', project_manager_id || null,
        totalRequired || null, notes ? notes.trim() : null,
        poc_name ? poc_name.trim() : null, poc_phone ? poc_phone.trim() : null, poc_email ? poc_email.trim() : null
      ]
    );

    const projectId = result.insertId;

    // Insert requirements if provided
    if (requirements && Array.isArray(requirements)) {
      for (const req_item of requirements) {
        if (req_item.category_id && parseInt(req_item.quantity_required, 10) > 0) {
          const qty = parseInt(req_item.quantity_required, 10);
          await conn.query(
            `INSERT INTO project_requirements (project_id, category_id, quantity_required) 
             VALUES (?, ?, ?)
             ON CONFLICT (project_id, category_id) DO UPDATE SET quantity_required = EXCLUDED.quantity_required`,
            [projectId, req_item.category_id, qty]
          );
        }
      }
    }

    await conn.commit();
    const [row] = await pool.query(`
      SELECT p.*, c.name AS client_name, m.name AS manager_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN managers m ON m.id = p.project_manager_id
      WHERE p.id = ?
    `, [projectId]);
    res.status(201).json({ success: true, data: row[0] });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// PUT update project
router.put('/:id', requirePermission('edit_projects'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      name, client_id, location, start_date, end_date, start_time, end_time,
      deadline, status, project_manager_id, notes, requirements,
      poc_name, poc_phone, poc_email
    } = req.body;

    let totalRequired = 0;
    if (requirements && Array.isArray(requirements)) {
      totalRequired = requirements.reduce((acc, r) => acc + (parseInt(r.quantity_required, 10) || 0), 0);
    }

    await conn.query(
      `UPDATE projects SET 
        name = COALESCE(?, name),
        client_id = ?,
        location = ?,
        start_date = ?,
        end_date = ?,
        start_time = ?,
        end_time = ?,
        deadline = ?,
        status = COALESCE(?, status),
        project_manager_id = ?,
        required_manpower = COALESCE(?, required_manpower),
        notes = ?,
        poc_name = ?,
        poc_phone = ?,
        poc_email = ?
       WHERE id = ?`,
      [
        name ? name.trim() : null, client_id || null, location ? location.trim() : null,
        start_date || null, end_date || null, start_time || null, end_time || null,
        deadline || null, status || null, project_manager_id || null,
        totalRequired || null, notes ? notes.trim() : null,
        poc_name ? poc_name.trim() : null, poc_phone ? poc_phone.trim() : null, poc_email ? poc_email.trim() : null,
        req.params.id
      ]
    );

    // Sync requirements if provided
    if (requirements && Array.isArray(requirements)) {
      for (const req_item of requirements) {
        if (req_item.category_id) {
          const qty = parseInt(req_item.quantity_required, 10) || 0;
          await conn.query(
            `INSERT INTO project_requirements (project_id, category_id, quantity_required) 
             VALUES (?, ?, ?)
             ON CONFLICT (project_id, category_id) DO UPDATE SET quantity_required = EXCLUDED.quantity_required`,
            [req.params.id, req_item.category_id, qty]
          );
        }
      }
    }

    // If project is being completed (or cancelled), release all currently active staff back to available
    if (status === 'completed' || status === 'cancelled') {
      const [activeAssignments] = await conn.query(
        `SELECT id, resource_id FROM project_assignments WHERE project_id = ? AND unassigned_on IS NULL`,
        [req.params.id]
      );

      if (activeAssignments.length > 0) {
        const resourceIds = activeAssignments.map(a => a.resource_id);

        // 1. Mark assignments as unassigned with timestamp, keeping historical record intact
        await conn.query(
          `UPDATE project_assignments 
           SET unassigned_on = CURRENT_TIMESTAMP, 
               notes = CONCAT(COALESCE(notes, ''), ' [Auto-released on project completion]')
           WHERE project_id = ? AND unassigned_on IS NULL`,
          [req.params.id]
        );

        // 2. Set resources status to available and clear current_project_id
        await conn.query(
          `UPDATE resources 
           SET status = 'available', current_project_id = NULL 
           WHERE id IN (?) AND status = 'assigned'`,
          [resourceIds]
        );

        // 3. Log to availability log for auditing
        for (const resId of resourceIds) {
          await conn.query(
            `INSERT INTO availability_log (resource_id, old_status, new_status, notes)
             VALUES (?, 'assigned', 'available', 'Auto-released: Project marked as completed')`,
            [resId]
          );
        }
      }
    }

    // Update requirements
    if (requirements && Array.isArray(requirements)) {
      await conn.query(`DELETE FROM project_requirements WHERE project_id = ?`, [req.params.id]);
      for (const req_item of requirements) {
        if (req_item.category_id && req_item.quantity_required) {
          await conn.query(
            `INSERT INTO project_requirements (project_id, category_id, quantity_required) VALUES (?, ?, ?)`,
            [req.params.id, req_item.category_id, req_item.quantity_required]
          );
        }
      }
    }

    await conn.commit();
    const [row] = await pool.query(`
      SELECT p.*, c.name AS client_name, m.name AS manager_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN managers m ON m.id = p.project_manager_id
      WHERE p.id = ?
    `, [req.params.id]);
    res.json({ success: true, data: row[0] });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE project
router.delete('/:id', requirePermission('edit_projects'), async (req, res) => {
  try {
    const [active] = await pool.query(
      `SELECT id FROM project_assignments WHERE project_id = ? AND unassigned_on IS NULL`, [req.params.id]
    );
    if (active.length) {
      return res.status(409).json({ success: false, error: 'Cannot delete project with active assignments. Unassign all resources first.' });
    }
    await pool.query(`DELETE FROM projects WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET project requirements only
router.get('/:id/requirements', requirePermission('view_projects'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT pr.*, rc.name AS category_name
      FROM project_requirements pr
      JOIN resource_categories rc ON rc.id = pr.category_id
      WHERE pr.project_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update single requirement
router.put('/:id/requirements/:cat_id', requirePermission('edit_projects'), async (req, res) => {
  try {
    const { quantity_required } = req.body;
    await pool.query(
      `INSERT INTO project_requirements (project_id, category_id, quantity_required) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity_required = ?`,
      [req.params.id, req.params.cat_id, quantity_required, quantity_required]
    );
    res.json({ success: true, message: 'Requirement updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
