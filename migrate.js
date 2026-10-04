// migrate.js - Full schema creation + seed data for Manpower Management Platform
require('dotenv').config();
const { pool } = require('./db');

const schema = [
  // Resource categories lookup
  `CREATE TABLE IF NOT EXISTS resource_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Managers table
  `CREATE TABLE IF NOT EXISTS managers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact VARCHAR(200),
    role VARCHAR(100) DEFAULT 'Manager',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Clients table
  `CREATE TABLE IF NOT EXISTS clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_info VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Projects table
  `CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    client_id INT,
    location VARCHAR(255),
    start_date DATE,
    end_date DATE,
    status ENUM('planned','active','completed','cancelled') DEFAULT 'planned',
    project_manager_id INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (project_manager_id) REFERENCES managers(id) ON DELETE SET NULL
  )`,

  // Resources table
  `CREATE TABLE IF NOT EXISTS resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id VARCHAR(50) UNIQUE,
    name VARCHAR(150) NOT NULL,
    contact_info VARCHAR(255),
    category_id INT,
    skills TEXT,
    status ENUM('available','assigned','on_leave','unavailable') DEFAULT 'available',
    reporting_manager_id INT,
    current_project_id INT DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (reporting_manager_id) REFERENCES managers(id) ON DELETE SET NULL,
    FOREIGN KEY (current_project_id) REFERENCES projects(id) ON DELETE SET NULL
  )`,

  // Project requirements (how many of each category needed)
  `CREATE TABLE IF NOT EXISTS project_requirements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    category_id INT NOT NULL,
    quantity_required INT NOT NULL DEFAULT 1,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE CASCADE,
    UNIQUE KEY uq_proj_cat (project_id, category_id)
  )`,

  // Project assignments - audit trail
  `CREATE TABLE IF NOT EXISTS project_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    resource_id INT NOT NULL,
    assigned_by INT,
    assigned_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unassigned_on TIMESTAMP NULL DEFAULT NULL,
    notes TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES managers(id) ON DELETE SET NULL
  )`,

  // Availability log - history of status changes
  `CREATE TABLE IF NOT EXISTS availability_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by INT,
    notes TEXT,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES managers(id) ON DELETE SET NULL
  )`,

  // Indexes for performance optimization
  `ALTER TABLE resources ADD INDEX idx_status (status)`,
  `ALTER TABLE resources ADD INDEX idx_category (category_id)`,
  `ALTER TABLE resources ADD INDEX idx_manager (reporting_manager_id)`,
  `ALTER TABLE projects ADD INDEX idx_status (status)`,
  `ALTER TABLE project_assignments ADD INDEX idx_project_unassigned (project_id, unassigned_on)`
];

const seedData = async (conn) => {
  // Check if already seeded
  const [rows] = await conn.query('SELECT COUNT(*) as cnt FROM resource_categories');
  if (rows[0].cnt > 0) {
    console.log('🌱 Seed data already exists, skipping...');
    return;
  }

  console.log('🌱 Seeding database...');

  // Categories
  await conn.query(`INSERT INTO resource_categories (name) VALUES
    ('Bouncer'),('Security Guard'),('Promoter'),('Supervisor'),('Event Staff'),
    ('Bartender'),('Valet'),('Hostess'),('Crowd Controller'),('VIP Escort')`);

  // Managers
  await conn.query(`INSERT INTO managers (name, contact, role) VALUES
    ('Rajesh Kumar', '+91-9876543210', 'Senior Manager'),
    ('Priya Sharma', '+91-9123456789', 'Operations Manager'),
    ('Amit Singh', '+91-9988776655', 'Field Manager')`);

  // Clients
  await conn.query(`INSERT INTO clients (name, contact_info) VALUES
    ('Grand Hyatt Events', 'events@grandhyatt.com | +91-2226761234'),
    ('ITC Hotels Corp', 'banquet@itchotels.in | +91-2222881000'),
    ('Pune Festival Org', 'info@punefest.org | +91-9090123456')`);

  // Projects
  await conn.query(`INSERT INTO projects (name, client_id, location, start_date, end_date, status, project_manager_id, notes) VALUES
    ('Grand Hyatt NYE Gala 2025', 1, 'Grand Hyatt Mumbai, Santacruz', '2025-12-31', '2026-01-01', 'planned', 1, 'VIP New Year event, strict dress code'),
    ('ITC Security Detail Q4', 2, 'ITC Maratha, Mumbai', '2025-10-01', '2025-12-31', 'active', 2, 'Quarterly security contract'),
    ('Pune Music Festival', 3, 'Shivajinagar Grounds, Pune', '2025-11-15', '2025-11-17', 'planned', 1, '3-day outdoor festival')`);

  // Resources (20 sample staff)
  await conn.query(`INSERT INTO resources (name, contact_info, category_id, skills, status, reporting_manager_id, notes) VALUES
    ('Suresh Patil', '9900112233', 1, 'Crowd control, MMA trained, 5yr exp', 'available', 1, 'Ex-army'),
    ('Ravi Yadav', '9900112244', 1, 'Door security, ID verification', 'available', 1, NULL),
    ('Mohan Das', '9900112255', 2, 'Armed escort, patrol routes', 'available', 2, 'Licensed arms holder'),
    ('Kiran Nair', '9900112266', 2, 'CCTV monitoring, perimeter guard', 'available', 2, NULL),
    ('Sneha Joshi', '9900112277', 3, 'Brand ambassador, social media', 'available', 3, 'Fluent English, Marathi, Hindi'),
    ('Divya Patel', '9900112288', 3, 'Promotions, leaflet distribution', 'available', 3, NULL),
    ('Arjun Mehta', '9900112299', 4, 'Team supervision, reporting', 'available', 1, 'Experienced team lead'),
    ('Neha Sharma', '9900112300', 5, 'Guest registration, crowd flow', 'available', 2, NULL),
    ('Rahul Verma', '9900112311', 5, 'Stage crew, equipment handling', 'available', 2, NULL),
    ('Pooja Iyer', '9900112322', 6, 'Cocktail making, event bartending', 'available', 3, 'FSSAI certified'),
    ('Sanjay Gupta', '9900112333', 7, 'Valet parking, luxury vehicles', 'available', 1, NULL),
    ('Anita Rao', '9900112344', 8, 'Guest relations, VIP handling', 'available', 2, NULL),
    ('Deepak Shinde', '9900112355', 1, 'Bouncer, conflict resolution', 'on_leave', 1, 'On leave until Oct 10'),
    ('Kavita More', '9900112366', 3, 'Brand promotion, demo expert', 'available', 3, NULL),
    ('Nikhil Chavan', '9900112377', 2, 'Security patrol, first aid trained', 'available', 2, NULL),
    ('Sunita Wagh', '9900112388', 5, 'Registration desk, data entry', 'available', 3, NULL),
    ('Prakash Jain', '9900112399', 9, 'Crowd management, barrier setup', 'available', 1, NULL),
    ('Rekha Singh', '9900112410', 10, 'VIP escort, etiquette training', 'available', 2, NULL),
    ('Vijay Kulkarni', '9900112421', 4, 'Shift supervisor, scheduling', 'available', 1, NULL),
    ('Manisha Desai', '9900112432', 5, 'Event coordination, logistics', 'unavailable', 3, 'Currently on personal break')`);

  // Project requirements for project 1 (NYE Gala)
  await conn.query(`INSERT INTO project_requirements (project_id, category_id, quantity_required) VALUES
    (1, 1, 4),(1, 2, 3),(1, 8, 2),(1, 7, 2),(1, 6, 2),(1, 5, 5)`);

  // Project requirements for project 2 (ITC Security)
  await conn.query(`INSERT INTO project_requirements (project_id, category_id, quantity_required) VALUES
    (2, 2, 4),(2, 1, 2),(2, 4, 1)`);

  // Project requirements for project 3 (Music Festival)
  await conn.query(`INSERT INTO project_requirements (project_id, category_id, quantity_required) VALUES
    (3, 1, 6),(3, 9, 4),(3, 3, 5),(3, 5, 8),(3, 4, 2)`);

  // Assign some resources to active project (ITC Security - project 2)
  await conn.query(`INSERT INTO project_assignments (project_id, resource_id, assigned_by, assigned_on) VALUES
    (2, 3, 2, NOW()),
    (2, 4, 2, NOW()),
    (2, 15, 2, NOW()),
    (2, 7, 1, NOW())`);

  // Update those resources to assigned status
  await conn.query(`UPDATE resources SET status='assigned', current_project_id=2 WHERE id IN (3, 4, 15, 7)`);

  // Log these assignments in availability_log
  await conn.query(`INSERT INTO availability_log (resource_id, old_status, new_status, changed_by, notes) VALUES
    (3, 'available', 'assigned', 2, 'Assigned to ITC Security Detail Q4'),
    (4, 'available', 'assigned', 2, 'Assigned to ITC Security Detail Q4'),
    (15, 'available', 'assigned', 2, 'Assigned to ITC Security Detail Q4'),
    (7, 'available', 'assigned', 1, 'Assigned to ITC Security Detail Q4')`);

  console.log('✅ Seed data inserted successfully');
};

async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('🔨 Running schema migrations...');
    for (const sql of schema) {
      try {
        await conn.query(sql);
        console.log('  ✓', sql.split('\n')[0].trim().substring(0, 60));
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log('  ✓', sql.split('\n')[0].trim().substring(0, 60), '(Index already exists)');
        } else {
          throw err;
        }
      }
    }
    console.log('✅ Schema migrations complete');
    await seedData(conn);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().then(() => {
  console.log('🚀 Database ready!');
  process.exit(0);
}).catch(() => process.exit(1));
