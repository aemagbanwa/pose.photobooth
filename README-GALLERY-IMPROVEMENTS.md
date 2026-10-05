# POSE Gallery performance update

This build adds the next round of gallery improvements while keeping the existing shared header/footer and album pagination.

## Frontend changes

- 12 event albums per page with numbered Previous/Next pagination.
- URL state for album page, category, media type, sort, and search. Example: `/gallery/?category=birthday&page=2`.
- Browser Back/Forward restores gallery filter/page state.
- Scroll position is preserved for return visits in the same browser session.
- Album covers use lazy loading, async decoding and priority hints.
- 12 loading skeletons on desktop, reduced automatically on smaller screens.
- Mobile album grid uses two columns on most phones and one column on very narrow screens.
- PIN dialog has Show/Hide, length validation, and a short client-side cooldown after repeated failed attempts.
- Lightbox keeps keyboard arrows, Escape close, and mobile swipe navigation.
- Public gallery metadata now includes canonical/Open Graph tags.

## Backend changes

`backend/pose-gallery.gs` is the updated Google Apps Script backend.

For an event request the frontend now sends `limit`, `offset`, and `pageToken`. The backend returns only the requested media batch plus:

- `itemCount`
- `photoCount`
- `videoCount`
- `hasMore`
- `nextPageToken`

Default frontend media page size is 30 items. Album covers use 640px thumbnails, gallery thumbnails use 240px thumbnails, and opened images use a 1600px Drive thumbnail before the original/download link is requested.

## Deploy

1. Replace the code in the existing POSE Gallery Apps Script project with `backend/pose-gallery.gs`.
2. In Apps Script choose **Deploy > Manage deployments**, edit the existing web app deployment, select **New version**, and deploy. Keeping the existing deployment preserves the current `/exec` URL.
3. Deploy the website files as usual.
4. Hard refresh the gallery after deployment. This build uses `styles.css?v=28` and `app.js?v=30`.

The album index is intentionally still returned as lightweight event summaries so client-side search/category filters cover all events. The heavy media payload is paginated server-side.
