# D&D 5e sheet

Character sheet for the 2014 and 2024 rules. Everything in this folder is the built site; there's no build step on GitHub.

## Put it online with GitHub Pages
1. Upload every file in this folder to the root of the repo, including the hidden `.nojekyll`.
2. Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.
3. The site appears at `https://<username>.github.io/<repo>/` within a minute or two.

## If you use sync
Add the new address to Firebase: Authentication → Settings → Authorized domains → Add domain → `<username>.github.io`.
Until then, sync on the new site will report an unauthorized domain. Characters saved on the old address stay in that browser's storage; bring them across with sync, or with the backup export and import.

## Files
- `index.html` — the app
- `dnd5e-data-2024.js`, `dnd5e-data.js` — the rules, downloaded per character
- `pdf-lib.js` — only fetched when importing a D&D Beyond PDF
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png` — installing to a home screen
