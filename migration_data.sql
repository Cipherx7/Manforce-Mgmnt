-- Data migration from MySQL to PostgreSQL
-- resource_categories (10 rows)
INSERT INTO resource_categories ("id", "name", "created_at") VALUES
(1, 'Bouncer', '2026-09-27T19:22:46.000Z'),
(2, 'Security Guard', '2026-09-27T19:22:46.000Z'),
(3, 'Promoter', '2026-09-27T19:22:46.000Z'),
(4, 'Supervisor', '2026-09-27T19:22:46.000Z'),
(5, 'Event Staff', '2026-09-27T19:22:46.000Z'),
(6, 'Bartender', '2026-09-27T19:22:46.000Z'),
(7, 'Valet', '2026-09-27T19:22:46.000Z'),
(8, 'Hostess', '2026-09-27T19:22:46.000Z'),
(9, 'Crowd Controller', '2026-09-27T19:22:46.000Z'),
(10, 'VIP Escort', '2026-09-27T19:22:46.000Z');

SELECT setval(pg_get_serial_sequence('resource_categories', 'id'), COALESCE((SELECT MAX(id) FROM resource_categories), 1));

-- managers (3 rows)
INSERT INTO managers ("id", "name", "contact", "role", "created_at") VALUES
(1, 'Rajesh Kumar', '+91-9876543210', 'Senior Manager', '2026-09-27T19:22:47.000Z'),
(2, 'Priya Sharma', '+91-9123456789', 'Operations Manager', '2026-09-27T19:22:47.000Z'),
(3, 'Amit Singh', '+91-9988776655', 'Field Manager', '2026-09-27T19:22:47.000Z');

SELECT setval(pg_get_serial_sequence('managers', 'id'), COALESCE((SELECT MAX(id) FROM managers), 1));

-- clients (3 rows)
INSERT INTO clients ("id", "name", "contact_info", "created_at") VALUES
(1, 'Grand Hyatt Events', 'events@grandhyatt.com | +91-2226761234', '2026-09-27T19:22:47.000Z'),
(2, 'ITC Hotels Corp', 'banquet@itchotels.in | +91-2222881000', '2026-09-27T19:22:47.000Z'),
(3, 'Pune Festival Org', 'info@punefest.org | +91-9090123456', '2026-09-27T19:22:47.000Z');

SELECT setval(pg_get_serial_sequence('clients', 'id'), COALESCE((SELECT MAX(id) FROM clients), 1));

-- projects (3 rows)
INSERT INTO projects ("id", "name", "client_id", "location", "start_date", "end_date", "status", "project_manager_id", "notes", "created_at", "updated_at", "start_time", "end_time", "required_manpower", "geofence_lat", "geofence_lng", "geofence_radius_m") VALUES
(1, 'Grand Hyatt NYE Gala 2025', 1, 'Grand Hyatt Mumbai, Santacruz', '2025-12-31T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'completed', 1, 'VIP New Year event, strict dress code', '2026-09-27T19:22:47.000Z', '2026-09-28T17:17:25.000Z', NULL, NULL, NULL, NULL, NULL, 100),
(2, 'ITC Security Detail Q4', 2, 'ITC Maratha, Mumbai', '2025-10-01T00:00:00.000Z', '2025-12-31T00:00:00.000Z', 'active', 2, 'Quarterly security contract', '2026-09-27T19:22:47.000Z', '2026-09-27T19:22:47.000Z', NULL, NULL, NULL, NULL, NULL, 100),
(3, 'Pune Music Festival', 3, 'Shivajinagar Grounds, Pune', '2025-11-15T00:00:00.000Z', '2025-11-17T00:00:00.000Z', 'planned', 1, '3-day outdoor festival', '2026-09-27T19:22:47.000Z', '2026-09-27T19:22:47.000Z', NULL, NULL, NULL, NULL, NULL, 100);

SELECT setval(pg_get_serial_sequence('projects', 'id'), COALESCE((SELECT MAX(id) FROM projects), 1));

-- resources (20 rows)
INSERT INTO resources ("id", "staff_id", "name", "contact_info", "category_id", "skills", "status", "reporting_manager_id", "current_project_id", "notes", "created_at", "updated_at", "dob", "email", "address", "photo_path", "id_type", "id_number", "gender", "rate_type", "rate_amount", "bank_details", "upi_id") VALUES
(1, 'STF-0001', 'Suresh Patil', '9900112233', 1, 'Crowd control, MMA trained, 5yr exp', 'available', 1, NULL, 'Ex-army', '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:30.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(2, 'STF-0002', 'Ravi Yadav', '9900112244', 1, 'Door security, ID verification', 'available', 1, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:30.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(3, 'STF-0003', 'Mohan Das', '9900112255', 2, 'Armed escort, patrol routes', 'available', 2, NULL, 'Licensed arms holder', '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:31.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(4, 'STF-0004', 'Kiran Nair', '9900112266', 2, 'CCTV monitoring, perimeter guard', 'assigned', 2, 2, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:31.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(5, 'STF-0005', 'Sneha Joshi', '9900112277', 3, 'Brand ambassador, social media', 'available', 3, NULL, 'Fluent English, Marathi, Hindi', '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:31.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(6, 'STF-0006', 'Divya Patel', '9900112288', 3, 'Promotions, leaflet distribution', 'available', 3, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:31.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(7, 'STF-0007', 'Arjun Mehta', '9900112299', 4, 'Team supervision, reporting', 'released', 1, NULL, 'Experienced team lead', '2026-09-27T19:22:47.000Z', '2026-10-02T18:56:03.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(8, 'STF-0008', 'Neha Sharma', '9900112300', 5, 'Guest registration, crowd flow', 'available', 2, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:31.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(9, 'STF-0009', 'Rahul Verma', '9900112311', 5, 'Stage crew, equipment handling', 'available', 2, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:32.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(10, 'STF-0010', 'Pooja Iyer', '9900112322', 6, 'Cocktail making, event bartending', 'available', 3, NULL, 'FSSAI certified', '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:32.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(11, 'STF-0011', 'Sanjay Gupta', '9900112333', 7, 'Valet parking, luxury vehicles', 'available', 1, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:32.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(12, 'STF-0012', 'Anita Rao', '9900112344', 8, 'Guest relations, VIP handling', 'released', 2, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-10-02T18:56:02.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(13, 'STF-0013', 'Deepak Shinde', '9900112355', 1, 'Bouncer, conflict resolution', 'on_leave', 1, NULL, 'On leave until Oct 10', '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:32.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(14, 'STF-0014', 'Kavita More', '9900112366', 3, 'Brand promotion, demo expert', 'available', 3, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:33.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(15, 'STF-0015', 'Nikhil Chavan', '9900112377', 2, 'Security patrol, first aid trained', 'assigned', 2, 2, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:33.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(16, 'STF-0016', 'Sunita Wagh', '9900112388', 5, 'Registration desk, data entry', 'available', 3, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:33.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(17, 'STF-0017', 'Prakash Jain', '9900112399', 9, 'Crowd management, barrier setup', 'available', 1, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:33.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(18, 'STF-0018', 'Rekha Singh', '9900112410', 10, 'VIP escort, etiquette training', 'available', 2, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:33.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(19, 'STF-0019', 'Vijay Kulkarni', '9900112421', 4, 'Shift supervisor, scheduling', 'available', 1, NULL, NULL, '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:33.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL),
(20, 'STF-0020', 'Manisha Desai', '9900112432', 5, 'Event coordination, logistics', 'unavailable', 3, NULL, 'Currently on personal break', '2026-09-27T19:22:47.000Z', '2026-09-28T17:53:34.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'per_day', NULL, NULL, NULL);

SELECT setval(pg_get_serial_sequence('resources', 'id'), COALESCE((SELECT MAX(id) FROM resources), 1));

-- project_requirements (14 rows)
INSERT INTO project_requirements ("id", "project_id", "category_id", "quantity_required") VALUES
(7, 2, 2, 4),
(8, 2, 1, 2),
(9, 2, 4, 1),
(10, 3, 1, 6),
(11, 3, 9, 4),
(12, 3, 3, 5),
(13, 3, 5, 8),
(14, 3, 4, 2),
(21, 1, 6, 2),
(22, 1, 1, 4),
(23, 1, 5, 5),
(24, 1, 8, 2),
(25, 1, 2, 3),
(26, 1, 7, 2);

SELECT setval(pg_get_serial_sequence('project_requirements', 'id'), COALESCE((SELECT MAX(id) FROM project_requirements), 1));

-- project_assignments (13 rows)
INSERT INTO project_assignments ("id", "project_id", "resource_id", "assigned_by", "assigned_on", "unassigned_on", "notes") VALUES
(1, 2, 3, 2, '2026-09-27T19:22:47.000Z', '2026-09-27T19:35:25.000Z', NULL),
(2, 2, 4, 2, '2026-09-27T19:22:47.000Z', NULL, NULL),
(3, 2, 15, 2, '2026-09-27T19:22:47.000Z', NULL, NULL),
(4, 2, 7, 1, '2026-09-27T19:22:47.000Z', '2026-09-27T19:48:53.000Z', NULL),
(5, 1, 1, 1, '2026-09-27T19:24:37.000Z', '2026-09-27T19:24:38.000Z', NULL),
(6, 2, 12, 1, '2026-09-27T19:41:19.000Z', '2026-09-27T19:42:19.000Z', 'VIP host'),
(8, 1, 12, 1, '2026-09-27T19:42:19.000Z', '2026-09-27T19:42:33.000Z', 'Reassigned to Project 1'),
(9, 1, 7, 3, '2026-09-27T19:48:53.000Z', '2026-09-27T20:13:38.000Z', 'afad'),
(10, 3, 7, 2, '2026-09-28T09:07:26.000Z', '2026-09-28T09:08:07.000Z', 'fergfre'),
(11, 1, 7, NULL, '2026-09-28T09:08:08.000Z', '2026-10-02T18:56:01.000Z', 'Reassigned from Pune Music Festival'),
(12, 3, 12, NULL, '2026-09-28T16:52:24.000Z', '2026-10-02T18:56:00.000Z', NULL),
(24, 2, 12, NULL, '2026-10-02T18:56:00.000Z', '2026-10-02T18:56:02.000Z', 'Automated bulk assign test'),
(25, 2, 7, NULL, '2026-10-02T18:56:01.000Z', '2026-10-02T18:56:03.000Z', 'Automated bulk assign test');

SELECT setval(pg_get_serial_sequence('project_assignments', 'id'), COALESCE((SELECT MAX(id) FROM project_assignments), 1));

-- availability_log (19 rows)
INSERT INTO availability_log ("id", "resource_id", "old_status", "new_status", "changed_at", "changed_by", "notes") VALUES
(1, 3, 'available', 'assigned', '2026-09-27T19:22:47.000Z', 2, 'Assigned to ITC Security Detail Q4'),
(2, 4, 'available', 'assigned', '2026-09-27T19:22:47.000Z', 2, 'Assigned to ITC Security Detail Q4'),
(3, 15, 'available', 'assigned', '2026-09-27T19:22:47.000Z', 2, 'Assigned to ITC Security Detail Q4'),
(4, 7, 'available', 'assigned', '2026-09-27T19:22:47.000Z', 1, 'Assigned to ITC Security Detail Q4'),
(5, 1, 'available', 'assigned', '2026-09-27T19:24:37.000Z', 1, 'Assigned to project: Grand Hyatt NYE Gala 2025'),
(6, 1, 'assigned', 'available', '2026-09-27T19:24:38.000Z', NULL, 'Unassigned from project: Grand Hyatt NYE Gala 2025'),
(7, 3, 'assigned', 'available', '2026-09-27T19:35:25.000Z', NULL, 'Unassigned from project: ITC Security Detail Q4'),
(8, 12, 'available', 'assigned', '2026-09-27T19:41:19.000Z', 1, 'Assigned to project: ITC Security Detail Q4'),
(9, 12, 'assigned', 'assigned', '2026-09-27T19:42:20.000Z', 1, 'Reassigned to Project 1'),
(10, 12, 'assigned', 'available', '2026-09-27T19:42:34.000Z', 1, 'Released from Grand Hyatt NYE Gala 2025'),
(11, 7, 'assigned', 'assigned', '2026-09-27T19:48:53.000Z', 3, 'afad'),
(12, 7, 'assigned', 'available', '2026-09-27T20:13:38.000Z', NULL, 'Released from Grand Hyatt NYE Gala 2025'),
(13, 7, 'available', 'assigned', '2026-09-28T09:07:26.000Z', 2, 'Assigned to project: Pune Music Festival'),
(14, 7, 'assigned', 'assigned', '2026-09-28T09:08:08.000Z', NULL, 'Reassigned from Pune Music Festival to Grand Hyatt NYE Gala 2025'),
(15, 12, 'available', 'assigned', '2026-09-28T16:52:24.000Z', NULL, 'Assigned to project: Pune Music Festival'),
(51, 12, 'assigned', 'deployed', '2026-10-02T18:56:01.000Z', NULL, 'Automated bulk assign test'),
(52, 7, 'assigned', 'deployed', '2026-10-02T18:56:01.000Z', NULL, 'Automated bulk assign test'),
(53, 12, 'deployed', 'released', '2026-10-02T18:56:02.000Z', NULL, 'Released from ITC Security Detail Q4'),
(54, 7, 'deployed', 'released', '2026-10-02T18:56:03.000Z', NULL, 'Released from ITC Security Detail Q4');

SELECT setval(pg_get_serial_sequence('availability_log', 'id'), COALESCE((SELECT MAX(id) FROM availability_log), 1));

-- users (7 rows)
INSERT INTO users ("id", "name", "email", "password_hash", "role", "manager_id", "permissions", "is_active", "last_login", "created_at", "updated_at") VALUES
(1, 'Super Admin', 'admin@dvevents.com', '$2b$12$ku9c2MXc5JQ6cn6JPHTAyeyebtlbPf394/w4PKDxb81J4oQhXXOSW', 'super_admin', NULL, '{"edit_clients":true,"manage_users":true,"view_clients":true,"view_reports":true,"edit_managers":true,"edit_projects":true,"view_managers":true,"view_projects":true,"edit_resources":true,"view_dashboard":true,"view_resources":true,"edit_assignments":true,"view_assignments":true}'::jsonb, TRUE, NULL, '2026-09-27T19:58:25.000Z', '2026-09-27T19:58:25.000Z'),
(2, 'Rajesh Kumar', 'rajesh@dvevents.com', '$2b$12$yBGdc5CB0rIUFsi5vYLEy.WXgN2vbG/M.R3eM5BpDX4XfFPlW7yB6', 'manager', 1, '{"edit_clients":false,"manage_users":false,"view_clients":false,"view_reports":true,"edit_managers":false,"edit_projects":false,"view_managers":false,"view_projects":true,"edit_resources":true,"view_dashboard":true,"view_resources":true,"edit_assignments":true,"view_assignments":true}'::jsonb, TRUE, NULL, '2026-09-27T19:58:25.000Z', '2026-09-27T19:58:25.000Z'),
(3, 'Priya Sharma', 'priya@dvevents.com', '$2b$12$HeQnsRVvjBoh9WdcWnfjreobNrEjD3pZXbd.Bc/B/.wDIRFdULCwK', 'manager', 2, '{"edit_clients":false,"manage_users":false,"view_clients":false,"view_reports":true,"edit_managers":false,"edit_projects":false,"view_managers":false,"view_projects":true,"edit_resources":true,"view_dashboard":true,"view_resources":true,"edit_assignments":true,"view_assignments":true}'::jsonb, TRUE, NULL, '2026-09-27T19:58:26.000Z', '2026-09-27T19:58:26.000Z'),
(4, 'Amit Singh', 'amit@dvevents.com', '$2b$12$5wOz0jlKc/fyugIhF/5zXOCMNBRIVYwatVbfeLgVvJwZ.2XQhBqtS', 'manager', 3, '{"edit_clients":false,"manage_users":false,"view_clients":false,"view_reports":true,"edit_managers":false,"edit_projects":false,"view_managers":false,"view_projects":true,"edit_resources":true,"view_dashboard":true,"view_resources":true,"edit_assignments":true,"view_assignments":true}'::jsonb, TRUE, NULL, '2026-09-27T19:58:26.000Z', '2026-09-27T19:58:26.000Z'),
(5, 'Vidhi Kumar', 'vidhi@dvevents.com', '$2b$12$s6zMhEDKPtyK2l0yg/fh4Oa78Ja.0cW7TkB7e6Y8M4sdx6cq5owrG', 'manager', NULL, '{"edit_clients":false,"manage_users":false,"view_clients":false,"view_reports":false,"edit_managers":false,"edit_projects":false,"view_managers":false,"view_projects":false,"edit_resources":false,"view_dashboard":false,"view_resources":true,"edit_assignments":false,"view_assignments":false}'::jsonb, TRUE, NULL, '2026-09-27T20:06:19.000Z', '2026-09-27T20:17:47.000Z'),
(6, 'Abhsihek', 'abhishek@cyberx.org.in', '$2b$12$g3TTo3kBgIszNgcn54Yitefrl7RZHT2KIuKOrNUaQG/5jMe1fiv0.', 'viewer', NULL, '{"edit_clients":false,"manage_users":false,"view_clients":true,"view_reports":true,"edit_managers":false,"edit_projects":false,"view_managers":false,"view_projects":true,"edit_resources":false,"view_dashboard":true,"view_resources":true,"edit_assignments":false,"view_assignments":true}'::jsonb, TRUE, NULL, '2026-09-28T09:06:43.000Z', '2026-09-28T17:54:27.000Z'),
(7, 'manager  A', 'mana@dvevnets.com', '$2b$12$ygeOrA.DuQ1csGm.BU1Cue3cKvXN6nldyY1t1NWTAdM.ZliTm.e5i', 'manager', NULL, '{"edit_clients":false,"manage_users":false,"view_clients":true,"view_reports":true,"edit_managers":false,"edit_projects":true,"view_managers":true,"view_projects":true,"edit_resources":true,"view_dashboard":true,"view_resources":true,"edit_assignments":true,"view_assignments":true}'::jsonb, TRUE, NULL, '2026-10-02T17:18:55.000Z', '2026-10-02T17:18:55.000Z');

SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1));

