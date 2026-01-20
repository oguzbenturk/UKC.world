# Image Upload Sync - Development to Production

## Problem
When developing locally with production database:
- Images upload to: `D:\kspro-plannivo\backend\uploads\images\`
- Database saves path: `/uploads/images/image-xxx.jpg`
- **Production server doesn't have the file** (it's only on your local computer)

## ✅ RECOMMENDED SOLUTION: Direct Production Upload

Upload directly to production server while developing locally - **NO MANUAL SYNC NEEDED!**

### What's Covered:
This solution works for **ALL file uploads** throughout the application:
- ✅ Event images (Event Manager)
- ✅ User profile pictures/avatars
- ✅ Instructor profile pictures
- ✅ Service & accommodation images
- ✅ Product images (main + additional images)
- ✅ Any other file upload functionality

**All upload components now use the centralized `uploadHelper` utility** which automatically detects production mode and routes files accordingly.

### Setup (One-time):

1. **Add to `.env.test` file:**
   ```env
   VITE_UPLOAD_URL=https://plannivo.com/api
   ```
   Replace `plannivo.com` with your actual production domain.

2. **Restart dev server:**
   ```bash
   npm run dev
   ```

### How It Works:
- ✅ When you upload an image in dev, it goes **directly to production server**
- ✅ Image is saved to production: `/var/www/plannivo/backend/uploads/images/`
- ✅ Database path matches actual file location
- ✅ Images appear instantly on production website
- ✅ No manual sync scripts needed!

### Verify It's Working:
1. Upload an event image in Services Settings > Event Manager
2. Check production server: `ls /var/www/plannivo/backend/uploads/images/`
3. Image should be there immediately!

---

## Alternative Solutions

### Option 2: Manual Sync with SCP (Old Method)
After uploading images locally, sync them to production:

```powershell
# Windows PowerShell
.\sync-uploads-to-production.ps1 -ServerHost "your-server.com" -ServerUser "username"
```

```bash
# Linux/Mac or Git Bash
scp -r backend/uploads/* username@your-server.com:/var/www/plannivo/backend/uploads/
```

### Option 3: Cloud Storage (Best Long-Term)
Use a shared storage service accessible from both environments:

**AWS S3:**
```bash
npm install @aws-sdk/client-s3 multer-s3
```

**Cloudinary:**
```bash
npm install cloudinary multer-storage-cloudinary
```

**Azure Blob Storage:**
```bash
npm install @azure/storage-blob multer-azure-storage
```

Then update `backend/routes/upload.js` to use cloud storage instead of local disk.

---

## Production-Only Development Setup

If you're using production database in development:

1. ✅ Set `VITE_UPLOAD_URL` to production (uploads go there automatically)
2. ✅ Images appear instantly, no sync needed
3. ✅ Works seamlessly like using the live website

## Notes

- **Images are NOT in Git** - `backend/uploads/` is in `.gitignore`
- **Direct upload requires production auth** - Uses your JWT token automatically
- **CORS must allow your local dev** - Production server should allow `localhost:3000`
