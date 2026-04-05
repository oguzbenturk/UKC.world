# DEPRECATED — Do Not Add Migrations Here

This directory is **not read** by the migration runner.

All migrations belong in: `backend/db/migrations/`

The active runner is `backend/migrate.js`, which reads `backend/db/migrations/`
(hardcoded in both `migrate.js` and `db.js`).

Files here (001–132) represent an earlier parallel development stream and have been
superseded by the canonical migrations in `backend/db/migrations/`. They are kept
for historical reference only.

**Do NOT run any of these files manually against the production database.**
