# POSE Gallery scaling update

This build adds a lightweight Drive-backed gallery index so public visitors no longer trigger a full scan of every event folder on every gallery request.

## What changed

- Server-side event album pagination (12 albums per request by default)
- Server-side event search, category filtering, media filtering, and sorting
- Lightweight `Gallery Index` sheet stored in the existing private gallery configuration spreadsheet
- Automatic index refresh trigger every 10 minutes
- Media inside an event still loads in batches (30 items by default)
- Server-side PIN attempt throttling keyed to the browser session and event
- Shareable event URLs using `?event=<event-slug>`
- Dedicated Share Album button
- Adjacent-image preloading in the lightbox
- One automatic retry when a Drive image thumbnail fails
- Request cancellation when users rapidly change filters/search

## Required deployment steps

1. Open the existing POSE Gallery Google Apps Script project.
2. Replace the gallery backend code with `backend/pose-gallery.gs`.
3. Save the script.
4. From the Apps Script editor, run `setupGalleryIndex()` once and authorize it when prompted.
   - This creates/refreshes the `Gallery Index` sheet.
   - It installs a 10-minute refresh trigger.
5. Deploy a new version of the **existing web app deployment** so the `/exec` URL stays the same.
6. Deploy the website files.
7. Hard refresh the gallery (Ctrl+F5).

## When new events are uploaded

The scheduled index refresh picks them up within about 10 minutes. To publish immediately, run `refreshGalleryIndex()` from Apps Script after uploading files.

## URL examples

Filtered gallery:

`/gallery/?category=birthday&page=2`

Shareable event link:

`/gallery/?event=2026-10-03-thomson-reuters-year-end-party-xxxxxx`

The event slug is generated from the event date/name plus a short folder-ID suffix so similarly named events remain unique.

## Security note

PIN throttling is now enforced by the backend in addition to the browser cooldown. Because Google Apps Script does not expose a reliable visitor IP address to this web app, throttling is keyed to a generated browser-session key plus the event. This improves abuse resistance without globally locking legitimate guests out of the album.
