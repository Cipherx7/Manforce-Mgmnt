const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requirePermission } = require('../middleware/auth');

// GET assignments with optional filters
router.get('/', requirePermission('view_assignments'), async (req, res) => {
  try {
    const { project_id, resource_id, active_only } = req.query;
    let where = [];
    let params = [];

    if (project_id) { where.push('pa.project_id = ?'); params.push(project_id); }
    if (resource_id) { where.push('pa.resource_id = ?'); params.push(resource_id); }
    if (active_only === 'true') { where.push('pa.unassigned_on IS NULL'); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await pool.query(`
      SELECT pa.*, 
             r.staff_id, r.name AS resource_name, r.status AS resource_status,
             rc.name AS category,
             p.name AS project_name, p.location, p.status AS project_status,
             m.name AS assigned_by_name
      FROM project_assignments pa
      JOIN resources r ON r.id = pa.resource_id
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      JOIN projects p ON p.id = pa.project_id
      LEFT JOIN managers m ON m.id = pa.assigned_by
      ${whereClause}
      ORDER BY pa.assigned_on DESC
    `, params);

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST bulk assign multiple resources to a project
router.post('/bulk-assign', requirePermission('edit_assignments'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { project_id, resource_ids, assigned_by, notes } = req.body;
    const effectiveAssignedBy = req.user?.manager_id || assigned_by || null;
    if (!project_id || !Array.isArray(resource_ids) || !resource_ids.length) {
      return res.status(400).json({ success: false, error: 'project_id and resource_ids array are required' });
    }

    const [project] = await conn.query('SELECT id, name, status FROM projects WHERE id = ?', [project_id]);
    if (!project.length) return res.status(404).json({ success: false, error: 'Project not found' });
    if (['completed', 'cancelled'].includes(project[0].status)) {
      return res.status(409).json({ success: false, error: `Cannot assign to a ${project[0].status} project` });
    }

    await conn.beginTransaction();
    const assigned = [];
    const skipped = [];

    for (const rId of resource_ids) {
      const [resRows] = await conn.query('SELECT id, name, status, current_project_id FROM resources WHERE id = ?', [rId]);
      if (!resRows.length) {
        skipped.push({ id: rId, reason: 'Not found' });
        continue;
      }
      const r = resRows[0];
      if (r.status === 'on_leave' || r.status === 'unavailable') {
        skipped.push({ id: rId, name: r.name, reason: `Status is ${r.status}` });
        continue;
      }

      // Check if already on this exact project
      if (r.current_project_id === Number(project_id)) {
        skipped.push({ id: rId, name: r.name, reason: 'Already deployed to this project' });
        continue;
      }

      // If active on another project, close old assignment (atomic transfer)
      if (r.current_project_id) {
        await conn.query(
          `UPDATE project_assignments SET unassigned_on = NOW() WHERE resource_id = ? AND unassigned_on IS NULL`,
          [rId]
        );
      }

      // Create new assignment
      await conn.query(
        `INSERT INTO project_assignments (project_id, resource_id, assigned_by, notes) VALUES (?, ?, ?, ?)`,
        [project_id, rId, effectiveAssignedBy, notes || `Bulk deployed to ${project[0].name}`]
      );

      // Update resource status
      const oldStatus = r.status;
      await conn.query(
        `UPDATE resources SET status = 'deployed', current_project_id = ? WHERE id = ?`,
        [project_id, rId]
      );

      // Log availability
      await conn.query(
        `INSERT INTO availability_log (resource_id, old_status, new_status, changed_by, notes) VALUES (?, ?, 'deployed', ?, ?)`,
        [rId, oldStatus, effectiveAssignedBy, notes || `Bulk deployed to ${project[0].name}`]
      );

      assigned.push({ id: rId, name: r.name });
    }

    await conn.commit();
    res.json({
      success: true,
      message: `Successfully deployed ${assigned.length} personnel to ${project[0].name}`,
      assigned_count: assigned.length,
      skipped_count: skipped.length,
      assigned,
      skipped
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// POST assign resource to project (with double-booking prevention)
router.post('/assign', requirePermission('edit_assignments'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { project_id, resource_id, assigned_by, notes } = req.body;
    if (!project_id || !resource_id) {
      return res.status(400).json({ success: false, error: 'project_id and resource_id are required' });
    }

    // Verify resource exists and check current status
    const [resource] = await conn.query(
      `SELECT id, name, status, current_project_id FROM resources WHERE id = ?`, [resource_id]
    );
    if (!resource.length) return res.status(404).json({ success: false, error: 'Resource not found' });

    const r = resource[0];

    // Check if resource is on leave or unavailable
    if (r.status === 'on_leave' || r.status === 'unavailable') {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        error: `Resource is currently ${r.status} and cannot be assigned`,
        resource: r
      });
    }

    // DOUBLE-BOOKING PREVENTION: Check active assignments
    const [activeAssignment] = await conn.query(
      `SELECT pa.id, p.name AS project_name
       FROM project_assignments pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.resource_id = ? AND pa.unassigned_on IS NULL`,
      [resource_id]
    );

    if (activeAssignment.length || r.current_project_id) {
      const activeProj = activeAssignment[0]?.project_name || 'another active project';
      await conn.rollback();
      return res.status(409).json({
        success: false,
        error: `Double-booking prevented: ${r.name} is already assigned to "${activeProj}". Unassign or release first.`,
        active_assignment: activeAssignment[0] || null
      });
    }

    // Verify project exists and is not completed/cancelled
    const [project] = await conn.query(`SELECT id, name, status FROM projects WHERE id = ?`, [project_id]);
    if (!project.length) return res.status(404).json({ success: false, error: 'Project not found' });
    if (['completed', 'cancelled'].includes(project[0].status)) {
      await conn.rollback();
      return res.status(409).json({ success: false, error: `Cannot assign to a ${project[0].status} project` });
    }

    // Create assignment record
    const [result] = await conn.query(
      `INSERT INTO project_assignments (project_id, resource_id, assigned_by, notes) VALUES (?, ?, ?, ?)`,
      [project_id, resource_id, assigned_by || null, notes || null]
    );

    // Update resource status to deployed
    const oldStatus = r.status;
    await conn.query(
      `UPDATE resources SET status='deployed', current_project_id=? WHERE id=?`,
      [project_id, resource_id]
    );

    // Log the status change
    await conn.query(
      `INSERT INTO availability_log (resource_id, old_status, new_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)`,
      [resource_id, oldStatus, 'deployed', assigned_by || null, `Assigned to project: ${project[0].name}`]
    );

    await conn.commit();

    const [assignment] = await pool.query(`
      SELECT pa.*, r.name AS resource_name, p.name AS project_name
      FROM project_assignments pa
      JOIN resources r ON r.id = pa.resource_id
      JOIN projects p ON p.id = pa.project_id
      WHERE pa.id = ?
    `, [result.insertId]);

    res.status(201).json({
      success: true,
      message: `${r.name} successfully assigned to ${project[0].name}`,
      data: assignment[0]
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// POST unassign resource from project
router.post('/unassign', requirePermission('edit_assignments'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { assignment_id, resource_id, project_id, unassigned_by, notes } = req.body;

    let assignmentQuery, assignmentParams;
    if (assignment_id) {
      assignmentQuery = `SELECT pa.*, r.name AS resource_name, p.name AS project_name
                         FROM project_assignments pa
                         JOIN resources r ON r.id = pa.resource_id
                         JOIN projects p ON p.id = pa.project_id
                         WHERE pa.id = ? AND pa.unassigned_on IS NULL`;
      assignmentParams = [assignment_id];
    } else if (resource_id && project_id) {
      assignmentQuery = `SELECT pa.*, r.name AS resource_name, p.name AS project_name
                         FROM project_assignments pa
                         JOIN resources r ON r.id = pa.resource_id
                         JOIN projects p ON p.id = pa.project_id
                         WHERE pa.resource_id = ? AND pa.project_id = ? AND pa.unassigned_on IS NULL`;
      assignmentParams = [resource_id, project_id];
    } else {
      return res.status(400).json({ success: false, error: 'Provide assignment_id OR both resource_id and project_id' });
    }

    const [assignments] = await conn.query(assignmentQuery, assignmentParams);
    if (!assignments.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'No active assignment found' });
    }

    const assignment = assignments[0];

    // Set unassigned_on
    await conn.query(
      `UPDATE project_assignments SET unassigned_on = NOW() WHERE id = ?`,
      [assignment.id]
    );

    // Update resource status to released, clear current_project_id
    await conn.query(
      `UPDATE resources SET status='released', current_project_id=NULL WHERE id=?`,
      [assignment.resource_id]
    );

    // Log the change
    await conn.query(
      `INSERT INTO availability_log (resource_id, old_status, new_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)`,
      [assignment.resource_id, 'deployed', 'released', unassigned_by || null,
       notes || `Unassigned from project: ${assignment.project_name}`]
    );

    await conn.commit();
    res.json({
      success: true,
      message: `${assignment.resource_name} released from ${assignment.project_name} to manpower pool`,
      data: { assignment_id: assignment.id, resource_id: assignment.resource_id }
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// POST reassign resource to another project atomically
router.post('/reassign', requirePermission('edit_assignments'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { resource_id, to_project_id, assigned_by, notes } = req.body;
    if (!resource_id || !to_project_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'resource_id and to_project_id are required' });
    }

    // Check resource
    const [resources] = await conn.query('SELECT * FROM resources WHERE id = ?', [resource_id]);
    if (!resources.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }
    const r = resources[0];

    // Check target project
    const [projects] = await conn.query('SELECT * FROM projects WHERE id = ?', [to_project_id]);
    if (!projects.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Target project not found' });
    }
    const p = projects[0];
    if (['completed', 'cancelled'].includes(p.status)) {
      await conn.rollback();
      return res.status(409).json({ success: false, error: `Cannot reassign to a ${p.status} project` });
    }

    // Find and close any active assignment
    const [active] = await conn.query(
      `SELECT pa.id, p.name AS project_name 
       FROM project_assignments pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.resource_id = ? AND pa.unassigned_on IS NULL`,
      [resource_id]
    );

    let oldProjectName = 'Unassigned';
    if (active.length) {
      oldProjectName = active[0].project_name;
      await conn.query('UPDATE project_assignments SET unassigned_on = NOW() WHERE id = ?', [active[0].id]);
    }

    // Create new assignment
    const [result] = await conn.query(
      'INSERT INTO project_assignments (project_id, resource_id, assigned_by, notes) VALUES (?, ?, ?, ?)',
      [to_project_id, resource_id, assigned_by || null, notes || `Reassigned from ${oldProjectName}`]
    );

    // Update resource
    await conn.query(
      `UPDATE resources SET status = 'deployed', current_project_id = ? WHERE id = ?`,
      [to_project_id, resource_id]
    );

    // Log status change
    await conn.query(
      `INSERT INTO availability_log (resource_id, old_status, new_status, changed_by, notes) VALUES (?, ?, 'deployed', ?, ?)`,
      [resource_id, r.status, assigned_by || null, notes || `Reassigned from ${oldProjectName} to ${p.name}`]
    );

    await conn.commit();
    res.json({
      success: true,
      message: `${r.name} successfully reassigned to ${p.name}`,
      data: { assignment_id: result.insertId, resource_id, project_id: to_project_id }
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// POST release (fast 1-click unassign by resource_id)
router.post('/release', requirePermission('edit_assignments'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { resource_id, unassigned_by, notes } = req.body;
    if (!resource_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'resource_id is required' });
    }

    const [active] = await conn.query(
      `SELECT pa.id, r.name AS resource_name, p.name AS project_name
       FROM project_assignments pa
       JOIN resources r ON r.id = pa.resource_id
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.resource_id = ? AND pa.unassigned_on IS NULL`,
      [resource_id]
    );

    if (!active.length) {
      // If resource is not in active assignment but marked as assigned, reset status
      await conn.query(`UPDATE resources SET status = 'available', current_project_id = NULL WHERE id = ?`, [resource_id]);
      await conn.commit();
      return res.json({ success: true, message: 'Resource status reset to available' });
    }

    const assignment = active[0];

    await conn.query(`UPDATE project_assignments SET unassigned_on = NOW() WHERE id = ?`, [assignment.id]);
    await conn.query(`UPDATE resources SET status = 'released', current_project_id = NULL WHERE id = ?`, [resource_id]);
    await conn.query(
      `INSERT INTO availability_log (resource_id, old_status, new_status, changed_by, notes) VALUES (?, 'deployed', 'released', ?, ?)`,
      [resource_id, unassigned_by || null, notes || `Released from ${assignment.project_name}`]
    );

    await conn.commit();
    res.json({
      success: true,
      message: `${assignment.resource_name} released from ${assignment.project_name} and returned to manpower pool`,
      data: { resource_id }
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// GET single assignment
router.get('/:id', requirePermission('view_assignments'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT pa.*, r.name AS resource_name, rc.name AS category,
             p.name AS project_name, m.name AS assigned_by_name
      FROM project_assignments pa
      JOIN resources r ON r.id = pa.resource_id
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      JOIN projects p ON p.id = pa.project_id
      LEFT JOIN managers m ON m.id = pa.assigned_by
      WHERE pa.id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Assignment not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
