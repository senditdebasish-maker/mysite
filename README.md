# mysite — XAMPP install and operations

A PHP/MySQL storefront and account system for Apache in XAMPP. Includes product pages,
checkout, customer accounts, order tracking, admin tools, invoices, and a first-run setup
wizard. There is no Node build step.

## Requirements

- Windows with a current XAMPP release (Apache, MySQL/MariaDB, PHP 8.x)
- PHP extensions `pdo_mysql`, `mbstring`, and `openssl`
- Composer dependencies installed in the project folder (`composer install`)
- A MySQL server and user; creating a database requires the user to have `CREATE DATABASE`
  permission, while connecting to an existing one requires access to that database
- A Gmail account with 2-Step Verification and a Google App Password for email OTP

## Install

1. Copy the project to `C:\xampp\htdocs\mysite`.
2. Start **Apache** and **MySQL** in the XAMPP Control Panel.
3. Choose either to create a new database from the setup wizard (the MySQL user needs
   `CREATE DATABASE` permission) or connect to a database already created in phpMyAdmin
   or by your hosting provider. For an existing database, use the exact host, database
   name, username, password, and port they supplied. The installer never deletes a database.
4. Install PHPMailer in the project folder:

   ```powershell
   cd C:\xampp\htdocs\mysite
   composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
   ```

   If Composer reports that ZIP support is missing, enable `extension=zip` in
   `C:\xampp\php\php.ini`, restart Apache, and retry.
5. Open `http://localhost/mysite/setup.html`.
6. Select **Create a new database** or **Connect to an existing database**, enter the
   MySQL connection details, and test the connection. Then create/connect and prepare
   tables. Creating the database requires `CREATE DATABASE` permission; either option
   requires permission to create tables inside the target database.
7. Enter the Gmail address and its App Password and press **Save & test Gmail**. Google
   App Passwords are created in your Google Account after enabling 2-Step Verification;
   do not enter your normal Gmail password.
8. Set your site identity, create your own admin username and password, configure the
   storefront, and press **Complete setup**.

The database and Gmail credentials are kept in `data/install.json`. The `data/` folder is
blocked by Apache rules; keep those rules in place and never publish this file or commit
it to source control. The local SQLite database from older versions is not imported.

## Before going live

XAMPP is primarily a local development stack. Do not expose a default XAMPP installation
or its Control Panel/phpMyAdmin to the public internet. For a public store, use a
maintained production web server or put XAMPP behind a properly managed HTTPS reverse
proxy and firewall.

- Serve the whole site over HTTPS. The app enables HSTS only when HTTPS is detected.
  Behind a reverse proxy, set `DD_TRUST_PROXY=1` in the Apache virtual-host
  configuration only when that proxy overwrites `X-Forwarded-Proto`; never trust that
  header from arbitrary clients.
- Keep `data/` outside the document root when possible. Set `DD_DATA_DIR` in the Apache
  virtual host to a directory writable only by the Apache service account, for example
  `C:/xampp-private/mysite-data`. If it remains under the site folder, retain the
  `.htaccess` deny rules and verify direct HTTP requests to `/data/` are denied.
- Create a dedicated MySQL account with access only to this database. Do not use MySQL
  root or allow remote database access unless your host requires it.
- Keep `install.json`, SMTP App Passwords, backups, and logs out of source control and
  public downloads. The app ignores `data/` contents and denies access to sensitive
  paths; do not remove those protections.
- Change sample storefront/contact details, disable or replace sample catalogue data,
  test the complete checkout-to-fulfilment flow, and send a real Gmail OTP before launch.
- Back up the database and `data/install.json` to encrypted, access-controlled storage.
  Test a restore before relying on the backup. Rotate the Gmail App Password and database
  password immediately if either is exposed.
- Run `composer audit` after dependency updates. Do not publish `vendor/` or the Composer
  archive; install dependencies on the server from the lock file.

## Sign-in

The login page uses **email OTP** as its sign-in flow. It sends a single-use six-digit
code to the account email via Gmail SMTP; its 10-minute expiry is measured in MySQL UTC
time from successful delivery and is limited to five verification attempts. OTP requests
have an atomic, file-backed rate limit and additional per-IP limits. Throttle state is
stored as hashed keys under `data/`.

New customer accounts require a unique username, email, and password; customers sign in
with their email and a one-time code after registration. Admin credentials are created
in the setup wizard; there are no built-in admin/customer demo accounts or
credential-fill buttons.

## Admin store management

The admin dashboard supports server-paginated order search with status/date filters,
bulk status updates, and CSV export. Cancelling an order restores its stock and coupon
usage exactly once. Product management includes search, stock/price sorting, custom
image paths or HTTPS URLs, duplication, quick restocking, and CSV export. Customer search
opens account summaries and recent order history; customer records can also be exported
as CSV.

Products can be assigned to managed categories, with storefront filters, category
descriptions, ordering, activation, and category-based sales reports. Existing product
tags are migrated into categories automatically. A category with assigned products
cannot be deleted; move or retire its products first.

Each order has a printable bill with item, discount, delivery, and stored total amounts.
Guest orders receive a random bill-access token; only its SHA-256 hash is stored. These
bills are not GST tax invoices or proof of payment. No tax rate or registration number
is assumed. Admin reports support custom date ranges up to 90 days and downloadable
CSV exports; cancelled orders are excluded from sales and payment totals.

Checkout re-reads and locks product rows in a transaction before it confirms an order,
so simultaneous checkouts cannot sell the same remaining stock.

## ERP features (orders · GST · inventory)

Milestone 1 turns the store admin into an order-operations console:

- **Order notes & history** — every status change is recorded in an order timeline
  (`order_events` table). Admins can add notes from the Orders pane (per-order
  **Notes**) marked *admin only* or *visible to customer*. Customers see status
  updates and customer-visible notes under **My orders → Order updates**.
- **Refunds** — per-order **Refund** action (reason required) puts the items back
  into stock, releases the coupon slot and marks the order **refunded**, the same
  exactly-once semantics as cancelling. Refunded/cancelled orders are final.
- **GST tax invoices** — set **Seller GSTIN + seller state + GST rate** under
  **Storefront → GST tax invoice & emails**. When both are set, bills print as GST
  tax invoices (`INV-YYYY-NNNN`, assigned on first print and stored) with a CGST/SGST
  (intra-state) or IGST (inter-state) breakup. Prices are treated as GST-inclusive
  (MRP-style). Place of supply comes from the state captured at checkout (new
  addresses require it); old orders without a state show a combined GST line.
- **Lifecycle emails** — new-order notification to the store inbox and customer
  updates on every status change / refund (uses the Gmail SMTP from setup; toggle in
  the same panel). Mail failures are logged and never block checkout.
- **Low-stock alert** — configurable threshold (Storefront → Store settings) drives
  the low-stock badges, counts and reports everywhere.
- **GST report** — Reports pane shows taxable value, CGST, SGST, IGST and total GST
  for the selected range (cancelled/refunded excluded) with a per-invoice CSV export
  (`api/admin/gst-report.csv`). Sales/orders CSVs gained State/PIN/Refund-reason
  columns; products.csv gained SKU.
- **Product SKU** — optional, unique, printed on bills and searchable in the admin.
- **Coupons v2** — types: % off, ₹ off cart, ₹ off per item, plus max-uses,
  per-customer caps (signed-in shoppers), expiry date, and optional product/category
  scoping. Legacy `flat` coupons are migrated to `₹ off cart` automatically.

Milestone 2 completes the order-management loop — dispatch, tracking and after-sales:

- **Shipment tracking** — from the order's **Notes** panel, set the courier, tracking
  number, an optional https tracking link and an expected delivery date, then **Save &
  ship**. If the order was pending/confirmed it flips to **shipped** (shipped email
  with courier + tracking included, customer-visible timeline event); saving again on
  an already-shipped order just updates the parcel details. Customers see the courier,
  tracking number, expected date and a track link on their order card, and the
  shipped/delivered emails carry the same details. `orders.csv` gained courier,
  tracking, link, expected-delivery and shipped-at columns.
- **Return / refund requests (RMA)** — delivered orders gain a **Return / refund**
  action in the customer dashboard (return · refund · exchange · other, with reason
  and details). Requests land in the order's Notes panel with a count badge in the
  row and the admin overview ("open return/refund requests"). Approve, reject or
  resolve with an optional note — the customer gets an email either way, and a
  customer-visible timeline note is added. Requests are capped at 2 open per order
  and require the order to be delivered. Refund itself still uses the one-click
  **Refund** flow above (restock + coupon release).
- **Order emails** — new-request notification goes to the store inbox (reuses the
  "email me about new orders" toggle); decision emails use the customer-update
  toggle. Mail failures never block a request or a decision.

Schema changes for milestone 2: new `orders` columns `courier`, `tracking_number`,
`tracking_url`, `expected_delivery`, `shipped_at`; new `order_requests` table
(order FK cascade, status open/approved/rejected/resolved). They run automatically
on first API hit of an existing database, like the rest.

Milestone 3 adds guest self-service, warehouse slips, delivery status granularity,
and notifications / cart recovery:

- **Guest "track my order" (`track.html`)** — linked in the storefront footer
  (with `noindex, follow`). Looks up an order via throttled `POST /api/track`
  using the order number **and** the checkout phone number (last-10-digit match)
  or email. Both unknown orders and contact mismatches return the same generic
  404 to prevent order-ID enumeration; only status, 5-step progress, item count,
  total, delivery method, and courier/tracking/EDD are returned (never address,
  notes, or payment details).
- **Warehouse packing slip (`packing-slip.html`)** — admin-only printable A4 slip
  opened from the **Slip** button next to **Bill** in the Orders table
  (`GET /api/admin/orders/{id}/packing-slip`). Lists seller info, ship-to address,
  dispatch method/payment, courier/tracking/EDD, customer note, item names/SKUs/categories
  and piece quantities with checkboxes — **no prices or GST totals**.
- **`out_for_delivery` status** — added across status badges, admin filter chips,
  single & bulk status selectors, customer & guest 5-step progress bars,
  lifecycle email/WhatsApp templates, and prefilled `wa.me` messages.
- **Notifications (WhatsApp & SMS honesty)** — Admin → Storefront → GST &
  notifications includes toggles for **cart reminder emails** (on by default) and
  **WhatsApp customer updates** (off by default). Automatic WhatsApp messages use
  Meta's WhatsApp Cloud API when `DD_WHATSAPP_TOKEN` and `DD_WHATSAPP_PHONE_ID`
  are set in the server environment (failures never block orders); without server
  credentials the admin UI clearly reports it as unconfigured and the per-order
  **WA** button remains the keyless `wa.me` deep link. **SMS is not wired** —
  sending SMS requires integrating an SMS gateway (MSG91, Twilio, WATI, etc.)
  and its API keys.
- **Abandoned-cart recovery** — the storefront saves a 32-hex local token
  (`dd_cart_token_v1`) and syncs non-empty carts (`POST /api/cart/abandon`) only
  when a reachable contact exists (signed-in session, or guest email/phone from
  checkout); emptying the cart deletes the snapshot, and placing an order sets
  `recovered_order_id`. Clicking a reminder link (`store.html?restore_cart=<token>`)
  calls `GET /api/cart/restore?t=<token>`, restores available items into the cart,
  and cleans the URL.
- **Scheduled cron job (`api/cron.php`)** — CLI-only (HTTP access blocked in
  `.htaccess` and returns 403 outside `cli`):
  ```bash
  DD_SITE_URL=https://store.example.com php api/cron.php abandoned-carts [--dry-run]
  ```
  Honours `email_customer_updates` + `cart_reminder_emails`, requires
  `DD_SITE_URL` (`https?://...`) and configured Gmail SMTP for non-dry runs
  (exits `78` otherwise; `64` on bad usage; `70` on DB error), respects
  `DD_CART_REMIND_HOURS` (default `4`) and `DD_CART_REMIND_BATCH` (default `25`),
  sends at most one reminder per cart snapshot (re-armed if `items_json` changes),
  and purges reminded/recovered snapshots older than 90 days.

Schema changes for milestone 3: new `abandoned_carts` table (`token VARCHAR(64)`
unique, `user_id` FK `ON DELETE SET NULL`, `items_json`, `reminded_at`,
`recovered_order_id`). Runs automatically on first API hit.

Schema changes ship as idempotent migrations in `api/lib.php` (new `order_events`
and `invoice_sequences` tables; new `orders` columns `state`, `pincode`,
`guest_email`, `invoice_no`, `refund_reason`, `refunded_at`; new `products.sku`;
new coupon columns `expires_at`, `usage_per_customer`, `product_ids`,
`category_ids`). They run automatically on first API hit of an existing database.

> GST figures are computed for guidance and MRP-style inclusive pricing; they are
> not a substitute for your CA's sign-off or for e-invoicing (IRP) if you cross the
> turnover threshold.

## Database backups

Use phpMyAdmin to export the database before making changes and to import a backup:
select the site's database, then choose **Export** or **Import**. Do not expose
phpMyAdmin publicly. Store encrypted backups outside the web root and periodically
verify that a backup can be restored.

## XAMPP routing

The root `.htaccess` routes pages and `/api/*` requests through PHP. Keep Apache's
`mod_rewrite` and `mod_headers` enabled and keep the project `.htaccess` file. Open the
site using its Apache URL (`http://localhost/mysite/`), not by opening the HTML files
directly.

## Local checks

Run PHP/JavaScript syntax checks and the isolated production smoke tests without
connecting to or modifying the configured application database:

```powershell
Get-ChildItem api -Filter *.php -Recurse | ForEach-Object { php -l $_.FullName }
Get-ChildItem -Filter *.php -File | ForEach-Object { php -l $_.FullName }
Get-ChildItem assets\js -Filter *.js -File | ForEach-Object { node --check $_.FullName }
php tests\production-smoke.php
composer validate --no-check-publish
composer audit
```

## Main project files

| Path | Purpose |
| --- | --- |
| `setup.html` | MySQL, Gmail SMTP, admin, identity, and storefront setup |
| `login.html` | Email OTP sign-in; account registration |
| `track.html` | Public guest order-tracking lookup (`noindex`, anti-enumeration) |
| `packing-slip.html` | Admin-only printable A4 warehouse packing slip (no prices) |
| `api/index.php` | PHP JSON API, authentication, setup, checkout, admin routes |
| `api/erp.php` | ERP module: order events/notes, refund flow, GST breakup & invoice numbering, lifecycle & cart emails, WhatsApp notifications, shipment tracking, return/refund requests, guest track & cart abandon/restore |
| `api/cron.php` | CLI-only scheduled job (`abandoned-carts`) — blocked from HTTP |
| `api/lib.php` | MySQL connection, schema, and migrations |
| `api/core.php` | Sessions, settings, password hashing, and shared helpers |
| `api/seed.php` | Optional sample product catalogue and storefront defaults |
| `data/` | Protected installer credentials and request-throttle data |
| `vendor/` | Composer dependencies, including PHPMailer |
| `tests/production-smoke.php` | Isolated checks for auth, report ranges, bill totals/tokens, and HTTP hardening |
