// migrate-users.js — Add users table & seed the super admin account
// Run: node migrate-users.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('🔨 Creating users table...');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(200) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'manager', 'viewer') NOT NULL DEFAULT 'manager',
        manager_id INT NULL COMMENT 'Links to managers table for scoped access',
        permissions JSON NULL COMMENT 'Granular feature-level permissions',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_login TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE SET NULL
      )
    `);
    console.log('  ✓ users table ready');

    // Check if super admin already exists
    const [existing] = await conn.query(`SELECT id FROM users WHERE email = 'admin@dvevents.com'`);
    if (existing.length > 0) {
      console.log('  ℹ  Super admin already exists, skipping seed.');
    } else {
      const hash = await bcrypt.hash('Admin@123', 12);
      await conn.query(`
        INSERT INTO users (name, email, password_hash, role, permissions, is_active)
        VALUES (?, ?, ?, 'super_admin', ?, 1)
      `, [
        'Super Admin',
        'admin@dvevents.com',
        hash,
        JSON.stringify({
          view_dashboard: true, view_resources: true, view_projects: true,
          view_assignments: true, view_managers: true, view_reports: true,
          view_clients: true, edit_resources: true, edit_projects: true,
          edit_assignments: true, edit_managers: true, edit_clients: true,
          manage_users: true,
        })
      ]);
      console.log('  ✓ Super Admin seeded:');
      console.log('      Email:    admin@dvevents.com');
      console.log('      Password: Admin@123');
      console.log('      ⚠️  Please change the password after first login!');
    }

    // Also seed manager users for the 3 existing managers
    const [managers] = await conn.query('SELECT id, name, contact FROM managers ORDER BY id');
    const managerEmails = [
      'rajesh@dvevents.com',
      'priya@dvevents.com',
      'amit@dvevents.com',
    ];
    const managerPerms = JSON.stringify({
      view_dashboard: true, view_resources: true, view_projects: true,
      view_assignments: true, view_managers: false, view_reports: true,
      view_clients: false, edit_resources: true, edit_projects: false,
      edit_assignments: true, edit_managers: false, edit_clients: false,
      manage_users: false,
    });

    for (let i = 0; i < Math.min(managers.length, 3); i++) {
      const mgr = managers[i];
      const email = managerEmails[i];
      const [ex] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
      if (ex.length === 0) {
        const hash = await bcrypt.hash('Manager@123', 12);
        await conn.query(`
          INSERT INTO users (name, email, password_hash, role, manager_id, permissions, is_active)
          VALUES (?, ?, ?, 'manager', ?, ?, 1)
        `, [mgr.name, email, hash, mgr.id, managerPerms]);
        console.log(`  ✓ Manager user: ${email} / Manager@123`);
      } else {
        console.log(`  ℹ  Manager user ${email} already exists`);
      }
    }

    console.log('\n✅ Users migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
