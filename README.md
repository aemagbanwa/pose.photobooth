# POSE Photobooth Website

Vercel-hosted website for POSE Photobooth, including the public event pages, inquiry form, Boothmate integration, and Google Apps Script backup.

## Project layout

- `index.html` - website entry point
- `assets/` - styles, scripts, images, and video
- `api/inquiries.js` - Vercel function that creates Boothmate inquiries and syncs the legacy backend
- `google-apps-script/Code.gs` - inquiry storage and email backend
- `START_LOCAL_PREVIEW.bat` - Windows preview launcher

## Local preview

On Windows, double-click `START_LOCAL_PREVIEW.bat`. If Python is installed, it starts a local server at `http://localhost:8080/`.

The Python preview serves static files only; inquiry submissions require the Vercel function. Use `vercel dev` to test the complete inquiry flow locally.

## Configuration

Website inquiries are sent through the Vercel serverless function at `api/inquiries.js`, which creates a Boothmate record and syncs to the existing Google Apps Script backend.

Set these environment variables in the Vercel project settings:

- `BOOTHMATE_API_BASE_URL` - Boothmate API origin, using HTTPS.
- `BOOTHMATE_ORGANIZATION_KEY` - organization key used in the public storefront route.
- `BOOTHMATE_PACKAGE_IDS` - JSON object mapping the exact website package labels to Boothmate package IDs, for example `{"4R":"<package-id>","Strip":"<package-id>"}`.
- `POSE_INQUIRY_ENDPOINT` - optional override for the Google Apps Script backup endpoint. The existing deployment URL is used by default.

Keep organization keys and any future API credentials in Vercel environment variables, never in browser JavaScript. The static Python preview does not execute `/api/inquiries`; use `vercel dev` to test inquiry submissions locally.

The optional gallery configuration is in `assets/js/gallery-config.js`. Keep the configured Google Apps Script and Drive resources available to the public site before deploying.

## Deploy the inquiry backend

1. Open the Google Apps Script project associated with the inquiry endpoint.
2. Replace its `Code.gs` contents with `google-apps-script/Code.gs`.
3. Run `setup` once and approve the requested permissions.
4. In **Deploy > Manage deployments**, edit the web app deployment and create a new version.
5. Keep **Execute as** set to the owner and **Who has access** set to **Anyone**.
6. Open the `/exec` URL and confirm it returns a successful JSON response with the current system version.

The Apps Script stores the secondary inquiry copy in a spreadsheet named `POSE Website Inquiries`, sends an owner notification, and sends a customer confirmation when an email address is provided.

## Pre-publish checks

- Preview the site locally and check the navigation, images, video, package links, and inquiry form.
- Set the Boothmate API origin, organization key, and package ID mapping in the Vercel project environment.
- Submit a test inquiry and verify the Boothmate record and Google Sheets/email backup.
- Submit one test inquiry with an email address and one without one.
- Confirm both inquiries appear in the sheet and that email behavior matches the form input.
- Check the browser console for failed assets or script errors.
- Verify that no local credentials, `.env` files, or generated files are included in the commit.

No build step is required. Vercel serves the static site and deploys `api/inquiries.js` as a serverless function. Update the Google Apps Script deployment only when its backend code changes.
