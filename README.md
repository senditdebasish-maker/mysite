# mysite — Debasish Das · Web Studio & Store

Full-page **scroll-snap** home page **plus a working full-stack shop & account system**:
customer accounts, order tracking, an admin dashboard, a lead inbox — all backed by a
real SQLite database and session auth. Fresh deploys are configured from the browser
with a **first-run setup wizard** at `/setup.html` (database, brand, seller identity,
admin account, storefront rules, backups) — no file editing required.

```
Browser ──► Apache + PHP 8 (any shared host, XAMPP locally) ──► SQLite via PDO
              ├─ serves the static site (index.html, login/dashboard/admin)
              └─ /api/* JSON API (auth, products, orders, admin), routed by .htaccess
```

No build step, **no Node.js anywhere in the project** — one edition, one runtime.
Requires:

| Requirement | Notes |
| --- | --- |
| Apache with `mod_rewrite` + `.htaccess` allowed | standard on shared hosts; XAMPP works out of the box |
| **PHP 8.x** with `pdo_sqlite` (and `mbstring`) | bundled on virtually every host (InfinityFree free plan included) |

No database server, MySQL, or Node runtime to configure — the database is a single file at `data/site.db` (git-ignored), created and seeded automatically on first run.

## Quick start

**With XAMPP (Windows):** copy the repo into `C:\xampp\htdocs\mysite` → open
<http://localhost/mysite/> — done.

**Or with the PHP built-in server (any OS with PHP 8):**

```bash
php -S localhost:8000 serve.php
# → http://localhost:8000
```

**First run:** every page redirects to **`/setup.html`** — the setup
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
**Change them before real use** — the simplest way is a fresh “Empty store” install, where the
wizard lets you create your own admin account from the start.

## Install on any shared host (Apache + PHP)

The complete store runs on ordinary PHP hosting: setup wizard, accounts, orders
(stock decrement, server-side coupons, GST-inclusive totals), admin console, reviews,
GST invoices, reports, backup/restore. PHP serves the same pages, and `/api/*` is routed
by a root `.htaccess` — there is **no Node process anywhere**.

**How it fits together**

| File / dir | Role |
| --- | --- |
| `.htaccess` | Routes `/api/*` → `api/index.php`, `/product/<id>` → `product.php`, `/sitemap.xml` + `/robots.txt` → `api/misc.php`, HTML pages through `page.php` (wizard gate + contact substitution), JS through `js.php`; blocks `/data/` and dotfiles |
| `api/index.php` | API front controller (all JSON routes; also the boot/seed point) |
| `api/lib.php`, `api/core.php`, `api/seed.php`, `api/scrypt.php` | DB open/migrate/backup, sessions, scrypt verify (legacy bcrypt tolerated), seed data |
| `page.php`, `product.php`, `js.php`, `api/misc.php` | HTML/SSR/substitution handlers |
| `serve.php` | Router for local testing with `php -S` (not used on Apache — `.htaccess` is) |
| `data/` | SQLite database + uploads — auto-created, web-blocked via `.htaccess` |

### Install (InfinityFree / cPanel / any Apache+PHP)

1. **Upload** the repository into the site root (`htdocs/` on InfinityFree, `public_html/` on cPanel) —
   *everything except* `.git/` and `data/`. Keep the top-level `.htaccess` (it is a hidden dotfile).
2. In the control panel, **force HTTPS** and enable free SSL (InfinityFree: Client Area → SSL; cPanel: Let's Encrypt).
3. Open **`https://your-host/setup.html`** and complete the wizard. That's the install —
   the `data/` directory and database are created automatically on first request.
4. **Verify:** `https://your-host/api/products` returns 14 products (fresh demo seed);
   place a test order; then **Admin → Backup** and download the `.db` — keep it somewhere safe.
5. **Change the demo passwords** (wizard does this for the admin it creates) and the WhatsApp
   placeholder `910000000000` in `assets/js/store-core.js` + `assets/js/app.js` before real use.

### XAMPP (Windows) — simplest option

Copy the repo into `C:\xampp\htdocs\mysite`, Apache + PHP run it at
<http://localhost/mysite/> — wizard at <http://localhost/mysite/setup.html>.
Your other PHP/MySQL apps stay untouched — this store keeps its data in `data/site.db`
and never touches MySQL.

### Honest status — read before you deploy

- The PHP backend passes a **114-check automated suite** on PHP 8.3 (fresh-install gate,
  wizard flow, auth incl. legacy-password handling, password changes, orders + coupons,
  address book, order cancellation with restock, CSV exports, admin backup/restore round-trip,
  SSR pages, throttling, logout) — run under php-wasm, plus live curl smoke tests of the same build.
- It has **not yet been run on a live InfinityFree/cPanel account**. The remaining risk is
  host-specific: `.htaccess` overrides must be allowed (`AllowOverride` — ask the host if the
  site shows Apache’s 403/500 or pages lose their CSS), and the filesystem must be writable
  for `data/`. If your host forbids `.htaccess` overrides or PDO SQLite, pick another host with
  PHP 8 — there is no second runtime anymore; this one is it.
- Free hosts disclaim durability. **Download the backup after anything important** (Admin → Backup)
  — you can also restore it (Admin → Restore) onto any other PHP host.
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
| `/checkout.html` | **Checkout** — contact prefill, address book picker or new address (PIN-validated, 6-digit), Standard vs Express delivery, COD/UPI on delivery, coupon chips from live offers, GST-inclusive totals |
| `/order-success.html` | **Order confirmation** — order number, delivery ETA, payment & address recap, WhatsApp hand-off fallback when the backend is unreachable |
| `/policies.html` | **Shipping · Returns · Cancellation · Privacy · Terms** — plain-English, PAN-India, honest rates |
| `/login.html`   | Split-screen sign in / create account (tabs, demo-creds autofill) |
| `/dashboard.html` | **Customer dashboard** — tabbed: **Orders** (status stepper, reorder, GST invoice download, one-tap cancel for pending/confirmed orders) · **Addresses** (full address book: add/edit/delete/make-default) · **Wishlist** · **Profile & Security** (name/phone + password change) |
| `/admin.html`   | **Admin dashboard** — Overview stats, Orders (search, from/to date filter, bulk status updates, CSV export), Products (low-stock/sold-out/hidden filter chips, CSV export), Customers, Leads inbox, **Storefront** (announcement, delivery rules incl. express fee, COD gate, LIVE/closed toggle, featured picks, coupon manager, inventory quick adjust), **Reports** (avg order value, units moved 30 d, coupon performance, COD-vs-UPI mix, 14-day revenue chart, top-selling products) |

The nav tabs on every page link to these dedicated pages; the home page keeps the snap-scroll single-page experience.

### Features

- **Real auth** — salted-hash passwords (scrypt, N=16384 r=8 p=1; legacy bcrypt rows still verify — no bcrypt hashes are written anymore), HttpOnly session cookies (30-day), login throttling (8 tries / 5 min), role-based access (`user` / `admin`)
- **Working cart → checkout → order** — server computes totals, delivery fee, stock checks & decrements; free delivery over ₹999 (else ₹49); **Express delivery (1–2 days, ₹99)** option at checkout
- **Full checkout flow** — dedicated `/checkout.html` (guest or signed-in), address book with PIN validation, coupon chips, COD minimum + stock guards enforced server-side, **WhatsApp hand-off fallback** when the backend is unreachable
- **Customer self-service** — order cancellation while pending/confirmed (atomic restock + coupon-usage rollback), saved address book (max 10, default-address promotion), password change with current-password check
- **Order confirmation & policies** — `/order-success.html` recap page, `/policies.html` (shipping/returns/cancellation/privacy/terms)
- **Enterprise storefront** — 14-product catalog with reviews, instant search, price buckets, category counts, in-stock filter, popularity/discount/price/rating sort, Today’s Deals rail with live countdown, quick view (qty stepper, share), localStorage wishlist, delivery ETA per card
- **Reviews & ratings** — seeded reviews per product, average + distribution bars, signed-in customers can write one review per product (server-enforced), verified buyer badges on order-derived stats
- **Printed invoices** — every order gets an A4 GST tax invoice (browser print / Save as PDF), owner- or admin-only, with seller GSTIN and amount-in-words
- **SEO done right** — every public page ships canonical + OG/Twitter meta (origin-resolved per request), Product pages get fully injected head + Product JSON-LD (aggregateRating, price, availability), `/sitemap.xml` (static pages + all products), `/robots.txt` (blocks admin/dashboard/invoice/api), 301 `/index.html → /`
- **Server-side coupon engine** — `WELCOME10` (10% off), `FLAT100`, `SHELF150` seeded; min-order, max-uses and percentage caps enforced on the server and re-validated at order time; GST-inclusive price line on the cart
- **COD & UPI on delivery** — selectable at checkout; server gates COD (enable/disable + minimum order) via Admin → Storefront
- **Admin → Storefront page** — inventory value & units, out/low-stock badges, announcement bar editor, free-delivery threshold / fee / max-qty / COD rules, LIVE ⇄ restocking toggle (checkout closes), featured-picks grid, coupon CRUD with active toggles, inline stock adjust with +10 restock |
- **Live order tracking** — admin advances `pending → confirmed → shipped → delivered`; the customer dashboard shows it instantly (auto-refreshes every 20 s)
- **Admin product manager** — restock/reprice/add/retire products; changes appear on the live store immediately; sold-out items disable the Add button; low-stock/sold-out/hidden filter chips; **CSV export**
- **Admin order operations** — full-text search (name/phone/order #/coupon/email), from/to date filters, bulk status updates, **orders CSV export** (Excel-friendly BOM)
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
POST /api/orders  {delivery_method:"standard|express"}   GET /api/my/orders
POST /api/my/orders/:id/cancel          (own pending|confirmed; restocks atomically)
GET/POST/PUT/DELETE /api/addresses[/:id]   (signed-in; max 10; PIN-validated; default-address promotion)
POST /api/me/password                    (current-password check → scrypt pair)
GET  /api/coupons/offers                 (public; active & in-stock coupons for checkout chips)
GET  /sitemap.xml   GET /robots.txt
GET  /api/setup/status               (public: install state; full details for admins / pre-setup)
POST /api/setup/test-db|database|site|admin|store|complete   (open until setup completes, then admin-only)
POST /api/inquiries                      (public, from the contact form)
── admin only ───────────────────────────────────────────────
GET  /api/admin/stats      GET/PUT  /api/admin/orders[/:id/status]
GET/POST/PUT/DELETE /api/admin/products[/:id]   (DELETE = soft, keeps order history)
GET  /api/admin/customers  GET /api/admin/inquiries
GET/PUT /api/admin/store-config           (announcement, free-delivery, DELIVERY + EXPRESS fees, COD rules, live toggle, featured ids)
GET  /api/admin/orders.csv?status&from&to&q      (Excel-friendly, ≤5000 rows, admin-only)
GET  /api/admin/products.csv
GET/POST/PUT/DELETE /api/admin/coupons[/:code]   (PUT toggles active)
GET  /api/admin/report                    (14-day revenue, top products, payment mix, coupon usage, AOV)
GET  /api/admin/backup                   (consistent .db snapshot, admin-only)   POST /api/admin/restore (upload .db, rolls back on failure)
```

Errors return `{ error: "message" }` with a proper HTTP status. The server never serves
`data/` or dotfiles — the database is not downloadable.

## Structure

```
index.html                 home (snap sections, cart drawer → checkout.html)
services.html / hosting.html / store.html / contact.html   ← tab pages
checkout.html / order-success.html / policies.html         ← checkout flow + store policies
login.html / dashboard.html / admin.html
.htaccess                  Apache routing (/api → api/index.php, pages, assets; blocks data/ and dotfiles)
api/                       PHP backend — index.php (front controller), lib/core/seed/scrypt (PDO SQLite)
page.php product.php js.php api/misc.php        page gate, product SSR, JS/misc substitution
serve.php                  `php -S` local router (mirrors .htaccess)
assets/css/styles.css      home page theme      assets/css/app.css   login/dashboard/admin theme
assets/css/pages.css       shared chrome for the 4 tab pages (nav, footer, heroes, cards, FAQ)
assets/js/app.js           home page logic      assets/js/ui.js      shared helpers (toast/fetch/fmt)
assets/js/checkout.js     checkout page          assets/css/checkout.css   checkout styles
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

1. `assets/js/app.js` → `SITE` block: `whatsapp` (digits only, country code), `phoneDisplay`, `email`, `location`, `hours` — **and** the matching placeholders `wa.me/910000000000` / `+91 00000 00000` / `hello@example.com` in `index.html`, `dashboard.html`, **and `api/seed.php`** (seed phone) and `waDigits` in `assets/js/dashboard.js`.
2. `PRODUCTS` in `api/seed.php` is **seed data** (used only to fill an empty DB) — manage live products in **Admin → Products**; storefront rules & coupons in **Admin → Storefront**.
3. Replace `assets/img/portrait.jpg` with your own photo.
4. Wordmark is `debasish.` — change it if you use a business brand.
5. **Just open `/setup.html`** (or `/admin.html` once the site is set up) — the wizard covers DB location, brand/GSTIN/contact details, the admin account and storefront rules. Env vars still work for headless/CI installs:
   - `DD_DATA_DIR` — point the database at another writable folder · `DB_PATH` — pin the exact database file (the wizard shows a read-only notice instead of the picker)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — email/password for the admin seeded into a brand-new database (existing databases are never re-seeded)
   - `SESSION_DAYS` (default 30)
   - `SELLER_LINE` / `SELLER_ADDR` / `SELLER_GSTIN` / `SELLER_EMAIL` / `SELLER_PHONE` — invoice seller, overridden by values saved in the wizard
6. Seller details saved in the wizard are printed on every GST invoice; the **WhatsApp number, email and phone** you set also replace the placeholders across the public pages automatically (HTML & JS assets are substituted per request, like the canonical/OG URLs).
7. Public site URL for absolute OG/canonical links is derived from the incoming request (works out of the box behind any domain/proxy); no env var needed.

## Database & live installs

- **Engine:** embedded SQLite via PDO — `data/site.db` (git-ignored), no MySQL/Postgres server to configure. “Connecting a database” = choosing the file (default `data/site.db`). Put it on a persistent folder on the host via the wizard or the `DD_DATA_DIR` env var.
- **PHP shared hosts:** the app creates `data/` on first request — make sure the folder is writable by PHP (default permissions on InfinityFree/cPanel are fine). `data/.htaccess` is installed automatically so the database is never web-accessible; don't delete it.
- **Fresh deploy:** everything redirects to `/setup.html` until setup completes. The wizard can (re)install the demo catalogue, wipe to an **empty store** (schema + your admin only), and switch the database file live — sessions for the old file die, the new one is migrated + seeded automatically.
- **Backups:** Admin → or `/setup.html` → *Download database backup* (consistent `VACUUM INTO` snapshot incl. all orders/customers). *Restore from backup* uploads a `.db` (max 40 MB), validates integrity + schema, keeps a timestamped `.bak-*` safety copy next to the live file, and rolls back automatically if validation fails.
- **Non-destructive checks:** “Test connection” opens/creates the target, runs `PRAGMA integrity_check` and reports table counts — without seeding anything (a brand-new file is removed after the test).
- **Demo vs empty:** choosing *Empty store* on a database that already holds data requires an explicit “erase existing data” confirmation.

## Setup page troubleshooting

If `/setup.html` says **“Setup unavailable — the setup API answered 404”**, the page is being served without a backend. Fix, in order:

- **(1)** re-upload the *whole* repo including `.htaccess` and `api/`; **(2)** check the host allows `.htaccess` overrides (`AllowOverride` — if your pages appear but `/api/*` 404s or 500s, it doesn't; enable it or ask the host); **(3)** open `/setup.html?api=/your/subpath/api` only if you installed into a subdirectory that rewrites differently; **(4)** confirm PDO SQLite with `https://host/api/products` — a JSON list means the stack works.

## Running on Windows + XAMPP

1. **Copy the repo into `C:\xampp\htdocs\mysite`.**
2. Open **<http://localhost/mysite/>** — Apache + PHP serve the store and the wizard
   (<http://localhost/mysite/setup.html>). Nothing else to install or start.
3. **Reaching it from other devices on the LAN:** <http://<server-IP>/mysite/> — allow inbound TCP 80 in Windows Firewall.
   **From the internet:** port-forward TCP 80/443 at your router (XAMPP is fine for small traffic), or put it behind a CDN/tunnel; a paid Apache/PHP plan is the easy route for a public store.
4. **About MySQL/MariaDB in XAMPP:** the store does its own embedded **SQLite** (`data/site.db`) — it does not use XAMPP's MySQL, so there is no database or user to create. Your MySQL stays free for your other apps.
5. **Wizard URL on XAMPP:** <http://localhost/mysite/setup.html>. The data file is `data\site.db` — back it up any time from Admin → Backup.

## Local preview of the static-only variant

The site also works without the backend for design previews and simple storefront duty: products fall back to the built-in catalogue, the cart persists in the browser, and a visitor's "Confirm & Place Order" composes a WhatsApp message with the full basket instead of hitting the API. Serve it with any static server, e.g. `python3 -m http.server 8000` — but accounts, orders, admin and the coupon/GST pipeline need Apache + PHP (above); there is no other runtime.

## Deploy

This is **a full-stack app, not a static bundle**:

- **Any Apache + PHP host (InfinityFree free, cPanel, Namecheap, Hostinger)** — upload the repo, open `/setup.html`. See **Install on any shared host** above.
- **XAMPP on your own PC / a VPS with Apache + PHP** — same story, one folder into the docroot.
- Static-only hosts (GitHub Pages/Netlify drop-in) can still host the design pages — see the note below (WhatsApp checkout, no accounts).

## Publish on InfinityFree — the **full** store, free

InfinityFree is **PHP + MySQL only** — but this store needs neither MySQL nor Node: it uses **PDO SQLite**, which the InfinityFree team confirms is available on all plans. So the whole thing — accounts, orders, admin, invoices — runs there.

Steps:

1. Create a free account at <https://www.infinityfree.net> → **Create Website** → pick a free subdomain (e.g. `yourname.epizy.com`) or connect a domain you own.
2. Get FTP credentials (**Accounts → FTP**) and connect with [FileZilla](https://filezilla-project.org).
3. Upload the repo into `htdocs/`: the top-level `*.html`, `*.php`, `.htaccess`, `assets/`, `api/`. Do **not** upload `.git/` or `data/` — the database is created on first run.
4. Enable the free **Let's Encrypt SSL** and force HTTPS.
5. Open `https://yourname.epizy.com/setup.html` and complete the wizard.
6. Verify: `https://yourname.epizy.com/api/products` → 14 products; place a test order from a second browser; sign in as admin and **download a backup** (Admin → Backup).
7. Fix the WhatsApp placeholder `910000000000` (`assets/js/store-core.js`, `assets/js/app.js`) before real customers use it.

If it misbehaves (pages unstyled, 403/500, `/api/*` 404s), the host is ignoring `.htaccess` or PDO SQLite — ask the host, or switch to another PHP 8 host. You can also verify quickly whether PDO SQLite works there by opening `https://yourname.epizy.com/api/products` — a JSON list means yes; an error page means no.

**Reliability honesty checklist for free hosting:**

- Free hosting gives no durability guarantee — **download a backup after any real order** and keep it outside the host. Restore works onto any other PHP host.
- If `data/` ever becomes unreadable, orders are lost — the backup is the only copy.
- Expect slow cold starts and occasional maintenance downtime; not for high volume. For a growing store, move to a small VPS (₹350–₹700/month) with Apache + PHP 8 or a paid PHP plan — this exact code runs unchanged.

### The static-only fallback (if you can't use PHP either)

The site also degrades gracefully to a pure static storefront — design pages, catalogue
(browser-fallback list of 14 products), cart/wishlist in the browser, and checkout that
composes a WhatsApp message instead of an API order. Upload only the `*.html` + `assets/`
(no PHP files). Accounts, admin, server-side coupons, order numbers and invoices **will not work**.
This exists for brochure-quality embeds — prefer Apache + PHP for a real shop (there is no other runtime in this repo).

Health check: `GET /api/products` should return 14 seeded products on a fresh deploy. Demo coupons: `WELCOME10` (10% off), `FLAT100` (₹100 off ₹999+), `SHELF150` (₹150 off ₹1499+, 100 uses).
