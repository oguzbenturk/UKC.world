# Team Page: Instructor Detail Drawer & Admin Configuration

**Date:** 2026-04-10
**Status:** Approved

## Overview

Enhance the public Team page with a slide-out drawer showing instructor details when a card is clicked, and add an admin "Team" settings tab where the academy owner can configure visibility, order, featured status, custom bios, field visibility, and the booking link.

## Data Model

### `team_member_settings` table

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| instructor_id | integer FK → users(id), unique | References the instructor |
| visible | boolean, default true | Show on public team page |
| display_order | integer, default 0 | Sort position (lower = first) |
| featured | boolean, default false | Pin to top with "Featured" badge |
| custom_bio | text, nullable | Override public bio (null = use instructor's own bio) |
| created_at | timestamp, default now() | |
| updated_at | timestamp, default now() | |

### `team_global_settings` table

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| visible_fields | jsonb, default '["bio","languages","specializations","experience"]' | Fields shown on public team page |
| booking_link_enabled | boolean, default true | Show "Book a Lesson" CTA |
| updated_at | timestamp, default now() | |

Single row table — only one row exists. Upsert on save.

## API Endpoints

### Admin endpoints (auth required, admin/manager role)

- **GET `/api/team-settings`** — Returns all `team_member_settings` rows joined with instructor name/avatar, plus global settings.
- **PUT `/api/team-settings`** — Bulk update: accepts `{ members: [{ instructor_id, visible, display_order, featured, custom_bio }], global: { visible_fields, booking_link_enabled } }`. Upserts all rows in a transaction.

### Enhanced existing endpoint

- **GET `/api/instructors`** (public) — Already exists. Enhanced to:
  - Filter out instructors where `team_member_settings.visible = false`
  - Order by `team_member_settings.display_order` (featured first, then by order)
  - Include `custom_bio`, `featured`, and `visible_fields` from global settings
  - Strip fields not in `visible_fields` from the response

## Public Team Page — Instructor Detail Drawer

### Trigger
Clicking any instructor card on `/community/team` opens the drawer.

### Component
Ant Design `<Drawer>` component, sliding from the right.
- Width: 480px on desktop, full-width on mobile
- Dark-themed to match existing team page (glassmorphism, gradient overlays)

### Drawer Content (top to bottom)

1. **Hero photo** — Large profile image with gradient overlay. Falls back to initials if no image.
2. **Name + Featured badge** — Instructor name with optional "Featured" tag if `featured = true`.
3. **Bio** — Full text. Uses `custom_bio` if set by admin, otherwise instructor's own `bio` field.
4. **Specializations** — Discipline tags rendered as styled pills/badges. Only shown if "specializations" is in `visible_fields`.
5. **Languages** — Language pills. Only shown if "languages" is in `visible_fields`.
6. **Experience** — "With us since 2023" derived from `created_at`. Only shown if "experience" is in `visible_fields`.
7. **Book a Lesson CTA** — Prominent button at drawer bottom. If user is not logged in, redirects to login page, then navigates to Academy landing page after authentication. Hidden entirely if `booking_link_enabled = false`.

### Field Filtering
Only fields present in `team_global_settings.visible_fields` are rendered. If admin removes "bio" from visible fields, the bio section is skipped.

## Admin Settings — Team Tab

### Location
New collapsible section "Team" in `src/features/dashboard/pages/Settings.jsx`, added alongside existing sections (Forecast, Finance, Calendar, Currency, Exchange Rates, Booking Defaults, Profile, Change Password).

### Layout

**Top Section: Global Settings**
- Toggle switch: "Show Book a Lesson button" (maps to `booking_link_enabled`)
- Checkbox group: "Visible fields on public team page" with options: Bio, Specializations, Languages, Experience (maps to `visible_fields` array)

**Bottom Section: Instructor List**
- Draggable/sortable list of all instructors
- Each row contains:
  - Drag handle (for reordering)
  - Avatar thumbnail + instructor name
  - Visibility toggle (eye icon, maps to `visible`)
  - Featured star toggle (maps to `featured`)
  - "Edit bio" button → opens a modal with a textarea to set/clear `custom_bio`
- "Save" button at the bottom — sends all settings in one PUT request

### Auto-initialization
When admin first opens the Team tab and no `team_member_settings` rows exist, the frontend auto-populates from the current instructor list (all visible, alphabetical order, none featured, no custom bios).

## Files to Create/Modify

### Backend
- **New migration:** `backend/db/migrations/XXX_create_team_settings_tables.sql`
- **New route:** `backend/routes/teamSettings.js`
- **New service:** `backend/services/teamSettingsService.js`
- **Modify:** `backend/routes/instructors.js` — enhance GET `/instructors` to respect team settings
- **Modify:** `backend/server.js` — register new route

### Frontend
- **New component:** `src/features/community/components/InstructorDetailDrawer.jsx`
- **New component:** `src/features/dashboard/components/TeamSettingsSection.jsx`
- **Modify:** `src/features/community/pages/TeamPage.jsx` — add click handler, render drawer
- **Modify:** `src/features/dashboard/pages/Settings.jsx` — add Team collapsible section

## Design Decisions

- **Drawer over modal/page:** Keeps browsing flow smooth, user can quickly check multiple instructors without navigating away.
- **Separate tables over JSON column:** Proper relational design with referential integrity, easier to query and extend.
- **Bulk save over per-field save:** Admin configures everything then saves once, reducing API calls and avoiding partial state.
- **Custom bio as override:** Falls back to instructor's own bio when null, so admin only needs to intervene when they want a different public-facing text.
