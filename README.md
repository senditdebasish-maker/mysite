# mysite — Debasish Das · Web Studio & Store

Full-page **scroll-snap** home page **plus a working full-stack shop & account system**:
customer accounts, order tracking, an admin dashboard, a lead inbox — all backed by a
real SQLite database and session auth. Fresh deploys are configured from the browser
with a **first-run setup wizard** at `/setup.html` (database, brand, seller identity,
admin account, storefront rules, backups) — no file editing required.

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

**First run on a fresh machine:** every page redirects to **`/setup.html`** — the setup
wizard. Pick *Demo catalogue* or *Empty store*, save your brand/GSTIN/contact details,
create the admin account, then **Complete setup**. The site opens and the wizard locks
behind the admin login. (A brand-new `data/site.db` is pre-seeded with the demo catalogue,
so picking “Demo catalogue” just keeps it.)

The SQLite database is created and seeded automatically on first run
(`data/site.db` — git-ignored). Delete it any time to reseed the demo data
(the setup wizard will run again).

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
| `/product/<id>` | **Product pages** (canonical, server-rendered SEO) — `/product/p5` etc.: gallery zoom, specs, highlights, FBT bundle, “frequently bought together” add, same-category reco rail, ratings & written reviews, review form for signed-in customers, breadcrumb, OG/Twitter tags + Product JSON-LD injected per request |
| `/invoice.html` | **GST tax invoice** — printable A4 invoice per order (owner or admin only); amount in words, 18% GST-inclusive split, seller GSTIN block, “computer-generated” terms |
| `/setup.html`   | **First-run setup wizard** (locks to admins after completion) — database location & connection test, demo/empty install, brand & seller identity (GSTIN, WhatsApp, email), admin account, storefront rules, backup/restore |
| `/contact.html`  | **Book a free call** — WhatsApp/call/email channels + brief form (saves to admin Leads) |
| `/login.html`   | Split-screen sign in / create account (tabs, demo-creds autofill) |
| `/dashboard.html` | **Customer dashboard** — My Orders with live status stepper, reorder, profile edit |
| `/admin.html`   | **Admin dashboard** — Overview stats, Orders, Products, Customers, Leads inbox, **Storefront** (announcement, delivery rules, COD gate, LIVE/closed toggle, featured picks, coupon manager, inventory quick adjust), **Reports** (avg order value, units moved 30 d, coupon performance, COD-vs-UPI mix, 14-day revenue chart, top-selling products) |

The nav tabs on every page link to these dedicated pages; the home page keeps the snap-scroll single-page experience.

### Features

- **Real auth** — scrypt-hashed passwords, HttpOnly session cookies (30-day), login throttling (8 tries / 5 min), role-based access (`user` / `admin`)
- **Working cart → checkout → order** — server computes totals, delivery fee, stock checks & decrements; free delivery over ₹999 (else ₹49)
- **Enterprise storefront** — 14-product catalog with reviews, instant search, price buckets, category counts, in-stock filter, popularity/discount/price/rating sort, Today’s Deals rail with live countdown, quick view (qty stepper, share), localStorage wishlist, delivery ETA per card
- **Reviews & ratings** — seeded reviews per product, average + distribution bars, signed-in customers can write one review per product (server-enforced), verified buyer badges on order-derived stats
- **Printed invoices** — every order gets an A4 GST tax invoice (browser print / Save as PDF), owner- or admin-only, with seller GSTIN and amount-in-words
- **SEO done right** — every public page ships canonical + OG/Twitter meta (origin-resolved per request), Product pages get fully injected head + Product JSON-LD (aggregateRating, price, availability), `/sitemap.xml` (static pages + all products), `/robots.txt` (blocks admin/dashboard/invoice/api), 301 `/index.html → /`
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
GET  /product/<id>                       (HTML; OG/canonical/JSON-LD injected per request)
GET  /api/products/<id>/reviews          (public)   POST …/reviews     (signed-in; one per user per product)
GET  /api/invoices/<orderId>             (owner or admin — printable GST invoice data)
POST /api/coupons/validate               (public: code + basket subtotal → discount)
POST /api/orders                         GET /api/my/orders
GET  /sitemap.xml   GET /robots.txt
GET  /api/setup/status               (public: install state; full details for admins / pre-setup)
POST /api/setup/test-db|database|site|admin|store|complete   (open until setup completes, then admin-only)
POST /api/inquiries                      (public, from the contact form)
── admin only ───────────────────────────────────────────────
GET  /api/admin/stats      GET/PUT  /api/admin/orders[/:id/status]
GET/POST/PUT/DELETE /api/admin/products[/:id]   (DELETE = soft, keeps order history)
GET  /api/admin/customers  GET /api/admin/inquiries
GET/PUT /api/admin/store-config           (announcement, free-delivery, COD rules, live toggle, featured ids)
GET/POST/PUT/DELETE /api/admin/coupons[/:code]   (PUT toggles active)
GET  /api/admin/report                    (14-day revenue, top products, payment mix, coupon usage, AOV)
GET  /api/admin/backup                   (consistent .db snapshot, admin-only)   POST /api/admin/restore (upload .db, rolls back on failure)
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
assets/js/store-core.js    shared DD engine (cart, coupons, checkout, toast, store config, products cache)
assets/js/store.js         storefront layer (facets, deals rail, quick view, wishlist) — cards link to /product/<id>
product.html / assets/js/product.js   canonical product page
assets/js/invoice.js       printable GST invoice   invoice.html
setup.html / assets/js/setup.js   first-run setup wizard (DB + identity + admin + backups)
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
5. **Just open `/setup.html`** (or `/admin.html` once the site is set up) — the wizard covers DB location, brand/GSTIN/contact details, the admin account and storefront rules. Env vars still work for headless/CI installs:
   - `DB_PATH` — pin the database file (the wizard shows a read-only notice instead of the picker)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — seed/refresh the admin on boot · `SESSION_DAYS` (default 30)
   - `SELLER_LINE` / `SELLER_ADDR` / `SELLER_GSTIN` / `SELLER_EMAIL` / `SELLER_PHONE` — invoice seller, overridden by values saved in the wizard
6. Seller details saved in the wizard are printed on every GST invoice; the **WhatsApp number, email and phone** you set also replace the placeholders across the public pages automatically (HTML & JS assets are substituted per request, like the canonical/OG URLs).
7. Public site URL for absolute OG/canonical links is derived from the incoming request (works out of the box behind any domain/proxy); no env var needed.

## Database & live installs

- **Engine:** embedded SQLite via Node's built-in `node:sqlite` — no MySQL/Postgres server to configure. “Connecting a database” = choosing the file (default `data/site.db`, git-ignored). Put it on a mounted volume for VPS/cPanel deploys via the wizard or `DB_PATH`.
- **Fresh deploy:** everything redirects to `/setup.html` until setup completes. The wizard can (re)install the demo catalogue, wipe to an **empty store** (schema + your admin only), and switch the database file live — sessions for the old file die, the new one is migrated + seeded automatically.
- **Backups:** Admin → or `/setup.html` → *Download database backup* (consistent `VACUUM INTO` snapshot incl. all orders/customers). *Restore from backup* uploads a `.db` (max 40 MB), validates integrity + schema, keeps a timestamped `.bak-*` safety copy next to the live file, and rolls back automatically if validation fails.
- **Non-destructive checks:** “Test connection” opens/creates the target, runs `PRAGMA integrity_check` and reports table counts — without seeding anything (a brand-new file is removed after the test).
- **Demo vs empty:** choosing *Empty store* on a database that already holds data requires an explicit “erase existing data” confirmation.

## Setup page troubleshooting

If `/setup.html` says **“Setup unavailable — the setup API answered 404”**, the page is being served without the Node backend. Fix, in order: **(1)** pull the latest code and **restart the Node app** (routes are cached at boot — cPanel/Passenger: press Restart); **(2)** run it with `npm start` on Node ≥ 22.5 — GitHub Pages/Netlify/`python -m http.server` can display the page but cannot run the installer; **(3)** re-upload the whole repo so `setup.html` and `server/server.js` match; **(4)** behind a proxy/subpath, forward `/api/*` untouched, or open `/setup.html?api=/your/subpath/api`.

## Running on Windows + XAMPP

XAMPP ships **Apache + PHP + MySQL — not Node.js**. Dropping this repo into `xampp/htdocs` shows the pages through Apache, but `/api/*` (login, orders, the store, `/setup.html`) can never work — that's the “Setup unavailable · 404” you saw. Run the app **next to** XAMPP instead; your PHP/MySQL apps stay untouched.

1. **Install Node.js (required):** <https://nodejs.org> → LTS (v22.5+), default options. Verify in cmd: `node -v`.
2. **Put the repo anywhere on disk** — e.g. `C:\sites\mysite`. Do **not** use `C:\xampp\htdocs` for this app.
3. **Double-click `start-windows.bat`** (checks Node, installs deps on first run, starts the site) — or manually: `cd C:\sites\mysite` → `npm install` → `npm start`.
4. Open **<http://localhost:8000>**. Fresh install → the setup wizard. Data lives in `data\site.db` (git-ignored) — back it up from `/setup.html` any time.
5. **Keep it running:** leave the launcher window open, or add `npm start` in that folder to Task Scheduler → *At startup*. For a proper service use [pm2](https://pm2.keymetrics.io): `npm i -g pm2` → `pm2 start npm --name mysite -- start`.
6. **Reaching it from other devices / the internet:**
   - LAN: `http://<server-IP>:8000` — allow inbound TCP 8000 in Windows Firewall.
   - Public: reverse-proxy Apache → Node so your domain serves it — see `deploy/xampp-apache.conf` (whole-domain `<VirtualHost>`, or a `/mysite/` subpath with `https://yourdomain/mysite/setup.html?api=/mysite/api`). Uncomment `mod_proxy` / `mod_proxy_http` / `mod_headers` in `httpd.conf`, keep XAMPP Apache on port 80, Node on 8000.
   - Alternative without touching Apache: **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:8000`) gives you an HTTPS URL.
   - Already serving `http://localhost/mysite/` from htdocs and want to keep it? Proxy **only the API**: `ProxyPass /mysite/api/ http://127.0.0.1:8000/api/` (+ `ProxyPassReverse`) — see `deploy/xampp-apache.conf`, Scenario 4. The static pages then work exactly as they do today, with the Node backend behind them.
7. **About MySQL/MariaDB in XAMPP:** this app uses its own embedded **SQLite** file — it does not use XAMPP’s MySQL, so you don't need to create a database or user for it. Your MySQL stays free for your other apps. (If you specifically require MySQL as the store backend, that's a data-layer migration — ask and I'll scope it.)
8. **The wizard on XAMPP:** Node serves everything, so `/setup.html` + `/api/setup/*` work normally at <http://localhost:8000/setup.html>. If your domain proxies to Node (step 6), the wizard is at `https://yourdomain/setup.html`.

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
