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
| `/services.html` | **Services** — full catalogue: 6 services with inclusions, 4-step process, FAQ, WhatsApp quotes |
| `/hosting.html`  | **Hosting** — 3 plans (₹199/₹499/₹999 + GST), included-features grid, comparison table, FAQ |
| `/store.html`    | **The Shelf** — enterprise storefront: announcement bar, Today’s Deals rail with midnight countdown, category/price facets, instant search, sort, quick view, wishlist, coupons, COD & UPI on delivery, GST-inclusive totals |
| `/contact.html`  | **Book a free call** — WhatsApp/call/email channels + brief form (saves to admin Leads) |
| `/login.html`   | Split-screen sign in / create account (tabs, demo-creds autofill) |
| `/dashboard.html` | **Customer dashboard** — My Orders with live status stepper, reorder, profile edit |
| `/admin.html`   | **Admin dashboard** — Overview stats, Orders, Products, Customers, Leads inbox, **Storefront** (announcement, delivery rules, COD gate, LIVE/closed toggle, featured picks, coupon manager, inventory quick adjust) |

The nav tabs on every page link to these dedicated pages; the home page keeps the snap-scroll single-page experience.

### Features

- **Real auth** — scrypt-hashed passwords, HttpOnly session cookies (30-day), login throttling (8 tries / 5 min), role-based access (`user` / `admin`)
- **Working cart → checkout → order** — server computes totals, delivery fee, stock checks & decrements; free delivery over ₹999 (else ₹49)
- **Enterprise storefront** — 14-product catalog with reviews, instant search, price buckets, category counts, in-stock filter, popularity/discount/price/rating sort, Today’s Deals rail with live countdown, quick view (qty stepper, share), localStorage wishlist, delivery ETA per card
- **Server-side coupon engine** — `WELCOME10` (10% off), `FLAT100`, `SHELF150` seeded; min-order, max-uses and percentage caps enforced on the server and re-validated at order time; GST-inclusive price line on the cart
- **COD & UPI on delivery** — selectable at checkout; server gates COD (enable/disable + minimum order) via Admin → Storefront
- **Admin → Storefront page** — inventory value & units, out/low-stock badges, announcement bar editor, free-delivery threshold / fee / max-qty / COD rules, LIVE ⇄ restocking toggle (checkout closes), featured-picks grid, coupon CRUD with active toggles, inline stock adjust with +10 restock |
- **Live order tracking** — admin advances `pending → confirmed → shipped → delivered`; the customer dashboard shows it instantly (auto-refreshes every 20 s)
- **Admin product manager** — restock/reprice/add/retire products; changes appear on the live store immediately; sold-out items disable the Add button
- **Leads inbox** — every “Book a free call” submission is stored and listed in Admin → Leads with a one-tap WhatsApp reply
- **Guest checkout** — works without an account; order confirmation opens WhatsApp with the order ref
- Light Studio/Editorial theme, scroll-snap sections, horizontal carousels, reduced-motion support

## API surface (all JSON)

```
POST /api/auth/register|login|logout     GET/PUT /api/me
GET  /api/products                       (public, active only)        GET /api/store/config
POST /api/coupons/validate               (public: code + basket subtotal → discount)
POST /api/orders                         GET /api/my/orders
POST /api/inquiries                      (public, from the contact form)
── admin only ───────────────────────────────────────────────
GET  /api/admin/stats      GET/PUT  /api/admin/orders[/:id/status]
GET/POST/PUT/DELETE /api/admin/products[/:id]   (DELETE = soft, keeps order history)
GET  /api/admin/customers  GET /api/admin/inquiries
GET/PUT /api/admin/store-config           (announcement, free-delivery, COD rules, live toggle, featured ids)
GET/POST/PUT/DELETE /api/admin/coupons[/:code]   (PUT toggles active)
```

Errors return `{ error: "message" }` with a proper HTTP status. The server never serves
`data/`, `server/`, `node_modules/` or dotfiles — the database is not downloadable.

## Structure

```
index.html                 home (snap sections, cart drawer, checkout + success states)
services.html / hosting.html / store.html / contact.html   ← tab pages
login.html / dashboard.html / admin.html
server/server.js           Express + node:sqlite backend (API + static hosting + seed)
assets/css/styles.css      home page theme      assets/css/app.css   login/dashboard/admin theme
assets/css/pages.css       shared chrome for the 4 tab pages (nav, footer, heroes, cards, FAQ)
assets/js/app.js           home page logic      assets/js/ui.js      shared helpers (toast/fetch/fmt)
assets/js/subpages.js      tab pages: mobile menu, live cart badge, auth-aware nav
assets/js/store.js         enterprise storefront (facets, deals rail, quick view, wishlist, coupons)
assets/js/contact.js       brief form
assets/js/login.js         auth page            assets/js/dashboard.js customer dashboard
assets/js/admin.js         admin dashboard
assets/img/                portrait & product photos (AI-generated samples)
examples/                  design mockups shown before building
```

## ✏️ Personalise before going live

1. `assets/js/app.js` → `SITE` block: `whatsapp` (digits only, country code), `phoneDisplay`, `email`, `location`, `hours` — **and** the matching placeholders `wa.me/910000000000` / `+91 00000 00000` / `hello@example.com` in `index.html`, `dashboard.html`, `server/server.js` (seed phone) and `waDigits` in `assets/js/dashboard.js`.
2. `PRODUCTS` in the server is **seed data** (used only to fill an empty DB) — manage live products in **Admin → Products**; storefront rules & coupons in **Admin → Storefront**.
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

Health check: `GET /api/products` should return 14 seeded products on a fresh deploy. Demo coupons: `WELCOME10` (10% off), `FLAT100` (₹100 off ₹999+), `SHELF150` (₹150 off ₹1499+, 100 uses).
