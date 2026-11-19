# POSE Partners affiliate integration — v1.1

## What is included

- Public program page: `/partners/`
- Application page: `/partners/register.html`
- Passwordless email-code login and affiliate dashboard: `/partners/dashboard.html`
- Admin application approval, booking reconciliation, status changes, payout recording: `/partners/admin.html`
- Draft terms and privacy notice: `/partners/terms.html`
- Referral query capture (`?ref=POSEXXXXXXXX`) for 30 days in the customer's browser and an optional referral field on the current inquiry form.
- New **Affiliate Code** column in the *existing* inquiry Google Apps Script backend, with no changes to existing inquiry data columns.
- Standalone Google Apps Script affiliate backend: `backend/pose-partners.gs`.

## REQUIRED DEPLOYMENT — THIS ZIP IS NOT A LIVE SERVICE

1. Create a **new** Apps Script project at script.google.com, under the Google account that will own POSE Partners records.
2. Paste **all** contents of `backend/pose-partners.gs` into its Code.gs (separate from the existing inquiry/gallery scripts).
3. In **Project Settings → Script properties**, create `PARTNERS_ADMIN_EMAIL` with your administrator mailbox. It must be an actual email you control; do not put this address in public site JavaScript.
4. Run `setupPartners()` from the Apps Script editor and authorize Google Sheets and sending mail. It creates `POSE Partners - Affiliate Registry` with `affiliates`, `bookings`, `audit` tabs.
5. **Deploy → New deployment → Web app**. Execute as **Me**; access **Anyone** (necessary for public affiliate registration). Copy the `/exec` URL. Treat it as public, not a secret.
6. Paste the URL into `assets/js/partners-config.js` as `endpoint`, keeping quote marks.
7. Open your existing inquiry Apps Script project; replace its existing Code.gs with `backend/pose inquiry.gs`, preserving your original script project's deployment and permissions. Update the existing deployment to a **new version**. Do not deploy this file into the affiliate script project.
8. Publish the modified site files to poseph.com, preserving existing images, assets, gallery and site paths.
9. Test registration, admin OTP, approval, affiliate OTP and link copy, an inquiry via `?ref=...`, the inquiry sheet's new Affiliate Code column, then admin record booking by matching the inquiry Submission ID and affiliate code. Mark completed only after event and full payment; review the retroactive tier calculations. Mark paid only after real payout.

## IMPORTANT CURRENT LIMITATIONS / SAFETY

- **Manual reconciliation required:** the inquiry service and affiliate service are different Apps Script deployments. A new inquiry captures the affiliate code in the inquiry spreadsheet, but it is *not* automatically a commissionable booking. Admin must match a real inquiry Submission ID and its recorded affiliate code before creating the booking record. This is intentional; inquiries do not equal paid bookings.
- Referral is stored client-side for up to 30 days in localStorage; disabling storage, switching devices or removing the code can break attribution. The referral field can be manually entered, and POSE must verify it.
- Google Apps Script Web App cross-origin browser requests should be tested against your hosting setup; failures must not be treated as successful submissions. This frontend rejects unverified responses.
- Google Apps Script CacheService session tokens have a 6-hour maximum life and may expire earlier. Login codes expire in 10 minutes, and resend throttling is 60 seconds.
- Tier calculation uses the **event date calendar month**, not booking confirmation month. Qualifying statuses are Completed and fully paid. Starter 0%, Silver 3–5 = 10%, Gold 6–10 = 20%, Platinum 11+ = 30%, all retroactive within month. Monthly performance is not a permanent tier.
- **Do not pay a monthly tier until that month's eligibility is finalized.** Once a booking commission is marked Paid, its recorded payout is frozen. New qualifying bookings could retroactively increase a prior booking's tier; reconcile such adjustments manually. This first release does not automatically settle tier-difference adjustments or enforce ₱500 minimum payout.
- The commission amounts are predefined in the affiliate server only; changes to public service pricing do not automatically change commissions.
- For production launch: verify local privacy and tax requirements, finalize the draft terms with professional review, perform a security review, validate deployment permissions and administrator email, and test Apps Script quotas / service capacity. Apps Script is suitable as a low-volume pilot, not a hardened high-scale affiliate platform.
- OTPs go to the registered email; never put Apps Script admin credentials or private sheet IDs in public website code. Only the configured admin email is authorized to edit records.

## Files changed

`index.html`, `partials/header.html`, `partials/footer.html`, `assets/js/partner-referral.js`, `assets/js/partners-config.js`, `assets/js/partners.js`, `assets/css/partners.css`, `partners/*.html`, `backend/pose inquiry.gs`, `backend/pose-partners.gs`.


## VERSION 1.1 — QR payments and payout requests

- Registration now requires GCash or Maya, registered wallet account name, mobile wallet number, and a PNG/JPEG QR image. The browser compresses an original image up to 2 MB to at most approximately 500 KB for upload. Partner login can replace payment details unless a payout request is pending.
- `setupPartners()` upgrades existing affiliate sheet headers in place and creates a `payouts` tab. No old records are deleted. Existing partners will have blank QR/wallet fields until updated through the dashboard.
- Private QR images are saved under a Drive folder **POSE Partners - PRIVATE Payment QRs**, owned by the script owner. **Do not share this folder, its files, or make its links public.** QR images are returned only to OTP-authenticated partner owner or admin.
- Affiliates can request payout once eligible, completed, fully paid bookings from *prior event months* total at least ₱500. Active month commissions stay unavailable until next month to avoid mid-month retroactive tier changes. Only one pending payout per affiliate is allowed.
- Admin opens **Pay via QR**, verifies wallet account name and number, manually sends the money, enters the actual reference (at least 6 characters), and confirms. The backend records allocations and transaction details and prevents duplicate transaction references and duplicate payout. **This does not automatically send money.**
- **Critical deployment:** Update the standalone Apps Script project's source to the new `backend/pose-partners.gs`, run `setupPartners()` again to grant Drive permission and apply schema changes, and redeploy as a **new version** of your existing web app. Keep its existing endpoint unchanged if using the same deployment. Publish the updated HTML/CSS/JS site files.
- Previously paid booking records from v1 have no wallet reference; don't use this flow to reconstruct them or re-pay them.
- Security checklist: use an administrator-owned Google account, restrict spreadsheet/Drive sharing, review actual wallet recipient in the wallet app, test a low-value payout, and verify deployment permissions. The site and Apps Script remain a pilot, not a penetration-tested production payment platform.
- Known limitation: there is no admin reject/cancel workflow for an already requested payout. If a payout cannot be made, resolve it in the private backend with a documented audit adjustment; do not mark paid without an actual transfer. Do not backdate completed bookings into months with pending payouts, because this can change tier amounts and fail reconciliation.


## VERSION 1.2 — payment screenshot evidence

- Admin **must upload a PNG/JPEG transaction screenshot** (up to 2 MB original, compressed client-side) when confirming a payout, along with the real GCash/Maya reference.
- Saved receipt images live in a **private Google Drive folder** called `POSE Partners - PRIVATE Payout Receipts`. Only the administrator and the recipient affiliate can view them through authenticated backend calls. Never share Drive folders publicly.
- Payout sheet now adds a `Receipt File ID` column, applied without deleting earlier data by running `setupPartners()` after updating the script. Existing historical payouts have no screenshots.
- Both admin and affiliate dashboards offer a **View receipt** action for payouts that have a saved receipt.
- The affiliate dashboard currently shows **verified booking/referral records manually entered by POSE**, not all new inquiry submissions. Inquiry-form referral codes are stored in the separate inquiry spreadsheet and must be reconciled by the administrator.
- Redeploy the new Apps Script **version**, then publish updated site files. Test receipt upload and access permissions using a test payout before live use.


## VERSION 1.3 — automatic affiliate inquiry visibility

**What changed**
- The public inquiry backend securely forwards referral-attributed inquiries to the partners backend using a **server-only shared secret**, never a browser-exposed token.
- Affiliate dashboards now show their own inquiry reference, service, event date and status automatically; customer names, telephone numbers, email addresses and messages are **not** copied or returned.
- The administrator sees all synchronized affiliate inquiries and can update unlinked inquiry status (New Inquiry, In Progress, Cancelled).
- 'Prepare booking' pre-fills the pre-existing reconciliation form. POSE must independently verify the reservation/payment and select the actual commissionable service. A synced inquiry alone earns **no commission**.
- Creating a booking now requires a previously synchronized inquiry ID and a matching affiliate code/event date. Subsequent booking status changes update its linked inquiry automatically.
- Sync is idempotent by submission ID and attribution cannot silently switch to another affiliate. The original inquiry is still saved even if partners sync is temporarily unavailable.
- Adds a non-destructive `inquiries` tab in the Partners spreadsheet and an `Affiliate Sync` column to the existing inquiry spreadsheet. Already-synced rows are skipped in the reconciliation function.
- Existing payout QR uploads, transaction reference numbers, payment screenshot evidence and commission tiers remain unchanged.

**Required setup (both separate Apps Script projects)**
1. In the **Partners** Apps Script project, replace the script with `backend/pose-partners.gs`. In **Project Settings → Script properties**, keep `PARTNERS_ADMIN_EMAIL`, existing database properties and add `PARTNERS_SYNC_SECRET` with a newly generated, random, **32+ character** secret. Run `setupPartners()` to add the `inquiries` sheet without deleting existing affiliate, booking, payout or receipt records. Redeploy a **new version** of the web app; retain its `/exec` URL.
2. In the **Inquiry** Apps Script project, replace the script with `backend/pose inquiry.gs`, while retaining the existing `POSE_INQUIRY_SPREADSHEET_ID`. Set `PARTNERS_SYNC_ENDPOINT` to the Partners web app `/exec` URL and `PARTNERS_SYNC_SECRET` to the **exact same** secret. **Never publish these script properties in HTML or client JavaScript.** Run `setup()` and grant any newly requested UrlFetch permissions, then redeploy a **new version**.
3. Publish the updated `partners/dashboard.html`, `partners/admin.html`, and `assets/js/partners.js` along with the rest of the site. Keep `assets/js/partners-config.js` pointed to the Partners deployment.
4. In the existing **Inquiry** Apps Script project, run `syncRecentPartnerInquiries()` once to import up to the 300 most recent unacknowledged referral-coded inquiries. Run it manually again if any past imports failed. For ongoing retry automation you may configure a **time-driven trigger** for this function, but first assess Apps Script quotas and limits; it will scan the last 300 rows each run and only resend those not marked `Synced`.
5. Test with an **approved** test affiliate's actual `?ref=POSEXXXXXXXX` link. Submit an inquiry on the public site, verify `Affiliate Code` and `Affiliate Sync = Synced` in the primary inquiry Sheet, then check that it appears in the affiliate's **Referred inquiries** and admin **Affiliate inquiries** tables.
6. Test **In Progress**, **Prepare booking**, record a Pending booking after checking a real reservation, mark Completed only after event completion and full payment, and confirm the referral status and commission amount update. Test affiliate accounts cannot access one another's inquiries, and verify payout receipts still work.

**Operational cautions**
- An unapproved/unknown affiliate code is deliberately not imported. Unacknowledged entries are eligible for later retry; verify referral approval if an inquiry does not appear.
- The two Apps Script deployments must remain separate. Never add both `doPost` definitions into one project.
- This is still a Google Sheets + Apps Script **pilot**, not a hardened commercial payment processor. Test endpoints and admin authorization before public rollout. Recording a screenshot and reference does **not** initiate the payment.
- For any old manually recorded booking that was not originally synced as an inquiry, its existing commission remains intact; new bookings need a synchronized inquiry.
- If a customer alters an inquiry after it is synced, this version does not automatically synchronize edits. POSE should verify actual booking details against the authoritative inquiry records.


## VERSION 1.4 — affiliate email notifications

**What changed**
- Approved partners receive an email when a *new, referral-attributed inquiry* is first saved in the Partners backend. The email includes the inquiry ID, service, event date and dashboard link, but no customer name, telephone number, email address or private message.
- Approved partners receive a second email when POSE links that inquiry to a *confirmed booking* in the admin dashboard. Booking ID, service, event date and dashboard link are included. Recording a cancelled booking does not send a confirmation.
- Repeated inquiry syncs are detected as duplicates and **do not resend** the inquiry email. Duplicate booking IDs cannot be recorded.
- Email sends are attempted only after a record is written. Email failures are logged in the `audit` tab as `email_failed` (successes as `email_sent`) and do not reverse saved inquiries/bookings. Failed messages are **not automatically retried**; check the audit log if a partner reports missing mail.
- This release also corrects the `syncInquiry` backend route so it authenticates with the server-side `PARTNERS_SYNC_SECRET` rather than requiring a partner login token.

**Deployment**
1. In the existing **Partners** Google Apps Script project, replace the contents with the updated `backend/pose-partners.gs`. Keep the existing `PARTNERS_ADMIN_EMAIL`, `PARTNERS_SYNC_SECRET`, `PARTNERS_DB_ID`, QR and receipt folder properties.
2. Add optional Script Property `PARTNERS_EMAIL_NOTIFICATIONS` = `true` (default). Setting it to `false` disables these two email alerts, but does not disable registration, OTP, approval or payout-request emails.
3. Run `setupPartners()` to verify the existing database; no new spreadsheet columns are required. Authorize MailApp if prompted. Redeploy the existing Partners web app as **a new version** and keep its same `/exec` endpoint. **No changes to the inquiry Apps Script or website HTML are required for this release.**
4. Verify the inquiry Apps Script still has the matching secret and Partners endpoint. Submit a test inquiry with an approved affiliate's referral link. Confirm exactly one inquiry email and `email_sent` audit entry; retry synchronization to verify no second email.
5. In the admin dashboard, reconcile the test inquiry into a non-cancelled booking and verify the affiliate receives exactly one booking confirmation email. Test duplicate booking prevention and check that the affiliate sees only their own inquiry/booking.

**Before launch:** Google Apps Script email quotas, mail delivery and live Web App behavior must be tested in the owner's account. These files are prepared for deployment, not deployed or verified on poseph.com.


## VERSION 1.5 — persistent affiliate notification center

- Approved affiliates can view the newest 100 account-scoped notifications on their dashboard, with an unread count, refresh control and per-item **Mark as read**. The backend checks the logged-in affiliate ID before marking any notification as read.
- Notification records cover newly synchronized inquiries, inquiry status changes, booking confirmation/cancellation/status updates, withdrawal requests, completed payout records (with reference number), and administrator announcements. Customer contact data and payout QR images are not stored in notifications.
- The administrator dashboard includes a form to publish an in-dashboard announcement to approved partners (maximum 400 accounts per request). Announcements do not send emails.
- A new `notifications` Google Sheet is created non-destructively when `setupPartners()` runs. Existing data, email notifications and receipt handling remain in place. No scheduled trigger is needed.

**Upgrade from v1.4:** Replace the existing Partners Apps Script code with `backend/pose-partners.gs` and run `setupPartners()`; redeploy a new web app version. Publish `partners/dashboard.html`, `partners/admin.html`, `assets/js/partners.js`, and `assets/css/partners.css`. Keep existing script properties and `/exec` URL. No inquiry-backend change required. Test two affiliates for cross-account isolation, read-state persistence, and a payout confirmation. Older events are not backfilled as notifications; they remain visible in the bookings/inquiries tables.

**Status:** Source-level implementation only. A real Apps Script account and deployed website are required to test end-to-end.


## v1.6 — Troubleshooting affiliate inquiries that do not appear

The normal website inquiry is stored in the separate **POSE Website Inquiries** spreadsheet. Only a submission with an **approved affiliate's exact POSEXXXXXXXX referral code** is copied into the **POSE Partners - Affiliate Registry → inquiries** tab; it will not be inserted in the affiliates tab.

1. In the **Inquiry** Apps Script project, replace `backend/pose inquiry.gs`, run `setup()`, and redeploy the **existing web app deployment as a new version**. Do not create a new deployment unless you also update the public website inquiry endpoint.
2. Ensure Inquiry Script Properties include `PARTNERS_SYNC_ENDPOINT` (the deployed Partners `/exec` URL) and `PARTNERS_SYNC_SECRET` (same 32+ character secret as the Partners project).
3. Ensure Partners script runs v1.5 or higher, `setupPartners()` ran, Partners `PARTNERS_SYNC_SECRET` matches, and the referring affiliate's Status is `Approved`.
4. From the Inquiry script editor run `diagnosePartnerSync()`. Read the execution log; it reports whether the endpoint/secret/columns exist and the last 20 inquiry sync statuses **without printing any secrets**.
5. Run `syncRecentPartnerInquiries()` in the Inquiry script editor to retry the last 300 eligible submissions. Failed or unapproved referrals now show a short reason in **Affiliate Sync** rather than an empty cell.
6. Submit a brand-new inquiry using a full affiliate link `https://poseph.com/?ref=POSEXXXXXXXX`, or manually enter an approved referral code in the Partner referral code field. Confirm **POSE Website Inquiries → Inquiries → Affiliate Code and Affiliate Sync**, then **POSE Partners - Affiliate Registry → inquiries**.
7. A test inquiry without a referral code is **not supposed to create an affiliate registry entry**. Existing old inquiries can be retried only if the primary inquiry spreadsheet retained their affiliate code.

**Security:** Never send or screenshot the secret, administrator OTP or private sheet data. This patch adds diagnostics and clearer errors; it does not change commission/payout logic. Live deployment remains necessary.

## VERSION 1.7 — service-based commission migration (November 19, 2026)

- New referral commission bases **per distinct eligible service**: Classic Photobooth ₱150; Signature Photobooth ₱250; Photoman ₱250; On-site Photo Studio ₱400; AI Photobooth ₱500; Trading Card Photobooth ₱500; 360 Video Booth ₱600. Bundle rates and Event Photography as a standalone service are not offered for **new** affiliate booking entry in this release.
- Multiple different services may be recorded against one synchronized inquiry using the admin **Prepare booking / Add service** action. Enter the same original inquiry submission ID and submit once per qualifying service. Each is a separately tracked commission. Duplicate service entry is blocked. Additional hours, print formats, upgrades, transportation and add-ons do not earn another commission.
- Performance tiers **still count distinct successful bookings/inquiries**, not distinct services (one event with three services counts as one booking toward the monthly threshold). All eligible service commissions earn the applicable monthly tier bonus.
- Bookings recorded **before this update** have no `Base Commission` snapshot and continue using their original legacy base rate schedule, including already-approved and paid commissions. All new booking rows store the rate they received in the `Base Commission` column. Never manually populate that column for historical rows without confirming their original agreed rates.
- Do not modify existing payout or payment evidence records. Historical paid amounts remain frozen. Existing monthly bonus recalculation for unpaid historical rows remains as in previous versions.
- **Deployment:** Replace `backend/pose-partners.gs` in the existing *pose-partners* Apps Script project. Run `setupPartners()` once to add the `Base Commission` column to the bookings sheet without destroying historical rows. Deploy a **new version** of the same Partners Web App. Publish updated `partners/admin.html`, `partners/index.html`, `partners/terms.html`, and `assets/js/partners.js` (or the complete ZIP). The separate POSE Inquiry Backend does not require source changes for this commission change.
- **Test:** First run a test approved affiliate, synchronized inquiry, and Classic service and verify ₱150 base; then add Signature to the same inquiry and verify ₱250 base without increasing the monthly booking count twice. Reopen the dashboard and confirm each service appears. Verify historical `signature` entries without snapshots still use ₱200 base. Verify an already-paid payout remains unchanged.
- **Important:** The old admin booking interface only accepts one service per submission. The new interface supports adding a second service; it does not automatically infer multiple services from the inquiry package. Admin confirmation and payment verification are still required. No live Apps Script or website changes are made merely by downloading the ZIP.
