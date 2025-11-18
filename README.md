# HostelSync PWA

HostelSync is a static progressive web app (PWA) that demonstrates laundry management, common room booking, and notification flows for hostel residents. The app is built with plain HTML, CSS, and vanilla JavaScript and can be served from any static host.

## Project structure
- `index.html` – Home landing page linking to laundry, room booking, alerts, leaderboard, and profile flows with a persistent bottom navigation bar.【F:index.html†L1-L64】
- `laundry.html`, `rooms.html`, `my-washes.html`, `alerts.html`, `my-bookings.html`, `admin-bookings.html`, `profile.html` – Feature pages that share the global stylesheet and script.
- `leaderboard.html` – Sustainability leaderboard highlighting residents with efficient laundry habits, sorted by a savings score that rewards full cycles and lower resource use.【F:leaderboard.html†L1-L131】
- `styles.css` – Global design system (palette, cards, navigation) used across all pages.【F:styles.css†L1-L120】
- `script.js` – Application logic: state persistence, pseudo-authentication, timers, per-page initialisers, and modal interactions.【F:script.js†L1-L136】
- `service-worker.js` and `manifest.json` – PWA plumbing for caching and install metadata.【F:service-worker.js†L1-L49】【F:manifest.json†L1-L18】

## Application logic highlights
- **Stateful demo data**: Machines, bookings, and notifications are stored in `localStorage` so the demo survives reloads. The state schema is versioned and seeded on load to reset older data when necessary.【F:script.js†L24-L170】
- **Authentication helper**: Lightweight, client-side “login” supports student and admin personas and mirrors the active user into a cookie so page reloads retain the role.【F:script.js†L70-L136】
- **Laundry workflow**: Page initialisation renders hostel/floor selectors, machine status summaries, a watch-free notifier, and machine modals for starting washes, nudging pickups, or reporting maintenance.【F:script.js†L1112-L1340】
- **PWA cache**: A service worker pre-caches key assets and cleans up old caches on activation, while fetch events prefer cached assets to support offline use.【F:service-worker.js†L1-L49】

## Running locally
Because the project is entirely static, you can serve it with any static HTTP server. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser. The service worker will register automatically when served over HTTP.

## Testing
No automated test suite is included, but you can run a couple of quick checks:

1. Validate the JavaScript syntax:
   ```bash
   node --check script.js
   ```
2. Confirm the web manifest is valid JSON:
   ```bash
   python -m json.tool manifest.json
   ```

Both commands should exit without errors.
