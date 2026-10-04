const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requirePermission, isLead } = require('../middleware/auth');

// Helper: Query active/planned projects with full staffing requirements, current headcount, and role deficits
async function getProjectsWithDeficits() {
  const [activeProjects] = await pool.query(`
    SELECT 
      p.id, 
      p.name AS project, 
      p.status, 
      p.location, 
      p.start_date, 
      p.end_date,
      p.deadline,
      c.name AS client,
      m.name AS manager,
      COALESCE(p.required_manpower, (SELECT COALESCE(SUM(pr.quantity_required), 0) FROM project_requirements pr WHERE pr.project_id = p.id), 0)::int AS total_required,
      (SELECT COUNT(*)::int FROM project_assignments pa WHERE pa.project_id = p.id AND pa.unassigned_on IS NULL) AS assigned_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN managers m ON m.id = p.project_manager_id
    WHERE p.status IN ('planned', 'active')
    ORDER BY p.start_date ASC NULLS LAST, p.id DESC
  `);

  const [categoryReqs] = await pool.query(`
    SELECT 
      pr.project_id,
      rc.id AS category_id,
      rc.name AS category,
      pr.quantity_required::int,
      (
        SELECT COUNT(*)::int 
        FROM project_assignments pa 
        JOIN resources r ON r.id = pa.resource_id 
        WHERE pa.project_id = pr.project_id 
          AND pa.unassigned_on IS NULL 
          AND r.category_id = pr.category_id
      ) AS assigned
    FROM project_requirements pr
    JOIN projects p ON p.id = pr.project_id AND p.status IN ('planned', 'active')
    JOIN resource_categories rc ON rc.id = pr.category_id
    ORDER BY pr.project_id, rc.name
  `);

  const projectGapsMap = {};
  const unfilledGaps = [];
  for (const r of categoryReqs) {
    const gap = r.quantity_required - r.assigned;
    if (gap > 0) {
      if (!projectGapsMap[r.project_id]) projectGapsMap[r.project_id] = [];
      projectGapsMap[r.project_id].push({
        category_id: r.category_id,
        category: r.category,
        required: r.quantity_required,
        assigned: r.assigned,
        gap
      });
      const prj = activeProjects.find(p => String(p.id) === String(r.project_id));
      unfilledGaps.push({
        project_id: r.project_id,
        project: prj ? prj.project : 'Project #' + r.project_id,
        category_id: r.category_id,
        category: r.category,
        quantity_required: r.quantity_required,
        assigned: r.assigned,
        gap
      });
    }
  }

  const projectsWithDeficit = activeProjects.map(p => {
    const category_gaps = projectGapsMap[p.id] || [];
    const deficit = Math.max(0, (p.total_required || 0) - (p.assigned_count || 0));
    return {
      ...p,
      deficit,
      category_gaps
    };
  });

  return { projectsWithDeficit, unfilledGaps };
}

// GET dashboard — Lead gets org-wide, Manager gets own-scoped
router.get('/', requirePermission('view_dashboard'), async (req, res) => {
  try {
    if (!isLead(req.user)) {
      // ── Manager dashboard ─────────────────────────────────────
      const mid = req.user.manager_id;

      const [totals] = await pool.query(`
        SELECT COUNT(*) AS total_resources,
          SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
          SUM(CASE WHEN status IN ('assigned','deployed','confirmed') THEN 1 ELSE 0 END) AS deployed,
          SUM(CASE WHEN status IN ('nominated','pending_approval') THEN 1 ELSE 0 END) AS nominated,
          SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END) AS on_leave
        FROM resources WHERE reporting_manager_id = ?`, [mid]);

      const { projectsWithDeficit, unfilledGaps } = await getProjectsWithDeficits();

      const [myNominations] = await pool.query(`
        SELECT n.id, n.status, n.created_at, r.name AS resource_name, p.name AS project_name
        FROM nominations n
        JOIN resources r ON r.id = n.resource_id
        JOIN projects p ON p.id = n.project_id
        WHERE n.manager_id = ?
        ORDER BY n.created_at DESC LIMIT 20`, [mid]);

      const [pendingPayments] = await pool.query(`
        SELECT COUNT(*) AS pending_count,
               SUM(COALESCE(final_amount, calculated_amount, 0)) AS pending_amount
        FROM payments pay
        JOIN resources r ON r.id = pay.resource_id
        WHERE r.reporting_manager_id = ? AND pay.payment_status = 'pending'`, [mid]);

      const [projectStats] = await pool.query(`
        SELECT COUNT(*) AS total_projects,
          SUM(CASE WHEN status='active'    THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status='planned'   THEN 1 ELSE 0 END) AS planned,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
        FROM projects
      `);

      const [byCategory] = await pool.query(`
        SELECT rc.id, rc.name AS category,
               COUNT(r.id) AS total,
               SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
               SUM(CASE WHEN r.status IN ('assigned','deployed','confirmed') THEN 1 ELSE 0 END) AS assigned
        FROM resource_categories rc
        LEFT JOIN resources r ON r.category_id = rc.id AND r.reporting_manager_id = ?
        GROUP BY rc.id, rc.name ORDER BY total DESC
      `, [mid]);

      return res.json({
        success: true,
        role: 'manager',
        data: {
          overview: totals[0],
          project_stats: projectStats[0],
          by_category: byCategory,
          by_project: projectsWithDeficit,
          my_projects: projectsWithDeficit,
          my_nominations: myNominations,
          pending_payments: pendingPayments[0],
          unfilled_gaps: unfilledGaps,
          recent_activity: [],
          generated_at: new Date().toISOString()
        }
      });
    }

    // ── Lead / org-wide dashboard ────────────────────────────────
    const [totals] = await pool.query(`
      SELECT
        COUNT(*) AS total_resources,
        SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN status IN ('assigned','deployed','confirmed') THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END) AS on_leave,
        SUM(CASE WHEN status='unavailable' THEN 1 ELSE 0 END) AS unavailable
      FROM resources
    `);

    const [byCategory] = await pool.query(`
      SELECT rc.id, rc.name AS category,
             COUNT(r.id) AS total,
             SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
             SUM(CASE WHEN r.status IN ('assigned','deployed','confirmed') THEN 1 ELSE 0 END) AS assigned
      FROM resource_categories rc
      LEFT JOIN resources r ON r.category_id = rc.id
      GROUP BY rc.id, rc.name ORDER BY total DESC
    `);

    const { projectsWithDeficit, unfilledGaps } = await getProjectsWithDeficits();

    const [byManager] = await pool.query(`
      SELECT m.id, m.name AS manager, m.role,
             COUNT(r.id) AS total_resources,
             SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
             SUM(CASE WHEN r.status IN ('assigned','deployed','confirmed') THEN 1 ELSE 0 END) AS assigned
      FROM managers m
      LEFT JOIN resources r ON r.reporting_manager_id = m.id
      GROUP BY m.id, m.name, m.role ORDER BY total_resources DESC
    `);

    const [projectStats] = await pool.query(`
      SELECT COUNT(*) AS total_projects,
        SUM(CASE WHEN status='active'    THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status='planned'   THEN 1 ELSE 0 END) AS planned,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM projects
    `);

    const [pendingNominations] = await pool.query(`
      SELECT COUNT(*) AS count FROM nominations WHERE status IN ('nominated','pending_approval')
    `);

    const [pendingPayments] = await pool.query(`
      SELECT COUNT(*) AS count, SUM(COALESCE(final_amount, calculated_amount, 0)) AS amount
      FROM payments WHERE payment_status = 'pending'
    `);

    const [recentActivity] = await pool.query(`
      SELECT al.changed_at, al.old_status, al.new_status, al.notes,
             r.name AS resource_name, m.name AS changed_by
      FROM availability_log al
      JOIN resources r ON r.id = al.resource_id
      LEFT JOIN managers m ON m.id = al.changed_by
      ORDER BY al.changed_at DESC LIMIT 10
    `);

    res.json({
      success: true,
      role: 'lead',
      data: {
        overview: totals[0],
        project_stats: projectStats[0],
        pending_nominations: pendingNominations[0].count,
        pending_payments: pendingPayments[0],
        by_category: byCategory,
        by_project: projectsWithDeficit,
        by_manager: byManager,
        unfilled_gaps: unfilledGaps,
        recent_activity: recentActivity,
        generated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET categories list
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM resource_categories ORDER BY name`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add category
router.post('/categories', requirePermission('edit_resources'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Category name required' });
    const [result] = await pool.query(`INSERT INTO resource_categories (name) VALUES (?)`, [name]);
    const [row] = await pool.query(`SELECT * FROM resource_categories WHERE id = ?`, [result.insertId]);
    res.status(201).json({ success: true, data: row[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Category already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET operations reports and analytics
router.get('/reports', requirePermission('view_reports'), async (req, res) => {
  try {
    const [totals] = await pool.query(`
      SELECT 
        COUNT(*) AS total_resources,
        SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN status='assigned' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END) AS on_leave,
        SUM(CASE WHEN status='unavailable' THEN 1 ELSE 0 END) AS unavailable
      FROM resources
    `);

    const [categoryUtil] = await pool.query(`
      SELECT rc.name AS category,
             COUNT(r.id) AS total,
             SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) AS assigned,
             SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
             ROUND((SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0)) * 100, 1) AS utilization_pct
      FROM resource_categories rc
      LEFT JOIN resources r ON r.category_id = rc.id
      GROUP BY rc.id, rc.name
      HAVING COUNT(r.id) > 0
      ORDER BY utilization_pct DESC, total DESC
    `);

    const [clientBreakdown] = await pool.query(`
      SELECT c.id, c.name AS client_name,
             COUNT(DISTINCT p.id) AS total_projects,
             SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active_projects,
             COUNT(DISTINCT pa.id) AS current_deployed_staff
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id
      LEFT JOIN project_assignments pa ON pa.project_id = p.id AND pa.unassigned_on IS NULL
      GROUP BY c.id, c.name
      ORDER BY current_deployed_staff DESC
    `);

    const [managerLoad] = await pool.query(`
      SELECT m.id, m.name AS manager_name, m.role,
             COUNT(r.id) AS team_size,
             SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) AS assigned,
             SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
             ROUND((SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0)) * 100, 1) AS load_pct
      FROM managers m
      LEFT JOIN resources r ON r.reporting_manager_id = m.id
      GROUP BY m.id, m.name, m.role
      ORDER BY load_pct DESC
    `);

    const [gaps] = await pool.query(`
      SELECT p.name AS project, rc.name AS category,
             pr.quantity_required,
             COUNT(pa.id) AS assigned,
             pr.quantity_required - COUNT(pa.id) AS gap
      FROM project_requirements pr
      JOIN projects p ON p.id = pr.project_id AND p.status IN ('planned','active')
      JOIN resource_categories rc ON rc.id = pr.category_id
      LEFT JOIN project_assignments pa ON pa.project_id = pr.project_id 
              AND pa.unassigned_on IS NULL
              AND pa.resource_id IN (SELECT id FROM resources WHERE category_id = pr.category_id)
      GROUP BY pr.id, p.name, rc.name, pr.quantity_required
      HAVING (pr.quantity_required - COUNT(pa.id)) > 0
      ORDER BY gap DESC
    `);

    const total = totals[0].total_resources || 0;
    const assigned = parseInt(totals[0].assigned, 10) || 0;
    const available = parseInt(totals[0].available, 10) || 0;
    const utilizationRate = total > 0 ? Math.round((assigned / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        summary: {
          total_resources: total,
          assigned,
          available,
          on_leave: parseInt(totals[0].on_leave, 10) || 0,
          unavailable: parseInt(totals[0].unavailable, 10) || 0,
          utilization_rate: utilizationRate,
          total_gaps: gaps.reduce((acc, g) => acc + (g.gap || 0), 0)
        },
        category_utilization: categoryUtil,
        client_breakdown: clientBreakdown,
        manager_load: managerLoad,
        staffing_gaps: gaps,
        generated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
