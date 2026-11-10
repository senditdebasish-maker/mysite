<?php
/**
 * API front controller — Apache routes /api/* here (see .htaccess).
 * `dd_handle(array $req): array` is the pure request → response seam used by tests.
 */
declare(strict_types=1);
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/erp.php';

function dd_env_int(string $k, int $fallback): int { $v = getenv($k); return ($v !== false && is_numeric($v)) ? (int) $v : $fallback; }
function dd_ip(array $req): string { return (string) ($req['ip'] ?? 'unknown'); }
function dd_throttle_key(array $req, string $email): string { return dd_ip($req) . '|' . strtolower(trim($email)); }

function dd_body_json(array $req): array {
  $raw = $req['raw'] ?? '';
  if ($raw === '' || $raw === null) return [];
  $j = json_decode($raw, true);
  if (json_last_error() !== JSON_ERROR_NONE || !is_array($j)) {
    throw new DdHttpError(400, 'Request body must be a valid JSON object');
  }
  return $j;
}

/* ════════════════ auth ════════════════ */
function route_auth_register(array $req): array {
  if (dd_throttle_attempt(dd_throttle_key($req, 'register'))) {
    throw new DdHttpError(429, 'Too many registration attempts — try again in 5 minutes');
  }
  $b = dd_body_json($req);
  $name = trim((string) ($b['name'] ?? ''));
  $username = strtolower(trim((string) ($b['username'] ?? '')));
  $email = trim((string) ($b['email'] ?? ''));
  $password = (string) ($b['password'] ?? '');
  $phone = trim((string) ($b['phone'] ?? ''));
  if ($name === '') throw new DdHttpError(400, 'Please tell me your name');
  if (mb_strlen($name) > 80) throw new DdHttpError(400, 'Name must be 80 characters or fewer');
  if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) throw new DdHttpError(400, 'Username must be 3–32 characters: letters, numbers, dot, underscore or hyphen');
  if (!dd_email_ok($email)) throw new DdHttpError(400, "That email doesn't look right");
  if (strlen($password) < 8) throw new DdHttpError(400, 'Password must be at least 8 characters');
  if (strlen($password) > 72) throw new DdHttpError(400, 'Password must be 72 bytes or fewer');
  if (mb_strlen($phone) > 32) throw new DdHttpError(400, 'Phone must be 32 characters or fewer');
  $norm = strtolower($email);
  $stmt = dd_db()->prepare('SELECT 1 FROM users WHERE email = ? OR username = ?');
  $stmt->execute([$norm, $username]);
  if ($stmt->fetch()) throw new DdHttpError(409, 'An account with this email already exists — try signing in');
  $pair = dd_password_pair($password);
  $ins = dd_db()->prepare("INSERT INTO users (name,username,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?,?,'user')");
  $ins->execute([$name, $username, $norm, $phone, $pair['hash'], $pair['salt']]);
  $id = (int) dd_db()->lastInsertId();
  dd_create_session($req, $id);
  $u = dd_db()->prepare('SELECT * FROM users WHERE id = ?'); $u->execute([$id]);
  return dd_json_out(['user' => dd_user_public($u->fetch())], 201);
}

function route_auth_login(array $req): array {
  $b = dd_body_json($req);
  $identifier = strtolower(trim((string) ($b['identifier'] ?? $b['email'] ?? '')));
  $password = (string) ($b['password'] ?? '');
  if ($identifier === '' || $password === '') throw new DdHttpError(400, 'Username or email and password are required');
  $key = dd_throttle_key($req, $identifier);
  if (dd_throttle_attempt($key)) throw new DdHttpError(429, 'Too many attempts — try again in 5 minutes');
  $u = dd_db()->prepare('SELECT * FROM users WHERE username = ? OR email = ?');
  $u->execute([$identifier, $identifier]);
  $user = $u->fetch();
  if (!$user || !dd_verify_password($password, $user)) {
    throw new DdHttpError(401, 'Invalid username/email or password');
  }
  dd_clear_attempt($key);
  if (password_needs_rehash((string) $user['password_hash'], PASSWORD_DEFAULT)) {
    dd_db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
  }
  dd_create_session($req, (int) $user['id']);
  return dd_json_out(['user' => dd_user_public($user)]);
}

function dd_smtp_settings(): array {
  $smtp = dd_read_install()['smtp'] ?? [];
  return is_array($smtp) ? $smtp : [];
}

function dd_send_email(string $to, string $subject, string $html, ?array $smtpOverride = null): void {
  $smtp = $smtpOverride ?? dd_smtp_settings();
  if (empty($smtp['email']) || empty($smtp['password'])) {
    throw new DdHttpError(503, 'Gmail SMTP is not configured. Complete the SMTP step in setup first.');
  }
  $autoload = dirname(__DIR__) . '/vendor/autoload.php';
  if (!is_file($autoload)) throw new DdHttpError(503, 'PHPMailer is missing. Run Composer install in the XAMPP project folder.');
  require_once $autoload;
  $mail = new PHPMailer\PHPMailer\PHPMailer(true);
  try {
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = $smtp['email'];
    $mail->Password = $smtp['password'];
    $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = 587;
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($smtp['email'], dd_site_get('site_brand') ?: 'Debasish Store');
    $mail->addAddress($to);
    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body = $html;
    $mail->AltBody = trim(strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html)));
    $mail->send();
  } catch (PHPMailer\PHPMailer\Exception $e) {
    error_log('[mail] SMTP delivery failed: ' . $e->getMessage());
    throw new DdHttpError(502, 'Email could not be sent. Check the Gmail address and App Password in setup.');
  }
}

function route_auth_otp_request(array $req): array {
  $b = dd_body_json($req);
  $identifier = strtolower(trim((string) ($b['identifier'] ?? '')));
  if ($identifier === '') throw new DdHttpError(400, 'Enter your username or email');
  $key = dd_throttle_key($req, 'otp:' . $identifier);
  if (dd_throttle_attempt($key) || dd_throttle_attempt(dd_throttle_key($req, 'otp-ip'))) {
    throw new DdHttpError(429, 'Too many code requests — try again in 5 minutes');
  }
  $stmt = dd_db()->prepare('SELECT id,email FROM users WHERE username = ? OR email = ?');
  $stmt->execute([$identifier, $identifier]);
  $user = $stmt->fetch();
  if (!$user) return dd_json_out(['ok' => true, 'message' => 'If the account exists, a sign-in code has been sent.']);
  $code = (string) random_int(100000, 999999);
  $hash = password_hash($code, PASSWORD_DEFAULT);
  try {
    dd_send_email($user['email'], 'Your sign-in code', '<p>Your sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">' . $code . '</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>');
  } catch (DdHttpError $e) {
    error_log('[auth-otp] delivery failed: ' . $e->getMessage());
    throw $e;
  }
  dd_db()->prepare('UPDATE users SET email_otp_hash = ?, email_otp_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), email_otp_attempts = 0 WHERE id = ?')
    ->execute([$hash, $user['id']]);
  return dd_json_out(['ok' => true, 'message' => 'If the account exists, a sign-in code has been sent.']);
}

function route_auth_otp_verify(array $req): array {
  $b = dd_body_json($req);
  $identifier = strtolower(trim((string) ($b['identifier'] ?? '')));
  $code = trim((string) ($b['code'] ?? ''));
  if ($identifier === '' || !preg_match('/^\d{6}$/', $code)) throw new DdHttpError(400, 'Enter your username/email and the 6-digit code');
  $key = dd_throttle_key($req, 'otp-verify:' . $identifier);
  if (dd_throttle_attempt($key)) throw new DdHttpError(429, 'Too many attempts — try again in 5 minutes');
  $stmt = dd_db()->prepare('SELECT * FROM users WHERE username = ? OR email = ?');
  $stmt->execute([$identifier, $identifier]);
  $user = $stmt->fetch();
  if (!$user || empty($user['email_otp_hash']) || empty($user['email_otp_expires_at']) ||
      (int) $user['email_otp_attempts'] >= 5 ||
      !password_verify($code, (string) $user['email_otp_hash'])) {
    if ($user && !empty($user['email_otp_hash'])) {
      dd_db()->prepare('UPDATE users SET email_otp_attempts = email_otp_attempts + 1 WHERE id = ? AND email_otp_attempts < 5 AND email_otp_expires_at >= UTC_TIMESTAMP()')->execute([$user['id']]);
    }
    throw new DdHttpError(401, 'That code is invalid or expired. Request a new one and try again.');
  }
  $consume = dd_db()->prepare('UPDATE users SET email_otp_hash = NULL, email_otp_expires_at = NULL, email_otp_attempts = 0 WHERE id = ? AND email_otp_hash = ? AND email_otp_expires_at >= UTC_TIMESTAMP() AND email_otp_attempts < 5');
  $consume->execute([$user['id'], $user['email_otp_hash']]);
  if ($consume->rowCount() !== 1) {
    throw new DdHttpError(401, 'That code is invalid or expired. Request a new one and try again.');
  }
  dd_clear_attempt($key);
  dd_create_session($req, (int) $user['id']);
  return dd_json_out(['user' => dd_user_public($user)]);
}

function route_setup_smtp(array $req): array {
  $previous = dd_read_install();
  $current = isset($previous['database']) && is_array($previous['database']) ? dd_current_user($req) : null;
  dd_require_setup_open($current);
  $b = dd_body_json($req);
  $email = strtolower(trim((string) ($b['email'] ?? '')));
  $password = preg_replace('/\s+/', '', trim((string) ($b['password'] ?? ''))) ?? '';
  if (!dd_email_ok($email)) throw new DdHttpError(400, 'Enter the Gmail address used for SMTP');
  if ($password === '') $password = (string) (($previous['smtp']['password'] ?? ''));
  if ($password === '') throw new DdHttpError(400, 'Enter a Gmail App Password');
  dd_send_email($email, 'Gmail SMTP test', '<p>Your Gmail SMTP settings are working. Email OTP sign-in is ready.</p>', ['email' => $email, 'password' => $password]);
  $previous['smtp'] = ['email' => $email, 'password' => $password];
  dd_write_install($previous);
  return dd_json_out(['ok' => true, 'email' => $email]);
}

function route_auth_logout(array $req): array {
  dd_destroy_session($req);
  return dd_json_out(['ok' => true]);
}

function route_me(array $req): array {
  return dd_json_out(['user' => dd_user_public(dd_current_user($req))]);
}

function route_me_put(array $req): array {
  $u = dd_require_auth($req);
  $b = dd_body_json($req);
  $name = trim((string) ($b['name'] ?? $u['name']));
  $phone = trim((string) ($b['phone'] ?? $u['phone']));
  if ($name === '') throw new DdHttpError(400, "Name can't be empty");
  if (mb_strlen($name) > 80) throw new DdHttpError(400, 'Name must be 80 characters or fewer');
  if (mb_strlen($phone) > 32) throw new DdHttpError(400, 'Phone must be 32 characters or fewer');
  dd_db()->prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')->execute([$name, $phone, $u['id']]);
  $stmt = dd_db()->prepare('SELECT * FROM users WHERE id = ?'); $stmt->execute([$u['id']]);
  return dd_json_out(['user' => dd_user_public($stmt->fetch())]);
}

/* ════════════════ store config & coupons ════════════════ */
function dd_coupon_row(string $raw): ?array {
  $stmt = dd_db()->prepare('SELECT * FROM coupons WHERE code = ? AND active = 1');
  $stmt->execute([strtoupper(trim($raw))]);
  $row = $stmt->fetch();
  return $row ?: null;
}
function dd_coupon_usable(?array $c): bool {
  if ($c === null) return false;
  if ($c['max_uses'] && (int) $c['used'] >= (int) $c['max_uses']) return false;
  $exp = $c['expires_at'] ?? null;
  if ($exp && strtotime((string) $exp) !== false && strtotime((string) $exp) < time()) return false;
  return true;
}
function dd_compute_discount(?array $c, int $subtotal): int {
  if (!$c || $subtotal < (int) ($c['min_order'] ?? 0)) return 0;
  return $c['type'] === 'percent' ? (int) round($subtotal * ((int) $c['value']) / 100) : min((int) $c['value'], $subtotal);
}

function route_store_config(array $req): array { return dd_json_out(dd_store_config()); }

function route_coupon_validate(array $req): array {
  $b = dd_body_json($req);
  $code = strtoupper(trim((string) ($b['code'] ?? '')));
  $subtotal = max(0, (int) round((float) ($b['subtotal'] ?? 0)));
  if ($code === '') throw new DdHttpError(400, 'Enter a coupon code');
  $c = dd_coupon_row($code);
  if (!$c) throw new DdHttpError(404, "That coupon code doesn't exist");
  if (!dd_coupon_usable($c)) throw new DdHttpError(409, 'This coupon has been fully used');
  if ($subtotal < (int) $c['min_order']) throw new DdHttpError(400, "Spend at least ₹{$c['min_order']} to use {$c['code']}");
  return dd_json_out([
    'valid' => true, 'code' => $c['code'], 'type' => $c['type'], 'value' => (int) $c['value'],
    'min_order' => (int) $c['min_order'], 'discount' => dd_compute_discount($c, $subtotal),
  ]);
}

/* ════════════════ products ════════════════ */
function route_products(array $req): array {
  $rows = dd_db()->query('SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND (c.active = 1 OR c.id IS NULL)
    ORDER BY p.created_at, p.id')->fetchAll();
  return dd_json_out(['products' => array_map('dd_product_out', $rows)]);
}
function route_categories(array $req): array {
  $rows = dd_db()->query("SELECT c.id,c.name,c.slug,c.description,c.sort_order,COUNT(p.id) AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.active = 1
    WHERE c.active = 1 GROUP BY c.id ORDER BY c.sort_order,c.name")->fetchAll();
  return dd_json_out(['categories' => $rows]);
}
function dd_product_active(string $id): ?array {
  $stmt = dd_db()->prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  return $row ?: null;
}

/* ════════════════ orders ════════════════ */
function route_orders_post(array $req): array {
  $b = dd_body_json($req);
  $items = $b['items'] ?? null;
  if (!is_array($items) || count($items) === 0) throw new DdHttpError(400, 'Your cart is empty');
  $cfg = dd_store_config();
  if (!$cfg['storeLive']) throw new DdHttpError(503, 'The store is momentarily closed — please try again shortly');
  $me = dd_current_user($req);
  $name = trim((string) ($b['customer_name'] ?? ($me['name'] ?? '')));
  if ($name === '') throw new DdHttpError(400, 'Please tell me your name');
  $phone = trim((string) ($b['phone'] ?? ''));
  $address = trim((string) ($b['address'] ?? ''));
  $note = trim((string) ($b['note'] ?? ''));
  $state = mb_substr(trim((string) ($b['state'] ?? '')), 0, 100);
  $pincode = trim((string) ($b['pincode'] ?? ''));
  if ($pincode !== '' && !preg_match('/^\d{6}$/', $pincode)) {
    throw new DdHttpError(400, 'PIN code must be 6 digits');
  }
  $guestEmail = strtolower(trim((string) ($b['guest_email'] ?? '')));
  if ($me) $guestEmail = ''; // signed-in users get order updates at their account email
  if ($guestEmail !== '' && !dd_email_ok($guestEmail)) {
    throw new DdHttpError(400, "That email doesn't look right");
  }
  if ($guestEmail !== '' && mb_strlen($guestEmail) > 190) {
    throw new DdHttpError(400, 'Email must be 190 characters or fewer');
  }
  if (mb_strlen($name) > 120 || mb_strlen($phone) > 32 || strlen($address) > 60000 || strlen($note) > 60000) {
    throw new DdHttpError(400, 'One or more order fields exceed their maximum length');
  }

  $pay = (($b['payment'] ?? '') === 'upi') ? 'upi' : 'cod';
  if ($pay === 'cod' && !$cfg['codEnabled']) throw new DdHttpError(400, 'Cash on Delivery is temporarily unavailable — please choose UPI on delivery');

  $requested = [];
  $maxQty = max(1, (int) $cfg['maxQty']);
  foreach ($items as $line) {
    if (!is_array($line)) throw new DdHttpError(400, 'One of the items is no longer available');
    $qty = max(1, min($maxQty, (int) ($line['qty'] ?? 1) ?: 1));
    $productId = trim((string) ($line['id'] ?? ''));
    if ($productId === '') throw new DdHttpError(400, 'One of the items is no longer available');
    $requested[$productId] = min($maxQty, ($requested[$productId] ?? 0) + $qty);
  }
  ksort($requested, SORT_STRING);

  $db = dd_db();
  $db->beginTransaction();
  try {
  $picked = [];
  $subtotal = 0;
  $get = $db->prepare('SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ? AND p.active = 1 AND (c.active = 1 OR c.id IS NULL) FOR UPDATE');
  foreach ($requested as $productId => $qty) {
    $get->execute([$productId]);
    $p = $get->fetch();
    if (!$p) throw new DdHttpError(400, 'One of the items is no longer available');
    if ((int) $p['stock'] < $qty) throw new DdHttpError(409, "Only {$p['stock']} left of {$p['name']}");
    $picked[] = [
      'id' => $p['id'], 'category_id' => isset($p['category_id']) ? (int) $p['category_id'] : null,
      'category' => (string) ($p['category_name'] ?? $p['tag']), 'name' => $p['name'],
      'price' => (int) $p['price'], 'qty' => $qty,
      'sku' => (string) ($p['sku'] ?? ''),
    ];
    $subtotal += (int) $p['price'] * $qty;
  }
  $couponCode = '';
  $discount = 0;
  $couponRaw = trim((string) ($b['coupon'] ?? ''));
  if ($couponRaw !== '') {
    $c = dd_coupon_row($couponRaw);
    if (!$c) throw new DdHttpError(400, "That coupon code doesn't exist");
    if (!dd_coupon_usable($c)) throw new DdHttpError(409, "This coupon is expired or has been fully used");
    if ($subtotal < (int) $c['min_order']) throw new DdHttpError(400, "Spend at least ₹{$c['min_order']} to use {$c['code']}");
    // per-customer cap (signed-in shoppers only — guests can't be identified reliably)
    $perCustomer = (int) ($c['usage_per_customer'] ?? 0);
    if ($perCustomer > 0 && $me) {
      $usedStmt = $db->prepare("SELECT COUNT(*) FROM orders WHERE user_id = ? AND coupon_code = ? AND status NOT IN ('cancelled', 'refunded')");
      $usedStmt->execute([(int) $me['id'], $c['code']]);
      if ((int) $usedStmt->fetchColumn() >= $perCustomer) {
        throw new DdHttpError(409, "You've already used {$c['code']} the maximum number of times");
      }
    }
    // optional scope: only some products / categories count towards the discount
    $scopeProducts = array_values(array_filter(array_map('trim', explode(',', (string) ($c['product_ids'] ?? '')))));
    $scopeCategories = array_values(array_filter(array_map('intval', explode(',', (string) ($c['category_ids'] ?? '')))));
    $scoped = count($scopeProducts) > 0 || count($scopeCategories) > 0;
    $eligibleSubtotal = 0;
    $eligibleQty = 0;
    foreach ($picked as $it) {
      $eligible = !$scoped
        || in_array((string) $it['id'], $scopeProducts, true)
        || (count($scopeCategories) > 0 && in_array((int) ($it['category_id'] ?? 0), $scopeCategories, true));
      if ($eligible) { $eligibleSubtotal += $it['price'] * $it['qty']; $eligibleQty += (int) $it['qty']; }
    }
    if ($scoped && $eligibleQty === 0) {
      throw new DdHttpError(400, "This coupon doesn't apply to the items in your cart");
    }
    $basis = $scoped ? $eligibleSubtotal : $subtotal;
    if (($c['type'] ?? '') === 'percent') {
      $discount = (int) round($basis * (int) $c['value'] / 100);
    } elseif (($c['type'] ?? '') === 'fixed_product') {
      $discount = min((int) $c['value'] * $eligibleQty, $basis);
    } else { // fixed_cart
      $discount = min((int) $c['value'], $basis);
    }
    $couponCode = $c['code'];
  }

  if ($pay === 'cod' && $cfg['codMin'] > 0 && $subtotal < $cfg['codMin']) {
    $missing = $cfg['codMin'] - $subtotal;
    throw new DdHttpError(400, "Cash on Delivery is available on orders of ₹{$cfg['codMin']} and above — please add ₹$missing more, or choose UPI on delivery");
  }

  $method = (($b['delivery_method'] ?? '') === 'express') ? 'express' : 'standard';
  $delivery = $method === 'express' ? (int) $cfg['expressFee'] : ($subtotal >= $cfg['freeAt'] ? 0 : $cfg['deliveryFee']);
  $total = max(0, $subtotal - $discount + $delivery);
    $invoiceToken = $me ? null : bin2hex(random_bytes(32));
    $ins = $db->prepare("INSERT INTO orders (user_id,customer_name,phone,address,note,state,pincode,guest_email,items_json,total,payment,coupon_code,discount,delivery_method,status,invoice_token_hash)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)");
    $ins->execute([$me ? (int) $me['id'] : null, $name, $phone, $address, $note, $state, $pincode, $guestEmail,
                   json_encode($picked, JSON_UNESCAPED_UNICODE), $total, $pay, $couponCode, $discount, $method,
                   $invoiceToken === null ? null : hash('sha256', $invoiceToken)]);
    $orderId = (int) $db->lastInsertId();
    if ($couponCode !== '') {
      $use = $db->prepare('UPDATE coupons SET used = used + 1 WHERE code = ? AND active = 1 AND (max_uses = 0 OR used < max_uses)');
      $use->execute([$couponCode]);
      if ($use->rowCount() !== 1) throw new DdHttpError(409, 'This coupon has just been fully used or disabled');
    }
    $dec = $db->prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND active = 1 AND stock >= ?');
    foreach ($picked as $it) {
      $dec->execute([$it['qty'], $it['id'], $it['qty']]);
      if ($dec->rowCount() !== 1) throw new DdHttpError(409, "Stock changed for {$it['name']}; please review your cart");
    }
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  dd_notify_new_order($orderId);

  return dd_json_out(['order' => [
    'id' => $orderId, 'total' => $total, 'subtotal' => $subtotal, 'discount' => $discount, 'delivery' => $delivery,
    'coupon' => $couponCode !== '' ? $couponCode : null, 'payment' => $pay, 'status' => 'pending', 'items' => $picked, 'delivery_method' => $method,
    'invoice_token' => $invoiceToken,
  ]], 201);
}

function route_my_orders(array $req): array {
  $u = dd_require_auth($req);
  $stmt = dd_db()->prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC");
  $stmt->execute([$u['id']]);
  $rows = $stmt->fetchAll();
  foreach ($rows as &$o) {
    $o['items'] = dd_parse_items($o['items_json'] ?? null);
    unset($o['invoice_token_hash']);
  }
  return dd_json_out(['orders' => $rows]);
}

function route_inquiries_post(array $req): array {
  $b = dd_body_json($req);
  $name = trim((string) ($b['name'] ?? ''));
  if ($name === '') throw new DdHttpError(400, 'Name is required');
  $phone = trim((string) ($b['phone'] ?? ''));
  $need = trim((string) ($b['need'] ?? ''));
  $budget = trim((string) ($b['budget'] ?? ''));
  $message = trim((string) ($b['message'] ?? ''));
  if (mb_strlen($name) > 120 || mb_strlen($phone) > 32 || mb_strlen($need) > 160 || mb_strlen($budget) > 80 || strlen($message) > 60000) {
    throw new DdHttpError(400, 'One or more inquiry fields exceed their maximum length');
  }
  dd_db()->prepare('INSERT INTO inquiries (name,phone,need,budget,message) VALUES (?,?,?,?,?)')
    ->execute([$name, $phone, $need, $budget, $message]);
  return dd_json_out(['ok' => true], 201);
}

/* ════════════════ admin ════════════════ */
function route_admin_stats(array $req): array {
  dd_require_admin($req);
  $revenue = (int) dd_db()->query("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled'")->fetch()['s'];
  $todayRev = (int) dd_db()->query("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled' AND DATE(created_at) = CURDATE()")->fetch()['s'];
  $orders = (int) dd_db()->query('SELECT COUNT(*) AS n FROM orders')->fetch()['n'];
  $pending = (int) dd_db()->query("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'")->fetch()['n'];
  $customers = (int) dd_db()->query("SELECT COUNT(*) AS n FROM users WHERE role = 'user'")->fetch()['n'];
  $products = (int) dd_db()->query('SELECT COUNT(*) AS n FROM products WHERE active = 1')->fetch()['n'];
  $lowStock = (int) dd_db()->query('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock <= 5')->fetch()['n'];
  $inquiries = (int) dd_db()->query('SELECT COUNT(*) AS n FROM inquiries')->fetch()['n'];
  return dd_json_out(['revenue' => $revenue, 'todayRev' => $todayRev, 'orders' => $orders, 'pending' => $pending,
    'customers' => $customers, 'products' => $products, 'lowStock' => $lowStock, 'inquiries' => $inquiries]);
}

function route_admin_orders(array $req): array {
  dd_require_admin($req);
  $query = $req['query'] ?? [];
  $status = trim((string) ($query['status'] ?? 'all'));
  if (!in_array($status, ['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'], true)) {
    throw new DdHttpError(400, 'Invalid order status filter');
  }
  $from = trim((string) ($query['from'] ?? ''));
  $to = trim((string) ($query['to'] ?? ''));
  foreach (['from' => $from, 'to' => $to] as $label => $date) {
    if ($date !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ||
        !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4)))) {
      throw new DdHttpError(400, "Invalid $label date");
    }
  }
  if ($from !== '' && $to !== '' && $from > $to) throw new DdHttpError(400, 'Start date must be on or before end date');
  $search = mb_substr(trim((string) ($query['q'] ?? '')), 0, 100);
  $page = max(1, min(100000, (int) ($query['page'] ?? 1)));
  $pageSize = max(1, min(100, (int) ($query['per_page'] ?? 50)));
  $where = [];
  $params = [];
  if ($status !== 'all') { $where[] = 'o.status = ?'; $params[] = $status; }
  if ($from !== '') { $where[] = "o.created_at >= CONCAT(?, ' 00:00:00')"; $params[] = $from; }
  if ($to !== '') { $where[] = "o.created_at < DATE_ADD(?, INTERVAL 1 DAY)"; $params[] = $to; }
  if ($search !== '') {
    $where[] = '(CAST(o.id AS CHAR) LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ? OR u.email LIKE ? OR o.coupon_code LIKE ? OR o.address LIKE ? OR o.note LIKE ? OR o.items_json LIKE ?)';
    for ($i = 0; $i < 8; $i++) $params[] = '%' . $search . '%';
  }
  $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
  $count = dd_db()->prepare("SELECT COUNT(*) FROM orders o LEFT JOIN users u ON u.id = o.user_id$whereSql");
  $count->execute($params);
  $total = (int) $count->fetchColumn();
  $offset = ($page - 1) * $pageSize;
  $rowsStmt = dd_db()->prepare("SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id$whereSql
                                ORDER BY o.created_at DESC, o.id DESC LIMIT $pageSize OFFSET $offset");
  $rowsStmt->execute($params);
  $rows = $rowsStmt->fetchAll();
  foreach ($rows as &$o) {
    $o['items'] = dd_parse_items($o['items_json'] ?? null);
    unset($o['items_json']);
    unset($o['invoice_token_hash']);
  }
  return dd_json_out(['orders' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $pageSize]);
}

function route_admin_order_status(array $req, string $id): array {
  $admin = dd_require_admin($req);
  $b = dd_body_json($req);
  $status = (string) ($b['status'] ?? '');
  if (!in_array($status, ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], true)) {
    throw new DdHttpError(400, 'Invalid status');
  }
  $db = dd_db();
  $db->beginTransaction();
  try {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? FOR UPDATE');
    $stmt->execute([(int) $id]);
    $order = $stmt->fetch();
    if (!$order) throw new DdHttpError(404, 'Order not found');
    if (in_array($order['status'], ['cancelled', 'refunded'], true) && $status !== $order['status']) {
      throw new DdHttpError(409, 'This order is closed (cancelled or refunded) and cannot be reopened. Create a new order if the customer still wants to buy.');
    }
    $fromStatus = (string) $order['status'];
    $changed = false;
    if ($status === 'cancelled' && $order['status'] !== 'cancelled') {
      $db->prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?")->execute([$order['id']]);
      $increment = $db->prepare('UPDATE products SET stock = LEAST(2147483647, stock + ?) WHERE id = ?');
      foreach (dd_parse_items($order['items_json'] ?? null) as $item) {
        if (!is_array($item) || empty($item['id'])) continue;
        $increment->execute([max(1, (int) ($item['qty'] ?? 1)), $item['id']]);
      }
      if (($order['coupon_code'] ?? '') !== '') {
        $db->prepare('UPDATE coupons SET used = GREATEST(0, used - 1) WHERE code = ?')->execute([$order['coupon_code']]);
      }
      $changed = true;
    } elseif ($status !== $order['status']) {
      $db->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$status, $order['id']]);
      $changed = true;
    }
    if ($changed) {
      dd_add_event((int) $order['id'], 'status', $fromStatus, $status, null, 'customer', (int) $admin['id']);
    }
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  if ($changed) dd_notify_status_change((int) $order['id'], $status);
  return dd_json_out(['ok' => true, 'status' => $status]);
}

function dd_clean_sku($raw, ?string $existing): string {
  $sku = strtoupper(trim((string) ($raw ?? $existing ?? '')));
  if ($sku === '') return '';
  if (strlen($sku) > 64 || !preg_match('/^[A-Z0-9][A-Z0-9._\\-]{0,63}$/', $sku)) {
    throw new DdHttpError(400, 'SKU must be 1–64 characters: A–Z, 0–9, dot, underscore, hyphen');
  }
  return $sku;
}
function dd_sku_available(string $sku, ?string $exceptId = null): bool {
  if ($sku === '') return true;
  $stmt = dd_db()->prepare('SELECT id FROM products WHERE sku = ?' . ($exceptId ? ' AND id <> ?' : ''));
  $args = $exceptId ? [$sku, $exceptId] : [$sku];
  $stmt->execute($args);
  return !$stmt->fetch();
}
function dd_read_product_body(array $b, ?array $existing = null): array {
  $existing = $existing ?? [];
  $name = trim((string) ($b['name'] ?? ($existing['name'] ?? '')));
  if ($name === '') throw new DdHttpError(400, 'Name is required');
  $meta = trim((string) ($b['meta'] ?? ($existing['meta'] ?? '')));
  $tag = trim((string) ($b['tag'] ?? ($existing['tag'] ?? 'Tech')));
  if ($tag === '') $tag = 'Tech';
  $img = trim((string) ($b['img'] ?? ($existing['img'] ?? 'assets/img/product-mouse.jpg')));
  if ($img === '') $img = 'assets/img/product-mouse.jpg';
  if (mb_strlen($name) > 190 || mb_strlen($meta) > 255 || mb_strlen($tag) > 80 || mb_strlen($img) > 255) {
    throw new DdHttpError(400, 'Product text fields exceed their maximum length');
  }
  $rating = (float) ($b['rating'] ?? ($existing['rating'] ?? 4.5));
  $rating = max(0, min(5, is_finite($rating) ? $rating : 4.5));
  $activeRaw = $b['active'] ?? ($existing['active'] ?? true);
  $active = ($activeRaw === true || $activeRaw === 'true' || $activeRaw === 1 || $activeRaw === '1') ? 1 : 0;
  return [
    'category_id' => array_key_exists('category_id', $b) ? dd_clampi($b['category_id'], 1, PHP_INT_MAX, 0) : (int) ($existing['category_id'] ?? 0),
    'sku' => dd_clean_sku($b['sku'] ?? null, $existing['sku'] ?? null),
    'name' => $name,
    'price' => dd_clampi($b['price'] ?? ($existing['price'] ?? 0), 0, PHP_INT_MAX, 0),
    'was'   => dd_clampi($b['was']   ?? ($existing['was']   ?? 0), 0, PHP_INT_MAX, 0),
    'stock' => dd_clampi($b['stock'] ?? ($existing['stock'] ?? 0), 0, 2147483647, 0),
    'rating' => $rating, 'meta' => $meta, 'tag' => $tag, 'img' => $img, 'active' => $active,
  ];
}

function dd_category_out(array $row): array {
  return [
    'id' => (int) $row['id'], 'name' => (string) $row['name'], 'slug' => (string) $row['slug'],
    'description' => (string) $row['description'], 'active' => (bool) $row['active'],
    'sort_order' => (int) $row['sort_order'], 'product_count' => (int) ($row['product_count'] ?? 0),
  ];
}
function dd_category_slug(string $name): string {
  $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
  $slug = strtolower(trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', $ascii === false ? $name : $ascii), '-'));
  if ($slug === '') $slug = 'category-' . substr(hash('sha256', $name), 0, 10);
  return substr($slug, 0, 96);
}
function route_admin_categories_get(array $req): array {
  dd_require_admin($req);
  $rows = dd_db()->query('SELECT c.*, COUNT(p.id) AS product_count FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.sort_order,c.name')->fetchAll();
  return dd_json_out(['categories' => array_map('dd_category_out', $rows)]);
}
function route_admin_categories_post(array $req): array {
  dd_require_admin($req);
  $b = dd_body_json($req);
  $name = trim((string) ($b['name'] ?? ''));
  $description = trim((string) ($b['description'] ?? ''));
  if ($name === '' || mb_strlen($name) > 80) throw new DdHttpError(400, 'Category name is required and must be 80 characters or fewer');
  if (mb_strlen($description) > 255) throw new DdHttpError(400, 'Category description must be 255 characters or fewer');
  $slug = dd_category_slug($name);
  $check = dd_db()->prepare('SELECT id FROM categories WHERE name = ? OR slug = ?');
  $check->execute([$name, $slug]);
  if ($check->fetch()) throw new DdHttpError(409, 'A category with this name already exists');
  $stmt = dd_db()->prepare('INSERT INTO categories (name,slug,description,active,sort_order) VALUES (?,?,?,1,?)');
  $stmt->execute([$name, $slug, $description, dd_clampi($b['sort_order'] ?? 500, 0, 100000, 500)]);
  $id = (int) dd_db()->lastInsertId();
  $stmt = dd_db()->prepare('SELECT c.*, 0 AS product_count FROM categories c WHERE id = ?');
  $stmt->execute([$id]);
  return dd_json_out(['category' => dd_category_out($stmt->fetch())], 201);
}
function route_admin_categories_put(array $req, string $id): array {
  dd_require_admin($req);
  $db = dd_db();
  $stmt = $db->prepare('SELECT * FROM categories WHERE id = ?');
  $stmt->execute([(int) $id]);
  $existing = $stmt->fetch();
  if (!$existing) throw new DdHttpError(404, 'Category not found');
  $b = dd_body_json($req);
  $name = trim((string) ($b['name'] ?? $existing['name']));
  $description = trim((string) ($b['description'] ?? $existing['description']));
  $active = array_key_exists('active', $b) ? (int) dd_boolish($b['active']) : (int) $existing['active'];
  $sortOrder = array_key_exists('sort_order', $b)
    ? dd_clampi($b['sort_order'], 0, 100000, (int) $existing['sort_order'])
    : (int) $existing['sort_order'];
  if ($name === '' || mb_strlen($name) > 80) throw new DdHttpError(400, 'Category name is required and must be 80 characters or fewer');
  if (mb_strlen($description) > 255) throw new DdHttpError(400, 'Category description must be 255 characters or fewer');
  if (!$active && (int) $db->query('SELECT COUNT(*) FROM products WHERE category_id = ' . (int) $id . ' AND active = 1')->fetchColumn() > 0) {
    throw new DdHttpError(409, 'Move or hide active products before deactivating this category');
  }
  $slug = $name === $existing['name'] ? $existing['slug'] : dd_category_slug($name);
  $check = $db->prepare('SELECT id FROM categories WHERE id <> ? AND (name = ? OR slug = ?)');
  $check->execute([(int) $id, $name, $slug]);
  if ($check->fetch()) throw new DdHttpError(409, 'A category with this name already exists');
  $db->beginTransaction();
  try {
    $db->prepare('UPDATE categories SET name=?,slug=?,description=?,active=?,sort_order=? WHERE id=?')
      ->execute([$name, $slug, $description, $active, $sortOrder, (int) $id]);
    if ($name !== $existing['name']) {
      $db->prepare('UPDATE products SET tag = ? WHERE category_id = ?')->execute([$name, (int) $id]);
    }
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  $stmt = $db->prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) AS product_count FROM categories c WHERE id = ?');
  $stmt->execute([(int) $id]);
  return dd_json_out(['category' => dd_category_out($stmt->fetch())]);
}
function route_admin_categories_delete(array $req, string $id): array {
  dd_require_admin($req);
  $stmt = dd_db()->prepare('SELECT COUNT(*) FROM products WHERE category_id = ?');
  $stmt->execute([(int) $id]);
  if ((int) $stmt->fetchColumn() > 0) throw new DdHttpError(409, 'Reassign or remove products before deleting this category');
  $delete = dd_db()->prepare('DELETE FROM categories WHERE id = ?');
  $delete->execute([(int) $id]);
  if ($delete->rowCount() !== 1) throw new DdHttpError(404, 'Category not found');
  return dd_json_out(['ok' => true]);
}

function route_admin_products_get(array $req): array {
  dd_require_admin($req);
  $rows = dd_db()->query('SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id ORDER BY c.sort_order,c.name,p.created_at,p.id')->fetchAll();
  return dd_json_out(['products' => array_map('dd_product_out', $rows)]);
}

function route_admin_products_post(array $req): array {
  dd_require_admin($req);
  $body = dd_body_json($req);
  $p = dd_read_product_body($body);
  $category = dd_db()->prepare('SELECT id,name,active FROM categories WHERE id = ?');
  $category->execute([$p['category_id']]);
  $categoryRow = $category->fetch();
  if (!$categoryRow || !(int) $categoryRow['active']) throw new DdHttpError(400, 'Choose an active product category');
  $p['tag'] = $categoryRow['name'];
  if (!dd_sku_available($p['sku'])) throw new DdHttpError(409, 'That SKU is already used by another product');
  $id = 'pr_' . base_convert((string) time(), 10, 36) . bin2hex(random_bytes(2));
  dd_db()->prepare('INSERT INTO products (id,category_id,name,meta,tag,price,was,rating,stock,img,active,sku) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    ->execute([$id, $p['category_id'], $p['name'], $p['meta'], $p['tag'], $p['price'], $p['was'], $p['rating'], $p['stock'], $p['img'], $p['active'], $p['sku'] === '' ? null : $p['sku']]);
  $stmt = dd_db()->prepare('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id = ?'); $stmt->execute([$id]);
  return dd_json_out(['product' => dd_product_out($stmt->fetch())], 201);
}

function route_admin_products_put(array $req, string $id): array {
  dd_require_admin($req);
  $stmt = dd_db()->prepare('SELECT * FROM products WHERE id = ?'); $stmt->execute([$id]);
  $existing = $stmt->fetch();
  if (!$existing) throw new DdHttpError(404, 'Product not found');
  $p = dd_read_product_body(dd_body_json($req), $existing);
  $category = dd_db()->prepare('SELECT id,name,active FROM categories WHERE id = ?');
  $category->execute([$p['category_id']]);
  $categoryRow = $category->fetch();
  if (!$categoryRow || (!(int) $categoryRow['active'] && $p['active'])) throw new DdHttpError(400, 'Choose an active category for visible products');
  $p['tag'] = $categoryRow['name'];
  if (!dd_sku_available($p['sku'], (string) $existing['id'])) throw new DdHttpError(409, 'That SKU is already used by another product');
  dd_db()->prepare('UPDATE products SET category_id=?,name=?,meta=?,tag=?,price=?,was=?,rating=?,stock=?,img=?,active=?,sku=? WHERE id=?')
    ->execute([$p['category_id'], $p['name'], $p['meta'], $p['tag'], $p['price'], $p['was'], $p['rating'], $p['stock'], $p['img'], $p['active'], $p['sku'] === '' ? null : $p['sku'], $existing['id']]);
  $stmt = dd_db()->prepare('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id = ?');
  $stmt->execute([$existing['id']]);
  return dd_json_out(['product' => dd_product_out($stmt->fetch())]);
}

function route_admin_products_delete(array $req, string $id): array {
  dd_require_admin($req);
  $stmt = dd_db()->prepare('UPDATE products SET active = 0 WHERE id = ?');
  $stmt->execute([$id]);
  if ($stmt->rowCount() === 0) {
    $chk = dd_db()->prepare('SELECT 1 FROM products WHERE id = ?'); $chk->execute([$id]);
    if (!$chk->fetch()) throw new DdHttpError(404, 'Product not found');
  }
  return dd_json_out(['ok' => true]);
}

function route_admin_customers(array $req): array {
  dd_require_admin($req);
  $search = mb_substr(trim((string) (($req['query'] ?? [])['q'] ?? '')), 0, 100);
  $filter = '';
  $params = [];
  if ($search !== '') {
    $filter = ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.username LIKE ? OR CAST(u.id AS CHAR) LIKE ?)';
    for ($i = 0; $i < 5; $i++) $params[] = '%' . $search . '%';
  }
  $stmt = dd_db()->prepare("SELECT u.id, u.name, u.email, u.phone, u.created_at,
                                   COUNT(o.id) AS orders,
                                   COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS revenue,
                                   MAX(o.created_at) AS last_order
                            FROM users u LEFT JOIN orders o ON o.user_id = u.id
                            WHERE u.role = 'user'$filter GROUP BY u.id ORDER BY revenue DESC, u.id");
  $stmt->execute($params);
  $rows = $stmt->fetchAll();
  return dd_json_out(['customers' => $rows]);
}

function route_admin_customer_detail(array $req, string $id): array {
  dd_require_admin($req);
  $customer = dd_db()->prepare("SELECT u.id, u.name, u.username, u.email, u.phone, u.created_at,
                                       COUNT(o.id) AS orders,
                                       COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS revenue,
                                       MAX(o.created_at) AS last_order
                                FROM users u LEFT JOIN orders o ON o.user_id = u.id
                                WHERE u.id = ? AND u.role = 'user' GROUP BY u.id");
  $customer->execute([(int) $id]);
  $row = $customer->fetch();
  if (!$row) throw new DdHttpError(404, 'Customer not found');
  $orders = dd_db()->prepare("SELECT id, customer_name, phone, address, items_json, total, payment, coupon_code, discount, delivery_method, status, created_at
                              FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50");
  $orders->execute([(int) $id]);
  $history = $orders->fetchAll();
  foreach ($history as &$order) {
    $order['items'] = dd_parse_items($order['items_json'] ?? null);
    unset($order['items_json']);
  }
  return dd_json_out(['customer' => $row, 'orders' => $history]);
}

function route_admin_customers_csv(array $req): array {
  dd_require_admin($req);
  $rows = dd_db()->query("SELECT u.id, u.name, u.username, u.email, u.phone, u.created_at,
                                 COUNT(o.id) AS orders,
                                 COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS revenue,
                                 MAX(o.created_at) AS last_order
                          FROM users u LEFT JOIN orders o ON o.user_id = u.id
                          WHERE u.role = 'user' GROUP BY u.id ORDER BY revenue DESC, u.id")->fetchAll();
  $out = array_map(fn($c) => [$c['id'], $c['name'], $c['username'], $c['email'], $c['phone'], $c['created_at'], $c['orders'], $c['revenue'], $c['last_order']], $rows);
  return dd_send_csv('customers.csv', ['ID','Name','Username','Email','Phone','Joined','Orders','Revenue','Last order'], $out);
}

function route_admin_inquiries(array $req): array {
  dd_require_admin($req);
  $rows = dd_db()->query("SELECT * FROM inquiries ORDER BY created_at DESC, id DESC LIMIT 100")->fetchAll();
  return dd_json_out(['inquiries' => $rows]);
}

/* ════════════════ reviews ════════════════ */
function route_reviews_get(array $req, string $productId): array {
  if (!dd_product_active($productId)) throw new DdHttpError(404, 'Product not found');
  $stmt = dd_db()->prepare('SELECT id, name, rating, title, body, created_at FROM reviews WHERE product_id = ? ORDER BY id DESC LIMIT 12');
  $stmt->execute([$productId]);
  return dd_json_out(['reviews' => $stmt->fetchAll()]);
}

function route_reviews_post(array $req, string $productId): array {
  $u = dd_require_auth($req);
  $prod = dd_product_active($productId);
  if (!$prod) throw new DdHttpError(404, 'Product not found');
  $b = dd_body_json($req);
  $rating = (int) round((float) ($b['rating'] ?? 0));
  if ($rating < 1 || $rating > 5) throw new DdHttpError(400, 'Pick a star rating (1–5)');
  $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 80);
  $body = mb_substr(trim((string) ($b['body'] ?? '')), 0, 600);
  if (mb_strlen($body) < 4) throw new DdHttpError(400, 'Please write a few words about the product');
  $exists = dd_db()->prepare('SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?');
  $exists->execute([$productId, $u['id']]);
  if ($exists->fetch()) throw new DdHttpError(409, "You've already reviewed this product");
  dd_db()->prepare('INSERT INTO reviews (product_id, user_id, name, rating, title, body) VALUES (?,?,?,?,?,?)')
    ->execute([$productId, $u['id'], $u['name'], $rating, $title, $body]);
  dd_db()->prepare('UPDATE products SET reviews = reviews + 1 WHERE id = ?')->execute([$productId]);
  $stmt = dd_db()->prepare('SELECT id, name, rating, title, body, created_at FROM reviews WHERE product_id = ? AND user_id = ?');
  $stmt->execute([$productId, $u['id']]);
  return dd_json_out(['ok' => true, 'review' => $stmt->fetch()], 201);
}

/* ════════════════ invoice ════════════════ */
function dd_invoice_token_matches(?string $storedHash, string $token): bool {
  return preg_match('/^[a-f0-9]{64}$/', $token) === 1
    && $storedHash !== null
    && $storedHash !== ''
    && hash_equals($storedHash, hash('sha256', $token));
}
function dd_invoice_item_totals(array $items): array {
  $subtotal = 0;
  $itemsOut = [];
  foreach ($items as $item) {
    if (!is_array($item)) continue;
    $price = max(0, (int) ($item['price'] ?? 0));
    $qty = max(0, (int) ($item['qty'] ?? 0));
    $lineTotal = $price * $qty;
    $subtotal += $lineTotal;
    $itemsOut[] = [
      'id' => $item['id'] ?? null, 'name' => $item['name'] ?? '', 'category' => $item['category'] ?? '',
      'sku' => (string) ($item['sku'] ?? ''),
      'price' => $price, 'qty' => $qty, 'lineTotal' => $lineTotal,
    ];
  }
  return ['items' => $itemsOut, 'subtotal' => $subtotal];
}
function route_invoice(array $req, string $id): array {
  $u = dd_current_user($req);
  $rawToken = (($req['query'] ?? [])['token'] ?? '');
  $token = is_string($rawToken) ? $rawToken : '';
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Invoice not found');
  $stmt = dd_db()->prepare('SELECT o.*, u.email AS customer_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?');
  $stmt->execute([(int) $id]);
  $o = $stmt->fetch();
  if (!$o) throw new DdHttpError(404, 'Invoice not found');
  $isOwner = $u && (int) ($o['user_id'] ?? 0) === (int) $u['id'];
  $isAdmin = $u && ($u['role'] ?? '') === 'admin';
  $hasValidToken = dd_invoice_token_matches($o['invoice_token_hash'] ?? null, $token);
  if (!$isOwner && !$isAdmin && !$hasValidToken) {
    throw new DdHttpError($u ? 403 : 401, $u ? 'Not your order bill' : 'Sign in or use the order bill link to continue');
  }
  $billLines = dd_invoice_item_totals(dd_parse_items($o['items_json'] ?? null));
  $itemsOut = $billLines['items'];
  $subtotal = $billLines['subtotal'];
  $discount = (int) ($o['discount'] ?? 0);
  $total = (int) $o['total'];
  $delivery = max(0, $total - $subtotal + $discount);
  $seller = dd_seller_info();
  $gst = dd_gst_breakup($total, (string) ($seller['state'] ?? ''), (string) ($o['state'] ?? ''));
  // assigns + stores INV-YYYY-NNNN on first view/print; reuses it forever after
  $invoiceNumber = dd_invoice_number((int) $o['id']) ?? ('INV-' . str_pad((string) $o['id'], 6, '0', STR_PAD_LEFT));
  return dd_json_out([
    'invoice' => [
      'id' => (int) $o['id'], 'invoiceNumber' => $invoiceNumber,
      'createdAt' => $o['created_at'], 'status' => $o['status'],
      'customer' => ['name' => $o['customer_name'], 'phone' => $o['phone'], 'email' => $o['customer_email'] ?? '', 'address' => $o['address'], 'state' => $o['state'] ?? '', 'pincode' => $o['pincode'] ?? ''],
      'items' => $itemsOut,
      'subtotal' => $subtotal, 'discount' => $discount, 'delivery' => $delivery,
      'total' => $total,
      'payment' => $o['payment'] ?: 'cod', 'coupon' => $o['coupon_code'] ?: '',
      'gst' => $gst,
    ],
    'seller' => $seller,
  ]);
}

/* ════════════════ admin reports ════════════════ */
function dd_report_period(array $query, ?string $today = null): array {
  $today = $today ?? (string) dd_db()->query('SELECT CURDATE()')->fetchColumn();
  $rawFrom = $query['from'] ?? '';
  $rawTo = $query['to'] ?? '';
  if (!is_string($rawFrom) || !is_string($rawTo)) throw new DdHttpError(400, 'Report dates must be single date values');
  $from = trim($rawFrom);
  $to = trim($rawTo);
  foreach (['from' => $from, 'to' => $to] as $label => $date) {
    if ($date !== '') {
      $parsed = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
      if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new DdHttpError(400, "Invalid $label date");
    }
  }
  if ($from === '' && $to === '') {
    $to = $today;
    $from = (new DateTimeImmutable($today))->modify('-29 days')->format('Y-m-d');
  } elseif ($from === '') {
    $from = (new DateTimeImmutable($to))->modify('-29 days')->format('Y-m-d');
  } elseif ($to === '') {
    $to = $today;
  }
  if ($from > $to) throw new DdHttpError(400, 'Start date must be on or before end date');
  $span = (int) (new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->format('%a') + 1;
  if ($span > 90) throw new DdHttpError(400, 'Report date range cannot exceed 90 days');
  return [$from, $to, $span];
}

function dd_product_category_names(): array {
  $products = [];
  $categories = [];
  foreach (dd_db()->query('SELECT p.id,p.category_id,p.tag,c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id=p.category_id')->fetchAll() as $row) {
    $name = (string) ($row['category_name'] ?? $row['tag'] ?? 'Uncategorized');
    $products[(string) $row['id']] = $name;
    if ($row['category_id'] !== null) $categories[(string) $row['category_id']] = $name;
  }
  return ['products' => $products, 'categories' => $categories];
}

function dd_build_admin_report(string $from, string $to, int $span): array {
  $db = dd_db();
  $range = $db->prepare('SELECT id,items_json,total,payment,coupon_code,discount,status,created_at,state,invoice_no
    FROM orders WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
    ORDER BY created_at,id');
  $range->execute([$from, $to]);
  $orders = $range->fetchAll();
  $categoryNames = dd_product_category_names();

  $days = [];
  $start = new DateTimeImmutable($from);
  for ($i = 0; $i < $span; $i++) {
    $key = $start->modify("+$i days")->format('Y-m-d');
    $days[$key] = ['date' => $key, 'orders' => 0, 'revenue' => 0];
  }
  $byProduct = [];
  $byCategory = [];
  $cod = 0; $upi = 0; $codRevenue = 0; $upiRevenue = 0;
  $couponOrders = 0; $couponSaved = 0; $units = 0; $grossSales = 0;
  $cancelled = 0; $open = 0; $salesOrders = 0; $refunded = 0;
  $sellerState = (string) dd_get_setting('seller_state');
  $gst = ['taxable' => 0, 'cgst' => 0, 'sgst' => 0, 'igst' => 0, 'unattributed' => 0, 'totalTax' => 0,
          'rateBp' => dd_gst_rate_bp(), 'intra' => 0, 'inter' => 0, 'unknown' => 0];
  foreach ($orders as $o) {
    $key = substr((string) $o['created_at'], 0, 10);
    if (($o['status'] ?? '') === 'cancelled') { $cancelled++; continue; }
    if (($o['status'] ?? '') === 'refunded') { $refunded++; continue; }
    if (isset($days[$key])) {
      $days[$key]['orders']++;
      $days[$key]['revenue'] += (int) $o['total'];
    }
    $salesOrders++;
    $grossSales += (int) $o['total'];
    if (!in_array($o['status'], ['delivered', 'cancelled', 'refunded'], true)) $open++;
    $g = dd_gst_breakup((int) $o['total'], $sellerState, (string) ($o['state'] ?? ''));
    $gst['taxable'] += $g['taxable']; $gst['cgst'] += $g['cgst']; $gst['sgst'] += $g['sgst'];
    $gst['igst'] += $g['igst']; $gst['unattributed'] += $g['unattributed']; $gst['totalTax'] += $g['totalTax'];
    if ($g['intra'] === true) $gst['intra']++; elseif ($g['intra'] === false) $gst['inter']++; else $gst['unknown']++;
    if (($o['payment'] ?? '') === 'upi') { $upi++; $upiRevenue += (int) $o['total']; }
    else { $cod++; $codRevenue += (int) $o['total']; }
    if (!empty($o['coupon_code'])) { $couponOrders++; $couponSaved += (int) ($o['discount'] ?? 0); }
    foreach (dd_parse_items($o['items_json'] ?? null) as $it) {
      if (!is_array($it)) continue;
      $pid = (string) ($it['id'] ?? '');
      $qty = max(0, (int) ($it['qty'] ?? 0));
      $price = max(0, (int) ($it['price'] ?? 0));
      $productName = (string) ($it['name'] ?? $pid ?: 'Product');
      $categoryId = (string) ($it['category_id'] ?? '');
      $category = $categoryNames['categories'][$categoryId]
        ?? (trim((string) ($it['category'] ?? '')) ?: ($categoryNames['products'][$pid] ?? 'Uncategorized'));
      if (!isset($byProduct[$pid])) $byProduct[$pid] = ['id' => $pid, 'name' => $productName, 'units' => 0, 'revenue' => 0];
      $byProduct[$pid]['units'] += $qty;
      $byProduct[$pid]['revenue'] += $price * $qty;
      if (!isset($byCategory[$category])) $byCategory[$category] = ['name' => $category, 'units' => 0, 'revenue' => 0];
      $byCategory[$category]['units'] += $qty;
      $byCategory[$category]['revenue'] += $price * $qty;
      $units += $qty;
    }
  }
  usort($byProduct, fn($a, $b) => $b['revenue'] <=> $a['revenue']);
  usort($byCategory, fn($a, $b) => $b['revenue'] <=> $a['revenue']);
  $itemSales = array_sum(array_column($byCategory, 'revenue'));
  $allTime = $db->query("SELECT COUNT(*) AS orders FROM orders")->fetch();
  return [
    'from' => $from, 'to' => $to, 'days' => array_values($days), 'topProducts' => array_slice($byProduct, 0, 10),
    'categories' => array_values($byCategory), 'payment' => ['cod' => $cod, 'upi' => $upi, 'codRevenue' => $codRevenue, 'upiRevenue' => $upiRevenue],
    'coupons' => ['orders' => $couponOrders, 'saved' => $couponSaved], 'units' => $units,
    'grossSales' => $grossSales, 'itemSales' => $itemSales, 'orders' => $salesOrders, 'cancelled' => $cancelled, 'open' => $open,
    'refunded' => $refunded, 'gst' => $gst,
    'aov' => $salesOrders ? (int) round($grossSales / $salesOrders) : 0, 'ordersAllTime' => (int) $allTime['orders'],
  ];
}
function route_admin_report(array $req): array {
  dd_require_admin($req);
  [$from, $to, $span] = dd_report_period($req['query'] ?? []);
  return dd_json_out(dd_build_admin_report($from, $to, $span));
}
function route_admin_report_csv(array $req): array {
  dd_require_admin($req);
  [$from, $to] = dd_report_period($req['query'] ?? []);
  $categoryNames = dd_product_category_names();
  $stmt = dd_db()->prepare('SELECT id,created_at,customer_name,phone,items_json,total,payment,coupon_code,discount,status,state
    FROM orders WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
    ORDER BY created_at,id');
  $stmt->execute([$from, $to]);
  $rows = [];
  foreach ($stmt->fetchAll() as $order) {
    if (in_array($order['status'] ?? '', ['cancelled', 'refunded'], true)) continue;
    foreach (dd_parse_items($order['items_json'] ?? null) as $item) {
      if (!is_array($item)) continue;
      $qty = max(0, (int) ($item['qty'] ?? 0));
      $price = max(0, (int) ($item['price'] ?? 0));
      $categoryId = (string) ($item['category_id'] ?? '');
      $category = $categoryNames['categories'][$categoryId]
        ?? (trim((string) ($item['category'] ?? '')) ?: ($categoryNames['products'][(string) ($item['id'] ?? '')] ?? 'Uncategorized'));
      $rows[] = [
        $order['id'], $order['created_at'], $order['customer_name'], $order['phone'],
        $item['id'] ?? '', $item['name'] ?? '', $category,
        $qty, $price, $qty * $price, (int) $order['total'], $order['payment'],
        $order['coupon_code'], (int) $order['discount'], $order['status'], $order['state'] ?? '',
      ];
    }
  }
  return dd_send_csv('sales-report-' . $from . '-to-' . $to . '.csv',
    ['Order','Placed','Customer','Phone','Product ID','Product','Category','Units','Unit price','Line sales','Order total','Payment','Coupon','Discount','Status','State'], $rows);
}

/* ════════════════ admin storefront config ════════════════ */
function route_admin_store_config_get(array $req): array {
  dd_require_admin($req);
  $cfg = dd_store_config();
  $inv = dd_db()->query('SELECT COALESCE(SUM(price * stock),0) AS value, COALESCE(SUM(stock),0) AS units, COUNT(*) AS skus FROM products WHERE active = 1')->fetch();
  $out = (int) dd_db()->query('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock = 0')->fetch()['n'];
  $threshold = max(1, min(100, (int) dd_num_setting('low_stock_threshold', 5)));
  $low = (int) dd_db()->query('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock > 0 AND stock <= ' . $threshold)->fetch()['n'];
  return dd_json_out(array_merge($cfg, [
    'inventoryValue' => (int) $inv['value'], 'unitsInStock' => (int) $inv['units'],
    'activeSkus' => (int) $inv['skus'], 'outOfStock' => $out, 'lowStock' => $low,
  ]));
}

function route_admin_store_config_put(array $req): array {
  dd_require_admin($req);
  $b = dd_body_json($req);
  if (array_key_exists('announce', $b)) {
    $s = mb_substr(trim((string) $b['announce']), 0, 140);
    dd_set_setting('announce', $s !== '' ? $s : DD_DEFAULT_SETTINGS['announce']);
  }
  if (array_key_exists('freeAt', $b))      dd_set_setting('free_at',     (string) dd_clampi($b['freeAt'], 0, 100000, 999));
  if (array_key_exists('deliveryFee', $b)) dd_set_setting('deliver_fee', (string) dd_clampi($b['deliveryFee'], 0, 1000, 49));
  if (array_key_exists('expressFee', $b))  dd_set_setting('express_fee', (string) dd_clampi($b['expressFee'], 0, 1000, 99));
  if (array_key_exists('codEnabled', $b))  dd_set_setting('cod_enabled', dd_boolish($b['codEnabled']));
  if (array_key_exists('codMin', $b))      dd_set_setting('cod_min',     (string) dd_clampi($b['codMin'], 0, 100000, 0));
  if (array_key_exists('maxQty', $b))      dd_set_setting('max_qty',     (string) dd_clampi($b['maxQty'], 1, 99, 99));
  if (array_key_exists('storeLive', $b))   dd_set_setting('store_live',  dd_boolish($b['storeLive']));
  if (array_key_exists('lowStockThreshold', $b)) dd_set_setting('low_stock_threshold', (string) dd_clampi($b['lowStockThreshold'], 1, 100, 5));
  if (array_key_exists('featuredIds', $b)) {
    $ids = is_array($b['featuredIds']) ? array_slice(array_values(array_filter($b['featuredIds'], 'is_string')), 0, 8) : [];
    $valid = [];
    $stmt = dd_db()->prepare('SELECT 1 FROM products WHERE id = ?');
    foreach ($ids as $id) { $stmt->execute([$id]); if ($stmt->fetch()) $valid[] = $id; }
    dd_set_setting('featured_ids', json_encode($valid));
  }
  return dd_json_out(['ok' => true, 'config' => dd_store_config()]);
}

/* ════════════════ admin coupons ════════════════ */
function route_admin_coupons_get(array $req): array {
  dd_require_admin($req);
  $rows = dd_db()->query('SELECT * FROM coupons ORDER BY active DESC, created_at DESC, code')->fetchAll();
  return dd_json_out(['coupons' => $rows]);
}
function route_admin_coupons_post(array $req): array {
  dd_require_admin($req);
  $b = dd_body_json($req);
  $code = strtoupper(trim((string) ($b['code'] ?? '')));
  if (!preg_match('/^[A-Z0-9_-]{3,20}$/', $code)) throw new DdHttpError(400, 'Code must be 3–20 characters: A–Z, 0–9, hyphen, underscore');
  $typeRaw = (string) ($b['type'] ?? 'percent');
  $type = in_array($typeRaw, ['percent', 'fixed_cart', 'fixed_product'], true) ? $typeRaw : null;
  if ($type === null) throw new DdHttpError(400, 'Unknown coupon type');
  $value = (int) round((float) ($b['value'] ?? 0));
  if ($type === 'percent' && ($value < 1 || $value > 90)) throw new DdHttpError(400, 'Percentage must be 1–90');
  if ($type !== 'percent' && $value < 1) throw new DdHttpError(400, 'Discount must be at least ₹1');
  $minOrder = dd_clampi($b['min_order'] ?? 0, 0, PHP_INT_MAX, 0);
  $maxUses = dd_clampi($b['max_uses'] ?? 0, 0, PHP_INT_MAX, 0);
  $perCustomer = dd_clampi($b['usage_per_customer'] ?? 0, 0, PHP_INT_MAX, 0);
  [$expiresAt, $productIds, $categoryIds] = dd_coupon_extras($b);
  $stmt = dd_db()->prepare('SELECT 1 FROM coupons WHERE code = ?'); $stmt->execute([$code]);
  if ($stmt->fetch()) throw new DdHttpError(409, "Coupon $code already exists");
  dd_db()->prepare('INSERT INTO coupons (code,type,value,min_order,max_uses,expires_at,usage_per_customer,product_ids,category_ids) VALUES (?,?,?,?,?,?,?,?,?)')
    ->execute([$code, $type, $value, $minOrder, $maxUses, $expiresAt, $perCustomer, $productIds, $categoryIds]);
  $stmt = dd_db()->prepare('SELECT * FROM coupons WHERE code = ?'); $stmt->execute([$code]);
  return dd_json_out(['coupon' => $stmt->fetch()], 201);
}
function dd_coupon_extras(array $b): array {
  // expiry: YYYY-MM-DD (end of day) or empty = never
  $expiresAt = null;
  if (array_key_exists('expires_at', $b)) {
    $raw = trim((string) $b['expires_at']);
    if ($raw !== '') {
      if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) || !checkdate((int) substr($raw, 5, 2), (int) substr($raw, 8, 2), (int) substr($raw, 0, 4))) {
        throw new DdHttpError(400, 'Expiry must be a valid date (YYYY-MM-DD)');
      }
      $expiresAt = $raw . ' 23:59:59';
    }
  }
  // optional cart scope: comma-separated product ids / category ids
  $cleanList = function ($raw, string $label) {
    $raw = trim((string) $raw);
    if ($raw === '') return null;
    $parts = array_values(array_filter(array_map('trim', explode(',', $raw)), fn($s) => $s !== ''));
    foreach ($parts as $tok) {
      if (strlen($tok) > 64 || !preg_match('/^[A-Za-z0-9_-]+$/', $tok)) {
        throw new DdHttpError(400, "$label must be comma-separated ids (letters, numbers, - and _)");
      }
    }
    if (count($parts) > 200) throw new DdHttpError(400, "$label list is too long (max 200)");
    return count($parts) ? implode(',', $parts) : null;
  };
  $productIds = $cleanList($b['product_ids'] ?? '', 'Product ids');
  $categoryIds = $cleanList($b['category_ids'] ?? '', 'Category ids');
  if ($categoryIds !== null) {
    foreach (explode(',', $categoryIds) as $tok) {
      if (!ctype_digit($tok)) throw new DdHttpError(400, 'Category ids must be numbers');
    }
  }
  return [$expiresAt, $productIds, $categoryIds];
}
function route_admin_coupons_put(array $req, string $code): array {
  dd_require_admin($req);
  $code = strtoupper($code);
  $stmt = dd_db()->prepare('SELECT * FROM coupons WHERE code = ?'); $stmt->execute([$code]);
  if (!$stmt->fetch()) throw new DdHttpError(404, 'Coupon not found');
  $b = dd_body_json($req);
  if (array_key_exists('active', $b)) {
    dd_db()->prepare('UPDATE coupons SET active = ? WHERE code = ?')->execute([dd_boolish($b['active']) === '1' ? 1 : 0, $code]);
  }
  if (array_key_exists('max_uses', $b)) dd_db()->prepare('UPDATE coupons SET max_uses = ? WHERE code = ?')->execute([dd_clampi($b['max_uses'], 0, PHP_INT_MAX, 0), $code]);
  if (array_key_exists('usage_per_customer', $b)) dd_db()->prepare('UPDATE coupons SET usage_per_customer = ? WHERE code = ?')->execute([dd_clampi($b['usage_per_customer'], 0, PHP_INT_MAX, 0), $code]);
  if (array_key_exists('expires_at', $b) || array_key_exists('product_ids', $b) || array_key_exists('category_ids', $b)) {
    [$expiresAt, $productIds, $categoryIds] = dd_coupon_extras($b);
    if (array_key_exists('expires_at', $b)) dd_db()->prepare('UPDATE coupons SET expires_at = ? WHERE code = ?')->execute([$expiresAt, $code]);
    if (array_key_exists('product_ids', $b)) dd_db()->prepare('UPDATE coupons SET product_ids = ? WHERE code = ?')->execute([$productIds, $code]);
    if (array_key_exists('category_ids', $b)) dd_db()->prepare('UPDATE coupons SET category_ids = ? WHERE code = ?')->execute([$categoryIds, $code]);
  }
  $stmt->execute([$code]);
  return dd_json_out(['coupon' => $stmt->fetch()]);
}
function route_admin_coupons_delete(array $req, string $code): array {
  dd_require_admin($req);
  $stmt = dd_db()->prepare('DELETE FROM coupons WHERE code = ?');
  $stmt->execute([strtoupper($code)]);
  if ($stmt->rowCount() === 0) throw new DdHttpError(404, 'Coupon not found');
  return dd_json_out(['ok' => true]);
}

/* ════════════════ setup wizard ════════════════ */
function route_setup_status(array $req): array {
  $install = dd_read_install();
  if (!isset($install['database']) || !is_array($install['database'])) {
    return dd_json_out(['installed' => false, 'configured' => false, 'engine' => 'MySQL / MariaDB']);
  }
  $installed = dd_is_setup_complete();
  $u = dd_current_user($req);
  if ($installed && (!$u || ($u['role'] ?? '') !== 'admin')) return dd_json_out(['installed' => true]);
  return dd_json_out(array_merge(
    ['installed' => $installed, 'configured' => true,
     'completedAt' => dd_site_get('setup_completed_at') ?: null,
     'signedInAs' => $u ? ['name' => $u['name'], 'role' => $u['role']] : null],
    dd_db_info(),
    ['settings' => dd_site_settings(), 'store' => dd_store_config(),
     'smtp' => ['configured' => !empty(($install['smtp']['email'] ?? '')) && !empty(($install['smtp']['password'] ?? '')),
                'email' => (string) ($install['smtp']['email'] ?? '')]]
  ));
}

function route_setup_test_db(array $req): array {
  $saved = dd_read_install();
  $current = isset($saved['database']) && is_array($saved['database']) ? dd_current_user($req) : null;
  dd_require_setup_open($current);
  $b = dd_body_json($req);
  $config = dd_mysql_config(array_merge(is_array($saved['database'] ?? null) ? $saved['database'] : [], $b));
  $databaseMode = (string) ($b['databaseMode'] ?? 'existing');
  if (!in_array($databaseMode, ['create', 'existing'], true)) throw new DdHttpError(400, 'Choose whether to create or connect to a database');
  if ($databaseMode === 'create') {
    try {
      $test = dd_mysql_connect_server($config);
      $stmt = $test->prepare('SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = ?');
      $stmt->execute([$config['database']]);
      if ((int) $stmt->fetchColumn() > 0) {
        throw new DdHttpError(409, 'That database already exists. Choose “Connect to an existing database” instead.');
      }
      return dd_json_out(['ok' => true, 'host' => $config['host'], 'database' => $config['database'], 'databaseExists' => false, 'counts' => null]);
    } catch (DdHttpError $e) {
      throw $e;
    } catch (Throwable $e) {
      error_log('[setup] MySQL server connection test failed: ' . $e->getMessage());
      throw new DdHttpError(400, 'MySQL server connection failed. Check the host, port, username, password, and MySQL service.');
    }
  }
  try {
    $test = dd_mysql_connect($config);
    $counts = null;
    $stmt = $test->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name IN ('users','products','orders')");
    $stmt->execute([$config['database']]);
    if ((int) $stmt->fetchColumn() === 3) {
      $counts = [
        'users'    => (int) $test->query('SELECT COUNT(*) FROM users')->fetchColumn(),
        'products' => (int) $test->query('SELECT COUNT(*) FROM products')->fetchColumn(),
        'orders'   => (int) $test->query('SELECT COUNT(*) FROM orders')->fetchColumn(),
      ];
    }
    return dd_json_out(['ok' => true, 'host' => $config['host'], 'database' => $config['database'], 'counts' => $counts]);
  } catch (Throwable $e) {
    error_log('[setup] MySQL connection test failed: ' . $e->getMessage());
    throw new DdHttpError(400, 'MySQL connection failed. Check the host, database name, port, username, password, and MySQL service.');
  }
}

function route_setup_database(array $req): array {
  $previous = dd_read_install();
  $current = isset($previous['database']) && is_array($previous['database']) ? dd_current_user($req) : null;
  dd_require_setup_open($current);
  $b = dd_body_json($req);
  $mode = (($b['mode'] ?? 'demo') === 'empty') ? 'empty' : 'demo';
  $config = dd_mysql_config(array_merge(is_array($previous['database'] ?? null) ? $previous['database'] : [], $b));
  $databaseMode = (string) ($b['databaseMode'] ?? 'existing');
  if (!in_array($databaseMode, ['create', 'existing'], true)) throw new DdHttpError(400, 'Choose whether to create or connect to a database');
  $created = false;
  if ($databaseMode === 'create') {
    try {
      $server = dd_mysql_connect_server($config);
      $stmt = $server->prepare('SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = ?');
      $stmt->execute([$config['database']]);
      if ((int) $stmt->fetchColumn() > 0) {
        throw new DdHttpError(409, 'That database already exists. Choose “Connect to an existing database” instead.');
      }
      $server->exec('CREATE DATABASE `' . $config['database'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      $created = true;
    } catch (DdHttpError $e) {
      throw $e;
    } catch (Throwable $e) {
      error_log('[setup] Database creation failed: ' . $e->getMessage());
      throw new DdHttpError(400, 'Could not create the database. Check that the MySQL user has CREATE DATABASE permission and try again.');
    }
  }
  DdDb::close();
  DdDb::open($config);
  $previous['database'] = $config;
  dd_write_install($previous);
  $counts = dd_db_info()['counts'];
  $hasData = ($counts['users'] + $counts['products']) > 0;
  if (!$hasData) dd_seed_database($mode === 'demo');
  return dd_json_out(['ok' => true, 'created' => $created, 'seeded' => $hasData ? 'kept-existing' : $mode, 'counts' => dd_db_info()['counts']]);
}

function route_setup_site(array $req): array {
  dd_require_setup_open(dd_current_user($req));
  $b = dd_body_json($req);
  $clean = fn($v, int $max) => mb_substr(trim((string) $v), 0, $max);
  if (array_key_exists('brand', $b))    dd_set_setting('site_brand', $clean($b['brand'], 80));
  if (array_key_exists('tagline', $b))  dd_set_setting('site_tagline', $clean($b['tagline'], 140));
  if (array_key_exists('address', $b))  dd_set_setting('site_address', $clean($b['address'], 160));
  if (array_key_exists('gstin', $b))    dd_set_setting('site_gstin', $clean($b['gstin'], 32));
  if (array_key_exists('email', $b)) {
    $e = $clean($b['email'], 120);
    if ($e !== '' && !dd_email_ok($e)) throw new DdHttpError(400, 'That email looks invalid');
    dd_set_setting('site_email', $e);
  }
  if (array_key_exists('phone', $b))    dd_set_setting('site_phone', $clean($b['phone'], 32));
  if (array_key_exists('whatsapp', $b)) dd_set_setting('site_whatsapp', preg_replace('/\D/', '', $clean($b['whatsapp'], 20)));
  return dd_json_out(['ok' => true, 'settings' => dd_site_settings()]);
}

function route_setup_admin(array $req): array {
  dd_require_setup_open(dd_current_user($req));
  $b = dd_body_json($req);
  $name = mb_substr(trim((string) ($b['name'] ?? '')), 0, 80);
  if ($name === '') $name = 'Site Admin';
  $username = strtolower(trim((string) ($b['username'] ?? '')));
  $email = mb_substr(strtolower(trim((string) ($b['email'] ?? ''))), 0, 120);
  $password = (string) ($b['password'] ?? '');
  $phone = mb_substr(trim((string) ($b['phone'] ?? '')), 0, 32);
  if (!dd_email_ok($email)) throw new DdHttpError(400, 'Enter a valid admin email');
  if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) throw new DdHttpError(400, 'Username must be 3–32 characters: letters, numbers, dot, underscore or hyphen');
  if (strlen($password) < 8) throw new DdHttpError(400, 'Password must be at least 8 characters');
  if (strlen($password) > 72) throw new DdHttpError(400, 'Password must be 72 bytes or fewer');
  $pair = dd_password_pair($password);
  $hash = $pair['hash'];
  $existing = dd_db()->prepare('SELECT id,email,username FROM users WHERE email = ? OR username = ?'); $existing->execute([$email, $username]);
  $matches = $existing->fetchAll();
  if (count($matches) > 1) throw new DdHttpError(409, 'That email and username belong to different accounts');
  $row = $matches[0] ?? null;
  $updated = (bool) $row;
  $cookies = dd_parse_cookies($req['headers']['cookie'] ?? null);
  $sid = (string) ($cookies['dd_sid'] ?? '');
  if ($row) {
    dd_db()->prepare("UPDATE users SET name=?, username=?, email=?, phone=?, password_hash=?, password_salt=?, role='admin' WHERE id=?")
      ->execute([$name, $username, $email, $phone, $hash, $pair['salt'], $row['id']]);
    dd_db()->prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?')->execute([$row['id'], $sid]);
  } else {
    dd_db()->prepare("INSERT INTO users (name,username,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?,?, 'admin')")
      ->execute([$name, $username, $email, $phone, $hash, $pair['salt']]);
    $row = ['id' => dd_db()->lastInsertId()];
  }
  dd_create_session($req, (int) $row['id']);
  return dd_json_out(['ok' => true, 'email' => $email, 'updated' => $updated]);
}

function route_setup_store(array $req): array {
  dd_require_setup_open(dd_current_user($req));
  $b = dd_body_json($req);
  if (array_key_exists('announce', $b)) {
    $s = mb_substr(trim((string) $b['announce']), 0, 140);
    dd_set_setting('announce', $s !== '' ? $s : DD_DEFAULT_SETTINGS['announce']);
  }
  if (array_key_exists('freeAt', $b))      dd_set_setting('free_at',     (string) dd_clampi($b['freeAt'], 0, 100000, 999));
  if (array_key_exists('deliveryFee', $b)) dd_set_setting('deliver_fee', (string) dd_clampi($b['deliveryFee'], 0, 1000, 49));
  if (array_key_exists('codEnabled', $b))  dd_set_setting('cod_enabled', dd_boolish($b['codEnabled']));
  if (array_key_exists('codMin', $b))      dd_set_setting('cod_min',     (string) dd_clampi($b['codMin'], 0, 100000, 0));
  if (array_key_exists('maxQty', $b))      dd_set_setting('max_qty',     (string) dd_clampi($b['maxQty'], 1, 99, 99));
  if (array_key_exists('storeLive', $b))   dd_set_setting('store_live',  dd_boolish($b['storeLive']));
  return dd_json_out(['ok' => true, 'config' => dd_store_config()]);
}

function route_setup_complete(array $req): array {
  dd_require_setup_open(dd_current_user($req));
  $smtp = dd_smtp_settings();
  if (empty($smtp['email']) || empty($smtp['password'])) throw new DdHttpError(400, 'Configure Gmail SMTP before completing setup.');
  $admins = (int) dd_db()->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
  if ($admins < 1) throw new DdHttpError(400, 'Create your admin account before completing setup.');
  dd_set_setting('setup_completed', '1');
  dd_set_setting('setup_completed_at', gmdate('c'));
  return dd_json_out(['ok' => true]);
}

/* ════════════════ addresses (address book) ════════════════ */
function dd_address_out(array $a): array {
  return ['id' => (int) $a['id'], 'label' => $a['label'], 'name' => $a['name'], 'phone' => $a['phone'],
          'line' => $a['line'], 'city' => $a['city'], 'state' => $a['state'], 'pincode' => $a['pincode'],
          'is_default' => (bool) $a['is_default']];
}
function dd_normalize_address(array $b, array $existing = []): array {
  $pick = fn(string $k, $fb) => array_key_exists($k, $b) ? $b[$k] : (array_key_exists($k, $existing) ? $existing[$k] : $fb);
  $a = [
    'label'   => mb_substr(trim((string) $pick('label', 'Home')), 0, 24) ?: 'Home',
    'name'    => trim((string) $pick('name', '')),
    'phone'   => trim((string) $pick('phone', '')),
    'line'    => trim((string) $pick('line', '')),
    'city'    => trim((string) $pick('city', '')),
    'state'   => trim((string) $pick('state', '')),
    'pincode' => trim((string) $pick('pincode', '')),
    'is_default' => (bool) ($pick('is_default', false)),
  ];
  if ($a['name'] === '') throw new DdHttpError(400, 'Add a recipient name');
  if (mb_strlen($a['name']) > 120 || mb_strlen($a['phone']) > 32 || mb_strlen($a['line']) > 255 ||
      mb_strlen($a['city']) > 100 || mb_strlen($a['state']) > 100 || mb_strlen($a['pincode']) > 20) {
    throw new DdHttpError(400, 'One or more address fields exceed their maximum length');
  }
  if (strlen(preg_replace('/\D/', '', $a['phone'])) < 10) throw new DdHttpError(400, 'Enter a valid 10-digit phone');
  if (mb_strlen($a['line']) < 6) throw new DdHttpError(400, 'Enter the full address line');
  if (!preg_match('/^\d{6}$/', $a['pincode'])) throw new DdHttpError(400, 'Enter a valid 6-digit PIN code');
  return $a;
}
function dd_set_default_address(int $uid, int $id): void {
  $db = dd_db();
  $db->beginTransaction();
  try {
    $db->prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?')->execute([$uid]);
    $db->prepare('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
    $db->commit();
  } catch (Throwable $e) { $db->rollBack(); throw $e; }
}

function route_addresses_get(array $req): array {
  $u = dd_require_auth($req);
  $stmt = dd_db()->prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC');
  $stmt->execute([$u['id']]);
  return dd_json_out(['addresses' => array_map('dd_address_out', $stmt->fetchAll())]);
}
function route_addresses_post(array $req): array {
  $u = dd_require_auth($req);
  $db = dd_db();
  $stmt = $db->prepare('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?'); $stmt->execute([$u['id']]);
  $count = (int) $stmt->fetch()['n'];
  if ($count >= 10) throw new DdHttpError(400, 'Address book is full (10 max) — delete one first');
  $a = dd_normalize_address(dd_body_json($req));
  if ($count === 0) $a['is_default'] = true;
  $ins = $db->prepare('INSERT INTO addresses (user_id,label,name,phone,line,city,state,pincode,is_default) VALUES (?,?,?,?,?,?,?,?,?)');
  $ins->execute([$u['id'], $a['label'], $a['name'], $a['phone'], $a['line'], $a['city'], $a['state'], $a['pincode'], $a['is_default'] ? 1 : 0]);
  $id = (int) $db->lastInsertId();
  if ($a['is_default']) dd_set_default_address((int) $u['id'], $id);
  $row = $db->prepare('SELECT * FROM addresses WHERE id = ?'); $row->execute([$id]);
  return dd_json_out(['address' => dd_address_out($row->fetch())], 201);
}
function route_addresses_put(array $req, string $id): array {
  $u = dd_require_auth($req);
  $db = dd_db();
  $row = $db->prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?'); $row->execute([(int) $id, $u['id']]);
  $existing = $row->fetch();
  if (!$existing) throw new DdHttpError(404, 'Address not found');
  $a = dd_normalize_address(dd_body_json($req), $existing);
  $db->prepare('UPDATE addresses SET label=?,name=?,phone=?,line=?,city=?,state=?,pincode=? WHERE id=?')
     ->execute([$a['label'], $a['name'], $a['phone'], $a['line'], $a['city'], $a['state'], $a['pincode'], $existing['id']]);
  if ($a['is_default']) dd_set_default_address((int) $u['id'], (int) $existing['id']);
  $row = $db->prepare('SELECT * FROM addresses WHERE id = ?'); $row->execute([$existing['id']]);
  return dd_json_out(['address' => dd_address_out($row->fetch())]);
}
function route_addresses_delete(array $req, string $id): array {
  $u = dd_require_auth($req);
  $db = dd_db();
  $row = $db->prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?'); $row->execute([(int) $id, $u['id']]);
  $existing = $row->fetch();
  if (!$existing) throw new DdHttpError(404, 'Address not found');
  $db->prepare('DELETE FROM addresses WHERE id = ?')->execute([$existing['id']]);
  if (!empty($existing['is_default'])) {
    $next = $db->prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1'); $next->execute([$u['id']]);
    $n = $next->fetch();
    if ($n) $db->prepare('UPDATE addresses SET is_default = 1 WHERE id = ?')->execute([$n['id']]);
  }
  return dd_json_out(['ok' => true]);
}

/* ════════════════ account · password change ════════════════ */
function route_me_password(array $req): array {
  $u = dd_require_auth($req);
  $b = dd_body_json($req);
  $current = (string) ($b['currentPassword'] ?? '');
  $new = (string) ($b['newPassword'] ?? '');
  if ($current === '') throw new DdHttpError(400, 'Enter your current password');
  if (strlen($new) < 8) throw new DdHttpError(400, 'New password must be at least 8 characters');
  if (strlen($new) > 72) throw new DdHttpError(400, 'Password must be 72 bytes or fewer');
  $row = dd_db()->prepare('SELECT * FROM users WHERE id = ?'); $row->execute([$u['id']]);
  $user = $row->fetch();
  if (!$user || !dd_verify_password($current, $user)) throw new DdHttpError(403, 'Current password is incorrect');
  $pair = dd_password_pair($new);
  dd_db()->prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')->execute([$pair['hash'], $pair['salt'], $u['id']]);
  return dd_json_out(['ok' => true]);
}

/* ════════════════ customer · order cancel (pending/confirmed; restocks) ════════════════ */
function route_my_order_cancel(array $req, string $id): array {
  $u = dd_require_auth($req);
  $db = dd_db();
  $db->beginTransaction();
  try {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE');
    $stmt->execute([(int) $id, $u['id']]);
    $o = $stmt->fetch();
    if (!$o) throw new DdHttpError(404, 'Order not found');
    if (!in_array($o['status'], ['pending', 'confirmed'], true)) {
      throw new DdHttpError(409, "This order can no longer be cancelled — it is {$o['status']}. Chat on WhatsApp and we'll do our best.");
    }
    $items = dd_parse_items($o['items_json'] ?? null);
    $db->prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?")->execute([$o['id']]);
    $inc = $db->prepare('UPDATE products SET stock = LEAST(2147483647, stock + ?) WHERE id = ?');
    foreach ($items as $it) {
      if (!is_array($it) || empty($it['id'])) continue;
      $inc->execute([max(1, (int) ($it['qty'] ?? 1)), $it['id']]);
    }
    if (($o['coupon_code'] ?? '') !== '') {
      $db->prepare('UPDATE coupons SET used = GREATEST(0, used - 1) WHERE code = ?')->execute([$o['coupon_code']]);
    }
    dd_add_event((int) $o['id'], 'status', (string) $o['status'], 'cancelled', 'Cancelled by customer', 'customer', (int) $u['id']);
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  return dd_json_out(['ok' => true, 'status' => 'cancelled']);
}

/* ════════════════ public offers (checkout coupon chips) ════════════════ */
function route_coupons_offers(array $req): array {
  $stmt = dd_db()->prepare('SELECT code,type,value,min_order FROM coupons WHERE active = 1 AND (max_uses = 0 OR used < max_uses) AND (expires_at IS NULL OR expires_at >= NOW()) ORDER BY value DESC, code');
  $stmt->execute();
  $rows = $stmt->fetchAll();
  return dd_json_out(['offers' => array_map(fn($c) => ['code' => $c['code'], 'type' => $c['type'], 'value' => (int) $c['value'], 'min_order' => (int) $c['min_order']], $rows)]);
}

/* ════════════════ admin · CSV exports ════════════════ */
function dd_csv_cell($v): string {
  $s = (string) ($v ?? '');
  if (preg_match('/^\s*[=+\-@]/', $s)) $s = "'" . $s;
  return preg_match('/[",\n\r]/', $s) ? '"' . str_replace('"', '""', $s) . '"' : $s;
}
function dd_send_csv(string $filename, array $header, array $rows): array {
  $lines = [implode(',', array_map('dd_csv_cell', $header))];
  foreach ($rows as $r) $lines[] = implode(',', array_map('dd_csv_cell', $r));
  $body = "\xEF\xBB\xBF" . implode("\r\n", $lines);
  return ['status' => 200,
          'headers' => ['Content-Disposition' => 'attachment; filename="' . $filename . '"', 'Cache-Control' => 'private, no-store'],
          'body' => $body,
          'content_type' => 'text/csv; charset=utf-8'];
}
function route_admin_orders_csv(array $req): array {
  dd_require_admin($req);
  $q2 = $req['query'] ?? [];
  $status = trim((string) ($q2['status'] ?? ''));
  $from = trim((string) ($q2['from'] ?? ''));
  $to = trim((string) ($q2['to'] ?? ''));
  $q = strtolower(trim((string) ($q2['q'] ?? '')));
  $stmt = dd_db()->prepare("SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id
                            ORDER BY o.created_at DESC, o.id DESC LIMIT 5000");
  $stmt->execute();
  $rows = $stmt->fetchAll();
  $rows = array_filter($rows, function ($o) use ($status, $from, $to, $q) {
    if ($status !== '' && $status !== 'all' && $o['status'] !== $status) return false;
    $d = substr((string) $o['created_at'], 0, 10);
    if ($from !== '' && $d < $from) return false;
    if ($to !== '' && $d > $to) return false;
    if ($q !== '') {
      $hay = strtolower(implode(' ', [$o['id'], $o['customer_name'], $o['phone'], $o['user_email'] ?? '', $o['coupon_code'] ?? '', $o['address'] ?? '', $o['note'] ?? '', $o['items_json'] ?? '']));
      if (strpos($hay, $q) === false) return false;
    }
    return true;
  });
  $header = ['Order','Placed','Customer','Phone','Email','Items','Subtotal','Discount','Delivery','Total','Payment','Delivery method','Coupon','Status','Address','Note','State','PIN','Refund reason'];
  $out = [];
  foreach ($rows as $o) {
    $items = dd_parse_items($o['items_json'] ?? null);
    $sub = 0;
    $itemStrs = [];
    foreach ($items as $i) { if (!is_array($i)) continue; $sub += (int) ($i['price'] ?? 0) * (int) ($i['qty'] ?? 1); $itemStrs[] = ((int) ($i['qty'] ?? 1)) . 'x ' . ($i['name'] ?? ''); }
    $delivery = max(0, (int) $o['total'] - $sub + (int) ($o['discount'] ?? 0));
    $out[] = [$o['id'], $o['created_at'], $o['customer_name'], $o['phone'], $o['user_email'] ?? '', implode('; ', $itemStrs),
              $sub, (int) ($o['discount'] ?? 0), $delivery, (int) $o['total'], $o['payment'], $o['delivery_method'] ?? 'standard',
              $o['coupon_code'] ?? '', $o['status'], $o['address'], $o['note'], $o['state'] ?? '', $o['pincode'] ?? '', $o['refund_reason'] ?? ''];
  }
  return dd_send_csv('orders.csv', $header, $out);
}
function route_admin_products_csv(array $req): array {
  dd_require_admin($req);
  $stmt = dd_db()->prepare('SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.sort_order,c.name,p.created_at,p.id');
  $stmt->execute();
  $rows = $stmt->fetchAll();
  $out = [];
  foreach ($rows as $pr) {
    $out[] = [$pr['id'], $pr['name'], $pr['meta'], $pr['category_id'], $pr['category_name'] ?? $pr['tag'],
      (int) $pr['price'], (int) $pr['was'], (float) $pr['rating'], (int) $pr['stock'], $pr['img'],
      ((int) $pr['active']) ? 'yes' : 'no', (int) ($pr['reviews'] ?? 0), $pr['sku'] ?? ''];
  }
  return dd_send_csv('products.csv', ['ID','Name','Details','Category ID','Category','Price','MRP','Rating','Stock','Image','Active','Reviews','SKU'], $out);
}

/* ════════════════ router ════════════════ */

/**
 * @param array $req ['method','subpath','query','raw','headers','ip','https','set_cookies']
 * @return array ['status' => int, 'headers' => array, 'body' => string, 'content_type' => string]
 */
function dd_handle(array $req): array {
  $GLOBALS['dd_set_cookies'] = [];
  $method = strtoupper($req['method'] ?? 'GET');
  $path = '/' . trim((string) ($req['subpath'] ?? '/'), '/');
  if ($path === '/') $path = '/';

  // size guard
  $rawLen = strlen((string) ($req['raw'] ?? ''));
  if ($rawLen > DD_MAX_JSON_BYTES) {
    return dd_json_out(['error' => 'Payload too large'], 413);
  }

  $amount = null;
  $route = static function (string $m, string $pattern, callable $fn) use (&$amount, $method, $path, $req) {
    if ($amount !== null) return;
    if ($m !== $method) return;
    if (preg_match($pattern, $path, $mm)) $amount = $fn($req, ...array_slice($mm, 1));
  };

  try {
    dd_boot_seed();
    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) dd_require_same_origin($req);
    // [method, pattern, handler]
    $route('POST', '#^/auth/register$#', fn ($req) => route_auth_register($req));
    $route('POST', '#^/auth/login$#', fn ($req) => route_auth_login($req));
    $route('POST', '#^/auth/otp/request$#', fn ($req) => route_auth_otp_request($req));
    $route('POST', '#^/auth/otp/verify$#', fn ($req) => route_auth_otp_verify($req));
    $route('POST', '#^/auth/logout$#', fn ($req) => route_auth_logout($req));
    $route('GET',  '#^/me$#', fn ($req) => route_me($req));
    $route('PUT',  '#^/me$#', fn ($req) => route_me_put($req));
    $route('GET',  '#^/store/config$#', fn ($req) => route_store_config($req));
    $route('POST', '#^/coupons/validate$#', fn ($req) => route_coupon_validate($req));
    $route('GET',  '#^/categories$#', fn ($req) => route_categories($req));
    $route('GET',  '#^/products$#', fn ($req) => route_products($req));
    $route('POST', '#^/orders$#', fn ($req) => route_orders_post($req));
    $route('GET',  '#^/my/orders$#', fn ($req) => route_my_orders($req));
    $route('POST', '#^/my/orders/(\d+)/cancel$#', fn ($req, $id) => route_my_order_cancel($req, $id));
    $route('GET',  '#^/addresses$#', fn ($req) => route_addresses_get($req));
    $route('POST', '#^/addresses$#', fn ($req) => route_addresses_post($req));
    $route('PUT',  '#^/addresses/(\d+)$#', fn ($req, $id) => route_addresses_put($req, $id));
    $route('DELETE', '#^/addresses/(\d+)$#', fn ($req, $id) => route_addresses_delete($req, $id));
    $route('POST', '#^/me/password$#', fn ($req) => route_me_password($req));
    $route('GET',  '#^/coupons/offers$#', fn ($req) => route_coupons_offers($req));
    $route('POST', '#^/inquiries$#', fn ($req) => route_inquiries_post($req));
    $route('GET',  '#^/admin/stats$#', fn ($req) => route_admin_stats($req));
    $route('GET',  '#^/admin/orders$#', fn ($req) => route_admin_orders($req));
    $route('PUT',  '#^/admin/orders/(\d+)/status$#', fn ($req, $id) => route_admin_order_status($req, $id));
    $route('GET',  '#^/admin/orders/(\d+)/events$#', fn ($req, $id) => route_admin_order_events_get($req, $id));
    $route('POST', '#^/admin/orders/(\d+)/events$#', fn ($req, $id) => route_admin_order_events_post($req, $id));
    $route('POST', '#^/admin/orders/(\d+)/refund$#', fn ($req, $id) => route_admin_order_refund($req, $id));
    $route('GET',  '#^/my/orders/(\d+)/events$#', fn ($req, $id) => route_my_order_events($req, $id));
    $route('GET',  '#^/admin/erp-config$#', fn ($req) => route_admin_erp_config_get($req));
    $route('PUT',  '#^/admin/erp-config$#', fn ($req) => route_admin_erp_config_put($req));
    $route('GET',  '#^/admin/gst-report.csv$#', fn ($req) => route_admin_gst_report_csv($req));
    $route('GET',  '#^/admin/categories$#', fn ($req) => route_admin_categories_get($req));
    $route('POST', '#^/admin/categories$#', fn ($req) => route_admin_categories_post($req));
    $route('PUT',  '#^/admin/categories/(\d+)$#', fn ($req, $id) => route_admin_categories_put($req, $id));
    $route('DELETE', '#^/admin/categories/(\d+)$#', fn ($req, $id) => route_admin_categories_delete($req, $id));
    $route('GET',  '#^/admin/products$#', fn ($req) => route_admin_products_get($req));
    $route('POST', '#^/admin/products$#', fn ($req) => route_admin_products_post($req));
    $route('PUT',  '#^/admin/products/([A-Za-z0-9_-]{1,64})$#', fn ($req, $id) => route_admin_products_put($req, $id));
    $route('DELETE', '#^/admin/products/([A-Za-z0-9_-]{1,64})$#', fn ($req, $id) => route_admin_products_delete($req, $id));
    $route('GET',  '#^/admin/customers$#', fn ($req) => route_admin_customers($req));
    $route('GET',  '#^/admin/customers/(\d+)$#', fn ($req, $id) => route_admin_customer_detail($req, $id));
    $route('GET',  '#^/admin/customers\.csv$#', fn ($req) => route_admin_customers_csv($req));
    $route('GET',  '#^/admin/inquiries$#', fn ($req) => route_admin_inquiries($req));
    $route('GET',  '#^/products/([A-Za-z0-9_-]{1,32})/reviews$#', fn ($req, $id) => route_reviews_get($req, $id));
    $route('POST', '#^/products/([A-Za-z0-9_-]{1,32})/reviews$#', fn ($req, $id) => route_reviews_post($req, $id));
    $route('GET',  '#^/invoices/(\d+)$#', fn ($req, $id) => route_invoice($req, $id));
    $route('GET',  '#^/admin/report$#', fn ($req) => route_admin_report($req));
    $route('GET',  '#^/admin/report\.csv$#', fn ($req) => route_admin_report_csv($req));
    $route('GET',  '#^/admin/orders.csv$#', fn ($req) => route_admin_orders_csv($req));
    $route('GET',  '#^/admin/products.csv$#', fn ($req) => route_admin_products_csv($req));
    $route('GET',  '#^/admin/store-config$#', fn ($req) => route_admin_store_config_get($req));
    $route('PUT',  '#^/admin/store-config$#', fn ($req) => route_admin_store_config_put($req));
    $route('GET',  '#^/admin/coupons$#', fn ($req) => route_admin_coupons_get($req));
    $route('POST', '#^/admin/coupons$#', fn ($req) => route_admin_coupons_post($req));
    $route('PUT',  '#^/admin/coupons/([A-Za-z0-9_-]{3,20})$#', fn ($req, $code) => route_admin_coupons_put($req, $code));
    $route('DELETE', '#^/admin/coupons/([A-Za-z0-9_-]{3,20})$#', fn ($req, $code) => route_admin_coupons_delete($req, $code));
    $route('GET',  '#^/setup/status$#', fn ($req) => route_setup_status($req));
    $route('POST', '#^/setup/test-db$#', fn ($req) => route_setup_test_db($req));
    $route('POST', '#^/setup/database$#', fn ($req) => route_setup_database($req));
    $route('POST', '#^/setup/smtp$#', fn ($req) => route_setup_smtp($req));
    $route('POST', '#^/setup/site$#', fn ($req) => route_setup_site($req));
    $route('POST', '#^/setup/admin$#', fn ($req) => route_setup_admin($req));
    $route('POST', '#^/setup/store$#', fn ($req) => route_setup_store($req));
    $route('POST', '#^/setup/complete$#', fn ($req) => route_setup_complete($req));
    if ($amount === null) $amount = dd_json_out(['error' => 'Not found'], 404);
  } catch (DdHttpError $e) {
    $amount = dd_json_out(['error' => $e->getMessage()], $e->status);
  } catch (Throwable $e) {
    error_log('[api] ' . $e);
    $amount = dd_json_out(['error' => 'Something went wrong'], 500);
  }

  if (!empty($GLOBALS['dd_set_cookies'])) {
    $amount['headers']['Set-Cookie'] = $GLOBALS['dd_set_cookies'];
  }
  return $amount;
}

/* ════════════════ web entry point (skipped under the test harness) ════════════════ */
function dd_web_main(): void {
  $contentType = (string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
  $raw = file_get_contents('php://input');
  if ($raw === false) $raw = '';

  $headers = [];
  foreach ($_SERVER as $k => $v) {
    if (is_string($v) && strncmp($k, 'HTTP_', 5) === 0) {
      $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
    }
  }
  if ($contentType !== '') $headers['content-type'] = $contentType;

  $sub = $_SERVER['PATH_INFO'] ?? null;
  if ($sub === null) {
    $sub = '/' . ltrim((string) ($_GET['r'] ?? ''), '/');
  }

  $https = dd_request_is_https();

  $req = [
    'method' => strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
    'subpath' => $sub,
    'query' => $_GET,
    'raw' => $raw,
    'headers' => $headers,
    'ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
    'https' => $https,
    'set_cookies' => [],
  ];

  $resp = dd_handle($req);
  if (!headers_sent()) {
    http_response_code($resp['status']);
    dd_emit_security_headers($https);
    foreach (($resp['headers'] ?? []) as $name => $value) {
      $values = is_array($value) ? $value : [$value];
      foreach ($values as $v) {
        if (strcasecmp((string) $name, 'Set-Cookie') === 0) header("Set-Cookie: $v", false);
        else header("$name: $v");
      }
    }
    header('Content-Type: ' . ($resp['content_type'] ?? 'application/json; charset=utf-8'));
  }
  echo $resp['body'];
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__ && !defined('DD_CLI_TEST')) {
  dd_web_main();
}
