# mysite — Debasish Das · Web Studio & Store

Full-page **scroll-snap** home page **plus a working full-stack shop & account system**:
customer accounts, order tracking, an admin dashboard, a lead inbox — all backed by a
real SQLite database and session auth. Fresh deploys are configured from the browser
with a **first-run setup wizard** at `/setup.html` (database, brand, seller identity,
admin account, storefront rules, backups) — no file editing required.

```
Browser ──► PHP edition (any Apache + PHP ≥ 7.4, no Node.js) ──► SQLite via PDO
   or   ──► Node edition (Express, server/server.js)            ──► SQLite (node:sqlite)
              ├─ serves the static site (index.html, login/dashboard/admin)
              └─ /api/* JSON API (auth, products, orders, admin)
```

No build step — two editions of the **same store**, sharing the same `data/site.db` file format:

| Edition | Runs on | Requirements |
| --- | --- | --- |
| **PHP** (best for shared hosting) | Any Apache + PHP host — XAMPP locally, cPanel/Namecheap/Hostinger, **InfinityFree (free)** | PHP ≥ 7.4 with `pdo_sqlite` (bundled on all of these), `.htaccess` overrides allowed |
| **Node** | Node ≥ 22.5 — VPS, Railway/Render, your PC | `npm install && npm start` |

Pick one; they are behaviour-compatible (same API contract, same seed data, same backup format —
a backup downloaded from one restores into the other). **PHP edition** details are in the next section.

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

## PHP edition — install on any shared host (no Node.js)

The complete store runs on ordinary PHP hosting: setup wizard, accounts, orders
(stock decrement, server-side coupons, GST-inclusive totals), admin console, reviews,
GST invoices, reports, backup/restore. PHP serves the same pages, and `/api/*` is routed
by a root `.htaccess` — there is **no Node process anywhere**.

**How it fits together**

| File / dir | Role |
| --- | --- |
| `.htaccess` | Routes `/api/*` → `api/index.php`, `/product/<id>` → `product.php`, `/sitemap.xml` + `/robots.txt` → `api/misc.php`, HTML pages through `page.php` (wizard gate + contact substitution), JS through `js.php`; blocks `/data/`, `server/`, etc. |
| `api/index.php` | API front controller (all JSON routes; also the boot/seed point) |
| `api/lib.php`, `api/core.php`, `api/seed.php`, `api/scrypt.php` | DB open/migrate/backup, sessions, bcrypt + legacy-scrypt verify, seed data |
| `page.php`, `product.php`, `js.php`, `api/misc.php` | HTML/SSR/substitution handlers |
| `serve.php` | Router for local testing with `php -S` (not used on Apache — `.htaccess` is) |
| `data/` | SQLite database + uploads — auto-created, web-blocked via `.htaccess` |

### Install (InfinityFree / cPanel / any Apache+PHP)

1. **Upload** the repository into the site root (`htdocs/` on InfinityFree, `public_html/` on cPanel) —
   *everything except* `node_modules/`, `.git/`, `data/`, `deploy/`, `package*.json`, `start-windows.bat`.
   Keep the top-level `.htaccess`.
2. In the control panel, **force HTTPS** and enable free SSL (InfinityFree: Client Area → SSL; cPanel: Let's Encrypt).
3. Open **`https://your-host/setup.html`** and complete the wizard. That's the install —
   the `data/` directory and database are created automatically on first request.
4. **Verify:** `https://your-host/api/products` returns 14 products (fresh demo seed);
   place a test order; then **Admin → Backup** and download the `.db` — keep it somewhere safe.
5. **Change the demo passwords** (wizard does this for the admin it creates) and the WhatsApp
   placeholder `910000000000` in `assets/js/store-core.js` + `assets/js/app.js` before real use.

### XAMPP (Windows) — simplest option

Drop the repo into `C:\xampp\htdocs\mysite`, Apache + PHP run it at
<http://localhost/mysite/> — wizard at <http://localhost/mysite/setup.html>.
No Node, no proxy, your other PHP/MySQL apps untouched.

### Honest status — read before you deploy

- The PHP edition passes an **82-check automated end-to-end suite** on PHP 8.3
  (fresh-install gate, wizard flow, auth incl. legacy password rehash, orders + coupons,
  admin backup/restore round-trip, SSR pages, throttling, logout). The Node edition passes
  the same contract; both were exercised against identical demo data.
- It has **not yet been run on a live InfinityFree/cPanel account**. The remaining risk is
  host-specific: `.htaccess` overrides must be allowed (`AllowOverride` — ask the host if the
  site shows Apache’s 403/500 or pages lose their CSS), and the filesystem must be writable
  for `data/`. If your host forbids `.htaccess` overrides or PDO SQLite, use the Node edition
  instead — the code is ready for both.
- Free hosts disclaim durability. **Download the backup after anything important** (Admin → Backup)
  — you can also restore it (Admin → Restore) onto any other server, either edition.
- SQLite is ideal for this store’s scale (thousands of orders, one shop). It will not do
  multi-server replication; no shared host does for you anyway.

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

- **Real auth** — salted-hash passwords (Node `scrypt`; PHP bcrypt with transparent legacy-scrypt upgrade on first login), HttpOnly session cookies (30-day), login throttling (8 tries / 5 min), role-based access (`user` / `admin`)
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
server/server.js           Node edition — Express + node:sqlite backend (API + static hosting + seed)
.htaccess                  PHP edition — Apache routing (/api → api/index.php, pages, assets; blocks data/)
api/                       PHP edition backend — index.php (front controller), lib/core/seed/scrypt (PDO SQLite)
page.php product.php js.php api/misc.php        PHP edition — page gate, product SSR, JS/misc substitution
serve.php                  PHP edition — `php -S` local router (mirrors .htaccess)
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

1. `assets/js/app.js` → `SITE` block: `whatsapp` (digits only, country code), `phoneDisplay`, `email`, `location`, `hours` — **and** the matching placeholders `wa.me/910000000000` / `+91 00000 00000` / `hello@example.com` in `index.html`, `dashboard.html`, `server/server.js` **and `api/seed.php`** (seed phone) and `waDigits` in `assets/js/dashboard.js`.
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

- **Engine:** embedded SQLite — Node edition uses Node's built-in `node:sqlite`; the PHP edition uses PDO SQLite. Same file format, same `data/site.db` (git-ignored), no MySQL/Postgres server to configure. “Connecting a database” = choosing the file (default `data/site.db`). Put it on a mounted volume for VPS/cPanel deploys via the wizard or `DB_PATH` / `DD_DATA_DIR`.
- **PHP shared hosts:** the app creates `data/` on first request — make sure the folder is writable by PHP (default permissions on InfinityFree/cPanel are fine). `data/.htaccess` is installed automatically so the database is never web-accessible; don't delete it.
- **Fresh deploy:** everything redirects to `/setup.html` until setup completes. The wizard can (re)install the demo catalogue, wipe to an **empty store** (schema + your admin only), and switch the database file live — sessions for the old file die, the new one is migrated + seeded automatically.
- **Backups:** Admin → or `/setup.html` → *Download database backup* (consistent `VACUUM INTO` snapshot incl. all orders/customers). *Restore from backup* uploads a `.db` (max 40 MB), validates integrity + schema, keeps a timestamped `.bak-*` safety copy next to the live file, and rolls back automatically if validation fails.
- **Non-destructive checks:** “Test connection” opens/creates the target, runs `PRAGMA integrity_check` and reports table counts — without seeding anything (a brand-new file is removed after the test).
- **Demo vs empty:** choosing *Empty store* on a database that already holds data requires an explicit “erase existing data” confirmation.

## Setup page troubleshooting

If `/setup.html` says **“Setup unavailable — the setup API answered 404”**, the page is being served without a backend. Fix, in order:

- **PHP edition:** **(1)** re-upload the *whole* repo including `.htaccess` and `api/`; **(2)** check the host allows `.htaccess` overrides (`AllowOverride` — if your pages appear but `/api/*` 404s or 500s, it doesn't; enable it or ask the host); **(3)** open `/setup.html?api=/your/subpath/api` only if you installed into a subdirectory that rewrites differently; **(4)** confirm PDO SQLite with `https://host/api/products` — a JSON list means the stack works.
- **Node edition:** **(1)** pull the latest code and **restart the Node app** (routes are cached at boot — cPanel/Passenger: press Restart); **(2)** run it with `npm start` on Node ≥ 22.5 — GitHub Pages/Netlify/`python -m http.server` can display the page but cannot run the installer; **(3)** re-upload the whole repo so `setup.html` and `server/server.js` match; **(4)** behind a proxy/subpath, forward `/api/*` untouched, or open `/setup.html?api=/your/subpath/api`.

## Running on Windows + XAMPP

XAMPP ships **Apache + PHP + MySQL — not Node.js**. You now have two ways to run the store there:

**Option A — PHP edition (recommended now):** copy the repo into `C:\xampp\htdocs\mysite` and open <http://localhost/mysite/>. Apache + PHP serve everything, wizard at <http://localhost/mysite/setup.html>. No Node at all.

**Option B — Node edition next to XAMPP:** run the app **next to** XAMPP (Node serves it, XAMPP serves your PHP sites). The steps below are for option B.

1. **Install Node.js (required for option B):** <https://nodejs.org> → LTS (v22.5+), default options. Verify in cmd: `node -v`.
2. **Put the repo anywhere on disk** — e.g. `C:\sites\mysite`. Do **not** use `C:\xampp\htdocs` for option B (use it for option A).
3. **Double-click `start-windows.bat`** (checks Node, installs deps on first run, starts the site) — or manually: `cd C:\sites\mysite` → `npm install` → `npm start`.
   - **PowerShell blocks `npm install` with “running scripts is disabled”?** That's PowerShell's `ExecutionPolicy`, not Node. Either use **Command Prompt** (Win+R → `cmd` → Enter — `npm` is `npm.cmd` there and works), double-click the `.bat`, run `npm.cmd install` explicitly, or allow locally-run scripts for yourself once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
4. Open **<http://localhost:8000>**. Fresh install → the setup wizard. Data lives in `data\site.db` (git-ignored) — back it up from `/setup.html` any time.
5. **Keep it running:** leave the launcher window open, or add `npm start` in that folder to Task Scheduler → *At startup*. For a proper service use [pm2](https://pm2.keymetrics.io): `npm i -g pm2` → `pm2 start npm --name mysite -- start`.
6. **Reaching it from other devices / the internet:**
   - LAN: `http://<server-IP>:8000` — allow inbound TCP 8000 in Windows Firewall.
   - Public: reverse-proxy Apache → Node so your domain serves it — see `deploy/xampp-apache.conf` (whole-domain `<VirtualHost>`, or a `/mysite/` subpath with `https://yourdomain/mysite/setup.html?api=/mysite/api`). Uncomment `mod_proxy` / `mod_proxy_http` / `mod_headers` in `httpd.conf`, keep XAMPP Apache on port 80, Node on 8000.
   - Alternative without touching Apache: **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:8000`) gives you an HTTPS URL.
   - Already serving `http://localhost/mysite/` from htdocs and want to keep it? Proxy **only the API**: `ProxyPass /mysite/api/ http://127.0.0.1:8000/api/` (+ `ProxyPassReverse`) — see `deploy/xampp-apache.conf`, Scenario 4. The static pages then work exactly as they do today, with the Node backend behind them.
7. **About MySQL/MariaDB in XAMPP:** this app uses its own embedded **SQLite** file — it does not use XAMPP’s MySQL, so you don't need to create a database or user for it. Your MySQL stays free for your other apps. (If you specifically require MySQL as the store backend, that's a data-layer migration — ask and I'll scope it.)
8. **The wizard on XAMPP:** Node serves everything, so `/setup.html` + `/api/setup/*` work normally at <http://localhost:8000/setup.html>. If your domain proxies to Node (step 6), the wizard is at `https://yourdomain/setup.html`. (With option A — the PHP edition — the wizard is at `http://localhost/mysite/setup.html` and these proxy steps don't apply.)

## Local preview of the static-only variant

The site also works without the backend for design previews and simple storefront duty: products fall back to the built-in catalogue, the cart persists in the browser, and a visitor's "Confirm & Place Order" composes a WhatsApp message with the full basket instead of hitting the API. Serve it with any static server, e.g. `python3 -m http.server 8000` — but accounts, orders, admin and the coupon/GST pipeline need a backend (the PHP edition above, or `npm start`).

## Deploy

This is **a full-stack app in two editions**, not a static bundle:

- **Any Apache + PHP host (InfinityFree free, cPanel, Namecheap, Hostinger)** — upload the repo, open `/setup.html`. See **PHP edition** above. No Node required.
- **Node 22.5+ hosts** — VPS / cPanel “Node.js App” / Railway / Render / Fly: `npm install && npm start`, set `PORT`, persist the `data/` folder (or point `DB_PATH` at a volume).
- **Namecheap/Hostinger cPanel (Node)**: create a Node.js app, run it from the repo root, env `PORT` is assigned by cPanel; make sure the app root contains `index.html` + `assets/`.
- Static-only hosts (GitHub Pages/Netlify drop-in) can still host the design pages — see the note below (WhatsApp checkout, no accounts).

## Publish on InfinityFree — the **full** store, free

InfinityFree is **PHP + MySQL only — no Node.js on the free plan**, and the PHP edition of this store needs neither Node nor MySQL: it uses **PDO SQLite**, which the InfinityFree team confirms is available on all plans. So the whole thing — accounts, orders, admin, invoices — runs there.

Steps:

1. Create a free account at <https://www.infinityfree.net> → **Create Website** → pick a free subdomain (e.g. `yourname.epizy.com`) or connect a domain you own.
2. Get FTP credentials (**Accounts → FTP**) and connect with [FileZilla](https://filezilla-project.org).
3. Upload the repo into `htdocs/`: the top-level `*.html`, `*.php`, `.htaccess`, `assets/`, `api/`. Do **not** upload `node_modules/`, `.git/`, `data/`, `deploy/`, `package*.json`, `start-windows.bat`.
4. Enable the free **Let's Encrypt SSL** and force HTTPS.
5. Open `https://yourname.epizy.com/setup.html` and complete the wizard.
6. Verify: `https://yourname.epizy.com/api/products` → 14 products; place a test order from a second browser; sign in as admin and **download a backup** (Admin → Backup).
7. Fix the WhatsApp placeholder `910000000000` (`assets/js/store-core.js`, `assets/js/app.js`) before real customers use it.

If it misbehaves (pages unstyled, 403/500, `/api/*` 404s), the host is ignoring `.htaccess` or PDO SQLite — ask the host, or use the Node edition instead (see below). You can also verify quickly whether PDO SQLite works there by opening `https://yourname.epizy.com/api/products` — a JSON list means yes; an error page means no.

**Reliability honesty checklist for free hosting:**

- Free hosting gives no durability guarantee — **download a backup after any real order** and keep it outside the host. Restore works onto any other server (either edition).
- If `data/` ever becomes unreadable, orders are lost — the backup is the only copy.
- Expect slow cold starts and occasional maintenance downtime; not for high volume. For a growing store, move to a small VPS (₹350–₹700/month) with the Node edition, or a paid PHP plan — both run this exact code unchanged.

### The static-only fallback (if you can't use PHP either)

The site also degrades gracefully to a pure static storefront — design pages, catalogue
(browser-fallback list of 14 products), cart/wishlist in the browser, and checkout that
composes a WhatsApp message instead of an API order. Upload only the `*.html` + `assets/`
(no PHP files). Accounts, admin, server-side coupons, order numbers and invoices **will not work**.
This exists for brochure-quality embeds — prefer the PHP edition for a real shop.

Health check (both editions): `GET /api/products` should return 14 seeded products on a fresh deploy. Demo coupons: `WELCOME10` (10% off), `FLAT100` (₹100 off ₹999+), `SHELF150` (₹150 off ₹1499+, 100 uses).
