# Team Page: Instructor Detail Drawer & Admin Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-out detail drawer to the public Team page when clicking instructor cards, and an admin "Team" settings tab to configure visibility, order, featured status, custom bios, field visibility, and booking link toggle.

**Architecture:** Two new database tables (`team_member_settings`, `team_global_settings`) store per-instructor and global config. A new backend route serves and saves this config. The public `/instructors` endpoint is enhanced to respect these settings. A new `InstructorDetailDrawer` component renders in the Team page, and a new `TeamSettingsSection` component plugs into the existing Settings page.

**Tech Stack:** PostgreSQL, Express, React 18, Ant Design, TailwindCSS, TanStack React Query

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `backend/db/migrations/234_create_team_settings.sql` | Creates `team_member_settings` and `team_global_settings` tables |
| `backend/routes/teamSettings.js` | Admin API endpoints for reading/saving team config |
| `backend/services/teamSettingsService.js` | Business logic for team settings CRUD |
| `src/features/community/components/InstructorDetailDrawer.jsx` | Slide-out drawer showing instructor details on the public Team page |
| `src/features/dashboard/components/TeamSettingsSection.jsx` | Admin UI for configuring team page (visibility, order, featured, bios, fields, booking link) |

### Modified Files
| File | Change |
|------|--------|
| `backend/server.js` | Register `teamSettingsRouter` at `/api/team-settings` |
| `backend/routes/instructors.js` | Enhance public `GET /` to join `team_member_settings` and `team_global_settings` |
| `src/features/community/pages/TeamPage.jsx` | Add click handler on cards, render `InstructorDetailDrawer` |
| `src/features/dashboard/pages/Settings.jsx` | Add "Team" collapsible section importing `TeamSettingsSection` |

---

### Task 1: Database Migration

**Files:**
- Create: `backend/db/migrations/234_create_team_settings.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 234_create_team_settings.sql
-- Team page configuration tables

CREATE TABLE IF NOT EXISTS team_member_settings (
  id SERIAL PRIMARY KEY,
  instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  custom_bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instructor_id)
);

CREATE TABLE IF NOT EXISTS team_global_settings (
  id SERIAL PRIMARY KEY,
  visible_fields JSONB NOT NULL DEFAULT '["bio","specializations","languages","experience"]'::jsonb,
  booking_link_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed one default global settings row
INSERT INTO team_global_settings (visible_fields, booking_link_enabled)
VALUES ('["bio","specializations","languages","experience"]'::jsonb, true)
ON CONFLICT DO NOTHING;

CREATE INDEX idx_team_member_settings_instructor ON team_member_settings(instructor_id);
```

- [ ] **Step 2: Run the migration**

Run: `npm run migrate:up`
Expected: Migration applies successfully, tables created.

- [ ] **Step 3: Commit**

```bash
git add backend/db/migrations/234_create_team_settings.sql
git commit -m "feat: add team_member_settings and team_global_settings tables"
```

---

### Task 2: Team Settings Service (Backend)

**Files:**
- Create: `backend/services/teamSettingsService.js`

- [ ] **Step 1: Create the service**

```javascript
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Get all team member settings joined with instructor info,
 * plus global settings.
 */
export async function getTeamSettings() {
  const membersQuery = `
    SELECT
      tms.id,
      tms.instructor_id,
      tms.visible,
      tms.display_order,
      tms.featured,
      tms.custom_bio,
      u.name,
      u.first_name,
      u.last_name,
      u.profile_image_url,
      u.avatar_url,
      u.email
    FROM team_member_settings tms
    JOIN users u ON u.id = tms.instructor_id
    WHERE u.deleted_at IS NULL
    ORDER BY tms.display_order ASC
  `;

  const globalQuery = `
    SELECT visible_fields, booking_link_enabled
    FROM team_global_settings
    LIMIT 1
  `;

  const [membersResult, globalResult] = await Promise.all([
    pool.query(membersQuery),
    pool.query(globalQuery),
  ]);

  return {
    members: membersResult.rows,
    global: globalResult.rows[0] || {
      visible_fields: ['bio', 'specializations', 'languages', 'experience'],
      booking_link_enabled: true,
    },
  };
}

/**
 * Bulk upsert team settings (members + global).
 */
export async function saveTeamSettings({ members, global: globalSettings }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert each member setting
    if (members && members.length > 0) {
      for (const m of members) {
        await client.query(
          `INSERT INTO team_member_settings (instructor_id, visible, display_order, featured, custom_bio, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (instructor_id) DO UPDATE SET
             visible = EXCLUDED.visible,
             display_order = EXCLUDED.display_order,
             featured = EXCLUDED.featured,
             custom_bio = EXCLUDED.custom_bio,
             updated_at = NOW()`,
          [m.instructor_id, m.visible ?? true, m.display_order ?? 0, m.featured ?? false, m.custom_bio ?? null]
        );
      }
    }

    // Upsert global settings (single row, id=1)
    if (globalSettings) {
      await client.query(
        `UPDATE team_global_settings
         SET visible_fields = $1, booking_link_enabled = $2, updated_at = NOW()
         WHERE id = (SELECT id FROM team_global_settings LIMIT 1)`,
        [JSON.stringify(globalSettings.visible_fields), globalSettings.booking_link_enabled ?? true]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to save team settings', err);
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/teamSettingsService.js
git commit -m "feat: add teamSettingsService for team config CRUD"
```

---

### Task 3: Team Settings Route (Backend)

**Files:**
- Create: `backend/routes/teamSettings.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create the route file**

```javascript
import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { getTeamSettings, saveTeamSettings } from '../services/teamSettingsService.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// GET /api/team-settings — admin reads all config
router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const settings = await getTeamSettings();
    res.json(settings);
  } catch (err) {
    logger.error('Failed to fetch team settings', err);
    res.status(500).json({ error: 'Failed to fetch team settings' });
  }
});

// PUT /api/team-settings — admin saves all config (bulk update)
router.put('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { members, global } = req.body;
    await saveTeamSettings({ members, global });
    const updated = await getTeamSettings();
    res.json(updated);
  } catch (err) {
    logger.error('Failed to save team settings', err);
    res.status(500).json({ error: 'Failed to save team settings' });
  }
});

export default router;
```

- [ ] **Step 2: Register the route in server.js**

In `backend/server.js`, add the import near the other route imports (around line 55):

```javascript
import teamSettingsRouter from './routes/teamSettings.js';
```

Add the route registration near the other `app.use` calls (around line 1325):

```javascript
app.use('/api/team-settings', teamSettingsRouter);
```

- [ ] **Step 3: Test manually**

Run: `npm run dev:backend`
Then: `curl http://localhost:4000/api/team-settings` (should return 401 — auth required)
Expected: `{"error":"..."}` (unauthorized)

- [ ] **Step 4: Commit**

```bash
git add backend/routes/teamSettings.js backend/server.js
git commit -m "feat: add /api/team-settings route for admin team config"
```

---

### Task 4: Enhance Public Instructors Endpoint

**Files:**
- Modify: `backend/routes/instructors.js` (lines 20-76, the public `GET /` handler)

- [ ] **Step 1: Update the public GET / query to join team settings**

Replace the existing `GET /` handler (lines 20-76 in `backend/routes/instructors.js`) with:

```javascript
// GET all instructors - Public endpoint for guest browsing
router.get('/', publicApiLimiter, async (req, res) => {
  try {
    // Fetch global team settings
    let globalSettings = {
      visible_fields: ['bio', 'specializations', 'languages', 'experience'],
      booking_link_enabled: true,
    };
    try {
      const globalResult = await pool.query('SELECT visible_fields, booking_link_enabled FROM team_global_settings LIMIT 1');
      if (globalResult.rows.length > 0) globalSettings = globalResult.rows[0];
    } catch {
      // Table may not exist yet; use defaults
    }

    const query = `
      SELECT u.*, r.name as role_name, 
             COALESCE(idc.commission_value, 0) as commission_rate,
             COALESCE(idc.commission_type, 'percent') as commission_type,
             COALESCE(
               json_agg(
                 json_build_object(
                   'discipline_tag', isk.discipline_tag,
                   'lesson_categories', isk.lesson_categories,
                   'max_level', isk.max_level
                 )
               ) FILTER (WHERE isk.id IS NOT NULL),
               '[]'::json
             ) as skills,
             tms.visible AS team_visible,
             tms.display_order AS team_display_order,
             tms.featured AS team_featured,
             tms.custom_bio AS team_custom_bio
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
      LEFT JOIN instructor_skills isk ON isk.instructor_id = u.id
      LEFT JOIN team_member_settings tms ON tms.instructor_id = u.id
      WHERE r.name IN ('instructor', 'manager') AND u.deleted_at IS NULL
        AND (tms.visible IS NULL OR tms.visible = true)
      GROUP BY u.id, r.name, idc.commission_value, idc.commission_type,
               tms.visible, tms.display_order, tms.featured, tms.custom_bio
      ORDER BY
        CASE WHEN tms.featured = true THEN 0 ELSE 1 END,
        COALESCE(tms.display_order, 999),
        u.name
    `;
    
    const { rows } = await pool.query(query);
    
    const visibleFields = Array.isArray(globalSettings.visible_fields) ? globalSettings.visible_fields : ['bio', 'specializations', 'languages', 'experience'];

    const sanitized = rows.map((row) => ({
      id: row.id,
      name: row.name,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      profile_image_url: row.profile_image_url,
      avatar_url: row.avatar_url,
      bio: visibleFields.includes('bio') ? (row.team_custom_bio || row.bio) : null,
      language: visibleFields.includes('languages') ? row.language : null,
      role_name: row.role_name,
      status: row.status || 'active',
      is_freelance: row.is_freelance || false,
      skills: visibleFields.includes('specializations') ? (row.skills || []) : [],
      featured: row.team_featured || false,
      created_at: visibleFields.includes('experience') ? row.created_at : null,
      booking_link_enabled: globalSettings.booking_link_enabled,
      visible_fields: visibleFields,
      ...(req.user ? {
        commission_rate: row.commission_rate,
        commission_type: row.commission_type
      } : {})
    }));

    res.json(sanitized);
  } catch (err) {
    logger.error('Failed to fetch instructors', err);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
});
```

- [ ] **Step 2: Verify the endpoint works**

Run: `npm run dev:backend`
Then test: `curl http://localhost:4000/api/instructors`
Expected: JSON array of instructors with `featured`, `created_at`, `booking_link_enabled`, and `visible_fields` fields.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/instructors.js
git commit -m "feat: enhance public instructors endpoint with team settings"
```

---

### Task 5: Instructor Detail Drawer Component

**Files:**
- Create: `src/features/community/components/InstructorDetailDrawer.jsx`

- [ ] **Step 1: Create the drawer component**

```jsx
import { Drawer, Tag } from 'antd';
import {
  GlobalOutlined,
  StarFilled,
  CalendarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/contexts/AuthContext';

const LANGUAGE_FLAGS = {
  en: '🇬🇧', english: '🇬🇧',
  tr: '🇹🇷', turkish: '🇹🇷', türkçe: '🇹🇷',
  de: '🇩🇪', german: '🇩🇪', deutsch: '🇩🇪',
  fr: '🇫🇷', french: '🇫🇷', français: '🇫🇷',
  es: '🇪🇸', spanish: '🇪🇸', español: '🇪🇸',
  it: '🇮🇹', italian: '🇮🇹', italiano: '🇮🇹',
  ru: '🇷🇺', russian: '🇷🇺', русский: '🇷🇺',
  pt: '🇵🇹', portuguese: '🇵🇹',
  nl: '🇳🇱', dutch: '🇳🇱',
  ar: '🇸🇦', arabic: '🇸🇦',
};

const parseLanguages = (langStr) => {
  if (!langStr) return [];
  return langStr.split(/[,;/|]+/).map((l) => l.trim().toLowerCase()).filter(Boolean);
};

const getDisplayName = (member) => {
  if (member.first_name || member.last_name) {
    return `${member.first_name || ''} ${member.last_name || ''}`.trim();
  }
  return member.name || 'Team Member';
};

const getInitials = (member) => {
  const name = getDisplayName(member);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || 'T')[0].toUpperCase();
};

const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return url;
};

const getExperienceText = (createdAt) => {
  if (!createdAt) return null;
  const year = new Date(createdAt).getFullYear();
  return `With us since ${year}`;
};

const InstructorDetailDrawer = ({ instructor, open, onClose }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  if (!instructor) return null;

  const avatarUrl = getImageUrl(instructor.profile_image_url) || getImageUrl(instructor.avatar_url);
  const name = getDisplayName(instructor);
  const languages = parseLanguages(instructor.language);
  const visibleFields = instructor.visible_fields || ['bio', 'specializations', 'languages', 'experience'];
  const skills = instructor.skills || [];
  const experienceText = getExperienceText(instructor.created_at);

  const handleBookLesson = () => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      navigate('/experience');
    }
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={480}
      closable
      styles={{
        wrapper: { maxWidth: '100vw' },
        header: { background: '#1a1d26', borderBottom: '1px solid rgba(255,255,255,0.1)' },
        body: { background: '#1a1d26', padding: 0 },
      }}
      closeIcon={<span className="text-white text-lg">&times;</span>}
      title={null}
    >
      <div className="text-white min-h-full">
        {/* Hero Photo */}
        <div className="relative h-72 overflow-hidden bg-gradient-to-br from-sky-900/30 to-cyan-900/15">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                e.target.nextElementSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className={`absolute inset-0 items-center justify-center bg-gradient-to-br from-sky-600/30 to-cyan-600/20 ${avatarUrl ? 'hidden' : 'flex'}`}
          >
            <span className="text-7xl font-bold text-sky-300/60">{getInitials(instructor)}</span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d26] via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="px-6 pb-6 -mt-8 relative z-10">
          {/* Name + Featured badge */}
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-2xl font-bold text-white">{name}</h2>
            {instructor.featured && (
              <Tag className="!bg-amber-500/20 !border-amber-500/40 !text-amber-300 !rounded-full !text-xs !font-semibold">
                <StarFilled className="mr-1" />Featured
              </Tag>
            )}
          </div>

          {/* Bio */}
          {visibleFields.includes('bio') && instructor.bio && (
            <div className="mb-5">
              <p className="text-gray-300 text-sm leading-relaxed">{instructor.bio}</p>
            </div>
          )}

          {/* Specializations */}
          {visibleFields.includes('specializations') && skills.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Specializations</h4>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill, idx) => (
                  skill.discipline_tag && (
                    <Tag
                      key={idx}
                      className="!bg-sky-500/15 !border-sky-500/30 !text-sky-300 !rounded-full !text-xs"
                    >
                      {skill.discipline_tag}
                      {skill.max_level ? ` (L${skill.max_level})` : ''}
                    </Tag>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {visibleFields.includes('languages') && languages.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Languages</h4>
              <div className="flex flex-wrap gap-1.5">
                {languages.map((lang) => {
                  const flag = LANGUAGE_FLAGS[lang];
                  return (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300 capitalize"
                    >
                      {flag && <span>{flag}</span>}
                      {!flag && <GlobalOutlined className="text-[10px] text-gray-500" />}
                      {lang}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Experience */}
          {visibleFields.includes('experience') && experienceText && (
            <div className="mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <CalendarOutlined className="text-sky-400" />
                <span>{experienceText}</span>
              </div>
            </div>
          )}

          {/* Book a Lesson CTA */}
          {instructor.booking_link_enabled && (
            <button
              onClick={handleBookLesson}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00a8c4] to-cyan-500 text-white font-semibold text-sm hover:from-[#0095ad] hover:to-cyan-600 transition-all duration-200 shadow-lg shadow-cyan-500/20"
            >
              Book a Lesson
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default InstructorDetailDrawer;
```

- [ ] **Step 2: Commit**

```bash
git add src/features/community/components/InstructorDetailDrawer.jsx
git commit -m "feat: add InstructorDetailDrawer for public team page"
```

---

### Task 6: Integrate Drawer into Team Page

**Files:**
- Modify: `src/features/community/pages/TeamPage.jsx`

- [ ] **Step 1: Add drawer state and import**

At the top of `TeamPage.jsx`, add the import (after the existing imports around line 17):

```javascript
import InstructorDetailDrawer from '../components/InstructorDetailDrawer';
```

Inside the `TeamPage` component (after `const [hoveredId, setHoveredId] = useState(null);` on line 64), add:

```javascript
const [selectedInstructor, setSelectedInstructor] = useState(null);
```

- [ ] **Step 2: Remove the client-side sort — server now handles ordering**

Replace the `sortedMembers` useMemo (lines 89-96) with:

```javascript
// Server handles ordering (featured first, then display_order, then name)
const sortedMembers = members;
```

- [ ] **Step 3: Add click handler to instructor cards**

On the card `<div>` (line 169), add an `onClick` handler and `cursor-pointer`. Replace:

```jsx
<div
  key={member.id}
  className="group relative bg-gradient-to-b from-[#1f2230] to-[#171925] rounded-2xl border border-white/10 hover:border-sky-400/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-sky-500/5 overflow-hidden"
  onMouseEnter={() => setHoveredId(member.id)}
  onMouseLeave={() => setHoveredId(null)}
>
```

with:

```jsx
<div
  key={member.id}
  className="group relative bg-gradient-to-b from-[#1f2230] to-[#171925] rounded-2xl border border-white/10 hover:border-sky-400/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-sky-500/5 overflow-hidden cursor-pointer"
  onMouseEnter={() => setHoveredId(member.id)}
  onMouseLeave={() => setHoveredId(null)}
  onClick={() => setSelectedInstructor(member)}
>
```

- [ ] **Step 4: Render the drawer**

Just before the closing `</div>` of the root element (before line 259), add:

```jsx
<InstructorDetailDrawer
  instructor={selectedInstructor}
  open={!!selectedInstructor}
  onClose={() => setSelectedInstructor(null)}
/>
```

- [ ] **Step 5: Add a featured badge on the card (optional visual enhancement)**

Inside the avatar area (after the Role badge Tag around line 200), add a featured badge:

```jsx
{member.featured && (
  <Tag className="absolute top-3 right-3 !bg-amber-500/20 !border-amber-500/40 !text-amber-300 !rounded-full !text-[10px] !font-bold backdrop-blur-sm uppercase tracking-wide">
    <StarFilled className="mr-0.5" /> Featured
  </Tag>
)}
```

Add `StarFilled` to the imports from `@ant-design/icons` (line 14):

```javascript
import {
  TeamOutlined,
  GlobalOutlined,
  MailOutlined,
  StarFilled,
} from '@ant-design/icons';
```

- [ ] **Step 6: Commit**

```bash
git add src/features/community/pages/TeamPage.jsx
git commit -m "feat: integrate instructor detail drawer into team page"
```

---

### Task 7: Admin Team Settings Component

**Files:**
- Create: `src/features/dashboard/components/TeamSettingsSection.jsx`

- [ ] **Step 1: Create the TeamSettingsSection component**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { Switch, Button, Checkbox, Modal, Input, Spin, message } from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  StarOutlined,
  StarFilled,
  EditOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import DataService from '@/shared/services/dataService';

const { TextArea } = Input;

const FIELD_OPTIONS = [
  { label: 'Bio', value: 'bio' },
  { label: 'Specializations', value: 'specializations' },
  { label: 'Languages', value: 'languages' },
  { label: 'Experience (Joined Date)', value: 'experience' },
];

const getDisplayName = (member) => {
  if (member.first_name || member.last_name) {
    return `${member.first_name || ''} ${member.last_name || ''}`.trim();
  }
  return member.name || 'Team Member';
};

const getInitials = (member) => {
  const name = getDisplayName(member);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || 'T')[0].toUpperCase();
};

const TeamSettingsSection = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [globalSettings, setGlobalSettings] = useState({
    visible_fields: ['bio', 'specializations', 'languages', 'experience'],
    booking_link_enabled: true,
  });
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [customBioText, setCustomBioText] = useState('');
  const [draggedIdx, setDraggedIdx] = useState(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/team-settings');
      if (data.members && data.members.length > 0) {
        setMembers(data.members);
      } else {
        // Auto-initialize from instructor list
        const instructors = await DataService.getInstructors();
        const initialized = (instructors || []).map((inst, idx) => ({
          instructor_id: inst.id,
          name: inst.name,
          first_name: inst.first_name,
          last_name: inst.last_name,
          profile_image_url: inst.profile_image_url,
          avatar_url: inst.avatar_url,
          email: inst.email,
          visible: true,
          display_order: idx,
          featured: false,
          custom_bio: null,
        }));
        setMembers(initialized);
      }
      if (data.global) {
        setGlobalSettings(data.global);
      }
    } catch (err) {
      console.error('Failed to load team settings', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        members: members.map((m, idx) => ({
          instructor_id: m.instructor_id,
          visible: m.visible,
          display_order: idx,
          featured: m.featured,
          custom_bio: m.custom_bio || null,
        })),
        global: globalSettings,
      };
      await apiClient.put('/team-settings', payload);
      message.success('Team settings saved');
    } catch (err) {
      console.error('Failed to save team settings', err);
      message.error('Failed to save team settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = (idx) => {
    setMembers((prev) => prev.map((m, i) => i === idx ? { ...m, visible: !m.visible } : m));
  };

  const toggleFeatured = (idx) => {
    setMembers((prev) => prev.map((m, i) => i === idx ? { ...m, featured: !m.featured } : m));
  };

  const openBioModal = (idx) => {
    setEditingMember(idx);
    setCustomBioText(members[idx].custom_bio || '');
    setBioModalOpen(true);
  };

  const saveBio = () => {
    setMembers((prev) => prev.map((m, i) => i === editingMember ? { ...m, custom_bio: customBioText || null } : m));
    setBioModalOpen(false);
    setEditingMember(null);
  };

  // Drag and drop reordering
  const handleDragStart = (idx) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    setMembers((prev) => {
      const next = [...prev];
      const [removed] = next.splice(draggedIdx, 1);
      next.splice(idx, 0, removed);
      return next;
    });
    setDraggedIdx(idx);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-medium leading-6 text-gray-900">Team Page Settings</h3>
      <p className="mt-1 text-sm text-gray-600">
        Configure how your team appears on the public Team page.
      </p>

      {/* Global Settings */}
      <div className="mt-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Global Settings</h4>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-gray-700">Show "Book a Lesson" button</div>
            <div className="text-xs text-gray-500">Display a CTA on the team page and instructor drawer</div>
          </div>
          <Switch
            checked={globalSettings.booking_link_enabled}
            onChange={(checked) => setGlobalSettings((prev) => ({ ...prev, booking_link_enabled: checked }))}
          />
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Visible fields on public team page</div>
          <Checkbox.Group
            options={FIELD_OPTIONS}
            value={globalSettings.visible_fields}
            onChange={(vals) => setGlobalSettings((prev) => ({ ...prev, visible_fields: vals }))}
          />
        </div>
      </div>

      {/* Instructor List */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Instructors ({members.length})
        </h4>
        <p className="text-xs text-gray-500 mb-3">Drag to reorder. Changes take effect after saving.</p>

        <div className="space-y-2">
          {members.map((member, idx) => {
            const avatarUrl = member.profile_image_url || member.avatar_url;
            const name = getDisplayName(member);

            return (
              <div
                key={member.instructor_id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 bg-white rounded-lg border transition-colors ${
                  draggedIdx === idx ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                } ${!member.visible ? 'opacity-50' : ''}`}
              >
                {/* Drag handle */}
                <MenuOutlined className="text-gray-400 cursor-grab active:cursor-grabbing" />

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-gray-500">{getInitials(member)}</span>
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{name}</div>
                  {member.custom_bio && (
                    <div className="text-xs text-blue-500 truncate">Custom bio set</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleVisibility(idx)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title={member.visible ? 'Hide from team page' : 'Show on team page'}
                  >
                    {member.visible ? (
                      <EyeOutlined className="text-gray-600" />
                    ) : (
                      <EyeInvisibleOutlined className="text-gray-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFeatured(idx)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title={member.featured ? 'Remove featured' : 'Mark as featured'}
                  >
                    {member.featured ? (
                      <StarFilled className="text-amber-500" />
                    ) : (
                      <StarOutlined className="text-gray-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBioModal(idx)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title="Edit public bio"
                  >
                    <EditOutlined className="text-gray-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <Button
          type="primary"
          onClick={handleSave}
          loading={saving}
        >
          Save Team Settings
        </Button>
      </div>

      {/* Custom Bio Modal */}
      <Modal
        title={editingMember !== null ? `Edit Public Bio — ${getDisplayName(members[editingMember])}` : 'Edit Public Bio'}
        open={bioModalOpen}
        onOk={saveBio}
        onCancel={() => setBioModalOpen(false)}
        okText="Set Bio"
      >
        <p className="text-sm text-gray-500 mb-3">
          Override this instructor's bio on the public Team page. Leave empty to use their default bio.
        </p>
        <TextArea
          rows={4}
          value={customBioText}
          onChange={(e) => setCustomBioText(e.target.value)}
          placeholder="Enter custom public bio..."
          maxLength={500}
          showCount
        />
      </Modal>
    </div>
  );
};

export default TeamSettingsSection;
```

- [ ] **Step 2: Commit**

```bash
git add src/features/dashboard/components/TeamSettingsSection.jsx
git commit -m "feat: add TeamSettingsSection admin component"
```

---

### Task 8: Add Team Tab to Settings Page

**Files:**
- Modify: `src/features/dashboard/pages/Settings.jsx`

- [ ] **Step 1: Import TeamSettingsSection**

At the top of `Settings.jsx` (after the existing imports, around line 14), add:

```javascript
import TeamSettingsSection from '../components/TeamSettingsSection';
```

- [ ] **Step 2: Add the Team section**

In the Settings component's JSX, add a new `SettingsSection` block right after the "Calendar" section and before "Business Currency" (after line 511). Insert:

```jsx
{/* Team Page Settings */}
<SettingsSection
  title="Team"
  isOpen={openSection === 'team'}
  onToggle={() => setOpenSection(openSection === 'team' ? null : 'team')}
>
  <div className="px-3 py-4 sm:px-4 sm:py-5 lg:p-6 border-t border-slate-100">
    <TeamSettingsSection />
  </div>
</SettingsSection>
```

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/pages/Settings.jsx
git commit -m "feat: add Team tab to admin Settings page"
```

---

### Task 9: Verify Auth Context Import in Drawer

**Files:**
- Verify: `src/shared/contexts/AuthContext.jsx` (check `useAuth` is exported)

- [ ] **Step 1: Verify useAuth export exists**

Run: `grep -n "export.*useAuth" src/shared/contexts/AuthContext.jsx`
Expected: A line exporting `useAuth` hook. If it doesn't exist or is named differently, update the import in `InstructorDetailDrawer.jsx` to match the actual export.

- [ ] **Step 2: If useAuth doesn't exist, check alternatives**

Run: `grep -rn "isAuthenticated\|useAuth\|AuthContext" src/shared/contexts/ --include="*.jsx" --include="*.js" | head -10`

Adapt the drawer's import if needed (e.g., if using `AuthContext` directly with `useContext`).

- [ ] **Step 3: Commit any fixes if needed**

---

### Task 10: End-to-End Smoke Test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test public Team page**

1. Open `http://localhost:3000/community/team` (not logged in)
2. Verify instructor cards render with photos and names
3. Click an instructor card → drawer should slide in from the right
4. Verify drawer shows: photo, name, bio, specializations, languages, experience
5. Verify "Book a Lesson" button is visible
6. Click "Book a Lesson" → should redirect to `/login`
7. Close drawer, click another instructor → should show different instructor data

- [ ] **Step 3: Test admin Team settings**

1. Log in as admin
2. Navigate to `/dashboard/settings`
3. Expand the "Team" section
4. Verify all instructors are listed with drag handles, visibility toggles, star toggles, edit buttons
5. Toggle visibility off for one instructor → Save
6. Go back to `/community/team` → instructor should be hidden
7. Toggle featured on for one instructor → Save
8. Go back to `/community/team` → featured instructor should appear first with badge
9. Edit a custom bio → Save → verify it appears in the drawer instead of the default bio
10. Uncheck "Languages" from visible fields → Save → verify languages are hidden on team page and drawer

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address smoke test findings"
```
