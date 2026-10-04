// routes/attendance.js — Attendance with GPS verification
// Resource submits: photo path + GPS coords
// Backend calculates distance from project geofence and sets status
const router = require('express').Router();
const { pool } = require('../db');
const { isLead } = require('../middleware/auth');

// Haversine distance in metres between two lat/lng points
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// GET /api/attendance?project_id=&status=
router.get('/', async (req, res) => {
  try {
    const { project_id, status, resource_id } = req.query;
    const where = [];
    const params = [];

    if (project_id)  { where.push('a.project_id = ?');  params.push(project_id); }
    if (status)      { where.push('a.status = ?');       params.push(status); }
    if (resource_id) { where.push('a.resource_id = ?');  params.push(resource_id); }

    // Managers only see attendance for their own resources
    if (!isLead(req.user)) {
      where.push('r.reporting_manager_id = ?');
      params.push(req.user.manager_id);
    }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await pool.query(`
      SELECT a.*,
             r.name AS resource_name, r.staff_id,
             p.name AS project_name, p.location,
             p.geofence_lat, p.geofence_lng, p.geofence_radius_m
      FROM attendance a
      JOIN resources r ON r.id = a.resource_id
      JOIN projects  p ON p.id = a.project_id
      ${wc}
      ORDER BY a.submitted_at DESC
    `, params);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/attendance — resource submits attendance
// Body: { project_id, resource_id, gps_lat, gps_lng, photo_path }
router.post('/', async (req, res) => {
  const { project_id, resource_id, gps_lat, gps_lng, photo_path } = req.body;
  if (!project_id || !resource_id) {
    return res.status(400).json({ success: false, error: 'project_id and resource_id are required.' });
  }

  try {
    // Verify resource exists and is confirmed for this project
    const [nominations] = await pool.query(
      `SELECT n.id FROM nominations n
       WHERE n.project_id = ? AND n.resource_id = ? AND n.status = 'approved'
       LIMIT 1`,
      [project_id, resource_id]
    );
    // Also allow directly assigned resources (project_assignments with no nomination)
    const [assigned] = await pool.query(
      `SELECT id FROM project_assignments WHERE project_id = ? AND resource_id = ? AND unassigned_on IS NULL LIMIT 1`,
      [project_id, resource_id]
    );
    if (!nominations.length && !assigned.length) {
      return res.status(403).json({ success: false, error: 'Resource is not confirmed for this project.' });
    }

    // Fetch project geofence
    const [proj] = await pool.query(
      'SELECT geofence_lat, geofence_lng, geofence_radius_m FROM projects WHERE id = ?',
      [project_id]
    );
    const project = proj[0];

    let distance_m = null;
    let status = 'submitted';

    // Auto-verify if project has a geofence configured and GPS provided
    if (project && project.geofence_lat && project.geofence_lng && gps_lat && gps_lng) {
      distance_m = haversineMetres(
        parseFloat(gps_lat), parseFloat(gps_lng),
        parseFloat(project.geofence_lat), parseFloat(project.geofence_lng)
      );
      const radius = project.geofence_radius_m || 100;
      status = distance_m <= radius ? 'present' : 'manual_review';
    }

    // Upsert: allow re-submission (update if already exists)
    await pool.query(
      `INSERT INTO attendance (project_id, resource_id, photo_path, gps_lat, gps_lng, distance_m, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         photo_path   = VALUES(photo_path),
         gps_lat      = VALUES(gps_lat),
         gps_lng      = VALUES(gps_lng),
         distance_m   = VALUES(distance_m),
         status       = VALUES(status),
         submitted_at = CURRENT_TIMESTAMP`,
      [project_id, resource_id, photo_path || null, gps_lat || null, gps_lng || null, distance_m, status]
    );

    res.status(201).json({ success: true, data: { status, distance_m } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/attendance/:id — Lead manually verifies/updates status
router.put('/:id', async (req, res) => {
  if (!isLead(req.user)) {
    return res.status(403).json({ success: false, error: 'Only a Lead can manually verify attendance.' });
  }
  const { status, notes } = req.body;
  const valid = ['submitted', 'present', 'absent', 'manual_review'];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, error: `status must be one of: ${valid.join(', ')}` });
  }
  try {
    await pool.query(
      `UPDATE attendance SET status=?, notes=COALESCE(?, notes), verified_by=?, verified_at=? WHERE id=?`,
      [status, notes, req.user.id, new Date(), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/attendance/summary/:project_id — summary counts for a project
router.get('/summary/:project_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COUNT(*) AS total_submitted,
        COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0)       AS present,
        COALESCE(SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END), 0)        AS absent,
        COALESCE(SUM(CASE WHEN status = 'manual_review' THEN 1 ELSE 0 END), 0) AS manual_review,
        COALESCE(SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END), 0)     AS pending_verification
      FROM attendance WHERE project_id = ?
    `, [req.params.project_id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
