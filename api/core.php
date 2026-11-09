<?php
/** Core request-scoped helpers shared by the API front controller and the page handlers. */
declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/seed.php';

/* ════════════════ settings & store config ════════════════ */
function dd_site_get(string $k): string {
  try { $v = dd_get_setting($k); return $v === null ? '' : (string) $v; } catch (Throwable $e) { return ''; }
}
function dd_site_settings(): array {
  return [
    'brand'    => dd_site_get('site_brand'),
    'tagline'  => dd_site_get('site_tagline'),
    'address'  => dd_site_get('site_address'),
    'gstin'    => dd_site_get('site_gstin'),
    'email'    => dd_site_get('site_email'),
    'phone'    => dd_site_get('site_phone'),
    'whatsapp' => dd_site_get('site_whatsapp'),
  ];
}
function dd_seller_info(): array {
  return [
    'name'  => dd_site_get('site_brand')   ?: 'Debasish Das — Web Studio & Store',
    'line'  => dd_site_get('site_tagline') ?: (getenv('SELLER_LINE')  ?: 'Web design · Hosting · Handpicked store'),
    'addr'  => dd_site_get('site_address') ?: (getenv('SELLER_ADDR')  ?: 'Kolkata, West Bengal 700001, India'),
    'gstin' => dd_site_get('site_gstin')   ?: (getenv('SELLER_GSTIN') ?: '19ABCDE1234F1Z5 (sample)'),
    'email' => dd_site_get('site_email')   ?: (getenv('SELLER_EMAIL') ?: 'hello@example.com'),
    'phone' => dd_site_get('site_phone')   ?: (getenv('SELLER_PHONE') ?: '+91 00000 00000'),
  ];
}

function dd_num_setting(string $k, float $fallback): float {
  $n = (float) dd_get_setting($k);
  return (is_finite($n) && $n >= 0) ? $n : $fallback;
}
function dd_store_config(): array {
  $featured = [];
  try {
    $a = json_decode((string) dd_get_setting('featured_ids'), true);
    if (is_array($a)) $featured = array_slice(array_values(array_filter($a, 'is_string')), 0, 8);
  } catch (Throwable $e) {}
  return [
    'announce'    => (string) dd_get_setting('announce'),
    'freeAt'      => (int) dd_num_setting('free_at', 999),
    'deliveryFee' => (int) dd_num_setting('deliver_fee', 49),
    'expressFee'  => (int) dd_num_setting('express_fee', 99),
    'codEnabled'  => dd_get_setting('cod_enabled') === '1',
    'codMin'      => (int) dd_num_setting('cod_min', 0),
    'maxQty'      => (int) dd_num_setting('max_qty', 99),
    'storeLive'   => dd_get_setting('store_live') === '1',
    'featuredIds' => $featured,
  ];
}
function dd_is_setup_complete(): bool {
  try { return dd_get_setting('setup_completed') === '1'; } catch (Throwable $e) { return false; }
}
function dd_product_out(array $p): array {
  return [
    'id' => $p['id'], 'name' => $p['name'], 'meta' => $p['meta'], 'tag' => $p['tag'],
    'price' => (int) $p['price'], 'was' => (int) $p['was'], 'rating' => (float) $p['rating'],
    'stock' => (int) $p['stock'], 'img' => $p['img'],
    'reviews' => (int) ($p['reviews'] ?? 0), 'active' => (bool) $p['active'],
  ];
}
function dd_parse_items(?string $s): array {
  $a = json_decode((string) $s, true);
  return is_array($a) ? $a : [];
}
function dd_db_counts(): array {
  $q = fn($sql) => (int) dd_db()->query($sql)->fetch()['n'];
  return [
    'users'     => $q('SELECT COUNT(*) n FROM users'),
    'products'  => $q('SELECT COUNT(*) n FROM products'),
    'orders'    => $q('SELECT COUNT(*) n FROM orders'),
    'reviews'   => $q('SELECT COUNT(*) n FROM reviews'),
    'coupons'   => $q('SELECT COUNT(*) n FROM coupons'),
    'inquiries' => $q('SELECT COUNT(*) n FROM inquiries'),
  ];
}
function dd_db_info(): array {
  $path = dd_db_path();
  $size = @filesize($path);
  $env  = dd_env_db_path();
  return [
    'engine'      => 'SQLite (PHP PDO — any Apache+PHP host)',
    'path'        => $path,
    'defaultPath' => DD_DATA . '/site.db',
    'envLocked'   => $env !== null,
    'size'        => $size === false ? null : $size,
    'counts'      => dd_db_counts(),
  ];
}
function dd_require_setup_open(?array $user): void {
  if (!dd_is_setup_complete()) return;
  if ($user && ($user['role'] ?? '') === 'admin') return;
  throw new DdHttpError(403, 'Setup is already complete — sign in as admin to change these settings.');
}
const DD_WIPE_TABLES = ['reviews', 'orders', 'sessions', 'coupons', 'inquiries', 'products', 'users', 'store_settings'];
function dd_wipe_all_tables(): void {
  $db = dd_db();
  $db->exec('PRAGMA foreign_keys = OFF');
  foreach (DD_WIPE_TABLES as $t) $db->exec("DELETE FROM $t");
  $db->exec('PRAGMA foreign_keys = ON');
  try { $db->exec('VACUUM'); } catch (Throwable $e) {}
}

/* ════════════════ passwords ════════════════
   Stored format: 16 random bytes as a 32-char hex STRING used as the scrypt
   salt (N=16384, r=8, p=1, 64-byte key), 128-hex output. Older databases that
   were hashed with bcrypt are still accepted via password_verify. */
function dd_new_salt(): string { return bin2hex(random_bytes(16)); }
function dd_scrypt_hex(string $pw, string $saltStr): string {
  require_once __DIR__ . '/scrypt.php';
  return bin2hex(scrypt_hash($pw, $saltStr, 16384, 8, 1, 64));
}
function dd_password_pair(string $pw): array {
  $salt = dd_new_salt();
  return ['hash' => dd_scrypt_hex($pw, $salt), 'salt' => $salt];
}
function dd_verify_password(string $pw, array $u): bool {
  $hash = (string) ($u['password_hash'] ?? '');
  $salt = (string) ($u['password_salt'] ?? '');
  if ($salt === 'bcrypt') return password_verify($pw, $hash);
  if ($salt !== '' && strlen($hash) === 128) {
    require_once __DIR__ . '/scrypt.php';
    return scrypt_verify_password($pw, $salt, $hash);
  }
  return false;
}

/* ════════════════ sessions ════════════════ */
function dd_parse_cookies(?string $header): array {
  $out = [];
  if (!$header) return $out;
  foreach (explode(';', $header) as $part) {
    $part = trim($part);
    if ($part === '') continue;
    $i = strpos($part, '=');
    if ($i === false) continue;
    $out[trim(substr($part, 0, $i))] = rawurldecode(trim(substr($part, $i + 1)));
  }
  return $out;
}
function dd_user_public(?array $u): ?array {
  if (!$u) return null;
  return ['id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'],
          'phone' => $u['phone'], 'role' => $u['role'], 'created_at' => $u['created_at']];
}
function dd_current_user(array $req): ?array {
  $cookies = dd_parse_cookies($req['headers']['cookie'] ?? null);
  $sid = $cookies['dd_sid'] ?? null;
  if (!$sid) return null;
  $stmt = dd_db()->prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                            WHERE s.token = ? AND s.expires_at > datetime('now')");
  $stmt->execute([$sid]);
  $row = $stmt->fetch();
  return $row ?: null;
}
function dd_session_days(): int {
  $d = (int) (getenv('SESSION_DAYS') ?: 30);
  return $d > 0 ? $d : 30;
}
function dd_cookie_out(string $cookie): void {
  $GLOBALS['dd_set_cookies'][] = $cookie;
}
function dd_create_session(array &$req, int $userId): array {
  $token = bin2hex(random_bytes(32));
  $days = dd_session_days();
  $stmt = dd_db()->prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,datetime('now', ?))");
  $stmt->execute([$token, $userId, '+' . $days . ' days']);
  dd_cookie_out("dd_sid=$token; HttpOnly; SameSite=Lax; Path=/; Max-Age=" . ($days * 86400));
  return [$token];
}
function dd_destroy_session(array &$req): void {
  $cookies = dd_parse_cookies($req['headers']['cookie'] ?? null);
  $sid = $cookies['dd_sid'] ?? null;
  if ($sid) dd_db()->prepare("DELETE FROM sessions WHERE token = ?")->execute([$sid]);
  dd_cookie_out("dd_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}
function dd_require_auth(array $req): array {
  $u = dd_current_user($req);
  if (!$u) throw new DdHttpError(401, 'Sign in required');
  return $u;
}
function dd_require_admin(array $req): array {
  $u = dd_require_auth($req);
  if (($u['role'] ?? '') !== 'admin') throw new DdHttpError(403, 'Admins only');
  return $u;
}

/* ════════════════ login throttle (file-based) ════════════════ */
function dd_throttle_file(): string { return DD_DATA . '/.throttle.json'; }
function dd_throttle_read(): array {
  $f = dd_throttle_file();
  if (!is_file($f)) return [];
  $j = json_decode((string) @file_get_contents($f), true);
  return is_array($j) ? $j : [];
}
function dd_throttle_write(array $data): void {
  $f = dd_throttle_file();
  $fp = fopen($f, 'c+');
  if (!$fp) return;
  flock($fp, LOCK_EX);
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($data));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
}
function dd_throttled(string $key): bool {
  $data = dd_throttle_read();
  $rec = $data[$key] ?? null;
  if (!$rec) return false;
  if (round(microtime(true) * 1000) > ($rec['resetAt'] ?? 0)) return false;
  return ($rec['count'] ?? 0) >= 8;
}
function dd_bump_attempt(string $key): void {
  $data = dd_throttle_read();
  // purge expired buckets opportunistically
  $now = round(microtime(true) * 1000);
  foreach ($data as $k => $rec) {
    if (($rec['resetAt'] ?? 0) < $now) unset($data[$k]);
  }
  $rec = $data[$key] ?? ['count' => 0, 'resetAt' => $now + 5 * 60 * 1000];
  $rec['count'] += 1;
  $data[$key] = $rec;
  dd_throttle_write($data);
}
function dd_clear_attempt(string $key): void {
  $data = dd_throttle_read();
  if (isset($data[$key])) { unset($data[$key]); dd_throttle_write($data); }
}

/* ════════════════ misc ════════════════ */
function dd_email_ok(?string $e): bool {
  return (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', trim((string) $e));
}
function dd_esc_html($s): string {
  return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function dd_json_out($value, int $status = 200, array $headers = []): array {
  return ['status' => $status, 'headers' => $headers, 'body' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'content_type' => 'application/json; charset=utf-8'];
}
function dd_boolish($v): string {
  return ($v === true || $v === 'true' || $v === 1 || $v === '1') ? '1' : '0';
}
function dd_clampi($v, int $min, int $max, int $fallback): int {
  if (!is_numeric($v)) return $fallback;
  $n = (int) round((float) $v);
  return max($min, min($max, $n));
}

/* ════════════════ contact-placeholder substitution ════════════════ */
function dd_contact_substitutions(string $text): string {
  $wa = preg_replace('/\D/', '', dd_site_get('site_whatsapp'));
  $se = dd_site_get('site_email');
  $sp = dd_site_get('site_phone');
  $out = $text;
  if ($wa !== '') $out = str_replace('910000000000', $wa, $out);
  if ($se !== '') $out = str_replace('hello@example.com', $se, $out);
  if ($sp !== '') $out = str_replace('+91 00000 00000', $sp, $out);
  return $out;
}
function dd_base_url(array $req): string {
  $https = $req['https'] ?? false;
  $host = $req['headers']['host'] ?? 'localhost';
  return ($https ? 'https' : 'http') . '://' . $host;
}

/* 404 page (shared by page/product handlers) */
function dd_page_404(): array {
  $f = DD_ROOT . '/404.html';
  $body = is_file($f) ? (string) file_get_contents($f) : 'Not found';
  return ['status' => 404, 'headers' => ['Cache-Control' => 'no-cache'], 'body' => $body, 'content_type' => 'text/html; charset=utf-8'];
}
