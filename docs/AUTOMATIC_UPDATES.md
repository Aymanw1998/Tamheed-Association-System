# Automatic browser updates

System, Sport and IT check asset-manifest.json before mounting production UI.
A changed main JS or CSS path triggers automatic navigation to the fresh build,
preserving the route, query and fragment. The manifest request and worker
preparation are bounded; network failure falls back to the available app.

Open pages check every minute and on focus, visibility, pageshow and reconnect.
Updates wait for typed forms, signatures, dialogs and pending saves to be safe.
Per-release retry protection prevents a cached page from reloading endlessly.
System and Sport navigation requests prefer current server HTML and fall back
to their precached shell offline. IT uses entry checks without a service worker.

This applies after the new code is deployed and loaded. A browser still running
an old manual-update implementation may need one initial refresh or reopen.
No code can change an already-running old implementation before it loads the
new implementation. Updates do not clear browser cookies or user records.

Verification: npm run verify; full Sport and IT test suites/builds; isolated
browser test with stale legacy shell, two successive releases, draft protection,
and unavailable navigation/manifest. See AI_REVIEW_LOG.md for actual results and
independent peer-review status. Production deployment remains a separate step.
