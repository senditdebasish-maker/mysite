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
    'name'  => dd_site_get('site_brand') ?: 'Store',
    'line'  => dd_site_get('site_tagline'),
    'addr'  => dd_site_get('site_address'),
    'email' => dd_site_get('site_email'),
    'phone' => dd_site_get('site_phone'),
    'gstin' => dd_site_get('site_gstin'),
    'state' => dd_site_get('seller_state'),
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
    'lowStockThreshold' => max(1, min(100, (int) dd_num_setting('low_stock_threshold', 5))),
    'featuredIds' => $featured,
  ];
}
function dd_is_setup_complete(): bool {
  try { return dd_get_setting('setup_completed') === '1'; } catch (DdHttpError $e) { return false; }
}
function dd_product_out(array $p): array {
  return [
    'id' => $p['id'], 'category_id' => isset($p['category_id']) ? (int) $p['category_id'] : null,
    'name' => $p['name'], 'meta' => $p['meta'], 'tag' => $p['category_name'] ?? $p['tag'],
    'price' => (int) $p['price'], 'was' => (int) $p['was'], 'rating' => (float) $p['rating'],
    'stock' => (int) $p['stock'], 'img' => $p['img'],
    'sku' => (string) ($p['sku'] ?? ''),
    'reviews' => (int) ($p['reviews'] ?? 0), 'active' => (bool) $p['active'],
    'created_at' => $p['created_at'] ?? null,
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
function dd_require_setup_open(?array $user): void {
  $complete = dd_is_setup_complete();
  if (!$complete && !isset(dd_read_install()['database'])) return;
  $adminCount = (int) dd_db()->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
  if ($adminCount === 0 && !$complete) return;
  if ($user && ($user['role'] ?? '') === 'admin') return;
  throw new DdHttpError(403, 'Sign in as admin to change these settings.');
}
/* ════════════════ passwords ════════════════ */
function dd_password_pair(string $pw): array {
  return ['hash' => password_hash($pw, PASSWORD_DEFAULT), 'salt' => 'bcrypt'];
}
function dd_verify_password(string $pw, array $u): bool {
  return password_verify($pw, (string) ($u['password_hash'] ?? ''));
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
  return ['id' => (int) $u['id'], 'name' => $u['name'], 'username' => $u['username'] ?? '', 'email' => $u['email'],
          'phone' => $u['phone'], 'role' => $u['role'], 'created_at' => $u['created_at']];
}
function dd_current_user(array $req): ?array {
  $cookies = dd_parse_cookies($req['headers']['cookie'] ?? null);
  $sid = $cookies['dd_sid'] ?? null;
  if (!$sid) return null;
  $stmt = dd_db()->prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                            WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP()");
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
  $stmt = dd_db()->prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL {$days} DAY))");
  $stmt->execute([$token, $userId]);
  $secure = !empty($req['https']) ? '; Secure' : '';
  dd_cookie_out("dd_sid=$token; HttpOnly; SameSite=Lax; Path=" . (dd_base_path() ?: '/') . "; Max-Age=" . ($days * 86400) . $secure);
  return [$token];
}
function dd_destroy_session(array &$req): void {
  $cookies = dd_parse_cookies($req['headers']['cookie'] ?? null);
  $sid = $cookies['dd_sid'] ?? null;
  if ($sid) dd_db()->prepare("DELETE FROM sessions WHERE token = ?")->execute([$sid]);
  $secure = !empty($req['https']) ? '; Secure' : '';
  dd_cookie_out("dd_sid=; HttpOnly; SameSite=Lax; Path=" . (dd_base_path() ?: '/') . "; Max-Age=0" . $secure);
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
function dd_throttle_update(callable $update) {
  $path = dd_throttle_file();
  $fp = @fopen($path, 'c+');
  if (!$fp) throw new RuntimeException('Could not open the authentication throttle file.');
  try {
    if (!flock($fp, LOCK_EX)) throw new RuntimeException('Could not lock the authentication throttle file.');
    rewind($fp);
    $raw = stream_get_contents($fp);
    if ($raw === false) throw new RuntimeException('Could not read the authentication throttle file.');
    $data = [];
    if (trim($raw) !== '') {
      $decoded = json_decode($raw, true);
      if (!is_array($decoded)) throw new RuntimeException('The authentication throttle file is invalid JSON.');
      $data = $decoded;
    }

    $now = (int) round(microtime(true) * 1000);
    foreach ($data as $key => $record) {
      if (!is_array($record) || (int) ($record['resetAt'] ?? 0) <= $now) unset($data[$key]);
    }
    $result = $update($data, $now);
    if (count($data) > 10000) {
      uasort($data, static fn($a, $b) => (int) ($a['resetAt'] ?? 0) <=> (int) ($b['resetAt'] ?? 0));
      $data = array_slice($data, -10000, null, true);
    }
    $json = json_encode($data);
    if ($json === false) throw new RuntimeException('Could not encode authentication throttle data.');
    rewind($fp);
    if (!ftruncate($fp, 0) || fwrite($fp, $json) !== strlen($json) || !fflush($fp)) {
      throw new RuntimeException('Could not persist authentication throttle data.');
    }
    return $result;
  } finally {
    if (is_resource($fp)) {
      flock($fp, LOCK_UN);
      fclose($fp);
    }
  }
}
function dd_throttle_limit(): int {
  $value = filter_var(getenv('DD_AUTH_MAX_ATTEMPTS') ?: '8', FILTER_VALIDATE_INT);
  return $value === false ? 8 : max(3, min(50, $value));
}
function dd_throttle_window_ms(): int {
  $value = filter_var(getenv('DD_AUTH_WINDOW_SECONDS') ?: '300', FILTER_VALIDATE_INT);
  $seconds = $value === false ? 300 : max(60, min(3600, $value));
  return $seconds * 1000;
}
function dd_throttle_attempt(string $key): bool {
  $key = hash('sha256', $key);
  return dd_throttle_update(static function (array &$data, int $now) use ($key): bool {
    $record = $data[$key] ?? ['count' => 0, 'resetAt' => $now + dd_throttle_window_ms()];
    if ((int) ($record['count'] ?? 0) >= dd_throttle_limit()) {
      $data[$key] = $record;
      return true;
    }
    $record['count'] = (int) ($record['count'] ?? 0) + 1;
    $data[$key] = $record;
    return false;
  });
}
function dd_clear_attempt(string $key): void {
  $key = hash('sha256', $key);
  dd_throttle_update(static function (array &$data) use ($key): void {
    unset($data[$key]);
  });
}

/* ════════════════ misc ════════════════ */
function dd_email_ok(?string $e): bool {
  $email = trim((string) $e);
  return strlen($email) <= 190 && (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $email);
}
function dd_esc_html($s): string {
  return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function dd_json_out($value, int $status = 200, array $headers = []): array {
  return ['status' => $status, 'headers' => array_merge(['Cache-Control' => 'no-store'], $headers), 'body' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'content_type' => 'application/json; charset=utf-8'];
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
/**
 * Path prefix the site is mounted under — '' when served from the vhost docroot,
 * '/mysite' when served from htdocs/mysite (XAMPP subfolder installs).
 * Env DD_BASE_PATH overrides detection (proxies, symlinked docroots).
 */
function dd_base_path(): string {
  static $p = null;
  if ($p !== null) return $p;
  $env = getenv('DD_BASE_PATH');
  if ($env !== false) return $p = rtrim(str_replace('\\', '/', trim((string) $env)), '/');
  $docroot = $_SERVER['DOCUMENT_ROOT'] ?? '';
  $dr = $docroot !== '' ? realpath((string) $docroot) : false;
  $rr = realpath(DD_ROOT);
  $norm = static fn($s) => rtrim(str_replace('\\', '/', (string) $s), '/');
  if ($dr !== false && $rr !== false) {
    $drN = $norm($dr); $rrN = $norm($rr);
    if ($rrN === $drN) return $p = '';                                        // repo IS the docroot
    if (strncmp($rrN, $drN . '/', strlen($drN) + 1) === 0) {
      return $p = $norm(substr($rrN, strlen($drN)));                          // repo nested inside docroot
    }
  }
  return $p = '';                                                             // CLI/tests: root-mounted
}

function dd_request_is_https(): bool {
  if ((!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
      || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) return true;
  if (getenv('DD_TRUST_PROXY') !== '1') return false;
  $forwarded = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
  return $forwarded === 'https';
}

function dd_security_headers(bool $https): array {
  $headers = [
    'X-Content-Type-Options' => 'nosniff',
    'X-Frame-Options' => 'SAMEORIGIN',
    'Referrer-Policy' => 'strict-origin-when-cross-origin',
    'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()',
  ];
  if ($https) $headers['Strict-Transport-Security'] = 'max-age=31536000';
  return $headers;
}

function dd_emit_security_headers(bool $https): void {
  header_remove('X-Powered-By');
  foreach (dd_security_headers($https) as $name => $value) header("$name: $value");
}

function dd_valid_host_header(string $host): bool {
  if (!preg_match('/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::([0-9]{1,5}))?$/D', $host, $matches)) return false;
  if (isset($matches[1]) && ((int) $matches[1] < 1 || (int) $matches[1] > 65535)) return false;
  return true;
}

function dd_require_same_origin(array $req): void {
  $origin = trim((string) ($req['headers']['origin'] ?? ''));
  if ($origin === '') return;
  $parts = parse_url($origin);
  $host = trim((string) ($req['headers']['host'] ?? ''));
  $scheme = !empty($req['https']) ? 'https' : 'http';
  $current = $host !== '' && dd_valid_host_header($host) ? parse_url($scheme . '://' . $host) : false;
  if (!is_array($parts) || !is_array($current)
      || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
      || (isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/')
      || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
      || strtolower((string) ($parts['scheme'] ?? '')) !== $scheme
      || strtolower((string) ($parts['host'] ?? '')) !== strtolower((string) ($current['host'] ?? ''))
      || (int) ($parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80))
        !== (int) ($current['port'] ?? ($scheme === 'https' ? 443 : 80))) {
    throw new DdHttpError(403, 'Cross-origin request rejected');
  }
}

function dd_base_url(array $req): string {
  $https = $req['https'] ?? false;
  $host = trim((string) ($req['headers']['host'] ?? 'localhost'));
  if (!dd_valid_host_header($host)) $host = 'localhost';
  return ($https ? 'https' : 'http') . '://' . $host . dd_base_path();
}

/* 404 page (shared by page/product handlers) */
function dd_page_404(): array {
  $f = DD_ROOT . '/404.html';
  $body = is_file($f) ? (string) file_get_contents($f) : 'Not found';
  return ['status' => 404, 'headers' => ['Cache-Control' => 'no-cache'], 'body' => $body, 'content_type' => 'text/html; charset=utf-8'];
}
