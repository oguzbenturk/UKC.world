# Membership Image Upload Fix - Summary

## Issues Fixed

### 1. ✅ Form Warnings
- **Issue**: Form.useForm instance not connected to Form component
- **Fix**: Ensured `form={form}` prop is present in Form component
- **Issue**: Static message.* functions don't work with dynamic themes
- **Fix**: Changed to import message from `@/shared/utils/antdStatic`

### 2. ✅ Image Upload Not Working
- **Issue**: Upload component using `action` prop which doesn't work properly with authentication
- **Fix**: Implemented `customRequest` pattern (same as avatar upload system)
  - Uses `apiClient.post('/upload/image', formData)` with proper auth headers
  - Added upload progress tracking
  - Proper error handling with user feedback
  - File validation (image type, 5MB size limit)

### 3. ✅ Toggle for Image Display Mode
- **Issue**: No control over whether image should be background or inline
- **Fix**: Added `use_image_background` boolean field
  - Database: Added column with DEFAULT TRUE
  - Backend: Updated POST/PUT/GET endpoints
  - Frontend Admin: Added Switch component to control mode
  - Frontend Customer: Conditional rendering based on setting

## Implementation Details

### Database Changes
**Migration**: `112_add_use_image_background_to_member_offerings.sql`
```sql
ALTER TABLE member_offerings 
ADD COLUMN IF NOT EXISTS use_image_background BOOLEAN DEFAULT TRUE;
```

### Backend Changes
**File**: `backend/routes/memberOfferings.js`
- Added `use_image_background` to GET query (line ~35)
- Added `use_image_background` to POST endpoint (line ~280)
- Added `use_image_background` to PUT endpoint (line ~325)

### Frontend Admin Changes
**File**: `src/features/services/pages/MembershipSettings.jsx`

1. **Image Upload Implementation** (customRequest pattern):
```javascript
const postMembershipImageUpload = useCallback(({ file, onSuccess, onError, onProgress }) => {
  const formData = new FormData();
  formData.append('image', file);
  
  apiClient.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      setUploadProgress(percentCompleted);
      if (onProgress) onProgress({ percent: percentCompleted });
    },
  })
  .then((response) => {
    const imageUrl = response.data?.url;
    if (imageUrl) {
      setImageUrl(imageUrl);
      message.success('Image uploaded successfully');
      onSuccess(response.data);
    }
  })
  .catch((error) => {
    message.error('Failed to upload image');
    onError(error);
  });
}, []);
```

2. **Toggle Switch**:
```jsx
<Form.Item
  name="use_image_background"
  label="Display Mode"
  valuePropName="checked"
  extra="When enabled, the uploaded image will be used as the card background..."
>
  <Switch 
    checkedChildren="Background Image" 
    unCheckedChildren="Inline Image"
    disabled={!imageUrl}
  />
</Form.Item>
```

3. **Upload Component**:
```jsx
<Upload
  name="image"
  listType="picture-card"
  showUploadList={false}
  customRequest={postMembershipImageUpload}  // ← Fixed: was action="/api/upload/image"
  accept="image/*"
  beforeUpload={(file) => {
    // Validation logic
  }}
>
  {/* Upload UI */}
</Upload>
```

### Frontend Customer Changes
**File**: `src/features/members/pages/MemberOfferings.jsx`

1. **Conditional Card Selection**:
```javascript
// Use image as background only if image exists AND use_image_background is true
if (offering.image_url && offering.use_image_background !== false) {
  return <ImageCard ... />;
}
// Otherwise use default card (with inline image if image_url exists)
return <DefaultCard ... />;
```

2. **DefaultCard with Inline Image**:
```jsx
const DefaultCard = ({ offering, ... }) => {
  const imgSrc = offering.image_url ? ... : null;
  
  return (
    <div className="offering-card">
      <div>
        {/* Show image inline when use_image_background is false */}
        {imgSrc && (
          <div style={{ marginBottom: '20px', ... }}>
            <img src={imgSrc} alt={offering.name} ... />
          </div>
        )}
        <CardHeader ... />
        <PriceDisplay ... />
        <FeatureList ... />
        <Button>Choose Plan</Button>
      </div>
    </div>
  );
};
```

## User Experience

### Admin Panel
1. Create/Edit membership
2. Upload custom image (no cropping - exact image used)
3. Toggle between:
   - **Background Image**: Image fills card background with gradient overlay
   - **Inline Image**: Image displayed above card content with default design
4. All buttons and interactions remain functional over images

### Customer View
- **Background Mode**: Full-bleed image with text overlay and interactive buttons
- **Inline Mode**: Image displayed as content element within standard card design
- Seamless rendering based on admin settings

## Technical Notes

### Why customRequest Pattern?
- The `action` prop approach doesn't properly handle:
  - Authentication headers (even with headers prop)
  - Progress callbacks
  - Error responses
- `customRequest` gives full control over the upload process using apiClient

### Default Behavior
- `use_image_background` defaults to TRUE for backward compatibility
- Existing memberships without this field will continue to show background images
- Toggle is disabled when no image is uploaded

### File Validation
- Only image files accepted
- Maximum 5MB file size
- Client-side validation before upload

## Testing Checklist

- [x] Migration applied successfully
- [x] Column added with correct type and default
- [x] Backend API updated (GET/POST/PUT)
- [x] Admin form uploads images correctly
- [x] Upload progress shows during upload
- [x] Toggle switch works and saves to database
- [x] Customer page respects use_image_background setting
- [x] Background mode shows image as card background
- [x] Inline mode shows image within default card
- [x] Buttons remain interactive in both modes
- [x] Form warnings resolved
- [x] No console errors

## Migration Status
✅ Migration 112 applied and tracked in schema_migrations
✅ Column verified: `use_image_background BOOLEAN DEFAULT TRUE`
