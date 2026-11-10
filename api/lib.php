<?php
/**
 * Debasish Das — Web Studio & Store · XAMPP PHP backend
 * Apache + PHP 8 + MySQL/MariaDB via PDO.
 * The JSON API is versioned in lockstep with the frontend.
 * frontend JS works unchanged.
 */
declare(strict_types=1);

define('DD_ROOT', dirname(__DIR__));
define('DD_DATA', ($__dd = getenv('DD_DATA_DIR')) !== false && $__dd !== '' ? rtrim(str_replace('\\', '/', $__dd), '/') : DD_ROOT . '/data');
define('DD_MAX_JSON_BYTES', 120 * 1024);

/* ════════════════ paths & environment ════════════════ */
function dd_mkdir_data(): void {
  if (!is_dir(DD_DATA) && !@mkdir(DD_DATA, 0775, true) && !is_dir(DD_DATA)) {
    throw new RuntimeException('Could not create the private data directory. Check its path and Apache permissions.');
  }
  $guard = DD_DATA . '/.htaccess';
  if (!is_file($guard) && file_put_contents($guard, "Require all denied\n\n# Apache 2.2\n<IfModule !mod_authz_core.c>\nOrder deny,allow\nDeny from all\n</IfModule>\n", LOCK_EX) === false) {
    throw new RuntimeException('Could not protect the private data directory. Check its path and Apache permissions.');
  }
}
dd_mkdir_data();

function dd_read_install(): array {
  $f = DD_DATA . '/install.json';
  if (!is_file($f)) return [];
  $fp = @fopen($f, 'rb');
  if (!$fp) throw new RuntimeException('Could not read the private installation settings file.');
  try {
    if (!flock($fp, LOCK_SH)) throw new RuntimeException('Could not lock the private installation settings file.');
    $raw = stream_get_contents($fp);
    if ($raw === false) throw new RuntimeException('Could not read the private installation settings file.');
  } finally {
    flock($fp, LOCK_UN);
    fclose($fp);
  }
  $settings = json_decode($raw, true);
  if (!is_array($settings)) throw new RuntimeException('The private installation settings file is invalid JSON.');
  return $settings;
}
function dd_write_install(array $obj): void {
  $path = DD_DATA . '/install.json';
  $json = json_encode($obj, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($json === false || file_put_contents($path, $json, LOCK_EX) === false) {
    throw new RuntimeException('Could not save setup credentials. Check that the data folder is writable.');
  }
  @chmod($path, 0600);
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
function dd_mysql_config(array $input): array {
  $host = trim((string) ($input['host'] ?? ''));
  $database = trim((string) ($input['database'] ?? ''));
  $username = trim((string) ($input['username'] ?? ''));
  $password = (string) ($input['password'] ?? '');
  $port = filter_var($input['port'] ?? 3306, FILTER_VALIDATE_INT);
  if (!preg_match('/^[A-Za-z0-9.:-]{1,253}$/', $host)) throw new DdHttpError(400, 'Enter a valid MySQL host name or IP address');
  if (!preg_match('/^[A-Za-z0-9_$-]{1,64}$/', $database)) throw new DdHttpError(400, 'Enter a valid database name');
  if (!preg_match('/^[A-Za-z0-9_.@-]{1,128}$/', $username)) throw new DdHttpError(400, 'Enter the MySQL username');
  if ($port === false || $port < 1 || $port > 65535) throw new DdHttpError(400, 'Enter a valid MySQL port');
  if (strlen($password) > 256) throw new DdHttpError(400, 'The MySQL password is too long');
  return ['host' => $host, 'database' => $database, 'username' => $username, 'password' => $password, 'port' => $port];
}

function dd_mysql_connect(array $config): PDO {
  $config = dd_mysql_config($config);
  $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4";
  return new PDO($dsn, $config['username'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
}

function dd_mysql_connect_server(array $config): PDO {
  $config = dd_mysql_config($config);
  $dsn = "mysql:host={$config['host']};port={$config['port']};charset=utf8mb4";
  return new PDO($dsn, $config['username'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
}

final class DdDb {
  public static ?PDO $pdo = null;
  public static array $config = [];

  public static function open(array $config): void {
    self::$config = dd_mysql_config($config);
    self::$pdo = dd_mysql_connect(self::$config);
    self::ensureSchema();
    self::runMigrations();
  }

  public static function close(): void {
    self::$pdo = null;
  }

  public static function pdo(): PDO {
    if (!self::$pdo) {
      $install = dd_read_install();
      if (!isset($install['database']) || !is_array($install['database'])) {
        throw new DdHttpError(503, 'MySQL is not configured. Open setup.html and enter your database credentials.');
      }
      self::open($install['database']);
    }
    return self::$pdo;
  }

  private static function ensureSchema(): void {
    $schemas = [
      "CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        username VARCHAR(64) NOT NULL,
        email VARCHAR(190) NOT NULL,
        phone VARCHAR(32) NOT NULL DEFAULT '',
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(32) NOT NULL DEFAULT 'bcrypt',
        role VARCHAR(16) NOT NULL DEFAULT 'user',
        email_otp_hash VARCHAR(255) NULL,
        email_otp_expires_at DATETIME NULL,
        email_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_users_username (username),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS sessions (
        token CHAR(64) NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        KEY idx_sessions_user (user_id),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        category_id BIGINT UNSIGNED NULL,
        name VARCHAR(190) NOT NULL,
        meta VARCHAR(255) NOT NULL DEFAULT '',
        tag VARCHAR(80) NOT NULL DEFAULT 'Tech',
        price BIGINT NOT NULL DEFAULT 0,
        was BIGINT NOT NULL DEFAULT 0,
        rating DECIMAL(3,2) NOT NULL DEFAULT 4.5,
        stock INT NOT NULL DEFAULT 10,
        img VARCHAR(255) NOT NULL DEFAULT 'assets/img/product-mouse.jpg',
        active TINYINT(1) NOT NULL DEFAULT 1,
        reviews INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_products_active (active),
        KEY idx_products_category (category_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS categories (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        slug VARCHAR(96) NOT NULL,
        description VARCHAR(255) NOT NULL DEFAULT '',
        active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_categories_name (name),
        UNIQUE KEY uq_categories_slug (slug),
        KEY idx_categories_active_order (active, sort_order, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        customer_name VARCHAR(120) NOT NULL,
        phone VARCHAR(32) NOT NULL DEFAULT '',
        address TEXT NOT NULL,
        note TEXT NOT NULL,
        items_json MEDIUMTEXT NOT NULL,
        total BIGINT NOT NULL DEFAULT 0,
        payment VARCHAR(16) NOT NULL DEFAULT 'cod',
        coupon_code VARCHAR(20) NOT NULL DEFAULT '',
        discount BIGINT NOT NULL DEFAULT 0,
        delivery_method VARCHAR(16) NOT NULL DEFAULT 'standard',
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        invoice_token_hash CHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_orders_user (user_id),
        KEY idx_orders_status (status),
        KEY idx_orders_created (created_at),
        CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS addresses (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        label VARCHAR(24) NOT NULL DEFAULT 'Home',
        name VARCHAR(120) NOT NULL,
        phone VARCHAR(32) NOT NULL,
        line VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL DEFAULT '',
        state VARCHAR(100) NOT NULL DEFAULT '',
        pincode VARCHAR(20) NOT NULL DEFAULT '',
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_addresses_user (user_id),
        CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS inquiries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        phone VARCHAR(32) NOT NULL DEFAULT '',
        need VARCHAR(160) NOT NULL DEFAULT '',
        budget VARCHAR(80) NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS coupons (
        code VARCHAR(20) NOT NULL PRIMARY KEY,
        type VARCHAR(16) NOT NULL DEFAULT 'percent',
        value BIGINT NOT NULL DEFAULT 1,
        min_order BIGINT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        used BIGINT NOT NULL DEFAULT 0,
        max_uses BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS store_settings (
        `key` VARCHAR(80) NOT NULL PRIMARY KEY,
        value TEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      "CREATE TABLE IF NOT EXISTS reviews (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(64) NOT NULL,
        user_id BIGINT UNSIGNED NULL,
        name VARCHAR(120) NOT NULL DEFAULT 'Customer',
        rating TINYINT UNSIGNED NOT NULL,
        title VARCHAR(80) NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_review_user (product_id, user_id),
        KEY idx_reviews_product (product_id),
        CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];
    foreach ($schemas as $schema) self::$pdo->exec($schema);
  }

  private static function runMigrations(): void {
    $columns = static function (string $table): array {
      $stmt = self::$pdo->prepare('SHOW COLUMNS FROM `' . $table . '`');
      $stmt->execute();
      return array_column($stmt->fetchAll(), 'Field');
    };
    $users = $columns('users');
    if (!in_array('username', $users, true)) {
      self::$pdo->exec('ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL AFTER name');
      self::$pdo->exec("UPDATE users SET username = CONCAT('user', id) WHERE username IS NULL OR username = ''");
      self::$pdo->exec('ALTER TABLE users MODIFY username VARCHAR(64) NOT NULL');
      self::$pdo->exec('ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)');
    }
    $users = $columns('users');
    if (!in_array('email_otp_hash', $users, true)) self::$pdo->exec('ALTER TABLE users ADD COLUMN email_otp_hash VARCHAR(255) NULL');
    if (!in_array('email_otp_expires_at', $users, true)) self::$pdo->exec('ALTER TABLE users ADD COLUMN email_otp_expires_at DATETIME NULL');
    if (!in_array('email_otp_attempts', $users, true)) self::$pdo->exec('ALTER TABLE users ADD COLUMN email_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0');

    $orders = $columns('orders');
    if (!in_array('invoice_token_hash', $orders, true)) self::$pdo->exec('ALTER TABLE orders ADD COLUMN invoice_token_hash CHAR(64) NULL AFTER status');

    $products = $columns('products');
    if (!in_array('category_id', $products, true)) self::$pdo->exec('ALTER TABLE products ADD COLUMN category_id BIGINT UNSIGNED NULL AFTER id');
    $categoryIndexes = self::$pdo->query("SHOW INDEX FROM products WHERE Key_name = 'idx_products_category'")->fetchAll();
    if (!$categoryIndexes) self::$pdo->exec('ALTER TABLE products ADD INDEX idx_products_category (category_id)');
    $categoryForeignKeys = self::$pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'category_id'
        AND REFERENCED_TABLE_NAME = 'categories'")->fetchAll();
    if (!$categoryForeignKeys) self::$pdo->exec('ALTER TABLE products ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT');

    /* ── ERP milestone 1: order trail, GST invoice, coupon v2, SKU, low-stock ── */
    $orderCols2 = $columns('orders');
    if (!in_array('guest_email', $orderCols2, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN guest_email VARCHAR(190) NULL AFTER note");
    if (!in_array('state', $orderCols2, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN state VARCHAR(100) NOT NULL DEFAULT '' AFTER address");
    if (!in_array('pincode', $orderCols2, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN pincode VARCHAR(20) NOT NULL DEFAULT '' AFTER state");
    if (!in_array('invoice_no', $orderCols2, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN invoice_no VARCHAR(32) NULL AFTER id");
    if (!in_array('refund_reason', $orderCols2, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN refund_reason VARCHAR(255) NULL AFTER delivery_method");
    if (!in_array('refunded_at', $orderCols2, true)) self::$pdo->exec("ALTER TABLE orders ADD COLUMN refunded_at DATETIME NULL AFTER refund_reason");
    $invIdx = self::$pdo->query("SHOW INDEX FROM orders WHERE Key_name = 'uq_orders_invoice_no'")->fetchAll();
    if (!$invIdx) self::$pdo->exec('ALTER TABLE orders ADD UNIQUE KEY uq_orders_invoice_no (invoice_no)');

    $productCols2 = $columns('products');
    if (!in_array('sku', $productCols2, true)) self::$pdo->exec("ALTER TABLE products ADD COLUMN sku VARCHAR(64) NULL AFTER id");
    $skuIdx = self::$pdo->query("SHOW INDEX FROM products WHERE Key_name = 'uq_products_sku'")->fetchAll();
    if (!$skuIdx) self::$pdo->exec('ALTER TABLE products ADD UNIQUE KEY uq_products_sku (sku)');

    $couponCols2 = $columns('coupons');
    if (!in_array('expires_at', $couponCols2, true)) self::$pdo->exec("ALTER TABLE coupons ADD COLUMN expires_at DATETIME NULL AFTER max_uses");
    if (!in_array('usage_per_customer', $couponCols2, true)) self::$pdo->exec("ALTER TABLE coupons ADD COLUMN usage_per_customer BIGINT NOT NULL DEFAULT 0 AFTER expires_at");
    if (!in_array('product_ids', $couponCols2, true)) self::$pdo->exec("ALTER TABLE coupons ADD COLUMN product_ids TEXT NULL AFTER usage_per_customer");
    if (!in_array('category_ids', $couponCols2, true)) self::$pdo->exec("ALTER TABLE coupons ADD COLUMN category_ids TEXT NULL AFTER product_ids");
    $legacyFlat = self::$pdo->query("SELECT COUNT(*) FROM coupons WHERE type IN ('flat','fixed')")->fetchColumn();
    if ($legacyFlat) self::$pdo->exec("UPDATE coupons SET type = 'fixed_cart' WHERE type IN ('flat','fixed')");
    $legacyPercent = self::$pdo->query("SELECT COUNT(*) FROM coupons WHERE type NOT IN ('percent','fixed_cart','fixed_product')")->fetchColumn();
    if ($legacyPercent) self::$pdo->exec("UPDATE coupons SET type = 'fixed_cart' WHERE type NOT IN ('percent','fixed_cart','fixed_product')");

    self::$pdo->exec("CREATE TABLE IF NOT EXISTS invoice_sequences (
      year INT NOT NULL PRIMARY KEY,
      next INT NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    self::$pdo->exec("CREATE TABLE IF NOT EXISTS order_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(8) NOT NULL DEFAULT 'status',
      from_status VARCHAR(16) NULL,
      to_status VARCHAR(16) NULL,
      body VARCHAR(500) NULL,
      visibility VARCHAR(10) NOT NULL DEFAULT 'admin',
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_order_events_order (order_id, id),
      CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // backfill a status event for existing orders so the trail starts somewhere honest
    self::$pdo->exec("INSERT INTO order_events (order_id, kind, to_status, visibility, created_at)
      SELECT o.id, 'status', o.status, 'customer', o.created_at FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'status')");

    $defaults = [
      ['Tech', 'tech', 'Technology and electronics', 10],
      ['Home & Living', 'home-living', 'Home, decor, and everyday living', 20],
      ['Other', 'other', 'Products in other categories', 1000],
    ];
    $insertCategory = self::$pdo->prepare('INSERT IGNORE INTO categories (name,slug,description,sort_order) VALUES (?,?,?,?)');
    foreach ($defaults as [$name, $slug, $description, $sortOrder]) $insertCategory->execute([$name, $slug, $description, $sortOrder]);

    $legacyTags = self::$pdo->query("SELECT DISTINCT COALESCE(NULLIF(TRIM(tag), ''), 'Other') AS name FROM products")->fetchAll(PDO::FETCH_COLUMN);
    $findCategory = self::$pdo->prepare('SELECT id FROM categories WHERE name = ?');
    foreach ($legacyTags as $tag) {
      $name = mb_substr(trim((string) $tag) ?: 'Other', 0, 80);
      $slug = strtolower(trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: $name), '-'));
      if ($slug === '') $slug = 'category-' . substr(hash('sha256', $name), 0, 10);
      $findCategory->execute([$name]);
      if ($findCategory->fetchColumn()) continue;
      $slugExists = self::$pdo->prepare('SELECT 1 FROM categories WHERE slug = ?');
      $slugExists->execute([$slug]);
      if ($slugExists->fetchColumn()) $slug = substr($slug, 0, 82) . '-' . substr(hash('sha256', $name), 0, 10);
      $insertCategory->execute([$name, mb_substr($slug, 0, 96), '', 500]);
    }
    self::$pdo->exec("UPDATE products p JOIN categories c ON c.name = COALESCE(NULLIF(TRIM(p.tag), ''), 'Other')
      SET p.category_id = c.id WHERE p.category_id IS NULL");
    self::$pdo->exec("UPDATE products SET tag = 'Other' WHERE tag IS NULL OR TRIM(tag) = ''");
  }
}

function dd_db(): PDO { return DdDb::pdo(); }
function dd_db_info(): array {
  $config = DdDb::$config ?: (dd_read_install()['database'] ?? []);
  $counts = [];
  foreach (['users', 'products', 'orders', 'reviews', 'coupons', 'inquiries'] as $table) {
    $counts[$table] = (int) dd_db()->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
  }
  return [
    'engine' => 'MySQL / MariaDB',
    'host' => (string) ($config['host'] ?? ''),
    'database' => (string) ($config['database'] ?? ''),
    'username' => (string) ($config['username'] ?? ''),
    'port' => (int) ($config['port'] ?? 3306),
    'counts' => $counts,
  ];
}
