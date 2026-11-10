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
| `api/index.php` | PHP JSON API, authentication, setup, checkout, admin routes |
| `api/lib.php` | MySQL connection, schema, and migrations |
| `api/core.php` | Sessions, settings, password hashing, and shared helpers |
| `api/seed.php` | Optional sample product catalogue and storefront defaults |
| `data/` | Protected installer credentials and request-throttle data |
| `vendor/` | Composer dependencies, including PHPMailer |
| `tests/production-smoke.php` | Isolated checks for auth, report ranges, bill totals/tokens, and HTTP hardening |
