// middleware/auth.js — JWT Authentication & Role-Based Access Control
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const SECRET = process.env.JWT_SECRET || 'dv-events-secret';

/**
 * Attach the decoded user to req.user with fresh live permissions from the database.
 * Public routes (login page, static assets) bypass this.
 */
async function authenticate(req, res, next) {
  // Pull token from Authorization header OR cookie
  const auth = req.headers['authorization'];
  const token = auth && auth.startsWith('Bearer ')
    ? auth.slice(7)
    : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    // Fetch fresh live user record to enforce permissions and account status in real-time
    const [rows] = await pool.query(
      `SELECT id, name, email, role, manager_id, permissions, is_active FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, error: 'Account is deactivated or does not exist. Please log in again.' });
    }

    const liveUser = rows[0];
    let perms = {};
    try {
      perms = typeof liveUser.permissions === 'string'
        ? JSON.parse(liveUser.permissions)
        : (liveUser.permissions || {});
    } catch {}

    req.user = {
      id: liveUser.id,
      name: liveUser.name,
      email: liveUser.email,
      role: liveUser.role,
      manager_id: liveUser.manager_id || null,
      permissions: perms,
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in again.' });
  }
}

/**
 * Guard: only super_admin may proceed.
 */
function requireSuperAdmin(req, res, next) {
  if (!['super_admin', 'lead'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Lead access required.' });
  }
  next();
}

function requireLead(req, res, next) {
  if (!['super_admin', 'lead'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Lead access required.' });
  }
  next();
}

/**
 * Guard: super_admin OR manager may proceed.
 */
function requireManager(req, res, next) {
  const allowed = ['super_admin', 'manager'];
  if (!allowed.includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Manager access required.' });
  }
  next();
}

/**
 * Guard: Check if the user has a specific granular permission.
 * Super Admin always has full bypass authority.
 */
function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
    }
    // Lead (and legacy super_admin) has full authority
    if (['super_admin', 'lead'].includes(req.user.role)) {
      return next();
    }
    const perms = req.user.permissions || {};
    if (perms[perm] === true) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: `Access denied. You do not have permission ('${perm}') to perform this action.`
    });
  };
}

/**
 * Sign a new JWT for a user object.
 */
function signToken(user) {
  let perms = {};
  try {
    perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {});
  } catch {}
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      manager_id: user.manager_id || null,
      permissions: perms,
    },
    SECRET,
    { expiresIn: '12h' }
  );
}

// isLead: true if role is lead or the legacy super_admin
function isLead(user) {
  return ['super_admin', 'lead'].includes(user?.role);
}

module.exports = { authenticate, requireSuperAdmin, requireLead, requireManager, requirePermission, signToken, isLead };
