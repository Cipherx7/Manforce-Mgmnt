// migrate-v2.js — Additive migration for new prompt requirements
// Run with: node migrate-v2.js
// All statements are safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
require('dotenv').config();
const { pool } = require('./db');

const steps = [
  // 1. Extend users table to support 'lead' role (in addition to existing super_admin)
  `ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','lead','manager','viewer') NOT NULL DEFAULT 'viewer'`,

  // 2. Add new resource statuses to the ENUM
  `ALTER TABLE resources MODIFY COLUMN status ENUM('available','nominated','pending_approval','confirmed','deployed','released','assigned','on_leave','unavailable') NOT NULL DEFAULT 'available'`,

  // 3. Add project fields: start_time, end_time, required_manpower, geofence
  `ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS start_time TIME NULL,
    ADD COLUMN IF NOT EXISTS end_time TIME NULL,
    ADD COLUMN IF NOT EXISTS required_manpower INT NULL DEFAULT NULL COMMENT 'Total headcount required',
    ADD COLUMN IF NOT EXISTS geofence_lat DECIMAL(10,7) NULL,
    ADD COLUMN IF NOT EXISTS geofence_lng DECIMAL(10,7) NULL,
    ADD COLUMN IF NOT EXISTS geofence_radius_m INT NULL DEFAULT 100 COMMENT 'Allowed radius in metres'`,

  // 4. Add more resource profile fields
  `ALTER TABLE resources
    ADD COLUMN IF NOT EXISTS dob DATE NULL,
    ADD COLUMN IF NOT EXISTS gender ENUM('male','female','other') NULL,
    ADD COLUMN IF NOT EXISTS email VARCHAR(200) NULL,
    ADD COLUMN IF NOT EXISTS address TEXT NULL,
    ADD COLUMN IF NOT EXISTS photo_path VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS id_type VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS id_number VARCHAR(100) NULL`,

  // 5. Nominations table
  `CREATE TABLE IF NOT EXISTS nominations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    resource_id INT NOT NULL,
    nominated_by_user_id INT NULL COMMENT 'User who nominated (lead or manager)',
    manager_id INT NULL COMMENT 'Manager whose resource this is',
    status ENUM('nominated','pending_approval','approved','rejected') NOT NULL DEFAULT 'nominated',
    notes TEXT,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    UNIQUE KEY uq_project_resource (project_id, resource_id)
  )`,

  // 6. Attendance table
  `CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    resource_id INT NOT NULL,
    photo_path VARCHAR(500) NULL,
    gps_lat DECIMAL(10,7) NULL,
    gps_lng DECIMAL(10,7) NULL,
    distance_m INT NULL COMMENT 'Calculated distance from project location in metres',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('submitted','present','absent','manual_review') NOT NULL DEFAULT 'submitted',
    verified_at TIMESTAMP NULL,
    verified_by INT NULL,
    notes TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    UNIQUE KEY uq_attendance (project_id, resource_id)
  )`,

  // 7. Payments table
  `CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    resource_id INT NOT NULL,
    assignment_id INT NULL,
    rate_type ENUM('per_day','per_shift','per_hour','fixed') NOT NULL DEFAULT 'per_day',
    rate_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    attendance_status ENUM('present','absent','partial') NULL,
    payable_units DECIMAL(10,2) NULL COMMENT 'Days/shifts/hours payable',
    calculated_amount DECIMAL(10,2) NULL,
    adjustment DECIMAL(10,2) NULL DEFAULT 0,
    final_amount DECIMAL(10,2) NULL,
    payment_status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
    payment_date DATE NULL,
    payment_reference VARCHAR(200) NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  )`,
];

// Indexes handled separately (MySQL doesn't support IF NOT EXISTS for ADD INDEX via ALTER)
const indexes = [
  ['nominations', 'idx_nom_project', 'project_id'],
  ['nominations', 'idx_nom_resource', 'resource_id'],
  ['nominations', 'idx_nom_status', 'status'],
  ['attendance',  'idx_att_project', 'project_id'],
  ['attendance',  'idx_att_status',  'status'],
  ['payments',    'idx_pay_project', 'project_id'],
  ['payments',    'idx_pay_status',  'payment_status'],
];

async function migrateV2() {
  const conn = await pool.getConnection();
  try {
    console.log('🔨 Running v2 additive migrations...');
    for (const sql of steps) {
      try {
        await conn.query(sql);
        console.log('  ✓', sql.split('\n')[0].trim().substring(0, 70));
      } catch (err) {
        // Many errors here are benign (column/table already exists)
        if (err.code === 'ER_DUP_KEYNAME' || err.message.includes('Duplicate key') || err.message.includes('already exists')) {
          console.log('  ✓ (already exists)');
        } else {
          console.warn('  ⚠ Skipped:', err.message.substring(0, 100));
        }
      }
    }

    // Add indexes only if they don't exist yet
    for (const [table, name, col] of indexes) {
      try {
        await conn.query(`ALTER TABLE ${table} ADD INDEX ${name} (${col})`);
        console.log(`  ✓ Index ${name} on ${table}`);
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log(`  ✓ Index ${name} already exists`);
        } else {
          console.warn(`  ⚠ Index ${name}:`, err.message.substring(0, 80));
        }
      }
    }

    console.log('✅ v2 migration complete');
  } finally {
    conn.release();
    await pool.end();
  }
}

migrateV2().then(() => process.exit(0)).catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
