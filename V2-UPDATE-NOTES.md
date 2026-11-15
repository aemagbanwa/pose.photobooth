# POSE Website v2 updates — 2026-11-15

- Moved existing Event Bundles and projector bundles ahead of individual service cards.
- Revised hero copy and primary calls to action for bookings.
- Added a lightweight package finder with budget and experience preferences (no external service or backend changes).
- Added Facebook contact shortcut and projector-related booking FAQs.
- Fixed missing projector packages/add-on options in the inquiry dropdown and updated JS selection mapping.
- Updated homepage SEO meta description and added basic LocalBusiness JSON-LD.
- Kept gallery, Google Apps Script backend, existing pages and assets intact.

## Important checks before deployment
1. Test all inquiry forms end-to-end against the live Google Apps Script endpoint (not submitted during this update).
2. Confirm advertised rates, staffing, screen/projector capabilities, transport exclusions, and dates.
3. Check desktop and mobile layout on a deployed staging URL.
4. Review the existing Google rating displayed on the site against the live profile; this update did not verify it.
5. The package finder makes suggestions, not reservations or confirmed availability.

Deployment: extract the ZIP to the existing website root, preserving directory structure; back up the live version first.
