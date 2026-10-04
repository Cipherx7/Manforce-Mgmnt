# DV Events Platform — Memory & User Preferences

## UI & Styling Preferences
- **Theme**: Light Mode (clean off-white `#f8fafc` background, pure white `#ffffff` cards and surfaces) & True Black Frosted Glass Dark Mode (100% pitch black `#000000` OLED canvas with zero purple tint, neutral smoky black frosted glass cards `rgba(16, 16, 18, 0.72)`, `backdrop-filter: blur(16px)`, specular white top-edge highlights `inset 0 1px 1px rgba(255,255,255,0.12)`, micro-etched glass borders `rgba(255,255,255,0.08)`, and translucent luminous badges).
- **Typography**: `Urbanist` font across all headings, body text, tables, modals, badges, and numerical metrics (with tabular numbers, sleek geometric proportions, and refined event luxury flair).
- **Aesthetic**: Pure Black Glassmorphism with optical depth. True pitch black AMOLED canvas (zero purple background gradients or ambient color haze), neutral smoky translucent surfaces, crisp specular edge reflections, and smooth interactive hover elevations.
- **Brand / Accent**: Indigo (`#4f46e5` in light, `#6366f1` in dark), with soft pastel status pills in light mode and translucent luminous frosted glass status badges in dark mode.

## Operations Dashboard & Resource Allocation UX
- **Design Philosophy**: Operations command dashboard (not generic HR). Optimized for visibility, speed, and real-time manpower allocation.
- **Visibility**: Understand manpower situation in seconds (available bench, active on-site deployments, locations, unfilled staffing gaps).
- **Navigation**: Simple left sidebar: Dashboard, Resources, Projects, Assignments, Managers, Reports, Clients.
- **Resource Allocation**: High-speed interactive filtering (status pills, category, skills, location, manager), streamlined operational rows/cards (no cluttered 12-column tables).
- **Actions**: Direct 1-click actions: `Assign`, `Reassign` (atomic project-to-project move), `Release` (fast unassign back to bench).
- **Visualizations**: Interactive SVG Donut / Pie Chart for "By Category" manpower distribution with dynamic center metrics on hover, interactive legend, and 1-click drilldown to resource allocation.

## Layout & Spacing Architecture
- **Full Viewport Width**: `#app-shell` and `.main-content` span 100% of available width (`width: calc(100% - var(--sidebar-width)); min-width: 0;`). Topbar uses `justify-content: space-between` across the entire monitor.
- **Responsive Card Grids**: `.deployment-grid` and card grids use `repeat(auto-fill, minmax(360px, 1fr))` to utilize wide screens naturally without empty gaps or single-column cramping.
- **Sidebar & Navigation Plane (Auto-Hide Mode)**: Clean, space-efficient icon-only rail by default (`--sidebar-width: 72px`). Shows only the icons (`🎭`, `📊`, `👥`, `📋`, `🏢`, `📝`, `📍`, `📈`, `👔`, `🔐`) with native tooltips. Smoothly auto-expands on hover (`--sidebar-expanded-width: 256px`) with frosted glass overlay without causing layout shifts in the main content. The topbar toggle button (`#sidebar-toggle`) allows pinning/unpinning the expanded state on desktop. Mobile screens (<= 900px) use off-canvas drawer. Bottom area is completely free of profile widgets and database status indicators.

## User Profile & Session Controls
- **Profile Placement**: Located exclusively in the top-right header (`.topbar-actions`). Shows user avatar circle, name, and subtle dropdown chevron.
- **Profile Popup Dropdown**: Floating flyout anchored below the topbar avatar button containing large avatar, full name, email, role badge (`👑 Super Admin`, `👔 Manager`), contextual shortcuts, and the **Sign Out** button.
- **Sign Out Button**: Located inside the topbar profile popup dropdown (with subtle red danger hover styling). Closes popup and clears session.

## User Management & Access Control UX
- **Dedicated Pages (No Popups)**: Creating and editing users takes place on a dedicated full page (`#page-user-form`). The "Back to Users" button is placed directly above ("upside of") the page title. The top-right actions contain only the "Cancel" button. The bottom action footer contains only the primary "Create User" / "Save Changes" button (no redundant cancel button on bottom left).
- **Open-Page Layout (No Box)**: The form utilizes the full width of the page rather than being constrained in a narrow card/box, separated with clean horizontal border lines (`border-top: 1px solid var(--border)`), with inputs distributed cleanly in a responsive 2-column grid.
- **3-Dots Table Action Menu**: Users table rows do not have cluttered direct buttons. Instead, each row ends with an elegant 3-dots action menu (`⋮`) offering: "View Details", "Edit User", and "Deactivate User" / "Activate User" (with confirmation and self-deactivation protection).
- **Simplified 2-Role System**: Only Lead (Super Admin) and Manager (Operations Manager). No permission sliders or granular matrices on user creation; permissions are automatically determined by role.

## Bulk Resource Import UX (Vertical Wizard)
- **Vertical Stepper Architecture**: The import process uses a 2-column wizard with a sticky left sidebar containing a vertical stepper:
  - **Step 1: Upload or Paste** (Excel/CSV drag-and-drop or clipboard paste)
  - **Step 2: Map Properties** (spreadsheet columns mapped to resource fields)
  - **Step 3: Preview & Import** (record validation, Google Drive photo previews, execution)
  - Vertical connecting indicator lines and step jumping for completed stages.
- **Sidebar Templates**: The left sidebar includes 1-click downloads for "Sample CSV" and "Sample Excel" templates.
- **Main Workspace**: The right column (`.import-main-content`) houses the active step workspace with responsive scrolling.

## Resources Page UX & Website-Wide Hover Standards
- **Minimal Resource List & Cards**: Shows only Name, Category badge, Mobile number, Skill tags, a small availability dot on the profile avatar (green = Available, indigo = Deployed, amber = On Leave, red = Unavailable), and a 3-dots action menu (`⋮`) at the far right. No cluttered direct buttons, bulky deployment banners, or emojis in items.
- **Contextual 3-Dots Menu**: Contains View Details, Edit Resource, Assign / Reassign / Release (permission & status aware), Call Phone, and Delete Resource.
- **Smooth Hover Standards (Whole Website)**:
  - **List Items & Table Rows**: Never jump or shift (`transform: none !important`). Hover applies a smooth, subtle background illumination (`rgba(255, 255, 255, 0.055)` in dark mode, `#f8fafc` in light mode) and border highlight. Muted text within rows stays crisp (`#d4d4d8`). Never turn opaque white in dark mode.
  - **Cards**: Gentle, subtle 1.5px elevation with smooth cubic-bezier easing (`0.22s cubic-bezier(0.16, 1, 0.3, 1)`).
  - **No 3D Tilt**: Removed VanillaTilt to eliminate perspective distortion, jitter, and wobbling on hover.
- **3-Dots Action Menu Stacking & Positioning**:
  - Always elevated to `z-index: 1000 !important; position: relative !important;` via `.menu-open` on the row, cell, and container so dropdowns never hide underneath sibling rows or backdrop filters.
  - Smart auto-flip checks available space below (threshold 260px) and flips upward (`bottom: calc(100% + 4px)`) when near viewport edges.
  - Containers (`.card.menu-open`, `.users-table-wrap.menu-open`, `.table-wrapper.menu-open`) enforce `overflow: visible !important` while active to prevent clipping.
  - Dropdown has solid background (`#111115` in dark mode) to avoid see-through text distraction.

## Projects & Assignments Minimalism & 3-Dots Action Menus
- **Projects Page**:
  - Minimalist layout in both Row List and Card Grid views.
  - Zero emojis in list items or badges. Clean status badges, date ranges, and staffing progress metrics (`X / Y staff`).
  - Contextual 3-dots action menu (`⋮`) on every row/card: View Team, Allocate Staff, Edit Project, Status Toggles (Active, Planned, Completed, Cancelled), and Delete Project.
- **Assignments Page (Live Deployments Board)**:
  - Replaced bulky inline dual buttons (`🔄 Reassign` and `🔓 Release`) with a sleek 3-dots action menu (`⋮`) on every deployment row.
  - Contextual options: Reassign to Project, Release to Bench, View Worker Details, View Project Team.
  - Active Deployments & Deployment History tab filters with real-time text search.
- **Managers Page (Pictorial Visual Oversight & Pie Charts)**:
  - Interactive SVG Donut / Pie Chart showing team distribution across operations leadership with dynamic center hover readout (Manager Name, Staff Count, and % of total workforce).
  - Clickable legend rows that filter the Resources directory directly by the selected manager.
  - High-level capacity distribution bar showing overall workforce allocation (Available, Deployed, Standby).
  - Manager cards with avatar initials, role, contact link, 3-dots action menu (`⋮`), stacked visual capacity bar (Available in green, Deployed in accent cyan, On Leave in amber), and active project deployment tags.
  - Full Team Roster modal (`viewManagerTeam`) showing manager's personnel with status dots, category badges, and quick profile actions.

## Deployment & Hosting
- **Platform**: Vercel (Production)
- **Production URL**: `https://dv-events.vercel.app`
- **Project ID**: `prj_fZh1uFEkg8fieynycqK1KNUmD5Qo`
- **Deploy Command**: `npx vercel --prod --yes`

## Staff ID System
- Every resource gets a unique `staff_id` (e.g. `STF-0001`) automatically on creation. Stored in `resources.staff_id VARCHAR(50) UNIQUE`.
- Existing 20 resources backfilled `STF-0001` through `STF-0020` via direct SQL update.
- Staff ID is displayed: below name in resource list rows and cards (mono font, muted), as a pill badge in the Personnel Profile modal header, and as a read-only display field at the top of the Edit Resource form.
- Staff ID is shown in the Project Operations modal (Personnel Roster table) and in PDF exports.

## Project PDF Export
- `exportProjectPDF(projectId)` fetches full project data and opens a new tab with a printable, professional HTML dossier.
- Report includes: DV Events branding, project status pill, 8-cell meta grid (client, location, lead, start/end dates, duration, active deployed, total personnel), optional notes section, Staffing Requirements table, and full Personnel Deployment Roster (Staff ID, name, role, contact, deployed date, released date, status pill).
- Auto-triggers `window.print()` after 400ms. Works from both the 3-dots menu on project rows/cards and the PDF button inside the Project Operations modal.
- Vercel deployments (serverless) do not store session; PDF data is fetched live from the API.

## Staff Deletion Protection
- `DELETE /api/resources/:id` returns HTTP 409 with a clear message if the staff member has ANY record in `project_assignments` (active or historical) or `current_project_id` is set.
- Frontend `deleteResourceConfirm` surfaces a user-friendly toast: "Cannot delete [Name] — they are deployed or have project history. Set status to Unavailable instead."
- Staff with project history are permanent records; they cannot be deleted to preserve operational audit trails.

## Project Completion — Auto Staff Release
- When a project `status` is set to `completed` or `cancelled` via `PUT /api/projects/:id`, the backend:
  1. Marks all active `project_assignments` (`unassigned_on IS NULL`) with `unassigned_on = CURRENT_TIMESTAMP` and appends `[Auto-released on project completion]` to notes.
  2. Sets `resources SET status = 'available', current_project_id = NULL` for all released staff.
  3. Inserts rows into `availability_log` for audit trail.
- The Project Operations modal displays ALL staff (active + historical) in a unified table with status pills (Active = amber, Completed = green). Completed projects preserve their full roster for historical reference.

## Ponytail Integration (Lazy Senior Dev Mode)
- **Active Philosophy**: "The best code is the code you never wrote." Enforce the Ponytail ladder across all environments:
  1. Does this need to exist at all? (YAGNI)
  2. Already in this codebase? Reuse existing helpers/patterns/styles.
  3. Stdlib does it? Use it.
  4. Native platform feature covers it? Use native HTML/CSS/browser APIs before JS dependencies.
  5. Installed dependency solves it? Use it. Never add new dependencies if a few lines suffice.
  6. Can it be one line? Make it one line.
  7. Minimum working code.
- **Bug Fixes**: Root cause, not symptom. Grep callers and fix at the source.
- **Environments Configured**:
  - Global Antigravity / Gemini CLI (`~/.gemini/config/skills/ponytail*`, `~/.gemini/config/rules/ponytail.md`, `~/.gemini/GEMINI.md`)
  - Global Agent Configs (`~/.config/ponytail/config.json` with `{"defaultMode": "full"}`, `~/.copilot/copilot-instructions.md`, `~/.cursor/hooks.json` & rules, `~/.codex/AGENTS.md`, `~/.config/amp/AGENTS.md`, `~/.config/swival/AGENTS.md`, `~/.kiro/steering/ponytail.md`, `~/.openclaw/skills/`)
  - Shell Environment: `export PONYTAIL_DEFAULT_MODE=full` in `~/.bashrc` and `~/.zshrc`
  - Workspace Rules: `AGENTS.md`, `.agents/rules/ponytail.md`, `.cursor/rules/ponytail.mdc`, `.windsurf/rules/ponytail.md`, `.clinerules/ponytail.md`, `.github/copilot-instructions.md`, `.kiro/steering/ponytail.md`, `.qoder/rules/ponytail.md`


## v3.5 Changes (October 2026) — Simplified 2-Role System & Supabase Transition

### Database
- Migrated from Aiven MySQL to **Supabase PostgreSQL** (`db.idchfpwhkljerfcpvqvl.supabase.co:5432`).
- Query pool adapter in [db.js](file:///home/cipherx7/Work/Websites/Dv%20Events/db.js) wraps `pg` pool to support MySQL `?` placeholder syntax for seamless compatibility with all routes.

### Role Model: Simplified 2-Role System (Zero Granular Matrix Complexity)
- **Viewer / Guest role completely eliminated.**
- Only **TWO** roles exist in the platform:
  1. **Lead** (Super Admin): Full system authority across all modules: user creation/management, workforce, projects, nomination approvals, client agreements, and operations supervisors.
  2. **Manager** (Operations Manager):
     - **Workforce / Resources**: Full access to view, register, edit, and allocate their own resources (`reporting_manager_id = manager_id`).
     - **Projects**: View-only access to active and planned event projects. Cannot create, edit, or delete projects.
     - **Clients**: Read-only directory access to corporate client accounts. Cannot add or edit client records.
     - **Nominations**: Can nominate their staff for projects; approval/rejection is reserved strictly for Lead.
     - **Managers Tab**: Hidden and restricted (`view_managers: false`).
     - **Attendance**: Real-time GPS attendance access scoped exclusively to their own team resources.
     - **User Management**: Restricted (`manage_users: false`).
- **User Creation UX**: Removed the 13-switch permissions matrix, category modules, presets, and sliders from the user form. User creation simply specifies Name, Email, Password, Organizational Role (Lead or Manager), and optional Linked Manager profile. All permissions are automatically assigned and enforced based on the chosen role.

### Manager Visibility Enforcement
- Managers can ONLY see/edit resources where `reporting_manager_id = their own manager_id`.
- Enforced at **SQL query level** in `routes/resources.js`, not just frontend.

### New Workflow States (Resource Status)
`available → nominated → pending_approval → confirmed → deployed → released`
Plus legacy: `assigned`, `on_leave`, `unavailable`

### New Routes
- `GET/POST/PUT/DELETE /api/nominations` — nomination workflow
- `GET/POST/PUT /api/attendance` — GPS-verified attendance with haversine distance
- `GET/POST/PUT /api/payments` — compensation tracking per resource/project

### New DB Tables: `nominations`, `attendance`, `payments`
### New Project Fields: `start_time`, `end_time`, `required_manpower`, `geofence_lat/lng/radius_m`
### New Resource Fields: `dob`, `gender`, `email`, `address`, `photo_path`, `id_type`, `id_number`

### Navigation (Role-Aware)
- `.nav-lead-only` hidden from managers, `.nav-manager-only` hidden from leads.
- Lead: "All Resources" | Manager: "My Resources" (same page, different backend scope).
- Lead dashboard: org-wide stats + pending nominations/payments count.
- Manager dashboard: own resource counts + my nominations + my projects.

### CSS/JS Version: v=3.0
### Migration: `node migrate-v2.js` (safe to re-run)

### Module 3: Resource / Manpower Inventory (Completed)
- **Configurable Profile Information**:
  - Full Name (`name`), Date of Birth / Age (`dob` with dynamic age calculation `calculateAge`), Gender (`gender`: male/female/other), Phone number (`contact_info`), Email (`email`), Address (`address`), Profile Photo (`photo_path`), Availability / Status (`status`), Manager / Owner (`reporting_manager_id`), Skills & Category (`skills`, `category_id`), Identification Documents (`id_type`, `id_number`), Operational Notes (`notes`), Created Date (`created_at`).
- **Complete Status Lifecycle**:
  - `Available`, `Nominated`, `Pending Approval`, `Confirmed`, `Deployed`, `Released`.
  - Compatible with legacy `assigned`, `on_leave`, `unavailable`.
  - Filter pills dynamically show live counts for all statuses.
- **Single Active Project Assignment Rule**:
  - Strictly enforced in `routes/assignments.js` at `/assign` and `/reassign`.
  - Overlapping active project assignments for the same person are prevented (HTTP 409).
  - Status automatically transitions to `deployed` on assignment, and to `released` upon completion/release back to the manpower pool.
- **Independent Manpower Pool**:
  - Resources belong to the organization's manpower pool and remain independent from any individual project.
  - Can be assigned, atomically reassigned between projects, or released to bench.

### Payments & Compensation (Integrated into Resource Profile)
- **Placement**: Removed standalone "Payments" page and sidebar navigation item as per user request.
- **Resource Person Ownership**: Compensation settings (`rate_type`, `rate_amount`, `bank_details`, `upi_id`) and payment transaction history are located directly inside each resource's profile (`viewResource` and `openResourceModal`).
- **Profile Actions**: Leads can log payments for a resource directly from their profile modal, view their complete earnings & settlement history, and mark pending payments as Paid with transaction reference tracking.

### Resource Bulk Import & Google Drive Photo Conversion (Completed)
- **Dedicated Page**:
  - Full-view dedicated import interface at `#page-resource-import` with route `resource-import` (`navigate('resource-import')`).
  - Accessible via "Import Excel / CSV" button in the Resources Directory header.
  - Adheres to "One page = one purpose" and AMOLED dark / light design tokens.
- **3-Step Import Wizard**:
  - **Step 1 (Source)**: Drag-and-drop zone for Excel (`.xlsx`, `.xls`) and CSV/TSV (`.csv`, `.tsv`), sheet selector for multi-sheet workbooks, and clipboard paste textarea. Includes sample `.csv` and `.xlsx` template download buttons.
  - **Step 2 (Property Mapping)**: Interactive table showing detected sheet headers, sample row values, and target field dropdowns with smart auto-detection for names, phone, age, DOB, gender, photo, category, rate, IDs, and notes. Includes defaults for unmapped fields (Status, Category, Manager).
  - **Step 3 (Preview & Execute)**: Live preview table with rendered avatar thumbnails, Age to estimated DOB conversion, validation indicators, and 1-click batch import.
  - **Step 4 (Summary)**: Confirmation summary showing successfully imported counts and direct links to Resources directory.
- **Google Drive Photo Normalization**:
  - `convertGoogleDriveUrl(url)` extracts Google Drive file IDs from share links (`/file/d/ID/view`, `id=ID`, `export=view`) and transforms them into direct CDN embed URLs (`https://lh3.googleusercontent.com/d/ID`).
  - Active in both frontend preview and backend persistence (`POST /api/resources/bulk`, `POST /api/resources`, `PUT /api/resources/:id`).
- **Backend API**:
  - `POST /api/resources/bulk`: Transactional bulk insertion handling category resolution (by name or ID), age-to-DOB estimation, gender normalization, role boundaries (Managers strictly import to their own ID), automatic `STF-XXXX` ID generation, and availability audit logging.

### Resource Bulk Deployment & Dynamic Filter System (Completed)
- **Single Resource Assignment Modal (No Worker Dropdown)**:
  - When opening the assignment popup from a specific worker's row, card, or detail modal (`openAssignModal(workerId)`), the worker `<select>` dropdown is omitted.
  - The modal dynamically titles `⚡ Deploy [Worker Name] to Project` and renders a dedicated worker card (avatar/photo, name, staff ID, role badge, current project status) with a hidden input `<input type="hidden" id="assign-resource" value="...">`.
  - Only the **Target Project Deployment** dropdown is presented to the user.
  - If the worker is already deployed to another project, the system performs an atomic project reassignment (`/assignments/reassign`) seamlessly without double-booking errors.
  - When opened generally (e.g., Quick Allocate with no worker preselected), the worker dropdown remains available.

- **Bulk Resource Assignment / Deployment**:
  - Checkboxes added to each resource in both streamlined Row List and Card Grid views (`.resource-select-cb`).
  - Master "Select All" checkbox in the toolbar with live count of filtered personnel.
  - AMOLED Floating Bulk Action Bar (`.bulk-action-bar`) appears at the bottom of the viewport as soon as personnel are selected, displaying selection count, "⚡ Bulk Deploy to Project" button, and "Clear" button.
  - Dedicated `#bulk-assign-modal` lists all selected personnel, offers target project selection, deploying manager, and deployment notes.
  - Backend `POST /api/assignments/bulk-assign`: Transactional bulk deployment with project validation, atomic release from previous projects, assignment creation, status updates to `deployed`, and audit logging to `availability_log`.

- **Dynamic Filter System ("＋ Add Filter")**:
  - Filter bar features an **"＋ Add Filter"** button with an animated popover menu (`#add-filter-popover`) containing criteria: **Category**, **Reporting Manager** (leads only), **Age Range**, **Gender**, and **Daily Rate**.
  - Default filter bar keeps only Search, "+ Add Filter", and View Mode switchers for maximum horizontal cleanliness.
  - Adding criteria displays a sleek, harmonized 38px dynamic filter chip (e.g. `🏷️ Category:`, `👔 Manager:`, `🎂 Age:`, `👤 Gender:`, `💰 Rate:`) with proportionate native dropdown and an `✕` remove button.
  - Removing a filter chip immediately clears its value and restores the active personnel pool.

- **Unified Add Resource Action**:
  - Single primary dropdown button **"Add Resource ▾"** in the Resources header with 2 direct options:
    1. **Add Manually**: Opens modal for single personnel record creation.
    2. **Import Excel / CSV**: Navigates to dedicated 3-step bulk spreadsheet import wizard (`#resource-import`).

- **SPA Routing & Page Refresh Persistence**:
  - `navigate(page)` stores current route in `localStorage` (`dv_active_page`) and URL hash (`#resources`, `#projects`, etc.).
  - Browser refresh or direct bookmarking preserves the active page instead of resetting to dashboard.
  - Listens to `hashchange` for native browser Back/Forward navigation.

## Supabase PostgreSQL Migration (October 2026)
- **Database Engine**: PostgreSQL 17 (Supabase)
- **Supabase URL**: `https://idchfpwhkljerfcpvqvl.supabase.co`
- **Database Host**: `db.idchfpwhkljerfcpvqvl.supabase.co` (Port: `5432`, Database: `postgres`, User: `dvevents`)
- **Publishable Key**: `sb_publishable_4_l86iWh5eFBq_6yQQfU3g_hcE5yIV-`
- **Driver**: Node `pg` (node-postgres connection pool with auto query adaptation, placeholder conversion, and transaction support)
- **Aiven Removal**: Removed Aiven MySQL credentials from `.env`, uninstalled `mysql2` package, removed `aiven` MCP server from `~/.gemini/config/mcp_config.json`.
- **Tables Active in Supabase (12/12)**:
  1. `resource_categories` (10 rows)
  2. `managers` (3 rows)
  3. `clients` (3 rows)
  4. `projects` (3 rows)
  5. `resources` (20 rows)
  6. `project_requirements` (14 rows)
  7. `project_assignments` (13 rows)
  8. `availability_log` (19 rows)
  9. `users` (7 rows)
  10. `nominations` (0 rows)
  11. `attendance` (0 rows)
  12. `payments` (0 rows)
- **Verification**: 17/17 endpoints (Auth, Dashboard, Analytics, Resources, Projects, Assignments, Clients, Managers, Users, Nominations, Attendance, Payments) tested and verified with 200 OK.

## Project Management & Dedicated Project Form Page (October 2026)
- **Dedicated Project Form Page (No Modals)**:
  - Project creation and editing now occur on a dedicated full page (`#page-project-form` / `navigate('project-form')`) instead of a narrow popup modal.
  - Follows open-page layout standard: "Back to Projects" button placed directly above the title, top border line (`border-top: 1px solid var(--border)`), top-right "Cancel" button, and bottom-right "Create Project" / "Save Changes" button.
- **Manager-Agnostic Project Creation**:
  - Assigning a project manager is **optional** (`project_manager_id` can be null). Leads can create projects without assigning any manager.
- **Event Information & POC Fields**:
  - Basic Info: Project Name, Corporate Client, Venue / Location, Status.
  - Event Schedule: Event Start Date & End Date, Event Shift Times (start/end time).
  - Deadline: Confirmation / Nomination Deadline date.
  - POC Details: POC Contact Name, POC Phone Number, POC Email.
  - Briefing: Event Notes & Briefing Instructions textarea.
- **Staffing Resource Quotas**:
  - Interactive quota stepper grid (`.project-req-grid`) for each resource category (e.g. Lead Hostess, Promoters, Supervisors, Brand Ambassadors).
  - Live calculation badge updating total required manpower in real-time.
  - Automatically persists to `project_requirements` via PostgreSQL `ON CONFLICT (project_id, category_id) DO UPDATE SET quantity_required = EXCLUDED.quantity_required`.
- **Database Schema Updates**:
  - Added `deadline DATE`, `poc_name TEXT`, `poc_phone TEXT`, `poc_email TEXT` to `projects` table on Supabase PostgreSQL.
- **Manager Account Dashboard & Directory Permissions**:
  - Fixed manager dashboard `GET /api/dashboard` to compute and return `project_stats` (active, planned, completed, cancelled counts), category breakdown, and project counts so manager dashboards never crash on undefined stats.
  - Changed `GET /api/managers` permission requirement from `requirePermission('view_managers')` to standard `authenticate` so managers can view the manager directory and filter dropdowns without encountering 403 Forbidden errors.

## Staffing Deficits, Project Form & Import Wizard Polish (October 2026)
- **Project-Wise Staffing Deficit Oversight (Manager & Lead Dashboards)**:
  - Both Manager and Lead dashboards query all active/planned projects and compute real-time manpower deficits: `deficit = Math.max(0, total_required - assigned_count)`.
  - Detailed category-level gaps breakdown (`category_gaps`: category name, required, assigned, remaining gap).
  - Dedicated **"Staffing Deficit Alert (Project-Wise)"** card on dashboard listing each project with unfilled headcount, client, location, date/deadline, and missing role badges.
  - Direct **"⚡ Allocate"** button embedded in each deficit row and deployment card (`openAssignModal(null, p.id)`) allowing operations managers to deploy staff immediately with the target project pre-selected.
- **Spacious Minimal Structure for Create Project Page**:
  - Encapsulated within `.project-form-wrap` (`max-width: 980px; margin: 0 auto;`).
  - Input fields grouped in `.project-form-grid` with generous spacing (`gap: 28px 32px`), zero awkward margin stacking, and clean 44px input boxes.
  - Minimal section dividers (`.project-form-section`) with clean hierarchy: Event & Client Overview, Schedule & Deadlines, POC Details, Staffing Quotas, and Briefing Notes.
- **Spacious Minimal Resource Import Wizard**:
  - Increased breathing room: `.import-container` (`max-width: 1180px`), `.import-layout` with `gap: 36px`.
  - Spacious minimalist dropzone (`padding: 56px 32px`) with subtle borders and clean typography.
  - Airy vertical stepper in `.import-sidebar` with 40px connector lines and 34px sleek status circles.
  - Streamlined Google Drive photo import helper and comfortable action buttons.

## Crew Registration Dataset, Rich Cards/Rows & Import Auto-Detection (October 2026)
- **Full Crew Data Schema (Google Form Alignment)**:
  - Database schema (`resources` table in Supabase PostgreSQL) updated with 8 dedicated columns:
    1. `alternate_phone TEXT`: Emergency contact number.
    2. `age INTEGER`: Age in years (validated and indexed).
    3. `zone TEXT`: Area of Residence in Pune (e.g. PCMC / Nigdi, Camp / Swargate / Deccan, Viman Nagar / Kharadi, Wakad / Baner / Aundh, Other).
    4. `height TEXT`: Height measurement (in cm or ft/inches).
    5. `languages TEXT`: Languages confidently spoken on-ground (e.g. Marathi, Hindi, English).
    6. `availability TEXT`: Weekend and overall availability (e.g. Weekdays + Weekends, Available on select weekends, College student).
    7. `experience TEXT`: Past event experience narrative.
    8. `opted_roles TEXT`: Crew roles opted for during registration (multi-role string).
  - Seeded missing categories (`Volunteer / Crowd Facilitation`, `Production & Logistics`, `Host / Emcee`, `Catering & Hospitality`, `Photography & Videography`) and squad managers (`Vijay`, `Vidhi`).
- **Dynamic Resource Filters & Extended Search**:
  - Filter bar popover ("＋ Add Filter") updated with dynamic chips for **📍 Pune Zone** and **🗓️ Weekend Availability**.
  - Real-time search query matches across 11 fields: Name, WhatsApp Phone, Emergency Phone, Email, Staff ID, ID Number, Skills, Opted Roles, Pune Zone, Languages, Past Experience, Current Project Name, and Project Venue.
- **Smart 1-Click CSV/Excel Auto-Detection**:
  - Auto-detects all 17 Google Form registration columns without requiring manual user mapping.
  - Correctly handles multiline text inside double-quoted cells (e.g. multiline past experience).
  - Automatically matches first opted role to system categories, squad manager names to manager profiles, and converts Google Drive share URLs (`drive.google.com/open?id=...`) to direct fast image URLs (`lh3.googleusercontent.com/d/...`).
- **Rich Card & Row Operations Views**:
  - **Card View**: Displays full crew operational card:
    - High-res avatar photo (or initials fallback with status border).
    - Status pill badge, Full Legal Name, and Staff ID tag.
    - Demographics bar: Age, Gender, Height, and Pune Zone tag (`📍 PCMC / Nigdi`, etc.).
    - Opted Roles pills box with subtle badges.
    - Dual click-to-contact links: 💬 WhatsApp (+91 direct wa.me link) & 🆘 Emergency Contact (`tel:` call link).
    - Languages chip list and Availability badge.
    - Past Event Experience snippet (quoted, expandable in dossier).
    - Quick action buttons (View Dossier `👁️`, Assign/Deploy `⚡`, 3-dots menu `⋮`).
  - **Row View**: Streamlined 5-column grid:
    - Column 1: Staff checkbox, Avatar, Name, Staff ID, Age/Gender.
    - Column 2: Pune Zone tag + Opted Role pills.
    - Column 3: WhatsApp + Emergency Phone links.
    - Column 4: Availability schedule + Languages spoken.
    - Column 5: Status badge + Quick deploy button + 3-dots action menu.
- **Resource Dossier Modal (`viewResource(id)`) & Add/Edit Resource Form**:
  - Upgraded with full personal profile, physical details, emergency contact, Pune zone datalist, opted roles, language tags, and past experience history.

## Multi-Select Filters, Manager Auto-Assignment, Duplicate Prevention & Visual Simplifications (October 2026)
- **Multi-Select Dynamic Filters**:
  - Manager, Category, Pune Zone, and Weekend Availability filters in `#add-filter-popover` support multi-selection with checkboxes, Select All, and Clear controls.
  - Enabled multi-select querying on the backend (`GET /api/resources?manager_id=4,5&zone=...`) via comma-separated query parameters.
  - Removed `isLead()` gate on the Manager filter so all authenticated users (Managers & Leads) can view and filter by manager.
- **Automatic Manager Profile Synchronization & Resource Scoping**:
  - Automatically ensures every manager user (including Vidhi Belani and Super Admin) has a linked record in `managers` upon login and user creation.
  - When creating a resource (`POST /api/resources`), if `reporting_manager_id` is omitted, it automatically defaults to `req.user.manager_id`.
  - Super Admin is also a manager and is assigned resources when creating them without another manager selected.
  - Managers immediately see the resources registered under their manager profile.
- **Resource Row List & Card View Simplifications**:
  - **Resource List Rows**: Streamlined to show only Name, Category badge, Primary WhatsApp contact link, and Action menu. Removed `staff_id`, `area` (zone), and `availability` schedule text. Removed alternate emergency phone from the row view.
  - **Availability Indicator**: Completely removed the "Available" text badge from both row list and card view. Availability is indicated strictly by the green status dot on the profile avatar. Non-available statuses (e.g. Deployed, Pending Approval) retain their status pills.
- **Filter Dropdown Stacking Context**:
  - Raised `.filter-bar` to `z-index: 80` and multi-filter popovers to `z-index: 99999 !important;`.
  - Configured `.res-list`, `.res-grid`, and `.res-row` with `z-index: 1` so dropdowns and popovers float smoothly above all list rows.
- **Projects Page Cleanliness**:
  - Completely removed `Lead: assigned/unassigned` and the lead metadata row from both project list items and project cards.
- **Duplicate Resource Prevention**:
  - `POST /api/resources` validates phone number (normalizing to last 10 digits) and email ID against existing records, returning HTTP 409 conflict if a duplicate is found.
  - `POST /api/resources/bulk` pre-checks the batch against existing database records and prevents duplicate entries during CSV/Excel import.
