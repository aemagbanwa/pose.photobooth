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
