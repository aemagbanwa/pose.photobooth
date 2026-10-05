# POSE Gallery Admin – Configuration as Source of Truth

This version changes the gallery lifecycle so **POSE Gallery Configuration** is the authoritative source of gallery albums.

## Important behavior

- A Google Drive folder is **not** shown in the public gallery just because it exists under the gallery root folder.
- Albums must first be added from **Gallery Admin → Add Album**.
- New albums are created as **unpublished drafts**.
- Gallery Admin can update event name, event date, category, PIN protection, downloads, expiry, cover file ID and Published status.
- **Remove from Gallery** deletes only the configuration record and its gallery index entry. It never deletes the Google Drive folder or photos/videos.
- `refreshGalleryIndex()` now indexes only configured albums.
- `refreshGalleryConfig()` no longer auto-registers Drive folders.

## Deploy

1. Replace your Apps Script code with `backend/pose-gallery.gs`.
2. Save the Apps Script project.
3. Deploy → Manage deployments → Edit → New version → Deploy.
4. Run `setupGalleryIndex()` once if the index trigger is not already installed.
5. Deploy the website files, including `gallery/admin/index.html`.
6. Open the existing private Gallery Admin URL and hard refresh (Ctrl+F5).

## Existing records

Existing rows in the Events sheet remain registered albums. New `Event Date` and `Event Type` columns are added automatically. If those fields are blank, the index falls back to information inferred from the Drive folder name until you save them from Gallery Admin.
