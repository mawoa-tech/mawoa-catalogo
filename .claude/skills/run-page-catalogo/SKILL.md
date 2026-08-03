---
name: run-page-catalogo
description: Build, run, and drive page-catalogo (the Next.js catalog generator / admin panel). Use when asked to start the dev server, log into /admin, screenshot the public catalog or the admin panel, or verify a UI change actually renders.
---

This is a Next.js 16 App Router app (React 19). There is no separate build step for local iteration — `npm run dev` serves both the public catalog and the git-backed `/admin` panel. Drive it via `.claude/skills/run-page-catalogo/driver.mjs`, a small headless-Chromium REPL (Playwright, already a project devDependency — `chromium-cli` is not installed in this environment, so this driver stands in for it with the same command shape).

All paths below are relative to the repo root.

## Prerequisites

Nothing beyond `npm install` (already run once per clone — it also triggers `playwright install chromium` via `postinstall`). No `apt-get`/Xvfb needed: this is a headless-Chromium web driver, not an Electron/desktop app.

## Setup

```bash
npm install
```

No env vars are required just to browse the **public** catalog (`/`, `/catalog/<id>`). To reach `/admin` locally you need `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` + `AUTH_SECRET` in `.env.local` — see **Admin login** below, since the real password is a bcrypt hash nobody can read back out.

## Run (agent path)

```bash
# 1. start the dev server, wait for the port (no separate build step)
npm run dev > /tmp/page-catalogo-dev.log 2>&1 &
i=0; until curl -sf http://localhost:3000 >/dev/null || [ $i -ge 30 ]; do sleep 1; i=$((i+1)); done

# 2. drive it
node .claude/skills/run-page-catalogo/driver.mjs <<'EOF'
nav http://localhost:3000
wait-for text=Catálogos
screenshot 01-home
console --errors
quit
EOF

# 3. stop it
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
```

Screenshots land in `.claude/skills/run-page-catalogo/screenshots/<name>.png`. `$!` after `npm run dev &` is only the `npm` wrapper — it doesn't forward signals to the real `next dev` it spawns, so **kill by port**, not by pid, or the port stays bound for the next run.

Driver commands (one per line on stdin):

| command | what it does |
|---|---|
| `nav <url>` | `goto(url, waitUntil: networkidle)` |
| `wait-for <selector>` | also accepts `text=...` — **see Gotchas, this can match too early** |
| `wait-url <glob>` | waits for a redirect/navigation to actually finish — use this after any form submit that redirects, not `wait-for` on text alone |
| `click <selector>` | |
| `fill <selector> <text...>` | goes through Playwright's real input pipeline (fires React's `onChange`) |
| `press <key>` | e.g. `Enter`, `Escape` |
| `screenshot [name]` | saved under `screenshots/<name>.png` |
| `console --errors` | prints + clears collected console errors / `pageerror`s since the last check |
| `eval <js>` | `page.evaluate(js)` |
| `quit` | closes the browser, exits |

### Admin login

`ADMIN_PASSWORD_HASH` in `.env.local` is a bcrypt hash — there's no way to recover the plaintext password from it. To drive `/admin` as an agent, generate a **temporary** credential, swap it in, test, then restore the file exactly:

```bash
cp .env.local .env.local.driver-backup
node -e 'console.log(require("bcryptjs").hashSync("driver-test-pw-999", 10).replace(/\$/g, "\\$"))' > /tmp/hash.txt
python3 -c "
import re
c = open('.env.local').read()
c = re.sub(r'ADMIN_PASSWORD_HASH=.*', 'ADMIN_PASSWORD_HASH=' + open('/tmp/hash.txt').read().strip(), c, count=1)
open('.env.local', 'w').write(c)
"

node .claude/skills/run-page-catalogo/driver.mjs <<'EOF'
nav http://localhost:3000/admin/login
wait-for input[name=username]
fill input[name=username] <el de ADMIN_USERNAME en .env.local>
fill input[name=password] driver-test-pw-999
click button[type=submit]
wait-url **/admin
wait-for text=Nuevo catálogo
screenshot admin-list
quit
EOF

mv .env.local.driver-backup .env.local   # restore immediately, every time
```

`ADMIN_USERNAME` is **not** `admin` — read the real one out of the file first (`grep '^ADMIN_USERNAME' .env.local`); it differs per deployment, and a wrong username fails exactly like a wrong password does, with a silent `POST /admin/login 200` and no redirect. Only the hash needs swapping. This dance is the whole reason a login flow can't just be "fill the form with credentials from the docs."

## Run (human path)

```bash
npm run dev   # → http://localhost:3000, Ctrl-C to stop
```

`npm run build` is **not** an interactive alternative — it runs `next build`, then a PDF-export script that boots a *temporary* `next start` on port **4173** just long enough to render each catalog to PDF, then kills it itself. If you load `localhost:3000` (or even 4173) during a `build` run expecting a normal session, it will look like the server "closes on its own" — that's this script exiting, not a crash.

## Test

No test suite is configured in this project (confirmed: no `test` script in `package.json`, no `*.test.*`/`*.spec.*` files). `npm run lint` (ESLint) and `npx tsc --noEmit` are the only static checks; `npm run build` is the closest thing to an integration check, since it exercises the schema validation, every catalog's static generation, and the PDF export in one pass.

---

## Gotchas

- **Two pages share the exact same heading text.** `/admin/login` and the post-login `/admin` list both render "Panel de administración" as their `<h1>`-equivalent — `wait-for text=Panel de administración` right after a login submit can resolve **immediately, against the login page itself**, before the redirect has actually happened (reproduced this exact race live: the "immediate" screenshot showed the login form mid-submit, button reading "Entrando…"). Use `wait-url **/admin` (or wait for something that only exists post-login, like `text=Nuevo catálogo` or `text=Salir`) instead of matching on that shared heading.
- **`timeout` isn't a builtin on macOS.** The classic `timeout 30 bash -c '...'` port-poll one-liner from generic docs silently no-ops (`command not found`) on a Mac shell — poll with a manual `until ...; do sleep 1; i=$((i+1)); done` loop instead (used throughout this skill).
- **Card thumbnails are CSS `background-image`, not `<img>`.** In the admin panel's "Páginas" tab, `networkidle` does not guarantee these have painted — a screenshot taken immediately after clicking into that tab can show blank/grey thumbnail boxes even though the real photos load fine a moment later. Not a bug in the app; just don't trust a same-tick screenshot for that specific grid if you need the thumbnails visible.
- **`Escape` closes the whole admin panel, not just a nested modal.** If you `press Escape` while the "Elegir imagen" gallery overlay is open (inside the already-open edit panel), it collapses the *entire* editor panel back to its "✏️ Editar" pill — there's no dialog-stacking, only one global Escape handler. Close nested overlays with their own `✕` button / an explicit `click`, not `press Escape`, if the outer panel needs to stay open.
- **`.env.production.local` can contain literal `"[SENSITIVE]"` placeholder strings** for `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`/`AUTH_SECRET`/`GITHUB_TOKEN` if it was ever populated via `vercel env pull` without access to reveal sensitive values. Irrelevant to `npm run dev` (which never loads `.env.production.local`), but it silently breaks `npm run build`'s temporary server and any real `next start` — login there will never succeed no matter the password, since the corrupted value is the username itself, not just the hash.
