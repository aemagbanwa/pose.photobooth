# POSE Gallery — album download fix (November 18, 2026)

## Root cause
`backend/pose-gallery.gs` previously rejected the entire album whenever any image or video exceeded 20 MiB. This happened before the ZIP manifest was returned, even if the other files could be compressed.

## Changes
- ZIP preparation now includes all eligible media from the Google Drive event folder, irrespective of gallery pagination (for example, all 137 items, not merely the first 30 loaded).
- Media of 20 MiB or less are grouped into bounded ZIP parts, preserving the existing per-request memory limit and original files.
- Media over 20 MiB are listed as separate original-quality download links within the same album-download dialog, rather than blocking the other items.
- The dialog displays total media count, media in ZIP parts, and oversized media requiring separate download.
- Existing PIN, expiration, visibility and downloads-enabled checks are retained before returning the manifest.

## Important limitations
This is a **partial ZIP workaround**, not a single ZIP of every image and video. A single ZIP including large videos needs a different streaming-capable backend or a new architecture; Google Apps Script's JSON/base64 ZIP endpoint is not suitable for arbitrarily large media. Individual large-file links use Google Drive's existing download URLs, so their accessibility depends on Drive file permissions and Drive download restrictions. No live Drive access was available in the source-only test.

## Deployment
1. Update the **existing gallery** Google Apps Script deployment with `backend/pose-gallery.gs` and publish a **new version** (keep the existing `/exec` URL and existing settings).
2. Publish the website source with `gallery/app.js` updated. Do not replace the configured endpoint with a new one.
3. Open an album with a file larger than 20 MiB; select Download Album ZIP. Confirm ZIP parts and separate large-file download links appear.
4. Confirm counts add up: ZIP contents + large files should equal the full album count, including content not yet shown in the gallery viewer. Test each type of link, and an album requiring a PIN.

Do not run fresh gallery setup or replace the original Google Drive folder during this deployment.
