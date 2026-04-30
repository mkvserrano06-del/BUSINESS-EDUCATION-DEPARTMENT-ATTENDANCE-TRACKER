# BUSINESS ED DEPT ATTENDANCE PWA - MASTER PROMPT

## Project Overview
Design and develop a scalable Progressive Web App (PWA) system called **BUSINESS ED DEPT ATTENDANCE**.

The system must use:
- **React** as the main framework
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **Supabase** as the backend platform

It should follow a clean, modular, and maintainable architecture, ensuring:
- Reusable components
- Responsive design
- Accessibility compliance
- Optimized performance
- Full PWA capabilities
- Secure backend access through Supabase Auth, Row Level Security, and typed database APIs

---

## Project Goal
Create a modern attendance monitoring system for the **Business Education Department** that enables instructors, coordinators, and administrators to:
- Record attendance
- Track student presence
- Manage class sessions
- Analyze attendance trends
- Access the system reliably on desktop and mobile devices, including limited offline usage

---

## Core Features

### 1. User Authentication and Roles
- Use **Supabase Auth** for secure login, logout, password reset, and session persistence.
- Support the following roles:
  - Admin
  - Instructor
  - Department Coordinator
  - Optional Student Viewer
- Store role and profile information in a `profiles` table linked to `auth.users`.
- Implement role-based access control in both:
  - Frontend route guards and UI permissions
  - Supabase Row Level Security policies
- Restrict sensitive actions:
  - Only admins can manage users, roles, programs, and global settings.
  - Coordinators can manage department-level classes, subjects, reports, and student records.
  - Instructors can manage only assigned classes and attendance sessions.
  - Student viewers can only view their own attendance records if enabled.

---

### 2. Dashboard
- Attendance summary cards
- Total students count
- Present, absent, late, and excused statistics
- Daily, weekly, monthly overview
- Quick attendance actions
- Role-aware dashboard views:
  - Admin: system-wide analytics
  - Coordinator: department/program analytics
  - Instructor: assigned class analytics
  - Student Viewer: personal attendance summary
- Fetch dashboard data from Supabase views or RPC functions for consistent reporting.

---

### 3. Student Management
- Add, edit, archive, and delete students based on role permissions.
- Import students by program, year level, section, subject, or CSV file.
- Search, filter, sort, and paginate student records.
- Student profile with:
  - Basic information
  - Program/year/section
  - Enrollment history
  - Attendance history
  - Attendance percentage
  - At-risk status
- Use Supabase Storage for optional student profile photos or import templates.

---

### 4. Class and Subject Management
- Create and manage subjects.
- Assign instructors to subjects/classes.
- Organize classes by:
  - Program
  - Year level
  - Section
  - Semester
  - School year
  - Schedule
- View attendance per class.
- Prevent duplicate active class assignments for the same subject, section, semester, and school year.

---

### 5. Attendance Recording
- Create date/time-based attendance sessions.
- Support status options:
  - Present
  - Absent
  - Late
  - Excused
- Support manual marking and bulk actions.
- Include remarks field per attendance record.
- Prevent duplicate attendance records for the same student and session.
- Track metadata:
  - Recorded by
  - Recorded at
  - Updated by
  - Updated at
  - Sync status for offline-created records
- Optional attendance methods:
  - QR code attendance
  - PIN-based attendance
- For QR or PIN attendance, validate session status, expiration time, and student eligibility before saving.

---

### 6. Reports and Analytics
- Generate reports by:
  - Student
  - Class
  - Subject
  - Instructor
  - Program
  - Section
  - Date range
- Export reports as:
  - PDF
  - CSV
  - Excel
- Calculate:
  - Attendance percentage
  - Absence count
  - Late count
  - Excused count
  - At-risk students based on configurable thresholds
- Use charts and graphs through Recharts.
- Use Supabase database views or RPC functions for aggregate queries to avoid duplicating reporting logic in the frontend.

---

### 7. Notifications
- Low attendance alerts
- Session reminders
- Optional email or in-app notifications
- Store in-app notifications in a `notifications` table.
- Mark notifications as read/unread.
- Use Supabase Realtime for live notification updates where appropriate.
- Optional future enhancement: Supabase Edge Functions for scheduled alerts and email dispatch.

---

## Supabase Backend Requirements

### 1. Supabase Services
Use the following Supabase services:
- **Supabase Auth** for authentication and session management
- **Postgres Database** for system data
- **Row Level Security (RLS)** for backend authorization
- **Supabase Storage** for file uploads such as profile photos, import files, and report exports
- **Supabase Realtime** for optional live dashboard, attendance, and notification updates
- **Supabase Edge Functions** for optional server-side tasks such as scheduled alerts, report generation, QR validation, or email notifications

---

### 2. Suggested Database Tables
Design the database with normalized tables and UUID primary keys.

Recommended core tables:
- `profiles`
  - `id` UUID primary key, references `auth.users(id)`
  - `full_name`
  - `email`
  - `role`
  - `department`
  - `avatar_url`
  - `created_at`
  - `updated_at`

- `programs`
  - `id`
  - `code`
  - `name`
  - `department`
  - `is_active`

- `sections`
  - `id`
  - `program_id`
  - `year_level`
  - `section_name`
  - `school_year`
  - `is_active`

- `students`
  - `id`
  - `student_number`
  - `first_name`
  - `middle_name`
  - `last_name`
  - `email`
  - `program_id`
  - `section_id`
  - `year_level`
  - `status`
  - `created_at`
  - `updated_at`

- `subjects`
  - `id`
  - `subject_code`
  - `subject_name`
  - `units`
  - `description`
  - `is_active`

- `classes`
  - `id`
  - `subject_id`
  - `section_id`
  - `instructor_id`
  - `semester`
  - `school_year`
  - `schedule`
  - `room`
  - `is_active`

- `class_enrollments`
  - `id`
  - `class_id`
  - `student_id`
  - `enrolled_at`
  - `status`

- `attendance_sessions`
  - `id`
  - `class_id`
  - `session_date`
  - `start_time`
  - `end_time`
  - `status`
  - `created_by`
  - `created_at`

- `attendance_records`
  - `id`
  - `session_id`
  - `student_id`
  - `status`
  - `remarks`
  - `recorded_by`
  - `recorded_at`
  - `updated_by`
  - `updated_at`

- `notifications`
  - `id`
  - `user_id`
  - `title`
  - `message`
  - `type`
  - `is_read`
  - `created_at`

- `audit_logs`
  - `id`
  - `actor_id`
  - `action`
  - `entity_type`
  - `entity_id`
  - `metadata`
  - `created_at`

---

### 3. Database Rules and Constraints
- Enable Row Level Security on all application tables.
- Add foreign key constraints for relational integrity.
- Add unique constraints where needed:
  - Unique `student_number`
  - Unique `subject_code`
  - Unique active class per subject, section, semester, and school year
  - Unique attendance record per `session_id` and `student_id`
- Add indexes for common filters:
  - `students.student_number`
  - `students.section_id`
  - `classes.instructor_id`
  - `classes.section_id`
  - `attendance_sessions.class_id`
  - `attendance_sessions.session_date`
  - `attendance_records.session_id`
  - `attendance_records.student_id`
- Prefer soft archive/deactivation for academic records instead of hard deletion when historical reports depend on them.

---

### 4. Row Level Security Policy Expectations
Implement RLS policies that enforce:
- Admins can manage all records.
- Coordinators can manage department-level academic records and reports.
- Instructors can only view and update classes assigned to them.
- Instructors can only create or modify attendance sessions for assigned classes.
- Students can only view their own attendance records if student access is enabled.
- Authenticated users can read their own profile.
- Users cannot escalate their own role from the frontend.

Use helper SQL functions such as:
- `get_current_user_role()`
- `is_admin()`
- `is_coordinator()`
- `is_assigned_instructor(class_id)`

---

### 5. Frontend Supabase Integration
- Create a centralized Supabase client in `src/lib/supabase.ts`.
- Store Supabase types in `src/types/supabase.ts` or generate them from the database schema.
- Keep all database queries in dedicated service files, not directly inside UI components.
- Suggested service modules:
  - `auth.service.ts`
  - `profiles.service.ts`
  - `students.service.ts`
  - `classes.service.ts`
  - `attendance.service.ts`
  - `reports.service.ts`
  - `notifications.service.ts`
- Use React Query or a similar server-state library for Supabase data fetching, caching, mutations, and invalidation.
- Validate form input with React Hook Form and Zod before sending data to Supabase.
- Handle Supabase errors with user-friendly messages and developer-friendly logs.

---

### 6. Offline and Sync Strategy
- Use IndexedDB for offline attendance drafts and pending sync records.
- Allow instructors to record attendance offline for previously loaded assigned classes.
- Queue offline attendance changes locally with:
  - Temporary local ID
  - Target Supabase table
  - Operation type
  - Payload
  - Created timestamp
  - Retry count
  - Sync status
- When online, sync pending records to Supabase.
- Resolve conflicts using predictable rules:
  - Prevent duplicate attendance records by `session_id` and `student_id`.
  - Prefer latest valid update only when the user has permission.
  - Surface unresolved conflicts to the user instead of silently overwriting data.
- Clearly show sync states in the UI:
  - Saved locally
  - Syncing
  - Synced
  - Failed

---

## PWA Requirements
- Installable on desktop and mobile.
- Offline support.
- Service worker.
- Web app manifest.
- App icons.
- Offline fallback page.
- Cache essential assets.
- Cache recently used assigned classes and student lists for offline attendance.
- Background sync for attendance data where supported.
- Do not cache private data in a way that bypasses authentication or leaks data between users.

---

## Technical Requirements
- React with a modular architecture.
- Tailwind CSS.
- shadcn/ui components.
- React Router.
- Zustand or Context API for lightweight local UI state.
- React Query for Supabase server state.
- React Hook Form and Zod validation.
- TanStack Table.
- Recharts for analytics.
- IndexedDB for offline data.
- Supabase client SDK.
- TypeScript is strongly recommended.
- API/service-ready architecture with clean separation between UI, data access, validation, and domain logic.

---

## Recommended Folder Structure

```txt
src/
  app/
    routes/
    providers/
    layouts/
  components/
    ui/
    forms/
    tables/
    charts/
    attendance/
    students/
    classes/
  features/
    auth/
    dashboard/
    students/
    classes/
    attendance/
    reports/
    notifications/
  hooks/
  lib/
    supabase.ts
    query-client.ts
    utils.ts
  services/
    auth.service.ts
    profiles.service.ts
    students.service.ts
    classes.service.ts
    attendance.service.ts
    reports.service.ts
    notifications.service.ts
  stores/
  schemas/
  types/
    supabase.ts
    domain.ts
  offline/
    db.ts
    sync-queue.ts
    sync-worker.ts
  assets/
  styles/
```

Optional Supabase project structure:

```txt
supabase/
  migrations/
  functions/
  seed.sql
```

---

## UI and UX Requirements
- Use a clean academic/admin dashboard style.
- Prioritize clarity, fast scanning, and efficient workflows.
- Use shadcn/ui for consistent forms, dialogs, tables, tabs, cards, badges, dropdowns, and toasts.
- Use clear status badges for Present, Absent, Late, and Excused.
- Provide loading, empty, error, and offline states for all major screens.
- Support mobile-first attendance marking.
- Include confirmation dialogs for destructive actions.
- Use optimistic UI only when rollback behavior is implemented.

---

## Security Requirements
- Never expose the Supabase service role key in the frontend.
- Use only the public anon key in the React app.
- Enforce authorization in Supabase RLS, not only in frontend checks.
- Validate all user input.
- Sanitize imported CSV data before insertion.
- Use secure file upload rules for Supabase Storage buckets.
- Keep audit logs for sensitive changes:
  - Role changes
  - Attendance edits
  - Student imports
  - Class assignment changes
- Prevent users from changing their role, department, or protected profile fields directly from the client.

---

## Development Deliverables
- React PWA frontend.
- Supabase schema migrations.
- RLS policies.
- Seed data for testing roles, programs, sections, subjects, classes, and students.
- Typed Supabase client integration.
- Offline attendance sync implementation.
- Reports and export functionality.
- Basic test coverage for critical logic:
  - Role guards
  - Attendance validation
  - Sync queue behavior
  - Report calculations

---

## Acceptance Criteria
- Users can sign in and see role-appropriate screens.
- Admins and coordinators can manage academic setup data.
- Instructors can view only assigned classes.
- Instructors can create attendance sessions and record student attendance.
- Attendance records are protected by Supabase RLS.
- Dashboard and reports show accurate attendance statistics.
- The app can be installed as a PWA.
- Recently loaded class rosters can be used for offline attendance.
- Offline attendance records sync to Supabase when connectivity returns.
- Reports can be filtered and exported.
- The UI remains responsive and usable on mobile, tablet, and desktop.
