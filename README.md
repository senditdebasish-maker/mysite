# mysite — Debasish Das · Web Studio & Store

Full-page **scroll-snap** home page **plus a working full-stack shop & account system**:
customer accounts, order tracking, an admin dashboard, a lead inbox — all backed by a
real SQLite database and session auth.

```
Browser ──► Express (server/server.js) ──► SQLite (data/site.db, auto-created & seeded)
              ├─ serves the static site (index.html, login/dashboard/admin)
              └─ /api/* JSON API (auth, products, orders, admin)
```

No build step. Two runtime dependencies (`express` only; the DB driver is Node's built-in
`node:sqlite`). Tested on Node 22+.

## Quick start

```bash
npm install
npm start
# → http://localhost:8000
```

The SQLite database is created and seeded automatically on first run
(`data/site.db` — git-ignored). Delete it any time to reseed the demo data.

### Demo logins

| Role     | Email                   | Password      |
|----------|-------------------------|---------------|
| Admin    | `admin@debasishdas.in`  | `admin123`    |
| Customer | `rohit@demo.in`         | `customer123` |

These are shown on the login page (`/login.html`) with one-tap **fill** buttons.
**Change them before real use** via env vars:

```bash
ADMIN_EMAIL=me@studio.in ADMIN_PASSWORD='a-strong-password' npm start
```

## What's inside

| Page            | Purpose |
|-----------------|---------|
| `/`             | Scroll-snap home: hero, services carousel, hosting plans, **the shelf** (store), contact |
| `/login.html`   | Split-screen sign in / create account (tabs, demo-creds autofill) |
| `/dashboard.html` | **Customer dashboard** — My Orders with live status stepper, reorder, profile edit |
| `/admin.html`   | **Admin dashboard** — Overview stats, Orders (filter + status changes), Products (add/edit/restock/delete), Customers, Leads inbox (from the “Book a call” form) |

### Features

- **Real auth** — scrypt-hashed passwords, HttpOnly session cookies (30-day), login throttling (8 tries / 5 min), role-based access (`user` / `admin`)
- **Working cart → checkout → order** — server computes totals, delivery fee, stock checks & decrements; free delivery over ₹999 (else ₹49)
- **Live order tracking** — admin advances `pending → confirmed → shipped → delivered`; the customer dashboard shows it instantly (auto-refreshes every 20 s)
- **Admin product manager** — restock/reprice/add/retire products; changes appear on the live store immediately; sold-out items disable the Add button
- **Leads inbox** — every “Book a free call” submission is stored and listed in Admin → Leads with a one-tap WhatsApp reply
- **Guest checkout** — works without an account; order confirmation opens WhatsApp with the order ref
- Light Studio/Editorial theme, scroll-snap sections, horizontal carousels, reduced-motion support

## API surface (all JSON)

```
POST /api/auth/register|login|logout     GET/PUT /api/me
GET  /api/products                       (public, active only)
POST /api/orders                         GET /api/my/orders
POST /api/inquiries                      (public, from the contact form)
── admin only ───────────────────────────────────────────────
GET  /api/admin/stats      GET/PUT  /api/admin/orders[/:id/status]
GET/POST/PUT/DELETE /api/admin/products[/:id]   (DELETE = soft, keeps order history)
GET  /api/admin/customers  GET /api/admin/inquiries
```

Errors return `{ error: "message" }` with a proper HTTP status. The server never serves
`data/`, `server/`, `node_modules/` or dotfiles — the database is not downloadable.

## Structure

```
index.html                 home (snap sections, cart drawer, checkout + success states)
login.html / dashboard.html / admin.html
server/server.js           Express + node:sqlite backend (API + static hosting + seed)
assets/css/styles.css      home page theme      assets/css/app.css   login/dashboard/admin theme
assets/js/app.js           home page logic      assets/js/ui.js      shared helpers (toast/fetch/fmt)
assets/js/login.js         auth page            assets/js/dashboard.js customer dashboard
assets/js/admin.js         admin dashboard
assets/img/                portrait & product photos (AI-generated samples)
examples/                  design mockups shown before building
```

## ✏️ Personalise before going live

1. `assets/js/app.js` → `SITE` block: `whatsapp` (digits only, country code), `phoneDisplay`, `email`, `location`, `hours` — **and** the matching placeholders `wa.me/910000000000` / `+91 00000 00000` / `hello@example.com` in `index.html`, `dashboard.html`, `server/server.js` (seed phone) and `waDigits` in `assets/js/dashboard.js`.
2. Same file → `PRODUCTS` is now **seed data** (used only to fill an empty DB) — manage live products in **Admin → Products**.
3. Replace `assets/img/portrait.jpg` with your own photo.
4. Wordmark is `debasish.` — change it if you use a business brand.
5. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars; change session length with `SESSION_DAYS` (default 30).

## Local preview of the static-only variant

The `index.html` still works without the backend for design previews (products fall back
to the built-in list, cart/WhatsApp still function). Serve it with any static server, e.g.
`python3 -m http.server 8000` — but accounts, orders and admin need `npm start`.

## Deploy

This is a **Node app**, not a static bundle. Any host that runs Node 22.5+ works:

- **VPS / cPanel (Node.js App) / Railway / Render / Fly** — `npm install && npm start`, set `PORT`, persist the `data/` folder (or point `DB_PATH` at a volume).
- **Namecheap/Hostinger cPanel**: create a Node.js app, run it from the repo root, env `PORT` is assigned by cPanel; make sure the app root contains `index.html` + `assets/`.
- Static-only hosts (GitHub Pages/Netlify drop-in) can still host the design pages, but account/order features will 404 — see note above.

Health check: `GET /api/products` should return 8 seeded products on a fresh deploy.
