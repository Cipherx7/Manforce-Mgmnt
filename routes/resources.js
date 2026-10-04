const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requirePermission, isLead } = require('../middleware/auth');

function toIsoDate(d) {
  if (!d) return null;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }
  const s = String(d).trim();
  if (s.includes('T')) return s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
}

function convertGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com') || trimmed.includes('googleusercontent.com')) {
    const m1 = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1 && m1[1]) return `https://lh3.googleusercontent.com/d/${m1[1]}`;
    const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return `https://lh3.googleusercontent.com/d/${m2[1]}`;
    const m3 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m3 && m3[1]) return `https://lh3.googleusercontent.com/d/${m3[1]}`;
  }
  return trimmed;
}

// GET resources with filters
router.get('/', requirePermission('view_resources'), async (req, res) => {
  try {
    const { category_id, manager_id, status, search, skills, location, project_id, zone, availability, gender, min_age, max_age } = req.query;
    let where = [];
    let params = [];

    // Managers can only see their own resources — enforce at query level
    if (!isLead(req.user)) {
      where.push('r.reporting_manager_id = ?');
      params.push(req.user.manager_id);
    } else {
      if (manager_id) {
        const mList = Array.isArray(manager_id) ? manager_id : String(manager_id).split(',').map(s => s.trim()).filter(Boolean);
        if (mList.length === 1) {
          where.push('r.reporting_manager_id = ?');
          params.push(mList[0]);
        } else if (mList.length > 1) {
          where.push(`r.reporting_manager_id IN (${mList.map(() => '?').join(', ')})`);
          params.push(...mList);
        }
      }
    }

    if (category_id) {
      const cList = Array.isArray(category_id) ? category_id : String(category_id).split(',').map(s => s.trim()).filter(Boolean);
      if (cList.length === 1) {
        where.push('r.category_id = ?');
        params.push(cList[0]);
      } else if (cList.length > 1) {
        where.push(`r.category_id IN (${cList.map(() => '?').join(', ')})`);
        params.push(...cList);
      }
    }
    if (status) { where.push('r.status = ?'); params.push(status); }
    if (skills) { where.push('(r.skills ILIKE ? OR r.opted_roles ILIKE ?)'); params.push(`%${skills}%`, `%${skills}%`); }
    if (location) { where.push('(p.location ILIKE ? OR r.zone ILIKE ?)'); params.push(`%${location}%`, `%${location}%`); }
    if (zone) {
      const zList = Array.isArray(zone) ? zone : String(zone).split(',').map(s => s.trim()).filter(Boolean);
      if (zList.length === 1) {
        where.push('r.zone ILIKE ?');
        params.push(`%${zList[0]}%`);
      } else if (zList.length > 1) {
        where.push(`(${zList.map(() => 'r.zone ILIKE ?').join(' OR ')})`);
        params.push(...zList.map(z => `%${z}%`));
      }
    }
    if (availability) {
      const aList = Array.isArray(availability) ? availability : String(availability).split(',').map(s => s.trim()).filter(Boolean);
      if (aList.length === 1) {
        where.push('r.availability ILIKE ?');
        params.push(`%${aList[0]}%`);
      } else if (aList.length > 1) {
        where.push(`(${aList.map(() => 'r.availability ILIKE ?').join(' OR ')})`);
        params.push(...aList.map(a => `%${a}%`));
      }
    }
    if (gender) { where.push('LOWER(r.gender) = LOWER(?)'); params.push(gender); }
    if (min_age) { where.push('r.age >= ?'); params.push(Number(min_age)); }
    if (max_age) { where.push('r.age <= ?'); params.push(Number(max_age)); }
    if (project_id === 'none') {
      where.push('r.current_project_id IS NULL');
    } else if (project_id) {
      where.push('r.current_project_id = ?');
      params.push(project_id);
    }
    if (search) {
      where.push('(r.name ILIKE ? OR r.contact_info ILIKE ? OR r.alternate_phone ILIKE ? OR r.email ILIKE ? OR r.skills ILIKE ? OR r.opted_roles ILIKE ? OR r.zone ILIKE ? OR r.languages ILIKE ? OR r.experience ILIKE ? OR p.name ILIKE ? OR p.location ILIKE ?)');
      params.push(
        `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`,
        `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`,
        `%${search}%`, `%${search}%`, `%${search}%`
      );
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await pool.query(`
      SELECT r.*, rc.name AS category_name,
             m.name AS manager_name,
             p.name AS current_project_name,
             p.location AS current_project_location
      FROM resources r
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN managers m ON m.id = r.reporting_manager_id
      LEFT JOIN projects p ON p.id = r.current_project_id
      ${whereClause}
      ORDER BY r.name
    `, params);

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET availability summary by category
router.get('/availability', requirePermission('view_resources'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        rc.id AS category_id,
        rc.name AS category,
        COUNT(r.id) AS total,
        SUM(CASE WHEN r.status='available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN r.status='assigned' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN r.status='on_leave' THEN 1 ELSE 0 END) AS on_leave,
        SUM(CASE WHEN r.status='unavailable' THEN 1 ELSE 0 END) AS unavailable
      FROM resource_categories rc
      LEFT JOIN resources r ON r.category_id = rc.id
      GROUP BY rc.id, rc.name
      ORDER BY rc.name
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET resource by ID with full history
router.get('/:id', requirePermission('view_resources'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, rc.name AS category_name,
             m.name AS manager_name,
             p.name AS current_project_name
      FROM resources r
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN managers m ON m.id = r.reporting_manager_id
      LEFT JOIN projects p ON p.id = r.current_project_id
      WHERE r.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'Resource not found' });

    // Managers can only access their own resources
    if (!isLead(req.user) && rows[0].reporting_manager_id !== req.user.manager_id) {
      return res.status(403).json({ success: false, error: 'Access denied. This resource does not belong to you.' });
    }

    // Assignment history
    const [history] = await pool.query(`
      SELECT pa.*, p.name AS project_name, p.location,
             m.name AS assigned_by_name
      FROM project_assignments pa
      JOIN projects p ON p.id = pa.project_id
      LEFT JOIN managers m ON m.id = pa.assigned_by
      WHERE pa.resource_id = ?
      ORDER BY pa.assigned_on DESC
    `, [req.params.id]);

    // Availability log
    const [log] = await pool.query(`
      SELECT al.*, m.name AS changed_by_name
      FROM availability_log al
      LEFT JOIN managers m ON m.id = al.changed_by
      WHERE al.resource_id = ?
      ORDER BY al.changed_at DESC
      LIMIT 50
    `, [req.params.id]);

    // Payment and compensation history for this resource
    const [payments] = await pool.query(`
      SELECT pay.*, p.name AS project_name
      FROM payments pay
      JOIN projects p ON p.id = pay.project_id
      WHERE pay.resource_id = ?
      ORDER BY pay.created_at DESC
    `, [req.params.id]);

    res.json({ success: true, data: { ...rows[0], assignment_history: history, availability_log: log, payments } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST bulk import resources
router.post('/bulk', requirePermission('edit_resources'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { resources: items, default_manager_id, default_category_id, default_status } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No resources provided for import' });
    }

    // Pre-fetch categories for name/id matching
    const [allCategories] = await conn.query('SELECT id, LOWER(name) AS lname, name FROM resource_categories');
    const categoryMap = new Map();
    allCategories.forEach(c => {
      categoryMap.set(c.id, c.id);
      categoryMap.set(String(c.id), c.id);
      categoryMap.set(c.lname, c.id);
    });

    // Pre-fetch managers if lead
    const [allManagers] = await conn.query('SELECT id, LOWER(name) AS lname, name FROM managers');
    const managerMap = new Map();
    allManagers.forEach(m => {
      managerMap.set(m.id, m.id);
      managerMap.set(String(m.id), m.id);
      managerMap.set(m.lname, m.id);
    });

    const validStatuses = ['available', 'nominated', 'pending_approval', 'confirmed', 'deployed', 'released', 'assigned', 'on_leave', 'unavailable'];

    // Pre-fetch existing phones & emails for duplicate detection
    const [existingRows] = await conn.query(`SELECT RIGHT(REGEXP_REPLACE(contact_info, '[^0-9]', '', 'g'), 10) AS phone, LOWER(TRIM(email)) AS email FROM resources`);
    const registeredPhones = new Set(existingRows.map(r => r.phone).filter(p => p && p.length >= 7));
    const registeredEmails = new Set(existingRows.map(r => r.email).filter(Boolean));

    await conn.beginTransaction();

    const imported = [];
    const skipped = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawName = item.name ? String(item.name).trim() : '';
      if (!rawName) {
        skipped.push({ row: i + 1, reason: 'Missing name' });
        continue;
      }

      // Check duplicates
      const rawContact = item.contact_info ? String(item.contact_info).trim() : '';
      const phoneDigits = rawContact.replace(/[^0-9]/g, '').slice(-10);
      const rawEmail = item.email ? String(item.email).toLowerCase().trim() : '';

      if (phoneDigits && phoneDigits.length >= 7 && registeredPhones.has(phoneDigits)) {
        skipped.push({ row: i + 1, name: rawName, reason: `Duplicate phone number: ${rawContact}` });
        continue;
      }
      if (rawEmail && registeredEmails.has(rawEmail)) {
        skipped.push({ row: i + 1, name: rawName, reason: `Duplicate email address: ${rawEmail}` });
        continue;
      }

      if (phoneDigits && phoneDigits.length >= 7) registeredPhones.add(phoneDigits);
      if (rawEmail) registeredEmails.add(rawEmail);

      // Resolve manager
      let finalManagerId = null;
      if (!isLead(req.user)) {
        finalManagerId = req.user.manager_id;
      } else {
        const mgrRaw = String(item.reporting_manager_id || item.reporting_manager || '').trim().toLowerCase();
        if (mgrRaw) {
          if (managerMap.has(mgrRaw)) {
            finalManagerId = managerMap.get(mgrRaw);
          } else {
            for (const [mName, mId] of managerMap.entries()) {
              if (typeof mName === 'string' && mName.length > 2 && (mgrRaw.includes(mName) || mName.includes(mgrRaw))) {
                finalManagerId = mId;
                break;
              }
            }
          }
        }
        if (!finalManagerId && default_manager_id) {
          finalManagerId = managerMap.get(default_manager_id) ||
                           managerMap.get(String(default_manager_id).trim().toLowerCase()) ||
                           null;
        }
        if (!finalManagerId && req.user.manager_id) {
          finalManagerId = req.user.manager_id;
        }
      }

      // Resolve opted roles & category
      const rawRoles = item.opted_roles || item.category_name || item.category_id || '';
      const cleanOptedRoles = rawRoles ? String(rawRoles).trim() : null;
      let finalCategoryId = null;

      if (item.category_id && categoryMap.has(item.category_id)) {
        finalCategoryId = categoryMap.get(item.category_id);
      } else if (cleanOptedRoles) {
        const lowerRoles = cleanOptedRoles.toLowerCase();
        if (categoryMap.has(lowerRoles)) {
          finalCategoryId = categoryMap.get(lowerRoles);
        } else {
          for (const [cName, cId] of categoryMap.entries()) {
            if (typeof cName === 'string' && cName.length > 2 && lowerRoles.includes(cName)) {
              finalCategoryId = cId;
              break;
            }
          }
        }
      }
      if (!finalCategoryId && default_category_id) {
        finalCategoryId = categoryMap.get(default_category_id) ||
                          categoryMap.get(String(default_category_id).trim().toLowerCase()) ||
                          null;
      }

      // Age & DOB handling
      let cleanAge = null;
      if (item.age != null && item.age !== '') {
        const numAge = parseInt(String(item.age).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numAge) && numAge >= 14 && numAge <= 100) {
          cleanAge = numAge;
        }
      }
      let cleanDob = toIsoDate(item.dob);
      if (!cleanDob && cleanAge) {
        const birthYear = new Date().getFullYear() - cleanAge;
        cleanDob = `${birthYear}-01-01`;
      }

      // Gender normalization
      let cleanGender = null;
      if (item.gender) {
        const gStr = String(item.gender).trim().toLowerCase();
        if (gStr === 'male' || gStr === 'm' || gStr === 'man') cleanGender = 'male';
        else if (gStr === 'female' || gStr === 'f' || gStr === 'woman') cleanGender = 'female';
        else if (gStr === 'other' || gStr === 'o' || gStr === 'non-binary') cleanGender = 'other';
      }

      // Photo path and Google Drive URL conversion
      let cleanPhoto = item.photo_path ? convertGoogleDriveUrl(String(item.photo_path).trim()) : null;

      // Status
      let finalStatus = 'available';
      if (item.status && validStatuses.includes(String(item.status).trim().toLowerCase())) {
        finalStatus = String(item.status).trim().toLowerCase();
      } else if (default_status && validStatuses.includes(default_status)) {
        finalStatus = default_status;
      }

      // Rate handling
      let cleanRateType = 'per_day';
      if (item.rate_type && ['per_day', 'per_shift', 'per_hour', 'fixed'].includes(String(item.rate_type).toLowerCase())) {
        cleanRateType = String(item.rate_type).toLowerCase();
      }
      let cleanRateAmount = null;
      if (item.rate_amount != null && item.rate_amount !== '') {
        const numRate = parseFloat(String(item.rate_amount).replace(/[^0-9.]/g, ''));
        if (!isNaN(numRate)) cleanRateAmount = numRate;
      }

      // String and detail fields
      const cleanContact = item.contact_info ? String(item.contact_info).trim() : null;
      const cleanAltPhone = (item.alternate_phone || item.emergency_contact) ? String(item.alternate_phone || item.emergency_contact).trim() : null;
      const cleanEmail = item.email ? String(item.email).trim() : null;
      const cleanZone = (item.zone || item.address) ? String(item.zone || item.address).trim() : null;
      const cleanHeight = item.height ? String(item.height).trim() : null;
      const cleanLanguages = item.languages ? String(item.languages).trim() : null;
      const cleanAvailability = item.availability ? String(item.availability).trim() : null;
      const cleanExperience = item.experience ? String(item.experience).trim() : null;
      const cleanSkills = item.skills ? String(item.skills).trim() : cleanOptedRoles;
      const cleanIdType = item.id_type ? String(item.id_type).trim() : null;
      const cleanIdNum = item.id_number ? String(item.id_number).trim() : null;
      const cleanNotes = item.notes ? String(item.notes).trim() : null;
      const cleanBankDetails = item.bank_details ? String(item.bank_details).trim() : null;
      const cleanUpiId = item.upi_id ? String(item.upi_id).trim() : null;
      let finalStaffId = item.staff_id ? String(item.staff_id).trim().toUpperCase() : null;

      const [resResult] = await conn.query(
        `INSERT INTO resources 
         (staff_id, name, dob, gender, contact_info, email, address, photo_path, category_id, skills, id_type, id_number, status, reporting_manager_id, notes, rate_type, rate_amount, bank_details, upi_id, alternate_phone, age, zone, height, languages, availability, experience, opted_roles)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalStaffId, rawName, cleanDob, cleanGender, cleanContact,
          cleanEmail, cleanZone, cleanPhoto, finalCategoryId,
          cleanSkills, cleanIdType, cleanIdNum, finalStatus, finalManagerId, cleanNotes,
          cleanRateType, cleanRateAmount, cleanBankDetails, cleanUpiId,
          cleanAltPhone, cleanAge, cleanZone, cleanHeight, cleanLanguages, cleanAvailability, cleanExperience, cleanOptedRoles
        ]
      );

      const insertedId = resResult.insertId;
      if (!finalStaffId) {
        finalStaffId = `STF-${String(insertedId).padStart(4, '0')}`;
        await conn.query('UPDATE resources SET staff_id = ? WHERE id = ?', [finalStaffId, insertedId]);
      }

      if (finalStatus && finalStatus !== 'available') {
        await conn.query(`INSERT INTO availability_log (resource_id, old_status, new_status, notes) VALUES (?, ?, ?, ?)`,
          [insertedId, 'available', finalStatus, 'Initial status during bulk import']);
      }

      imported.push({ id: insertedId, staff_id: finalStaffId, name: rawName, photo_path: cleanPhoto });
    }

    await conn.commit();
    res.json({
      success: true,
      message: `Successfully imported ${imported.length} resources`,
      imported_count: imported.length,
      skipped_count: skipped.length,
      imported,
      skipped
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// POST create resource
router.post('/', requirePermission('edit_resources'), async (req, res) => {
  try {
    const {
      staff_id, name, dob, gender, contact_info, email, address,
      photo_path, category_id, skills, id_type, id_number,
      status, reporting_manager_id, notes,
      rate_type, rate_amount, bank_details, upi_id,
      alternate_phone, age, zone, height, languages, availability, experience, opted_roles
    } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });

    // Duplicate check on phone and email
    const cleanContact = contact_info ? String(contact_info).trim() : null;
    const phoneDigits = cleanContact ? cleanContact.replace(/[^0-9]/g, '').slice(-10) : null;
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;

    if ((phoneDigits && phoneDigits.length >= 7) || cleanEmail) {
      const dupClauses = [];
      const dupParams = [];
      if (phoneDigits && phoneDigits.length >= 7) {
        dupClauses.push(`RIGHT(REGEXP_REPLACE(contact_info, '[^0-9]', '', 'g'), 10) = ?`);
        dupParams.push(phoneDigits);
      }
      if (cleanEmail) {
        dupClauses.push(`LOWER(TRIM(email)) = ?`);
        dupParams.push(cleanEmail);
      }
      const [existingDups] = await pool.query(
        `SELECT id, name, staff_id, contact_info, email FROM resources WHERE ${dupClauses.join(' OR ')} LIMIT 1`,
        dupParams
      );
      if (existingDups.length) {
        const dup = existingDups[0];
        const matchField = cleanEmail && dup.email && dup.email.toLowerCase() === cleanEmail ? `email (${dup.email})` : `phone number (${dup.contact_info})`;
        return res.status(409).json({
          success: false,
          error: `Duplicate crew member: ${dup.name} is already registered with this ${matchField}.`
        });
      }
    }

    let finalStaffId = staff_id ? staff_id.trim().toUpperCase() : null;
    const finalManagerId = isLead(req.user) ? (reporting_manager_id || req.user.manager_id || null) : (req.user.manager_id || null);
    const cleanDob = toIsoDate(dob);
    const cleanAge = (age !== '' && age != null) ? parseInt(age, 10) : null;
    const cleanGender = ['male', 'female', 'other'].includes(gender) ? gender : null;
    const validStatuses = ['available', 'nominated', 'pending_approval', 'confirmed', 'deployed', 'released', 'assigned', 'on_leave', 'unavailable'];
    const finalStatus = validStatuses.includes(status) ? status : 'available';
    const cleanRateType = ['per_day', 'per_shift', 'per_hour', 'fixed'].includes(rate_type) ? rate_type : 'per_day';
    const cleanRateAmount = rate_amount !== '' && rate_amount != null ? Number(rate_amount) : null;
    const cleanBankDetails = bank_details ? bank_details.trim() : null;
    const cleanUpiId = upi_id ? upi_id.trim() : null;
    const cleanPhoto = photo_path ? convertGoogleDriveUrl(photo_path) : null;

    const [result] = await pool.query(
      `INSERT INTO resources 
       (staff_id, name, dob, gender, contact_info, email, address, photo_path, category_id, skills, id_type, id_number, status, reporting_manager_id, notes, rate_type, rate_amount, bank_details, upi_id, alternate_phone, age, zone, height, languages, availability, experience, opted_roles)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalStaffId, name.trim(), cleanDob, cleanGender, contact_info || null,
        email || null, (zone || address) || null, cleanPhoto, category_id || null,
        skills || null, id_type || null, id_number || null, finalStatus, finalManagerId, notes || null,
        cleanRateType, cleanRateAmount, cleanBankDetails, cleanUpiId,
        alternate_phone || null, cleanAge, zone || null, height || null, languages || null, availability || null, experience || null, opted_roles || null
      ]
    );

    if (!finalStaffId) {
      finalStaffId = `STF-${String(result.insertId).padStart(4, '0')}`;
      await pool.query('UPDATE resources SET staff_id = ? WHERE id = ?', [finalStaffId, result.insertId]);
    }

    if (finalStatus && finalStatus !== 'available') {
      await pool.query(`INSERT INTO availability_log (resource_id, old_status, new_status, notes) VALUES (?, ?, ?, ?)`,
        [result.insertId, 'available', finalStatus, 'Initial status at creation']);
    }

    const [row] = await pool.query(`
      SELECT r.*, rc.name AS category_name, m.name AS manager_name
      FROM resources r
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN managers m ON m.id = r.reporting_manager_id
      WHERE r.id = ?
    `, [result.insertId]);
    res.status(201).json({ success: true, data: row[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update resource
router.put('/:id', requirePermission('edit_resources'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      staff_id, name, dob, gender, contact_info, email, address,
      photo_path, category_id, skills, id_type, id_number,
      status, reporting_manager_id, notes,
      rate_type, rate_amount, bank_details, upi_id,
      alternate_phone, age, zone, height, languages, availability, experience, opted_roles
    } = req.body;

    // Get current record for log, ownership check, and partial update fallbacks
    const [currentRows] = await conn.query(`SELECT * FROM resources WHERE id = ?`, [req.params.id]);
    if (!currentRows.length) return res.status(404).json({ success: false, error: 'Resource not found' });
    const current = currentRows[0];

    // Managers can only edit their own resources
    if (!isLead(req.user) && current.reporting_manager_id !== req.user.manager_id) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Access denied. This resource does not belong to you.' });
    }

    const oldStatus = current.status;
    let finalStaffId = staff_id ? staff_id.trim().toUpperCase() : current.staff_id || `STF-${String(req.params.id).padStart(4, '0')}`;

    // Block changing status to 'available' or 'released' if actively assigned
    if (['available', 'released'].includes(status) && ['assigned', 'deployed'].includes(oldStatus)) {
      const [activeAssignment] = await conn.query(
        `SELECT id FROM project_assignments WHERE resource_id = ? AND unassigned_on IS NULL`, [req.params.id]
      );
      if (activeAssignment.length) {
        await conn.rollback();
        return res.status(409).json({ success: false, error: 'Cannot set to available while actively assigned to a project. Release from project first.' });
      }
    }

    // Merge incoming values with current record
    const finalName = name !== undefined ? (name ? name.trim() : current.name) : current.name;
    const finalContact = contact_info !== undefined ? (contact_info ? contact_info.trim() : null) : current.contact_info;
    const finalAltPhone = alternate_phone !== undefined ? (alternate_phone ? alternate_phone.trim() : null) : current.alternate_phone;
    const finalEmail = email !== undefined ? (email ? email.trim() : null) : current.email;
    const finalZone = zone !== undefined ? (zone ? zone.trim() : null) : (address !== undefined ? (address ? address.trim() : null) : current.zone);
    const finalAddress = finalZone || current.address;
    const finalAge = age !== undefined ? (age !== '' && age != null ? parseInt(age, 10) : null) : current.age;
    const finalHeight = height !== undefined ? (height ? height.trim() : null) : current.height;
    const finalLanguages = languages !== undefined ? (languages ? languages.trim() : null) : current.languages;
    const finalAvailability = availability !== undefined ? (availability ? availability.trim() : null) : current.availability;
    const finalExperience = experience !== undefined ? (experience ? experience.trim() : null) : current.experience;
    const finalOptedRoles = opted_roles !== undefined ? (opted_roles ? opted_roles.trim() : null) : current.opted_roles;
    const finalPhoto = photo_path !== undefined ? (photo_path ? convertGoogleDriveUrl(photo_path.trim()) : null) : current.photo_path;
    const finalCatId = category_id !== undefined ? (category_id || null) : current.category_id;
    const finalSkills = skills !== undefined ? (skills ? skills.trim() : null) : (finalOptedRoles || current.skills);
    const finalIdType = id_type !== undefined ? (id_type ? id_type.trim() : null) : current.id_type;
    const finalIdNum = id_number !== undefined ? (id_number ? id_number.trim() : null) : current.id_number;
    const finalNotes = notes !== undefined ? (notes ? notes.trim() : null) : current.notes;
    const finalDob = dob !== undefined ? toIsoDate(dob) : toIsoDate(current.dob);
    const finalGender = gender !== undefined ? (['male', 'female', 'other'].includes(gender) ? gender : null) : current.gender;
    const finalRateType = rate_type !== undefined ? (['per_day', 'per_shift', 'per_hour', 'fixed'].includes(rate_type) ? rate_type : 'per_day') : current.rate_type;
    const finalRateAmount = rate_amount !== undefined ? (rate_amount !== '' && rate_amount != null ? Number(rate_amount) : null) : current.rate_amount;
    const finalBankDetails = bank_details !== undefined ? (bank_details ? bank_details.trim() : null) : current.bank_details;
    const finalUpiId = upi_id !== undefined ? (upi_id ? upi_id.trim() : null) : current.upi_id;

    // Managers cannot reassign resources to another manager
    const finalManagerId = isLead(req.user) ? (reporting_manager_id !== undefined ? (reporting_manager_id || null) : current.reporting_manager_id) : current.reporting_manager_id;
    const validStatuses = ['available', 'nominated', 'pending_approval', 'confirmed', 'deployed', 'released', 'assigned', 'on_leave', 'unavailable'];
    const finalStatus = validStatuses.includes(status) ? status : oldStatus;

    await conn.query(
      `UPDATE resources SET 
         staff_id=?, name=?, dob=?, gender=?, contact_info=?, email=?, address=?, photo_path=?,
         category_id=?, skills=?, id_type=?, id_number=?, status=?, reporting_manager_id=?, notes=?,
         rate_type=?, rate_amount=?, bank_details=?, upi_id=?, alternate_phone=?, age=?, zone=?, height=?, languages=?, availability=?, experience=?, opted_roles=?
       WHERE id=?`,
      [
        finalStaffId, finalName, finalDob, finalGender, finalContact,
        finalEmail, finalAddress, finalPhoto, finalCatId,
        finalSkills, finalIdType, finalIdNum, finalStatus, finalManagerId,
        finalNotes, finalRateType, finalRateAmount, finalBankDetails, finalUpiId,
        finalAltPhone, finalAge, finalZone, finalHeight, finalLanguages, finalAvailability, finalExperience, finalOptedRoles,
        req.params.id
      ]
    );

    if (finalStatus && finalStatus !== oldStatus) {
      await conn.query(`INSERT INTO availability_log (resource_id, old_status, new_status, notes) VALUES (?, ?, ?, ?)`,
        [req.params.id, oldStatus, finalStatus, req.body.change_reason || 'Status manually updated']);
    }

    await conn.commit();
    const [row] = await pool.query(`
      SELECT r.*, rc.name AS category_name, m.name AS manager_name, p.name AS current_project_name
      FROM resources r
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN managers m ON m.id = r.reporting_manager_id
      LEFT JOIN projects p ON p.id = r.current_project_id
      WHERE r.id = ?
    `, [req.params.id]);
    res.json({ success: true, data: row[0] });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE resource
router.delete('/:id', requirePermission('edit_resources'), async (req, res) => {
  try {
    // Check if staff has ever been assigned to a project (active or historical)
    const [assignments] = await pool.query(
      `SELECT id FROM project_assignments WHERE resource_id = ? LIMIT 1`, [req.params.id]
    );
    if (assignments.length) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete staff member who is deployed or has assignment history on a project. Mark as Unavailable instead.'
      });
    }

    const [current] = await pool.query(`SELECT current_project_id FROM resources WHERE id = ?`, [req.params.id]);
    if (current.length && current[0].current_project_id) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete staff member who is currently assigned to a project.'
      });
    }

    await pool.query(`DELETE FROM resources WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Resource deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET resource categories
router.get('/meta/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM resource_categories ORDER BY name`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
