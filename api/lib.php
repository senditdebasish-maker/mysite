<?php
/**
 * Debasish Das — Web Studio & Store · PHP backend (shared-hosting edition)
 * Any Apache + PHP 8 host with PDO SQLite — no Node.js required.
 * The JSON API matches the Node server contract exactly, so the existing
 * frontend JS works unchanged.
 */
declare(strict_types=1);

define('DD_ROOT', dirname(__DIR__));
define('DD_DATA', ($__dd = getenv('DD_DATA_DIR')) !== false && $__dd !== '' ? rtrim(str_replace('\\', '/', $__dd), '/') : DD_ROOT . '/data');
define('DD_MAX_JSON_BYTES', 120 * 1024);
define('DD_MAX_BACKUP_BYTES', 40 * 1024 * 1024);

/* ════════════════ paths & environment ════════════════ */
function dd_mkdir_data(): void {
  if (!is_dir(DD_DATA)) @mkdir(DD_DATA, 0775, true);
  // keep the database out of the web root on Apache hosts
  $guard = DD_DATA . '/.htaccess';
  if (!is_file($guard)) @file_put_contents($guard, "Require all denied\n\n# Apache 2.2\n<IfModule !mod_authz_core.c>\nOrder deny,allow\nDeny from all\n</IfModule>\n");
}
dd_mkdir_data();

function dd_read_install(): array {
  $f = DD_DATA . '/install.json';
  if (!is_file($f)) return [];
  $j = json_decode((string) @file_get_contents($f), true);
  return is_array($j) ? $j : [];
}
function dd_write_install(array $obj): void {
  @file_put_contents(DD_DATA . '/install.json', json_encode($obj, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

/** Resolve a user-supplied database path exactly like the Node server does. */
function dd_resolve_db_target(?string $p): string {
  $s = trim((string) $p);
  if ($s === '') $s = DD_DATA . '/site.db';
  if ($s[0] === '~') {
    $home = getenv('HOME') ?: (getenv('USERPROFILE') ?: '/');
    $s = $home . substr($s, 1);
  }
  $isAbs = ($s[0] === '/') || preg_match('/^[A-Za-z]:[\\\\\/]/', $s) || (substr($s, 0, 2) === '\\\\');
  $abs = $isAbs ? $s : (DD_ROOT . '/' . $s);
  $abs = str_replace('\\', '/', $abs);
  // lexical normalisation (.. segments)
  $parts = [];
  foreach (explode('/', $abs) as $seg) {
    if ($seg === '' || $seg === '.') continue;
    if ($seg === '..') { array_pop($parts); continue; }
    $parts[] = $seg;
  }
  $abs = (substr($abs, 0, 1) === '/' ? '/' : '') . implode('/', $parts);
  if (strpos($abs, "\0") !== false) throw new DdHttpError(400, 'Invalid path');
  return $abs;
}

/* ════════════════ errors ════════════════ */
class DdHttpError extends Exception {
  public int $status;
  public function __construct(int $status, string $message) {
    parent::__construct($message);
    $this->status = $status;
  }
}

/* ════════════════ database ════════════════ */
function dd_env_db_path(): ?string {
  $e = getenv('DB_PATH');
  return ($e !== false && trim($e) !== '') ? dd_resolve_db_target($e) : null;
}

final class DdDb {
  public static ?PDO $pdo = null;
  public static string $path = '';

  public static function open(string $path): void {
    $path = dd_resolve_db_target($path);
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    self::$path = $path;
    self::$pdo = new PDO('sqlite:' . $path, null, null, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    self::$pdo->exec('PRAGMA foreign_keys = ON');
    self::$pdo->exec('PRAGMA busy_timeout = 5000');
    self::ensureSchema();
    self::runMigrations();
  }

  public static function close(): void {
    self::$pdo = null;
  }

  public static function pdo(): PDO {
    if (!self::$pdo) {
      $env = dd_env_db_path();
      $install = dd_read_install();
      $initial = $env ?: (isset($install['dbPath']) && is_string($install['dbPath']) ? $install['dbPath'] : DD_DATA . '/site.db');
      self::open($initial);
    }
    return self::$pdo;
  }

  private static function ensureSchema(): void {
    self::$pdo->exec("
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  meta       TEXT NOT NULL DEFAULT '',
  tag        TEXT NOT NULL DEFAULT 'Tech',
  price      INTEGER NOT NULL CHECK(price >= 0),
  was        INTEGER NOT NULL DEFAULT 0,
  rating     REAL NOT NULL DEFAULT 4.5,
  stock      INTEGER NOT NULL DEFAULT 10,
  img        TEXT NOT NULL DEFAULT 'assets/img/product-mouse.jpg',
  active     INTEGER NOT NULL DEFAULT 1,
  reviews    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  items_json    TEXT NOT NULL,
  total         INTEGER NOT NULL CHECK(total >= 0),
  payment       TEXT NOT NULL DEFAULT 'cod',
  coupon_code   TEXT NOT NULL DEFAULT '',
  discount      INTEGER NOT NULL DEFAULT 0,
  delivery_method TEXT NOT NULL DEFAULT 'standard',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','confirmed','shipped','delivered','cancelled')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'Home',
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  line       TEXT NOT NULL,
  city       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT '',
  pincode    TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inquiries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  need       TEXT NOT NULL DEFAULT '',
  budget     TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupons (
  code       TEXT PRIMARY KEY,
  type       TEXT NOT NULL DEFAULT 'percent' CHECK(type IN ('percent','flat')),
  value      INTEGER NOT NULL CHECK(value > 0),
  min_order  INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  used       INTEGER NOT NULL DEFAULT 0,
  max_uses   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS store_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL DEFAULT 'Customer',
  rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user   ON addresses(user_id);
");
  }

  private static function runMigrations(): void {
    $cols = static function (string $table): array {
      $rows = self::$pdo->query("PRAGMA table_info($table)")->fetchAll();
      return array_column($rows, 'name');
    };
    $p = $cols('products');
    if (!in_array('reviews', $p, true)) self::$pdo->exec("ALTER TABLE products ADD COLUMN reviews INTEGER NOT NULL DEFAULT 0");
    $o = $cols('orders');
    if (!in_array('payment', $o, true))     self::$pdo->exec("ALTER TABLE orders ADD COLUMN payment TEXT NOT NULL DEFAULT 'cod'");
    if (!in_array('coupon_code', $o, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN coupon_code TEXT NOT NULL DEFAULT ''");
    if (!in_array('discount', $o, true))    self::$pdo->exec("ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0");
    if (!in_array('delivery_method', $o, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'standard'");
  }
}

function dd_db(): PDO { return DdDb::pdo(); }
function dd_db_path(): string { DdDb::pdo(); return DdDb::$path; }
