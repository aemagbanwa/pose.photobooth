# Album ZIP downloads

## Deploy both parts
1. Upload the updated website files to your existing web host (especially gallery/app.js, gallery/index.html, and gallery/styles.css).
2. Open the Google Apps Script project used by gallery/assets/config.js. Replace its gallery code with backend/pose-gallery.gs.
3. In Apps Script choose Deploy > Manage deployments > Edit > New version > Deploy. Keep the existing web app URL and deployment access settings. Saving the editor alone does not update the deployed backend.
4. Refresh the gallery. Open an album and choose Download album ZIP. A single ZIP prepares automatically; click Save when ready. For a multipart album, prepare and save each numbered ZIP.

## Behavior and limits
- Collects all current album media directly from Drive, including files beyond the page currently loaded.
- ZIP compression preserves the original files. JPEGs and videos are already compressed and may show little size reduction.
- Each ZIP part contains at most 20 MiB of original data or 40 files to bound Apps Script memory and work. Each numbered ZIP can be extracted independently.
- If any individual file exceeds 20 MiB, album ZIP preparation stops with an explanation. Use the existing individual photo/video download control for that album. This version does not support large-video album ZIPs.
- PIN, publication, expiry, and download permissions are checked on every ZIP request. No temporary public ZIP files are created in Drive.
- Files have numbered filename prefixes to prevent duplicate-name collisions. Album changes between preparation requests require starting again, preventing mismatched parts.
- Close the ZIP window to cancel the browser request and release prepared downloads. Google may finish work already running on its server.
- Apps Script quotas, runtime limits, and browser memory still apply. Slow/failed requests show an error and retry control; no incomplete archive is presented as complete.

## Validation
Run `node tests/album-zip.test.cjs`, `node tests/album-zip-ui.test.cjs`, and `node tests/album-cover.test.cjs`.
Automated checks cover authorization, ZIP grouping, filenames, changed albums, dialog state, saved ZIP link creation, and old-backend handling. Live Apps Script/Drive downloads require deployment and have not been tested against your account.
