# Mobile menu and inquiry date fix

Upload these changed files to the same paths on your website:
- index.html
- assets/css/modern-home.css
- assets/js/app.js

The mobile menu now uses a dark background with readable links, sits below the header, and can scroll on short screens. Removed duplicate menu event binding; the shared header script continues to handle opening and closing.

The inquiry date field now stays inside its column, uses 16px text, and shows “Choose event date” while empty. The native date picker and required validation are preserved.

No backend changes are needed for this update. This full archive retains the earlier gallery fixes. Refresh the page after uploading; the updated asset URLs bypass the previous CSS and JavaScript cache.

Validation: JavaScript syntax and static source checks passed. Physical iPhone Safari testing was not available.
