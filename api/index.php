<?php
/**
 * API front controller — Apache routes /api/* here (see .htaccess).
 * `dd_handle(array $req): array` is the pure request → response seam used by tests.
 */
declare(strict_types=1);
require_once __DIR__ . '/core.php';

function dd_env_int(string $k, int $fallback): int { $v = getenv($k); return ($v !== false && is_numeric($v)) ? (int) $v : $fallback; }
function dd_ip(array $req): string { return (string) ($req['ip'] ?? 'unknown'); }
function dd_throttle_key(array $req, string $email): string { return dd_ip($req) . '|' . strtolower(trim($email)); }

function dd_body_json(array $req): array {
  $raw = $req['raw'] ?? '';
  if ($raw === '' || $raw === null) return [];
  $j = json_decode($raw, true);
  return is_array($j) ? $j : [];
}

/* ════════════════ auth ════════════════ */
function route_auth_register(array $req): array {
  $b = dd_body_json($req);
  $name = trim((string) ($b['name'] ?? ''));
  $email = trim((string) ($b['email'] ?? ''));
  $password = (string) ($b['password'] ?? '');
  $phone = trim((string) ($b['phone'] ?? ''));
  if ($name === '') throw new DdHttpError(400, 'Please tell me your name');
  if (!dd_email_ok($email)) throw new DdHttpError(400, "That email doesn't look right");
  if (strlen($password) < 6) throw new DdHttpError(400, 'Password must be at least 6 characters');
  $norm = strtolower($email);
  $stmt = dd_db()->prepare('SELECT 1 FROM users WHERE email = ?');
  $stmt->execute([$norm]);
  if ($stmt->fetch()) throw new DdHttpError(409, 'An account with this email already exists — try signing in');
  $hash = dd_hash_password($password);
  $ins = dd_db()->prepare('INSERT INTO users (name,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?,\'user\')');
  $ins->execute([$name, $norm, $phone, $hash, 'bcrypt']);
  $id = (int) dd_db()->lastInsertId();
  dd_create_session($req, $id);
  $u = dd_db()->prepare('SELECT * FROM users WHERE id = ?'); $u->execute([$id]);
  return dd_json_out(['user' => dd_user_public($u->fetch())], 201);
}

function route_auth_login(array $req): array {
  $b = dd_body_json($req);
  $email = trim((string) ($b['email'] ?? ''));
  $password = (string) ($b['password'] ?? '');
  if ($email === '' || $password === '') throw new DdHttpError(400, 'Email and password are required');
  $norm = strtolower($email);
  $key = dd_throttle_key($req, $norm);
  if (dd_throttled($key)) throw new DdHttpError(429, 'Too many attempts — try again in 5 minutes');
  $u = dd_db()->prepare('SELECT * FROM users WHERE email = ?');
  $u->execute([$norm]);
  $user = $u->fetch();
  if (!$user || !dd_verify_password($password, $user)) {
    dd_bump_attempt($key);
    throw new DdHttpError(401, 'Invalid email or password');
  }
  dd_clear_attempt($key);
  dd_create_session($req, (int) $user['id']);
  return dd_json_out(['user' => dd_user_public($user)]);
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
  return $c !== null && (!$c['max_uses'] || (int) $c['used'] < (int) $c['max_uses']);
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
  $rows = dd_db()->query('SELECT * FROM products WHERE active = 1 ORDER BY created_at, id')->fetchAll();
  return dd_json_out(['products' => array_map('dd_product_out', $rows)]);
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

  $pay = (($b['payment'] ?? '') === 'upi') ? 'upi' : 'cod';
  if ($pay === 'cod' && !$cfg['codEnabled']) throw new DdHttpError(400, 'Cash on Delivery is temporarily unavailable — please choose UPI on delivery');

  $picked = [];
  $subtotal = 0;
  $maxQty = max(1, (int) $cfg['maxQty']);
  $get = dd_db()->prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  foreach ($items as $line) {
    if (!is_array($line)) throw new DdHttpError(400, 'One of the items is no longer available');
    $qty = max(1, min($maxQty, (int) ($line['qty'] ?? 1) ?: 1));
    $get->execute([(string) ($line['id'] ?? '')]);
    $p = $get->fetch();
    if (!$p) throw new DdHttpError(400, 'One of the items is no longer available');
    if ((int) $p['stock'] < $qty) throw new DdHttpError(400, "Only {$p['stock']} left of {$p['name']}");
    $picked[] = ['id' => $p['id'], 'name' => $p['name'], 'price' => (int) $p['price'], 'qty' => $qty];
    $subtotal += (int) $p['price'] * $qty;
  }

  $couponCode = '';
  $discount = 0;
  $couponRaw = trim((string) ($b['coupon'] ?? ''));
  if ($couponRaw !== '') {
    $c = dd_coupon_row($couponRaw);
    if (!$c) throw new DdHttpError(400, "That coupon code doesn't exist");
    if (!dd_coupon_usable($c)) throw new DdHttpError(409, 'This coupon has been fully used');
    if ($subtotal < (int) $c['min_order']) throw new DdHttpError(400, "Spend at least ₹{$c['min_order']} to use {$c['code']}");
    $discount = dd_compute_discount($c, $subtotal);
    $couponCode = $c['code'];
  }

  if ($pay === 'cod' && $cfg['codMin'] > 0 && $subtotal < $cfg['codMin']) {
    $missing = $cfg['codMin'] - $subtotal;
    throw new DdHttpError(400, "Cash on Delivery is available on orders of ₹{$cfg['codMin']} and above — please add ₹$missing more, or choose UPI on delivery");
  }

  $delivery = $subtotal >= $cfg['freeAt'] ? 0 : $cfg['deliveryFee'];
  $total = max(0, $subtotal - $discount + $delivery);
  $db = dd_db();
  $db->beginTransaction();
  try {
    $ins = $db->prepare("INSERT INTO orders (user_id,customer_name,phone,address,note,items_json,total,payment,coupon_code,discount,status)
                         VALUES (?,?,?,?,?,?,?,?,?,?,'pending')");
    $ins->execute([$me ? (int) $me['id'] : null, $name, trim((string) ($b['phone'] ?? '')), trim((string) ($b['address'] ?? '')), trim((string) ($b['note'] ?? '')),
                   json_encode($picked, JSON_UNESCAPED_UNICODE), $total, $pay, $couponCode, $discount]);
    $orderId = (int) $db->lastInsertId();
    if ($couponCode !== '') $db->prepare('UPDATE coupons SET used = used + 1 WHERE code = ?')->execute([$couponCode]);
    $dec = $db->prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
    foreach ($picked as $it) $dec->execute([$it['qty'], $it['id']]);
    $db->commit();
  } catch (Throwable $e) {
    $db->rollBack();
    throw $e;
  }

  return dd_json_out(['order' => [
    'id' => $orderId, 'total' => $total, 'subtotal' => $subtotal, 'discount' => $discount, 'delivery' => $delivery,
    'coupon' => $couponCode !== '' ? $couponCode : null, 'payment' => $pay, 'status' => 'pending', 'items' => $picked,
  ]], 201);
}

function route_my_orders(array $req): array {
  $u = dd_require_auth($req);
  $stmt = dd_db()->prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY datetime(created_at) DESC, id DESC");
  $stmt->execute([$u['id']]);
  $rows = $stmt->fetchAll();
  foreach ($rows as &$o) $o['items'] = dd_parse_items($o['items_json'] ?? null);
  return dd_json_out(['orders' => $rows]);
}

function route_inquiries_post(array $req): array {
  $b = dd_body_json($req);
  $name = trim((string) ($b['name'] ?? ''));
  if ($name === '') throw new DdHttpError(400, 'Name is required');
  dd_db()->prepare('INSERT INTO inquiries (name,phone,need,budget,message) VALUES (?,?,?,?,?)')
    ->execute([$name, trim((string) ($b['phone'] ?? '')), trim((string) ($b['need'] ?? '')), trim((string) ($b['budget'] ?? '')), trim((string) ($b['message'] ?? ''))]);
  return dd_json_out(['ok' => true], 201);
}

/* ════════════════ admin ════════════════ */
function route_admin_stats(array $req): array {
  dd_require_admin($req);
  $revenue = (int) dd_db()->query("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled'")->fetch()['s'];
  $todayRev = (int) dd_db()->query("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled' AND date(created_at) = date('now')")->fetch()['s'];
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
  $rows = dd_db()->query("SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id
                          ORDER BY datetime(o.created_at) DESC, o.id DESC LIMIT 200")->fetchAll();
  foreach ($rows as &$o) $o['items'] = dd_parse_items($o['items_json'] ?? null);
  return dd_json_out(['orders' => $rows]);
}

function route_admin_order_status(array $req, string $id): array {
  dd_require_admin($req);
  $b = dd_body_json($req);
  $status = (string) ($b['status'] ?? '');
  if (!in_array($status, ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], true)) {
    throw new DdHttpError(400, 'Invalid status');
  }
  $stmt = dd_db()->prepare('UPDATE orders SET status = ? WHERE id = ?');
  $stmt->execute([$status, (int) $id]);
  if ($stmt->rowCount() === 0) {
    $chk = dd_db()->prepare('SELECT 1 FROM orders WHERE id = ?'); $chk->execute([(int) $id]);
    if (!$chk->fetch()) throw new DdHttpError(404, 'Order not found');
  }
  return dd_json_out(['ok' => true]);
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
  $rating = (float) ($b['rating'] ?? ($existing['rating'] ?? 4.5));
  $rating = max(0, min(5, is_finite($rating) ? $rating : 4.5));
  $activeRaw = $b['active'] ?? ($existing['active'] ?? true);
  $active = ($activeRaw === true || $activeRaw === 'true' || $activeRaw === 1 || $activeRaw === '1') ? 1 : 0;
  return [
    'name' => $name,
    'price' => dd_clampi($b['price'] ?? ($existing['price'] ?? 0), 0, PHP_INT_MAX, 0),
    'was'   => dd_clampi($b['was']   ?? ($existing['was']   ?? 0), 0, PHP_INT_MAX, 0),
    'stock' => dd_clampi($b['stock'] ?? ($existing['stock'] ?? 0), 0, PHP_INT_MAX, 0),
    'rating' => $rating, 'meta' => $meta, 'tag' => $tag, 'img' => $img, 'active' => $active,
  ];
}

function route_admin_products_get(array $req): array {
  dd_require_admin($req);
  $rows = dd_db()->query('SELECT * FROM products ORDER BY created_at, id')->fetchAll();
  return dd_json_out(['products' => array_map('dd_product_out', $rows)]);
}

function route_admin_products_post(array $req): array {
  dd_require_admin($req);
  $p = dd_read_product_body(dd_body_json($req));
  $id = 'pr_' . base_convert((string) time(), 10, 36) . bin2hex(random_bytes(2));
  dd_db()->prepare('INSERT INTO products (id,name,meta,tag,price,was,rating,stock,img,active) VALUES (?,?,?,?,?,?,?,?,?,?)')
    ->execute([$id, $p['name'], $p['meta'], $p['tag'], $p['price'], $p['was'], $p['rating'], $p['stock'], $p['img'], $p['active']]);
  $stmt = dd_db()->prepare('SELECT * FROM products WHERE id = ?'); $stmt->execute([$id]);
  return dd_json_out(['product' => dd_product_out($stmt->fetch())], 201);
}

function route_admin_products_put(array $req, string $id): array {
  dd_require_admin($req);
  $stmt = dd_db()->prepare('SELECT * FROM products WHERE id = ?'); $stmt->execute([$id]);
  $existing = $stmt->fetch();
  if (!$existing) throw new DdHttpError(404, 'Product not found');
  $p = dd_read_product_body(dd_body_json($req), $existing);
  dd_db()->prepare('UPDATE products SET name=?,meta=?,tag=?,price=?,was=?,rating=?,stock=?,img=?,active=? WHERE id=?')
    ->execute([$p['name'], $p['meta'], $p['tag'], $p['price'], $p['was'], $p['rating'], $p['stock'], $p['img'], $p['active'], $existing['id']]);
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
  $rows = dd_db()->query("SELECT u.id, u.name, u.email, u.phone, u.created_at,
                                 COUNT(o.id) AS orders,
                                 COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS revenue
                          FROM users u LEFT JOIN orders o ON o.user_id = u.id
                          WHERE u.role = 'user' GROUP BY u.id ORDER BY revenue DESC, u.id")->fetchAll();
  return dd_json_out(['customers' => $rows]);
}

function route_admin_inquiries(array $req): array {
  dd_require_admin($req);
  $rows = dd_db()->query("SELECT * FROM inquiries ORDER BY datetime(created_at) DESC, id DESC LIMIT 100")->fetchAll();
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
function route_invoice(array $req, string $id): array {
  $u = dd_require_auth($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Invoice not found');
  $stmt = dd_db()->prepare('SELECT * FROM orders WHERE id = ?');
  $stmt->execute([(int) $id]);
  $o = $stmt->fetch();
  if (!$o) throw new DdHttpError(404, 'Invoice not found');
  if ((int) ($o['user_id'] ?? 0) !== (int) $u['id'] && ($u['role'] ?? '') !== 'admin') {
    throw new DdHttpError(403, 'Not your invoice');
  }
  $items = dd_parse_items($o['items_json'] ?? null);
  $subtotal = 0;
  $itemsOut = [];
  foreach ($items as $i) {
    $price = (int) ($i['price'] ?? 0);
    $qty = (int) ($i['qty'] ?? 0);
    $subtotal += $price * $qty;
    $itemsOut[] = ['id' => $i['id'] ?? null, 'name' => $i['name'] ?? '', 'price' => $price, 'qty' => $qty, 'lineTotal' => $price * $qty];
  }
  $discount = (int) ($o['discount'] ?? 0);
  $delivery = max(0, (int) $o['total'] - $subtotal + $discount);
  $gst = (int) round((int) $o['total'] * 18 / 118);
  return dd_json_out([
    'invoice' => [
      'id' => (int) $o['id'], 'createdAt' => $o['created_at'], 'status' => $o['status'],
      'customer' => ['name' => $o['customer_name'], 'phone' => $o['phone'], 'address' => $o['address']],
      'items' => $itemsOut,
      'subtotal' => $subtotal, 'discount' => $discount, 'delivery' => $delivery,
      'total' => (int) $o['total'], 'gstIncluded' => $gst,
      'payment' => $o['payment'] ?: 'cod', 'coupon' => $o['coupon_code'] ?: '',
    ],
    'seller' => dd_seller_info(),
  ]);
}

/* ════════════════ admin report (last 14 days + 30-day breakdown) ════════════════ */
function route_admin_report(array $req): array {
  dd_require_admin($req);
  $days = [];
  for ($i = 13; $i >= 0; $i--) {
    $key = gmdate('Y-m-d', time() - $i * 86400);
    $stmt = dd_db()->prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE status != 'cancelled' AND date(created_at) = date(?)");
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    $days[] = ['date' => $key, 'orders' => (int) $row['orders'], 'revenue' => (int) $row['revenue']];
  }
  $recent = dd_db()->query("SELECT items_json, total, payment, coupon_code, discount, status FROM orders
                            WHERE status != 'cancelled' AND datetime(created_at) >= datetime('now','-30 days')")->fetchAll();
  $byProduct = [];
  $cod = 0; $upi = 0; $codRev = 0; $upiRev = 0; $couponOrders = 0; $couponSaved = 0; $units = 0;
  foreach ($recent as $o) {
    $tot = (int) $o['total'];
    if (($o['payment'] ?? '') === 'upi') { $upi++; $upiRev += $tot; } else { $cod++; $codRev += $tot; }
    if (!empty($o['coupon_code'])) { $couponOrders++; $couponSaved += (int) ($o['discount'] ?? 0); }
    foreach (dd_parse_items($o['items_json'] ?? null) as $it) {
      $pid = (string) ($it['id'] ?? '');
      $qty = (int) ($it['qty'] ?? 0);
      $price = (int) ($it['price'] ?? 0);
      if (!isset($byProduct[$pid])) $byProduct[$pid] = ['id' => $pid, 'name' => (string) ($it['name'] ?? ''), 'units' => 0, 'revenue' => 0];
      $byProduct[$pid]['units'] += $qty;
      $byProduct[$pid]['revenue'] += $price * $qty;
      $units += $qty;
    }
  }
  usort($byProduct, fn($a, $b) => $b['units'] <=> $a['units']);
  $topProducts = array_slice($byProduct, 0, 5);
  $allTime = dd_db()->query("SELECT COALESCE(AVG(total),0) AS aov, COUNT(*) AS orders FROM orders WHERE status != 'cancelled'")->fetch();
  return dd_json_out([
    'days' => $days, 'topProducts' => $topProducts,
    'payment' => ['cod' => $cod, 'upi' => $upi, 'codRevenue' => $codRev, 'upiRevenue' => $upiRev],
    'coupons' => ['orders' => $couponOrders, 'saved' => $couponSaved],
    'units30d' => $units, 'aov' => (int) round((float) $allTime['aov']), 'ordersAllTime' => (int) $allTime['orders'],
  ]);
}

/* ════════════════ admin storefront config ════════════════ */
function route_admin_store_config_get(array $req): array {
  dd_require_admin($req);
  $cfg = dd_store_config();
  $inv = dd_db()->query('SELECT COALESCE(SUM(price * stock),0) AS value, COALESCE(SUM(stock),0) AS units, COUNT(*) AS skus FROM products WHERE active = 1')->fetch();
  $out = (int) dd_db()->query('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock = 0')->fetch()['n'];
  $low = (int) dd_db()->query('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock > 0 AND stock <= 5')->fetch()['n'];
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
  if (array_key_exists('codEnabled', $b))  dd_set_setting('cod_enabled', dd_boolish($b['codEnabled']));
  if (array_key_exists('codMin', $b))      dd_set_setting('cod_min',     (string) dd_clampi($b['codMin'], 0, 100000, 0));
  if (array_key_exists('maxQty', $b))      dd_set_setting('max_qty',     (string) dd_clampi($b['maxQty'], 1, 99, 99));
  if (array_key_exists('storeLive', $b))   dd_set_setting('store_live',  dd_boolish($b['storeLive']));
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
  $type = (($b['type'] ?? '') === 'flat') ? 'flat' : 'percent';
  $value = (int) round((float) ($b['value'] ?? 0));
  if ($type === 'percent' && ($value < 1 || $value > 90)) throw new DdHttpError(400, 'Percentage must be 1–90');
  if ($type === 'flat' && $value < 1) throw new DdHttpError(400, 'Flat discount must be at least ₹1');
  $minOrder = dd_clampi($b['min_order'] ?? 0, 0, PHP_INT_MAX, 0);
  $maxUses = dd_clampi($b['max_uses'] ?? 0, 0, PHP_INT_MAX, 0);
  $stmt = dd_db()->prepare('SELECT 1 FROM coupons WHERE code = ?'); $stmt->execute([$code]);
  if ($stmt->fetch()) throw new DdHttpError(409, "Coupon $code already exists");
  dd_db()->prepare('INSERT INTO coupons (code,type,value,min_order,max_uses) VALUES (?,?,?,?,?)')->execute([$code, $type, $value, $minOrder, $maxUses]);
  $stmt = dd_db()->prepare('SELECT * FROM coupons WHERE code = ?'); $stmt->execute([$code]);
  return dd_json_out(['coupon' => $stmt->fetch()], 201);
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
  $installed = dd_is_setup_complete();
  $u = dd_current_user($req);
  if ($installed && (!$u || ($u['role'] ?? '') !== 'admin')) return dd_json_out(['installed' => true]);
  return dd_json_out(array_merge(
    ['installed' => $installed,
     'completedAt' => dd_site_get('setup_completed_at') ?: null,
     'signedInAs' => $u ? ['name' => $u['name'], 'role' => $u['role']] : null],
    dd_db_info(),
    ['settings' => dd_site_settings(), 'store' => dd_store_config()]
  ));
}

function route_setup_test_db(array $req): array {
  dd_require_setup_open(dd_current_user($req));
  $b = dd_body_json($req);
  $target = dd_resolve_db_target($b['path'] ?? null);
  $existed = file_exists($target);
  @mkdir(dirname($target), 0775, true);
  $test = null;
  try {
    $test = new PDO('sqlite:' . $target, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $integ = (string) $test->query('PRAGMA integrity_check')->fetchColumn();
    $has = function (string $t) use ($test): bool {
      $stmt = $test->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?");
      $stmt->execute([$t]);
      return (bool) $stmt->fetch();
    };
    $counts = null;
    if ($has('users') && $has('products')) {
      $counts = [
        'users'    => (int) $test->query('SELECT COUNT(*) n FROM users')->fetch()['n'],
        'products' => (int) $test->query('SELECT COUNT(*) n FROM products')->fetch()['n'],
        'orders'   => (int) $test->query('SELECT COUNT(*) n FROM orders')->fetch()['n'],
      ];
    }
    $test = null;
    if (!$existed) @unlink($target);
    return dd_json_out(['ok' => true, 'path' => $target, 'existed' => $existed, 'counts' => $counts, 'integrity' => $integ]);
  } catch (Throwable $e) {
    $test = null;
    if (!$existed) @unlink($target);
    throw new DdHttpError(400, "Can't use that file as the site database: " . $e->getMessage());
  }
}

function route_setup_database(array $req): array {
  dd_require_setup_open(dd_current_user($req));
  $b = dd_body_json($req);
  $mode = (($b['mode'] ?? 'demo') === 'empty') ? 'empty' : 'demo';
  $confirmReset = dd_boolish($b['confirmReset'] ?? false) === '1';
  $target = dd_resolve_db_target($b['path'] ?? null);
  $sameFile = $target === dd_db_path();

  $countsNow = dd_db_counts();
  $nNow = $countsNow['users'] + $countsNow['products'];

  if ($sameFile) {
    if ($nNow > 0 && $mode === 'empty' && !$confirmReset) {
      return dd_json_out(['error' => 'That database already holds data — tick “erase existing data” to wipe and reinstall.',
                          'needsReset' => true, 'counts' => $countsNow], 409);
    }
    if ($nNow > 0 && $confirmReset) dd_wipe_all_tables();
    if ($nNow === 0 || $confirmReset) dd_seed_database($mode === 'demo');
    return dd_json_out(['ok' => true, 'path' => dd_db_path(),
                        'seeded' => ($nNow === 0 || $confirmReset) ? $mode : 'kept-existing', 'counts' => dd_db_counts()]);
  }

  @mkdir(dirname($target), 0775, true);
  $test = new PDO('sqlite:' . $target, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
  $had = false;
  $n = 0;
  try {
    $had = (bool) $test->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'users'")->fetch();
    if ($had) {
      try {
        $n = (int) $test->query('SELECT COUNT(*) n FROM users')->fetch()['n'] + (int) $test->query('SELECT COUNT(*) n FROM products')->fetch()['n'];
      } catch (Throwable $e) {}
    }
  } finally { $test = null; }
  if ($n > 0 && $mode === 'empty' && !$confirmReset) {
    return dd_json_out(['error' => 'That database already holds data — tick “erase existing data” to wipe and reinstall.',
                        'needsReset' => true, 'counts' => null], 409);
  }
  DdDb::close();
  DdDb::open($target);
  if ($n > 0) dd_wipe_all_tables();
  if ($n === 0 || $confirmReset) dd_seed_database($mode === 'demo');
  dd_write_install(['dbPath' => $target]);
  return dd_json_out(['ok' => true, 'path' => $target,
                      'seeded' => ($n === 0 || $confirmReset) ? $mode : 'kept-existing', 'counts' => dd_db_counts()]);
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
  $email = mb_substr(strtolower(trim((string) ($b['email'] ?? ''))), 0, 120);
  $password = (string) ($b['password'] ?? '');
  $phone = mb_substr(trim((string) ($b['phone'] ?? '')), 0, 32);
  if (!dd_email_ok($email)) throw new DdHttpError(400, 'Enter a valid admin email');
  if (strlen($password) < 8) throw new DdHttpError(400, 'Password must be at least 8 characters');
  if (strlen($password) > 100) throw new DdHttpError(400, 'Password too long');
  $hash = dd_hash_password($password);
  $existing = dd_db()->prepare('SELECT id FROM users WHERE email = ?'); $existing->execute([$email]);
  $row = $existing->fetch();
  $cookies = dd_parse_cookies($req['headers']['cookie'] ?? null);
  $sid = (string) ($cookies['dd_sid'] ?? '');
  if ($row) {
    dd_db()->prepare("UPDATE users SET name=?, phone=?, password_hash=?, password_salt='bcrypt', role='admin' WHERE id=?")
      ->execute([$name, $phone, $hash, $row['id']]);
    dd_db()->prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?')->execute([$row['id'], $sid]);
  } else {
    dd_db()->prepare("INSERT INTO users (name,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?, 'admin')")
      ->execute([$name, $email, $phone, $hash, 'bcrypt']);
  }
  return dd_json_out(['ok' => true, 'email' => $email, 'updated' => (bool) $row]);
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
  dd_set_setting('setup_completed', '1');
  dd_set_setting('setup_completed_at', gmdate('c'));
  return dd_json_out(['ok' => true]);
}

/* ════════════════ backup & restore (SQLite) ════════════════ */
function route_admin_backup(array $req): array {
  dd_require_admin($req);
  $tmp = tempnam(sys_get_temp_dir(), 'mysite-backup-');
  if ($tmp === false) throw new DdHttpError(500, 'Backup failed: could not create a temp file');
  @unlink($tmp); // VACUUM INTO requires the target to not exist
  $tmpDb = $tmp . '.db';
  try {
    dd_db()->exec("VACUUM INTO " . dd_db()->quote($tmpDb));
  } catch (Throwable $e) {
    @unlink($tmpDb);
    throw new DdHttpError(500, 'Backup failed: ' . $e->getMessage());
  }
  $data = file_get_contents($tmpDb);
  @unlink($tmpDb);
  $name = 'mysite-backup-' . gmdate('Y-m-d') . '.db';
  return ['status' => 200,
          'headers' => ['Content-Disposition' => "attachment; filename=\"$name\"", 'Cache-Control' => 'no-store'],
          'body' => $data, 'content_type' => 'application/octet-stream'];
}

function route_admin_restore(array $req): array {
  dd_require_admin($req);
  $raw = (string) ($req['raw'] ?? '');
  if (strlen($raw) < 100) throw new DdHttpError(400, 'Empty or unreadable upload — pick the .db backup file.');
  if (substr($raw, 0, 16) !== "SQLite format 3\0") throw new DdHttpError(400, 'That file is not a SQLite database.');
  $target = dd_db_path();
  $backup = $target . '.bak-' . time();
  if (!@copy($target, $backup)) throw new DdHttpError(500, 'Could not snapshot the current database first.');
  DdDb::close();
  $tmpFile = $target . '.restore-tmp';
  file_put_contents($tmpFile, $raw);
  try {
    $test = new PDO('sqlite:' . $tmpFile, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $integ = (string) $test->query('PRAGMA integrity_check')->fetchColumn();
    $ok = (bool) $test->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'users'")->fetch();
    $test = null;
    if (!$ok || $integ !== 'ok') throw new Exception('missing required schema or failed integrity check');
    rename($tmpFile, $target);
  } catch (Throwable $e) {
    @copy($backup, $target);
    @unlink($tmpFile);
    DdDb::open($target);
    throw new DdHttpError(400, 'Restore rolled back — ' . $e->getMessage());
  }
  DdDb::open($target);
  return dd_json_out(['ok' => true, 'counts' => dd_db_counts(), 'backup' => basename($backup)]);
}

/* ════════════════ router ════════════════ */

/**
 * @param array $req ['method','subpath','query','raw','headers','ip','https','set_cookies']
 * @return array ['status' => int, 'headers' => array, 'body' => string, 'content_type' => string]
 */
function dd_handle(array $req): array {
  $GLOBALS['dd_set_cookies'] = [];
  dd_boot_seed();
  $method = strtoupper($req['method'] ?? 'GET');
  $path = '/' . trim((string) ($req['subpath'] ?? '/'), '/');
  if ($path === '/') $path = '/';

  // size guards (mirrors the Node limits)
  $rawLen = strlen((string) ($req['raw'] ?? ''));
  $ctype = strtolower((string) ($req['headers']['content-type'] ?? ''));
  $isBinaryUpload = stripos($ctype, 'application/octet-stream') !== false || stripos($ctype, 'application/x-sqlite3') !== false || stripos($ctype, 'application/vnd.sqlite3') !== false;
  if ($isBinaryUpload && $rawLen > DD_MAX_BACKUP_BYTES) {
    return dd_json_out(['error' => 'Upload too large (max 40 MB)'], 413);
  }
  if (!$isBinaryUpload && $rawLen > DD_MAX_JSON_BYTES) {
    return dd_json_out(['error' => 'Payload too large'], 413);
  }

  $amount = null;
  $route = static function (string $m, string $pattern, callable $fn) use (&$amount, $method, $path, $req) {
    if ($amount !== null) return;
    if ($m !== $method) return;
    if (preg_match($pattern, $path, $mm)) $amount = $fn($req, ...array_slice($mm, 1));
  };

  try {
    // [method, pattern, handler] — order matches server.js
    $route('POST', '#^/auth/register$#', fn ($req) => route_auth_register($req));
    $route('POST', '#^/auth/login$#', fn ($req) => route_auth_login($req));
    $route('POST', '#^/auth/logout$#', fn ($req) => route_auth_logout($req));
    $route('GET',  '#^/me$#', fn ($req) => route_me($req));
    $route('PUT',  '#^/me$#', fn ($req) => route_me_put($req));
    $route('GET',  '#^/store/config$#', fn ($req) => route_store_config($req));
    $route('POST', '#^/coupons/validate$#', fn ($req) => route_coupon_validate($req));
    $route('GET',  '#^/products$#', fn ($req) => route_products($req));
    $route('POST', '#^/orders$#', fn ($req) => route_orders_post($req));
    $route('GET',  '#^/my/orders$#', fn ($req) => route_my_orders($req));
    $route('POST', '#^/inquiries$#', fn ($req) => route_inquiries_post($req));
    $route('GET',  '#^/admin/stats$#', fn ($req) => route_admin_stats($req));
    $route('GET',  '#^/admin/orders$#', fn ($req) => route_admin_orders($req));
    $route('PUT',  '#^/admin/orders/(\d+)/status$#', fn ($req, $id) => route_admin_order_status($req, $id));
    $route('GET',  '#^/admin/products$#', fn ($req) => route_admin_products_get($req));
    $route('POST', '#^/admin/products$#', fn ($req) => route_admin_products_post($req));
    $route('PUT',  '#^/admin/products/([A-Za-z0-9_-]{1,64})$#', fn ($req, $id) => route_admin_products_put($req, $id));
    $route('DELETE', '#^/admin/products/([A-Za-z0-9_-]{1,64})$#', fn ($req, $id) => route_admin_products_delete($req, $id));
    $route('GET',  '#^/admin/customers$#', fn ($req) => route_admin_customers($req));
    $route('GET',  '#^/admin/inquiries$#', fn ($req) => route_admin_inquiries($req));
    $route('GET',  '#^/products/([A-Za-z0-9_-]{1,32})/reviews$#', fn ($req, $id) => route_reviews_get($req, $id));
    $route('POST', '#^/products/([A-Za-z0-9_-]{1,32})/reviews$#', fn ($req, $id) => route_reviews_post($req, $id));
    $route('GET',  '#^/invoices/(\d+)$#', fn ($req, $id) => route_invoice($req, $id));
    $route('GET',  '#^/admin/report$#', fn ($req) => route_admin_report($req));
    $route('GET',  '#^/admin/store-config$#', fn ($req) => route_admin_store_config_get($req));
    $route('PUT',  '#^/admin/store-config$#', fn ($req) => route_admin_store_config_put($req));
    $route('GET',  '#^/admin/coupons$#', fn ($req) => route_admin_coupons_get($req));
    $route('POST', '#^/admin/coupons$#', fn ($req) => route_admin_coupons_post($req));
    $route('PUT',  '#^/admin/coupons/([A-Za-z0-9_-]{3,20})$#', fn ($req, $code) => route_admin_coupons_put($req, $code));
    $route('DELETE', '#^/admin/coupons/([A-Za-z0-9_-]{3,20})$#', fn ($req, $code) => route_admin_coupons_delete($req, $code));
    $route('GET',  '#^/setup/status$#', fn ($req) => route_setup_status($req));
    $route('POST', '#^/setup/test-db$#', fn ($req) => route_setup_test_db($req));
    $route('POST', '#^/setup/database$#', fn ($req) => route_setup_database($req));
    $route('POST', '#^/setup/site$#', fn ($req) => route_setup_site($req));
    $route('POST', '#^/setup/admin$#', fn ($req) => route_setup_admin($req));
    $route('POST', '#^/setup/store$#', fn ($req) => route_setup_store($req));
    $route('POST', '#^/setup/complete$#', fn ($req) => route_setup_complete($req));
    $route('GET',  '#^/admin/backup$#', fn ($req) => route_admin_backup($req));
    $route('POST', '#^/admin/restore$#', fn ($req) => route_admin_restore($req));
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

  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);

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
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
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
