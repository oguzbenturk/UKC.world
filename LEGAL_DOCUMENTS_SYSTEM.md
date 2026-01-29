# Legal Documents & Consent System - Implementation Summary

## What Was Changed

### 1. Database Schema
- **Created**: `legal_documents` table to store Terms of Service, Privacy Policy, and Marketing content
- **Migration**: `130_create_legal_documents.sql`
- Supports versioning and activation status
- Default documents pre-populated

### 2. Backend API
- **New Route**: `/api/admin/legal-documents`
  - `GET /api/admin/legal-documents` - Fetch active documents (all authenticated users)
  - `POST /api/admin/legal-documents` - Save/update documents (admin only)
- **File**: `backend/routes/admin.js`
- **Registered in**: `backend/server.js`

### 3. Frontend - Admin Interface
- **New Page**: `src/features/settings/pages/LegalDocumentsPage.jsx`
- Features:
  - Rich text editor (ReactQuill) for Terms & Privacy content
  - Version management
  - Live preview functionality
  - Marketing preferences description customization
- **Route**: `/admin/legal-documents`
- **Menu**: Added to Settings submenu (Admin/Manager/Developer only)

### 4. User Consent Modal (Updated)
- **File**: `src/features/compliance/components/UserConsentModal.jsx`
- Changes:
  - Now fetches content from database instead of external URLs
  - Displays Terms & Privacy content directly in modal
  - Shows scrollable previews of both documents
  - Dynamic marketing description from database
  - Loading state while fetching documents

### 5. Navigation
- Added "Legal Documents" to Settings submenu
- Icon: DocumentTextIcon
- Access: Admin, Manager, Developer roles only

## How It Works

### Admin Workflow:
1. Navigate to **Settings → Legal Documents**
2. Edit Terms of Service, Privacy Policy, or Marketing Preferences
3. Update version numbers to trigger re-consent
4. Click "Save" and "Preview" to verify
5. Users will be prompted to accept new versions on next login

### User Experience:
1. On first login OR when new version is published:
   - Modal appears (cannot be closed)
   - Displays full Terms & Privacy content inline
   - User can scroll through documents
   - Must check "I agree" checkbox
   - Can opt-in to marketing preferences
2. After acceptance:
   - Modal disappears
   - User can continue using the app
   - Can update marketing preferences later from profile

## Database Migration

Run this to create the table:
```bash
# From backend directory
psql -U your_user -d plannivo -f migrations/130_create_legal_documents.sql
```

Or using the migration script if you have one.

## Testing Checklist

- [ ] Admin can access `/admin/legal-documents`
- [ ] Admin can edit Terms of Service
- [ ] Admin can edit Privacy Policy
- [ ] Admin can edit Marketing description
- [ ] Preview button opens new window with formatted content
- [ ] Saving updates the database
- [ ] New users see consent modal on first login
- [ ] Consent modal displays database content (not external links)
- [ ] Changing version triggers re-consent for existing users
- [ ] User can accept terms and continue
- [ ] Marketing preferences are saved correctly

## Benefits

✅ **Single unified consent form** - No more multiple acceptance forms
✅ **Admin-controlled content** - No need for developers to update legal text
✅ **Version management** - Automatic re-consent when versions change
✅ **Inline display** - Users see content directly without external links
✅ **First-login only** - Only shows when needed
✅ **Centralized storage** - All legal content in one database table

## Migration Notes

- Old external URLs (`VITE_TERMS_URL`, `VITE_PRIVACY_URL`) are no longer used
- The consent modal now has one unified interface
- All legal documents are managed through the admin panel
- No separate forms needed - everything is in one modal

## Next Steps

1. Run the database migration
2. Test the admin interface
3. Test the user consent flow
4. Populate initial content for Terms & Privacy
5. Remove any old consent-related code if needed
