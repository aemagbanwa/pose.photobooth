# PIN Enter key fix

The close (×) button had no explicit type, making it the form’s first submit button. Enter activated that close action.

The close button is now a regular button with its own close handler. Open gallery is the only submit button, so Enter in the PIN field follows the same validation and unlock flow as clicking Open gallery. Repeated submissions while Checking are ignored. An incorrect PIN keeps the existing error/retry behavior.

Upload gallery/index.html and gallery/app.js together. Reload the page (Ctrl+F5) to refresh the cached files. No Apps Script changes are needed for this fix. The archive retains the previous album-cover backend fix.

Static form checks, handler regression checks and JavaScript syntax checks passed. Live browser testing was not performed.
