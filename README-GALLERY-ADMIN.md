# POSE Gallery Admin update

This build adds a private web admin page at `/gallery/admin/`.

## New admin capabilities
- Search all indexed events
- Publish / unpublish an event
- Enable / disable PIN protection
- Enable / disable downloads
- Change expiry date
- Change Google Drive cover file ID
- Set a new PIN without storing plaintext
- Generate / replace a client PIN-management link
- Refresh the Drive-backed Gallery Index on demand

## Deploy
1. Replace the Apps Script project code with `backend/pose-gallery.gs`.
2. Save and redeploy the existing Web App deployment as a new version.
3. Run `setupGalleryAdmin()` once from the Apps Script editor.
4. Copy the URL returned in the execution result/log. It will look like:
   `https://poseph.com/gallery/admin/?token=...`
5. Keep this URL private. Running `setupGalleryAdmin()` again invalidates the previous admin link.
6. Upload the website files, including `gallery/admin/index.html`.

## Published setting
The Events sheet now gains a `Published` checkbox column. Existing blank rows remain published by default for backward compatibility. The admin page can explicitly publish/unpublish each event.

Unpublished or expired events are blocked from the public index, slug lookup, and direct event opening.
