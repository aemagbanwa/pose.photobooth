# POSE Photobooth Website

Static website for POSE Photobooth, including the public event pages, inquiry form, and Google Apps Script inquiry backend.

## Project layout

- `index.html` - website entry point
- `assets/` - styles, scripts, images, and video
- `google-apps-script/Code.gs` - inquiry storage and email backend
- `START_LOCAL_PREVIEW.bat` - Windows preview launcher

## Local preview

On Windows, double-click `START_LOCAL_PREVIEW.bat`. If Python is installed, it starts a local server at `http://localhost:8080/`.

The site can also be opened directly from `index.html`, although the local server is recommended for checking all assets.

## Configuration

The inquiry form endpoint is configured in `assets/js/inquiry-config.js`.

The optional gallery configuration is in `assets/js/gallery-config.js`. Keep the configured Google Apps Script and Drive resources available to the public site before deploying.

## Deploy the inquiry backend

1. Open the Google Apps Script project associated with the inquiry endpoint.
2. Replace its `Code.gs` contents with `google-apps-script/Code.gs`.
3. Run `setup` once and approve the requested permissions.
4. In **Deploy > Manage deployments**, edit the web app deployment and create a new version.
5. Keep **Execute as** set to the owner and **Who has access** set to **Anyone**.
6. Open the `/exec` URL and confirm it returns a successful JSON response with the current system version.

The Apps Script stores inquiries in a spreadsheet named `POSE Website Inquiries`, sends an owner notification, and sends a customer confirmation when an email address is provided.

## Pre-publish checks

- Preview the site locally and check the navigation, images, video, package links, and inquiry form.
- Submit one test inquiry with an email address and one without one.
- Confirm both inquiries appear in the sheet and that email behavior matches the form input.
- Check the browser console for failed assets or script errors.
- Verify that no local credentials, `.env` files, or generated files are included in the commit.

This project has no package manager or build step; deployment consists of publishing the tracked website files and updating the Apps Script deployment when its code changes.

## Client-managed gallery PIN

The gallery now supports secure client self-service PIN changes.

1. Deploy the updated `google-apps-script/gallery_script.gs` as the existing web app (execute as you; access: anyone).
2. Run `setupGalleryConfig()` once after deploying so the Events sheet receives the new columns and the management-token salt is initialized.
3. Open the private **POSE Gallery Configuration** spreadsheet and select the event row.
4. Use **POSE Gallery → Generate/replace client PIN link**. Copy the URL from **Client Management Link** (column J) and send it to the client.
5. After sending it, you may use **POSE Gallery → Clear visible client link**. This removes the plaintext URL from the sheet while its hidden token hash remains valid.
6. The client opens the link at `/gallery/manage/?token=...`, enters a new PIN twice, and saves it. The new PIN is salted/hashed exactly like admin-entered PINs and `PIN Enabled` is turned on automatically.

Generating a replacement client link invalidates the previous management link. The event folder ID by itself cannot change a PIN. Column K stores only the management-token hash and is hidden automatically.


## Shared header and footer
The main page and gallery now use `/partials/header.html` and `/partials/footer.html`.
`/assets/js/partials.js` injects the shared partials, handles the mobile navigation, marks Gallery active, and updates the copyright year.
Edit the partial files once to update both pages.

## Gallery scaling update (October 2026)
See `README-GALLERY-SCALING.md`. After deploying the included Apps Script backend, run `setupGalleryIndex()` once before testing the optimized gallery.
