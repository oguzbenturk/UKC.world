# Plannivo (kspro) – Fixes & Features Progress

This checklist tracks the requested tasks and their status. I’ll update it as changes land.

## Legend
- [x] Done
- [ ] Pending
- [~] In progress / partial

## Backend / Finance
- [x] Package bookings pay instructors correctly in persisted instructor_earnings (create/update cascade)
- [x] Lint/complexity cleanup in backend services where changes were made (reduced lint noise via ESLint overrides; no runtime changes)
- [x] Unit tests: commission precedence and package lesson split
- [x] Group lessons: ensure each participant using a package consumes hours from their own package (treat paymentStatus 'package/partial' or provided customerPackageId as intent)

## Realtime / Navbar
- [x] Replace fake “active users” with backend-driven stats

## Customers / Packages
- [x] Remove “Use Hours” buttons and modal across package manager UI
 - [x] Ensure group package assignment works when initiated from profile (default participants wired)

## Tables / UI Consistency
- [x] Unify table styling across app based on Customers table (introduced UnifiedTable and applied broadly)
	- [x] Wrapped Customer Profile tabs (Total, Lessons, Rentals, Financial) with UnifiedTable
	- [x] Wrapped Services pages (Lessons, Rentals, Categories) tables with UnifiedTable
	- [x] Wrapped Rentals page table with UnifiedTable
	- [x] Wrapped Popup Analytics tables (Event Breakdown, Recent User Feedback)
	- [x] Wrapped Outstanding Balances Manager table
	- [x] Wrapped Revenue Totals table
- [x] Customers page: make name column sticky when scrolling
- [x] Strengthen table borders/lines on customers page
- [x] Ensure Action button doesn’t redirect unexpectedly to dashboard

## Customer Dashboard
- [x] Show totals (hours for lessons/supervisions, rentals, etc.) with drill-down links (navigates tabs)

## Profile / Forms
 - [x] Edit profile: place Add Balance and Charge buttons on the same line within the form
 - [x] After creating a new user, close the registration form immediately upon success

## Commissions / Instructors
- [x] Bulk commission assignment (assign many at once)
- [x] Instructors page: remove label and refresh button; add list view for instructors/staff; add Bulk Commissions link

## Admin Pages
- [x] Create new admin page for Spare parts orders tracking (initial scaffold, route + sidebar)
- [x] Spare parts backend: DB migration + API routes wired to server
- [x] Frontend API client for spare parts
- [x] Wire Spare Parts Orders UI to backend (list/create/update/delete, filters, export)

## Audit Metadata Visibility
- [x] Finance dashboards show creator attribution on transactions
- [x] Booking list cards include created-by footer
- [x] Rentals table includes created-by column with timestamps
- [x] Services cards surface creator avatars & timestamps
- [x] Products cards display creator info and creator filter on index view

## Tests
- [x] Backend Jest config for ESM; added tests for commission precedence and package lesson split (all green)

## Notes
- Changes will be validated with linting and quick smoke tests. I’ll keep this file updated as items are completed.
