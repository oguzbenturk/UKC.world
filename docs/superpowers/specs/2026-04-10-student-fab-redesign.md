# Student FAB Redesign

**Date:** 2026-04-10  
**Status:** Approved

## Problem

`StudentQuickActions` is mounted inside `StudentLayout`, so the FAB is only visible on `/student/*` pages. It also has too many buttons — Wallet, Book, Accommodation, Book Rental, Buy Package, Group Lessons, Friends — several of which connect to flows no longer in use or out of scope.

## Goal

Simplify the student FAB to two actions and make it visible on any authenticated page that is not a shop or public-form route.

## Design

### Button Set

| Label | Icon | Action |
|-------|------|--------|
| Book a Lesson | `CalendarDaysIcon` | `navigate('/academy')` |
| Rental | `WrenchScrewdriverIcon` | `navigate('/rental')` |

### Visibility Rules

Shown for roles: `student`, `trusted_customer`

Hidden on:
- `/shop/*`
- `/f/*`
- `/quick/*`
- `/group-invitation/*`
- `/login`, `/register`, `/reset-password`
- `/academy` (redundant — that is where Book navigates)
- `/guest`

Visible everywhere else authenticated students can reach.

### Architecture

**Approach B — lift to App.jsx**

- `StudentQuickActions` is stripped to 2 buttons, no wizard state, no wallet state, no ratings badge
- Removed from `StudentLayout` — `StudentLayout` no longer imports or renders it
- Mounted in `App.jsx` alongside `GlobalFAB`, with a student-role guard and path-based hide logic (same pattern as `GlobalFAB`)

### What Is NOT Changed

- `GlobalFAB` (staff FAB) — untouched
- `StudentBookingWizard` — stays, still used by other flows (nav state, event listeners)
- `QuickBookingModal` — untouched
- `FloatingQuickAction` in `InstructorDashboard` — untouched

## Implementation Steps

1. Gut `StudentQuickActions` — remove all buttons except Book and Rental, remove all state and props related to wallet/wizard/ratings
2. Remove `StudentQuickActions` import and render from `StudentLayout`
3. Add `StudentQuickActions` to `App.jsx` with student-role guard and hidden-path logic
4. Verify `GlobalFAB` and student FAB do not appear at the same time (they guard on mutually exclusive roles)
