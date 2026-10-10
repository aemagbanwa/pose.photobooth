# Album cover save fix

Cause: admin Save wrote Cover File ID into Events, but public album listings still read the previous cover from Gallery Index. The admin preview was not refreshed either.

## Install both parts

1. Replace gallery/admin/index.html on your website.
2. In your existing Google Apps Script project, replace the gallery backend code with backend/pose-gallery.gs from this archive. Keep your existing project and configuration.
3. Save, then update the existing web-app deployment to a new version (Deploy → Manage deployments → edit the existing deployment → New version → Deploy). Keep the same deployment URL and access settings.
4. Reload the admin page. Paste the cover's Drive file link or ID, then Save. The file must be an image or video inside that album's Drive folder. Leave the field blank for automatic selection.
5. For an earlier saved cover that is still stale, open its album card and Save once more. Reload the public gallery afterward.

The save now updates just that album's indexed cover and returns the thumbnail URL to the admin page. Unchanged covers skip a Drive scan. Invalid file selections are rejected before settings are written. A cleared cover remains blank in the admin field (automatic mode). The shared-album lookup also fixes an undefined variable that prevented that route from returning an album.

No frontend config URL changes are needed when updating the existing Apps Script deployment. Uploading the website files alone will not apply the backend fix.

## Verification

Run node tests/album-cover.test.cjs. Mocked Apps Script tests cover Drive-link normalization, index updates, stale-index repair, clearing to automatic, invalid-file rejection, and unchanged-cover performance. JavaScript syntax checks passed. Live Google Apps Script deployment and browser interactions were not performed.
