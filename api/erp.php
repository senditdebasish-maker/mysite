<?php
/**
 * ERP milestone 1 — order notes & timeline, refund flow, GST tax invoice,
 * lifecycle emails, ERP/GST settings.
 *
 * Included by api/index.php (function definitions only — nothing runs at
 * include time). Direct access is blocked in .htaccess like api/core.php.
 */
declare(strict_types=1);

/* ════════════════ settings helpers ════════════════ */
function dd_erp_bool(string $key, bool $default): bool {
  $v = dd_get_setting($key);
  if ($v === null || $v === '') return $default;
  return $v === '1';
}

/* ════════════════ GST ════════════════ */
function dd_gst_rate_bp(): int {
  return max(0, min(2800, (int) dd_num_setting('gst_rate_bp', 1800)));
}
function dd_gst_state_norm(?string $s): string {
  return mb_strtolower(trim((string) $s));
}
/**
 * MRP-style (GST-inclusive) tax breakup for a grand total.
 * All inputs/outputs are integer rupees. Returns:
 *   ['rateBp','inclusive','taxable','cgst','sgst','igst','unattributed',
 *    'totalTax','intra' => true|false|null, 'sellerState','placeOfSupply']
 * 'intra' is null when either state is missing — the caller must then show a
 * combined "GST" line instead of CGST/SGST vs IGST.
 */
function dd_gst_breakup(int $grandTotal, string $sellerState, string $placeState): array {
  $rateBp = dd_gst_rate_bp();
  $rate = $rateBp / 10000;
  $total = max(0, $grandTotal);
  $taxable = (int) round($total / (1 + $rate));
  $tax = $total - $taxable;
  $ss = dd_gst_state_norm($sellerState);
  $ps = dd_gst_state_norm($placeState);
  $intra = ($ss !== '' && $ps !== '') ? ($ss === $ps) : null;
  $cgst = 0; $sgst = 0; $igst = 0; $unattributed = 0;
  if ($intra === true) { $cgst = intdiv($tax, 2); $sgst = $tax - $cgst; }
  elseif ($intra === false) { $igst = $tax; }
  else { $unattributed = $tax; }
  return [
    'rateBp' => $rateBp, 'inclusive' => true, 'taxable' => $taxable,
    'cgst' => $cgst, 'sgst' => $sgst, 'igst' => $igst, 'unattributed' => $unattributed,
    'totalTax' => $tax, 'intra' => $intra,
    'sellerState' => trim($sellerState), 'placeOfSupply' => trim($placeState),
  ];
}

/**
 * Assign the next INV-YYYY-NNNN number to an order. Idempotent per order —
 * once assigned, stored on orders.invoice_no and reused forever. Called when
 * the invoice is first viewed/printed (never on the checkout path).
 */
function dd_invoice_number(int $orderId): ?string {
  $db = dd_db();
  $stmt = $db->prepare('SELECT invoice_no FROM orders WHERE id = ?');
  $stmt->execute([$orderId]);
  $existing = $stmt->fetchColumn();
  if (is_string($existing) && $existing !== '') return $existing;

  $year = (int) date('Y');
  $db->beginTransaction();
  try {
    $stmt = $db->prepare('SELECT next FROM invoice_sequences WHERE year = ? FOR UPDATE');
    $stmt->execute([$year]);
    $row = $stmt->fetch();
    if (!$row) {
      $db->prepare('INSERT INTO invoice_sequences (year, next) VALUES (?, 2)')->execute([$year]);
      $seq = 1;
    } else {
      $seq = (int) $row['next'];
      $db->prepare('UPDATE invoice_sequences SET next = next + 1 WHERE year = ?')->execute([$year]);
    }
    $number = 'INV-' . $year . '-' . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    $upd = $db->prepare("UPDATE orders SET invoice_no = ? WHERE id = ? AND (invoice_no IS NULL OR invoice_no = '')");
    $upd->execute([$number, $orderId]);
    if ($upd->rowCount() !== 1) {
      // Another request assigned one concurrently — use theirs, keep ours unused.
      $stmt = $db->prepare('SELECT invoice_no FROM orders WHERE id = ?');
      $stmt->execute([$orderId]);
      $number = (string) $stmt->fetchColumn() ?: $number;
    }
    $db->commit();
    return $number;
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
}

/* ════════════════ order events & notes ════════════════ */
function dd_add_event(int $orderId, string $kind, ?string $fromStatus, ?string $toStatus, ?string $body, string $visibility, ?int $createdBy): void {
  dd_db()->prepare('INSERT INTO order_events (order_id, kind, from_status, to_status, body, visibility, created_by) VALUES (?,?,?,?,?,?,?)')
    ->execute([$orderId, $kind, $fromStatus, $toStatus, $body, $visibility, $createdBy]);
}
function dd_map_event(array $e): array {
  return [
    'id' => (int) $e['id'], 'kind' => (string) $e['kind'],
    'fromStatus' => $e['from_status'] ?? null, 'toStatus' => $e['to_status'] ?? null,
    'body' => $e['body'] ?? null, 'visibility' => (string) $e['visibility'],
    'author' => $e['author'] ?? null, 'createdAt' => (string) $e['created_at'],
  ];
}
function dd_events_for(int $orderId, bool $customerOnly): array {
  $sql = 'SELECT e.*, u.name AS author FROM order_events e LEFT JOIN users u ON u.id = e.created_by WHERE e.order_id = ?';
  if ($customerOnly) $sql .= " AND e.visibility = 'customer'";
  $sql .= ' ORDER BY e.id ASC';
  $stmt = dd_db()->prepare($sql);
  $stmt->execute([$orderId]);
  return array_map('dd_map_event', $stmt->fetchAll());
}
function dd_order_exists(int $orderId): bool {
  $stmt = dd_db()->prepare('SELECT 1 FROM orders WHERE id = ?');
  $stmt->execute([$orderId]);
  return (bool) $stmt->fetch();
}

function route_admin_order_events_get(array $req, string $id): array {
  dd_require_admin($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Order not found');
  if (!dd_order_exists((int) $id)) throw new DdHttpError(404, 'Order not found');
  return dd_json_out(['events' => dd_events_for((int) $id, false), 'requests' => dd_requests_for((int) $id)]);
}
function route_admin_order_events_post(array $req, string $id): array {
  $admin = dd_require_admin($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Order not found');
  if (!dd_order_exists((int) $id)) throw new DdHttpError(404, 'Order not found');
  $b = dd_body_json($req);
  $body = trim((string) ($b['body'] ?? ''));
  if ($body === '') throw new DdHttpError(400, 'Write a note first');
  if (mb_strlen($body) > 500) throw new DdHttpError(400, 'Notes are limited to 500 characters');
  $visibility = (($b['visibility'] ?? 'admin') === 'customer') ? 'customer' : 'admin';
  dd_add_event((int) $id, 'note', null, null, $body, $visibility, (int) $admin['id']);
  return dd_json_out(['events' => dd_events_for((int) $id, false)], 201);
}
function route_my_order_events(array $req, string $id): array {
  $u = dd_require_auth($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Order not found');
  $stmt = dd_db()->prepare('SELECT 1 FROM orders WHERE id = ? AND user_id = ?');
  $stmt->execute([(int) $id, (int) $u['id']]);
  if (!$stmt->fetch()) throw new DdHttpError(404, 'Order not found');
  return dd_json_out(['events' => dd_events_for((int) $id, true)]);
}

/* ════════════════ refund flow ════════════════ */
function route_admin_order_refund(array $req, string $id): array {
  $admin = dd_require_admin($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Order not found');
  $b = dd_body_json($req);
  $reason = trim((string) ($b['reason'] ?? ''));
  if ($reason === '') throw new DdHttpError(400, 'A refund reason is required');
  if (mb_strlen($reason) > 255) throw new DdHttpError(400, 'Reason must be 255 characters or fewer');

  $db = dd_db();
  $db->beginTransaction();
  try {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? FOR UPDATE');
    $stmt->execute([(int) $id]);
    $order = $stmt->fetch();
    if (!$order) throw new DdHttpError(404, 'Order not found');
    $status = (string) $order['status'];
    if ($status === 'cancelled') throw new DdHttpError(409, 'This order is cancelled — there is nothing to refund');
    if ($status === 'refunded') throw new DdHttpError(409, 'This order has already been refunded');
    if ($status === 'pending') throw new DdHttpError(409, 'This order is not confirmed yet — cancel it instead');

    $db->prepare("UPDATE orders SET status = 'refunded', refund_reason = ?, refunded_at = UTC_TIMESTAMP() WHERE id = ?")
      ->execute([$reason, $order['id']]);

    $restock = $db->prepare('UPDATE products SET stock = LEAST(2147483647, stock + ?) WHERE id = ?');
    foreach (dd_parse_items($order['items_json'] ?? null) as $item) {
      if (!is_array($item) || empty($item['id'])) continue;
      $restock->execute([max(1, (int) ($item['qty'] ?? 1)), $item['id']]);
    }
    if (($order['coupon_code'] ?? '') !== '') {
      $db->prepare('UPDATE coupons SET used = GREATEST(0, used - 1) WHERE code = ?')->execute([$order['coupon_code']]);
    }
    dd_add_event((int) $order['id'], 'status', $status, 'refunded',
      'Refunded: ' . $reason, 'customer', (int) $admin['id']);
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  dd_notify_status_change((int) $id, 'refunded');
  return dd_json_out(['ok' => true, 'status' => 'refunded']);
}

/* ════════════════ WhatsApp notifications (Meta Cloud API — opt-in, env-gated)
   No server credentials -> every attempt returns 'not_configured' and nothing is
   sent. Configure DD_WHATSAPP_TOKEN + DD_WHATSAPP_PHONE_ID (env) and enable the
   admin toggle. Admins can always use the WA button per order (opens WhatsApp
   with a prefilled message) — that path needs no keys. */
function dd_whatsapp_config(): array {
  return [trim((string) (getenv('DD_WHATSAPP_TOKEN') ?: '')),
          trim((string) (getenv('DD_WHATSAPP_PHONE_ID') ?: ''))];
}
function dd_whatsapp_ready(): bool {
  [$t, $p] = dd_whatsapp_config();
  return $t !== '' && $p !== '';
}
function dd_whatsapp_phone(string $raw): string {
  $d = preg_replace('/\D+/', '', $raw) ?? '';
  if (strlen($d) === 10) return '91' . $d;              // Indian mobiles — same rule as the WA deep links
  if (strlen($d) === 11 && strpos($d, '0') === 0) return '91' . substr($d, 1);
  if (strlen($d) === 12 && strpos($d, '91') === 0) return $d;
  return '';
}
/** Returns 'sent'|'disabled'|'not_configured'|'invalid_phone'|'failed'. Never throws —
 *  notification problems must never break an order or a status change. */
function dd_try_whatsapp(string $phone, string $message): string {
  try {
  if (!dd_erp_bool('whatsapp_customer_updates', false)) return 'disabled';
  [$token, $phoneId] = dd_whatsapp_config();
  if ($token === '' || $phoneId === '') return 'not_configured';
  $to = dd_whatsapp_phone($phone);
  if ($to === '') return 'invalid_phone';
  $url = 'https://graph.facebook.com/v18.0/' . rawurlencode($phoneId) . '/messages';
  $payload = (string) json_encode([
    'messaging_product' => 'whatsapp', 'to' => $to, 'type' => 'text',
    'text' => ['preview_url' => false, 'body' => $message],
  ], JSON_UNESCAPED_UNICODE);
  try {
    if (function_exists('curl_init')) {
      $ch = curl_init($url);
      curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 5,
      ]);
      $res = curl_exec($ch);
      $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
      $err = curl_error($ch);
      curl_close($ch);
      if ($res === false || $code >= 300) {
        error_log('[whatsapp] send failed: ' . ($err !== '' ? $err : ('HTTP ' . $code . ' — ' . mb_substr((string) $res, 0, 300))));
        return 'failed';
      }
      return 'sent';
    }
    $ctx = stream_context_create(['http' => [
      'method' => 'POST',
      'header' => "Authorization: Bearer {$token}\r\nContent-Type: application/json\r\n",
      'content' => $payload, 'timeout' => 8,
    ]]);
    if (@file_get_contents($url, false, $ctx) === false) {
      error_log('[whatsapp] send failed (streams)');
      return 'failed';
    }
    return 'sent';
  } catch (Throwable $e) {
    error_log('[whatsapp] ' . $e->getMessage());
    return 'failed';
  }
  } catch (Throwable $e) {
    error_log('[whatsapp] config/db read failed: ' . $e->getMessage());
    return 'failed';
  }
}

/* ════════════════ lifecycle emails ════════════════ */
function dd_try_email(string $to, string $subject, string $html): void {
  $to = trim($to);
  if ($to === '' || !dd_email_ok($to)) return;
  try {
    dd_send_email($to, $subject, $html);
  } catch (Throwable $e) {
    // A mail failure must never break an order, a refund or a status change.
    error_log('[erp-mail] ' . $e->getMessage());
  }
}
function dd_email_layout(string $brand, string $heading, string $bodyHtml): string {
  $b = htmlspecialchars($brand, ENT_QUOTES, 'UTF-8');
  $h = htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#1c1c1c">'
    . '<p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#999;margin:0 0 4px">' . $b . '</p>'
    . '<h1 style="font-size:20px;margin:0 0 12px;color:#141414">' . $h . '</h1>'
    . $bodyHtml
    . '<p style="font-size:11px;color:#888;border-top:1px solid #eee;padding-top:10px;margin-top:16px">'
    . 'Questions? Just reply to this email or reach us on WhatsApp.</p></div>';
}
function dd_order_summary_html(array $o, array $items): string {
  $rows = '';
  foreach ($items as $it) {
    if (!is_array($it)) continue;
    $name = htmlspecialchars((string) ($it['name'] ?? 'Item'), ENT_QUOTES, 'UTF-8');
    $qty = max(1, (int) ($it['qty'] ?? 1));
    $price = max(0, (int) ($it['price'] ?? 0));
    $rows .= '<tr><td style="padding:4px 8px;border-bottom:1px solid #f0ece1">' . $name . ' × ' . $qty
      . '</td><td style="padding:4px 8px;border-bottom:1px solid #f0ece1;text-align:right">₹' . number_format($price * $qty) . '</td></tr>';
  }
  $name = htmlspecialchars((string) ($o['customer_name'] ?? ''), ENT_QUOTES, 'UTF-8');
  $addr = htmlspecialchars((string) ($o['address'] ?? ''), ENT_QUOTES, 'UTF-8');
  $pay = (($o['payment'] ?? 'cod') === 'upi') ? 'UPI on delivery' : 'Cash on delivery';
  $total = number_format((int) ($o['total'] ?? 0));
  return '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0">' . $rows . '</table>'
    . '<p style="font-size:15px;margin:8px 0"><strong>Total: ₹' . $total . '</strong> · ' . htmlspecialchars($pay, ENT_QUOTES, 'UTF-8') . '</p>'
    . '<p style="font-size:13px;color:#444;margin:4px 0">Deliver to: ' . $name . '<br>' . nl2br($addr) . '</p>';
}
function dd_fetch_order_full(int $orderId): ?array {
  $stmt = dd_db()->prepare('SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?');
  $stmt->execute([$orderId]);
  $o = $stmt->fetch();
  return $o ?: null;
}
function dd_notify_new_order(int $orderId): void {
  $o = dd_fetch_order_full($orderId);
  if (!$o) return;
  $items = dd_parse_items($o['items_json'] ?? null);
  $brand = dd_site_get('site_brand') ?: 'Store';
  $total = number_format((int) ($o['total'] ?? 0));
  $summary = dd_order_summary_html($o, $items);

  if (dd_erp_bool('email_admin_new_order', true)) {
    $adminTo = dd_site_get('site_email');
    if ($adminTo !== '') {
      dd_try_email($adminTo, 'New order #' . $orderId . ' — ₹' . $total,
        dd_email_layout($brand, 'New order #' . $orderId, $summary));
    }
  }
  if (dd_erp_bool('email_customer_updates', true)) {
    $customerTo = trim((string) (($o['user_email'] ?? '') ?: ($o['guest_email'] ?? '')));
    dd_try_email($customerTo, 'We received your order #' . $orderId,
      dd_email_layout($brand, 'Thank you! Order #' . $orderId . ' received',
        '<p style="font-size:13px">We’ve received your order and will start packing it soon. We’ll email you at every step.</p>' . $summary));
  }
}
function dd_notify_status_change(int $orderId, string $status): void {
  if (!dd_erp_bool('email_customer_updates', true)) return;
  $o = dd_fetch_order_full($orderId);
  if (!$o) return;
  $to = trim((string) (($o['user_email'] ?? '') ?: ($o['guest_email'] ?? '')));
  if ($to === '') return;
  $brand = dd_site_get('site_brand') ?: 'Store';
  $map = [
    'confirmed' => ['Order #%d confirmed', 'Good news — your order is confirmed and will be packed shortly.'],
    'shipped'   => ['Order #%d is on its way', 'Your order has shipped. Keep your phone handy for the delivery call.'],
    'out_for_delivery' => ['Order #%d is out for delivery', 'Your order is out with the courier right now — please keep your phone handy and arrange to be available.'],
    'delivered' => ['Order #%d delivered', 'Your order was marked as delivered. Enjoy, and thank you for shopping with us!'],
    'cancelled' => ['Order #%d cancelled', 'Your order was cancelled. If this is unexpected, please contact us right away.'],
    'refunded'  => ['Order #%d refunded', 'Your order was refunded. Depending on payment mode, the amount returns to the original payment method or is adjusted with the courier.'],
  ];
  if (!isset($map[$status])) return;
  [$subj, $line] = $map[$status];
  if ($status === 'shipped') {
    $summary = dd_tracking_summary($o);
    if ($summary !== '') $line .= ' ' . $summary . '.';
    if (!empty($o['tracking_url'])) $line .= ' Track your parcel: ' . $o['tracking_url'];
  }
  $items = dd_parse_items($o['items_json'] ?? null);
  dd_try_email($to, sprintf($subj, $orderId),
    dd_email_layout($brand, sprintf($subj, $orderId),
      '<p style="font-size:13px">' . htmlspecialchars($line, ENT_QUOTES, 'UTF-8') . '</p>' . dd_order_summary_html($o, $items)));
  // WhatsApp: plain text, same gate style as email; a failure here never breaks the status change
  $wa = $brand . ' — order #' . $orderId . ' update: ' . $line;
  if ($status === 'shipped' && !empty($o['tracking_url'])) $wa .= ' Track: ' . $o['tracking_url'];
  dd_try_whatsapp((string) ($o['phone'] ?? ''), $wa);
}

/* ════════════════ ERP / GST settings (admin) ════════════════ */
function dd_erp_config_out(): array {
  return [
    'gstin' => (string) dd_get_setting('site_gstin'),
    'sellerState' => (string) dd_get_setting('seller_state'),
    'gstRateBp' => dd_gst_rate_bp(),
    'gstRate' => dd_gst_rate_bp() / 100,
    'emailAdminNewOrder' => dd_erp_bool('email_admin_new_order', true),
    'emailCustomerUpdates' => dd_erp_bool('email_customer_updates', true),
    'cartReminderEmails' => dd_erp_bool('cart_reminder_emails', true),
    'whatsappCustomerUpdates' => dd_erp_bool('whatsapp_customer_updates', false),
    'whatsappConfigured' => dd_whatsapp_ready(),
  ];
}
function route_admin_erp_config_get(array $req): array {
  dd_require_admin($req);
  return dd_json_out(dd_erp_config_out());
}
function route_admin_erp_config_put(array $req): array {
  dd_require_admin($req);
  $b = dd_body_json($req);
  if (array_key_exists('gstin', $b)) {
    $g = strtoupper(trim((string) $b['gstin']));
    if ($g !== '' && !preg_match('/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/', $g)) {
      throw new DdHttpError(400, 'GSTIN must look like 19ABCDE1234F1Z5 (15 characters)');
    }
    dd_set_setting('site_gstin', $g);
  }
  if (array_key_exists('sellerState', $b)) {
    dd_set_setting('seller_state', mb_substr(trim((string) $b['sellerState']), 0, 100));
  }
  if (array_key_exists('gstRate', $b) || array_key_exists('gstRateBp', $b)) {
    if (array_key_exists('gstRate', $b)) {
      $pct = (float) $b['gstRate'];
      if (!is_finite($pct)) throw new DdHttpError(400, 'GST rate must be a number');
      $bp = (int) round($pct * 100);
    } else {
      $bp = (int) $b['gstRateBp'];
    }
    if ($bp < 0 || $bp > 2800) throw new DdHttpError(400, 'GST rate must be between 0% and 28%');
    dd_set_setting('gst_rate_bp', (string) $bp);
  }
  if (array_key_exists('emailAdminNewOrder', $b)) dd_set_setting('email_admin_new_order', dd_boolish($b['emailAdminNewOrder']));
  if (array_key_exists('emailCustomerUpdates', $b)) dd_set_setting('email_customer_updates', dd_boolish($b['emailCustomerUpdates']));
  if (array_key_exists('cartReminderEmails', $b)) dd_set_setting('cart_reminder_emails', dd_boolish($b['cartReminderEmails']));
  if (array_key_exists('whatsappCustomerUpdates', $b)) dd_set_setting('whatsapp_customer_updates', dd_boolish($b['whatsappCustomerUpdates']));
  return dd_json_out(dd_erp_config_out());
}

/* ════════════════ GST report (per invoice CSV) ════════════════ */
function route_admin_gst_report_csv(array $req): array {
  dd_require_admin($req);
  [$from, $to] = dd_report_period($req['query'] ?? []);
  $sellerState = (string) dd_get_setting('seller_state');
  $stmt = dd_db()->prepare("SELECT id, invoice_no, created_at, customer_name, state, total, status
    FROM orders WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
      AND status NOT IN ('cancelled', 'refunded')
    ORDER BY created_at, id");
  $stmt->execute([$from, $to]);
  $rows = [];
  foreach ($stmt->fetchAll() as $o) {
    $total = (int) $o['total'];
    $g = dd_gst_breakup($total, $sellerState, (string) ($o['state'] ?? ''));
    $supply = $g['intra'] === true ? 'Intra-state' : ($g['intra'] === false ? 'Inter-state' : 'Place of supply missing');
    $rows[] = [
      $o['invoice_no'] ?? '', $o['id'], substr((string) $o['created_at'], 0, 10),
      $o['customer_name'], $o['state'] ?? '', $supply,
      $g['taxable'], $g['cgst'], $g['sgst'], $g['igst'], $g['unattributed'], $g['totalTax'], $total, $o['status'],
    ];
  }
  return dd_send_csv('gst-report-' . $from . '-to-' . $to . '.csv',
    ['Invoice', 'Order', 'Date', 'Customer', 'Place of supply', 'Supply type',
     'Taxable value (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'GST (place unknown) (₹)', 'Total GST (₹)', 'Invoice total (₹)', 'Status'], $rows);
}

/* ═══════════════════════════════════════════════════════════
   ERP milestone 2 — shipment tracking & return/refund requests
   ═══════════════════════════════════════════════════════════ */

/** "via Delhivery · tracking #DEL123 · expected 2026-11-12" (empty string when nothing set) */
function dd_tracking_summary(array $o): string {
  $bits = [];
  $courier = trim((string) ($o['courier'] ?? ''));
  $tracking = trim((string) ($o['tracking_number'] ?? ''));
  $eta = trim((string) ($o['expected_delivery'] ?? ''));
  if ($courier !== '') $bits[] = 'via ' . $courier;
  if ($tracking !== '') $bits[] = 'tracking #' . $tracking;
  if ($eta !== '') $bits[] = 'expected by ' . $eta;
  return implode(' · ', $bits);
}

function dd_map_request(array $r): array {
  return [
    'id' => (int) $r['id'],
    'orderId' => (int) $r['order_id'],
    'type' => (string) $r['type'],
    'reason' => (string) $r['reason'],
    'details' => (string) $r['details'],
    'status' => (string) $r['status'],
    'adminNote' => $r['admin_note'] ?? null,
    'customer' => $r['customer'] ?? null,
    'createdAt' => (string) $r['created_at'],
    'updatedAt' => $r['updated_at'] ?? null,
  ];
}
function dd_requests_for(int $orderId): array {
  $stmt = dd_db()->prepare('SELECT r.*, u.name AS customer FROM order_requests r LEFT JOIN users u ON u.id = r.user_id WHERE r.order_id = ? ORDER BY r.id DESC');
  $stmt->execute([$orderId]);
  return array_map('dd_map_request', $stmt->fetchAll());
}

/* ── shipment: set courier / tracking / expected delivery; optionally flips pending|confirmed → shipped ── */
function route_admin_order_shipment(array $req, string $id): array {
  $admin = dd_require_admin($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Order not found');
  $b = dd_body_json($req);

  $courier = mb_substr(trim((string) ($b['courier'] ?? '')), 0, 80);
  $tracking = mb_substr(trim((string) ($b['tracking_number'] ?? '')), 0, 80);
  if ($tracking !== '' && !preg_match('/^[A-Za-z0-9._\/-]{3,80}$/', $tracking)) {
    throw new DdHttpError(400, 'Tracking number may only contain letters, digits, dots, slashes and dashes');
  }
  $url = mb_substr(trim((string) ($b['tracking_url'] ?? '')), 0, 255);
  if ($url !== '') {
    $parts = parse_url($url);
    if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https' || empty($parts['host'])) {
      throw new DdHttpError(400, 'Tracking link must be a full https:// URL');
    }
  }
  $eta = trim((string) ($b['expected_delivery'] ?? ''));
  if ($eta !== '') {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $eta)
        || !checkdate((int) substr($eta, 5, 2), (int) substr($eta, 8, 2), (int) substr($eta, 0, 4))) {
      throw new DdHttpError(400, 'Expected delivery must be a valid date (YYYY-MM-DD)');
    }
  }
  if ($courier === '' && $tracking === '' && $url === '' && $eta === '') {
    throw new DdHttpError(400, 'Add a courier, tracking number, link or expected date — otherwise there is nothing to save');
  }

  $db = dd_db();
  $db->beginTransaction();
  try {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? FOR UPDATE');
    $stmt->execute([(int) $id]);
    $order = $stmt->fetch();
    if (!$order) throw new DdHttpError(404, 'Order not found');
    $status = (string) $order['status'];
    if (in_array($status, ['cancelled', 'refunded'], true)) {
      throw new DdHttpError(409, 'This order is closed (cancelled or refunded) — tracking cannot be updated');
    }
    $shipNow = ($status === 'pending' || $status === 'confirmed');
    $db->prepare('UPDATE orders SET courier = ?, tracking_number = ?, tracking_url = ?, expected_delivery = ?,
                        shipped_at = IF(?, COALESCE(shipped_at, UTC_TIMESTAMP()), shipped_at),
                        status = ? WHERE id = ?')
      ->execute([$courier !== '' ? $courier : null,
                 $tracking !== '' ? $tracking : null,
                 $url !== '' ? $url : null,
                 $eta !== '' ? $eta : null,
                 $shipNow ? 1 : 0,
                 $shipNow ? 'shipped' : $status,
                 $order['id']]);
    $summary = dd_tracking_summary(['courier' => $courier, 'tracking_number' => $tracking, 'expected_delivery' => $eta]);
    if ($shipNow) {
      dd_add_event((int) $order['id'], 'status', $status, 'shipped', $summary !== '' ? $summary : null, 'customer', (int) $admin['id']);
    } else {
      dd_add_event((int) $order['id'], 'note', null, null, 'Tracking updated' . ($summary !== '' ? ': ' . $summary : ''), 'customer', (int) $admin['id']);
    }
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  if ($shipNow) dd_notify_status_change((int) $id, 'shipped');
  return dd_json_out(['ok' => true, 'status' => $shipNow ? 'shipped' : $status]);
}

/* ── customer: open a return/refund request on a delivered order ── */
function route_my_order_requests_post(array $req, string $id): array {
  $u = dd_require_auth($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Order not found');
  $b = dd_body_json($req);

  $type = (string) ($b['type'] ?? 'return');
  if (!in_array($type, ['return', 'refund', 'exchange', 'other'], true)) throw new DdHttpError(400, 'Invalid request type');
  $reason = mb_substr(trim((string) ($b['reason'] ?? '')), 0, 120);
  if ($reason === '') throw new DdHttpError(400, 'Please pick a reason');
  $details = mb_substr(trim((string) ($b['details'] ?? '')), 0, 1000);

  $db = dd_db();
  $db->beginTransaction();
  try {
    $stmt = $db->prepare('SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE');
    $stmt->execute([(int) $id, (int) $u['id']]);
    $order = $stmt->fetch();
    if (!$order) throw new DdHttpError(404, 'Order not found');
    if ((string) $order['status'] !== 'delivered') {
      throw new DdHttpError(409, 'Returns and refunds open once the order is delivered');
    }
    $openStmt = $db->prepare("SELECT COUNT(*) FROM order_requests WHERE order_id = ? AND status = 'open'");
    $openStmt->execute([(int) $id]);
    if ((int) $openStmt->fetchColumn() >= 2) {
      throw new DdHttpError(409, 'You already have an open request for this order — we will get back to you shortly');
    }
    $db->prepare('INSERT INTO order_requests (order_id, user_id, type, reason, details) VALUES (?,?,?,?,?)')
      ->execute([(int) $id, (int) $u['id'], $type, $reason, $details]);
    dd_add_event((int) $id, 'note', null, null, 'Customer requested ' . $type . ' — ' . $reason, 'customer', (int) $u['id']);
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  dd_notify_new_request((int) $id, ['type' => $type, 'reason' => $reason, 'details' => $details, 'customer' => $u['name'] ?? '']);
  return dd_json_out(['ok' => true, 'requests' => dd_requests_for((int) $id)], 201);
}

/* ── admin: approve / reject / resolve a customer request ── */
function route_admin_request_decide(array $req, string $id): array {
  $admin = dd_require_admin($req);
  if (!ctype_digit($id)) throw new DdHttpError(404, 'Request not found');
  $b = dd_body_json($req);
  $decision = (string) ($b['status'] ?? '');
  if (!in_array($decision, ['approved', 'rejected', 'resolved'], true)) {
    throw new DdHttpError(400, 'Invalid decision');
  }
  $note = mb_substr(trim((string) ($b['admin_note'] ?? '')), 0, 500);

  $db = dd_db();
  $db->beginTransaction();
  $orderId = 0;
  $request = null;
  try {
    $stmt = $db->prepare('SELECT * FROM order_requests WHERE id = ? FOR UPDATE');
    $stmt->execute([(int) $id]);
    $request = $stmt->fetch();
    if (!$request) throw new DdHttpError(404, 'Request not found');
    if ((string) $request['status'] !== 'open') {
      throw new DdHttpError(409, 'This request was already ' . $request['status']);
    }
    $orderId = (int) $request['order_id'];
    $db->prepare('UPDATE order_requests SET status = ?, admin_note = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?')
      ->execute([$decision, $note !== '' ? $note : null, (int) $id]);
    $body = 'Your ' . $request['type'] . ' request was ' . $decision . ($note !== '' ? ' — ' . $note : '');
    dd_add_event($orderId, 'note', null, null, $body, 'customer', (int) $admin['id']);
    $db->commit();
  } catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
  }
  dd_notify_request_decision($orderId, $request, $decision, $note);
  return dd_json_out(['ok' => true, 'requests' => dd_requests_for($orderId)]);
}

/* ── request emails (best-effort, never block) ── */
function dd_notify_new_request(int $orderId, array $r): void {
  if (!dd_erp_bool('email_admin_new_order', true)) return;
  $adminTo = dd_site_get('site_email');
  if ($adminTo === '') return;
  $o = dd_fetch_order_full($orderId);
  if (!$o) return;
  $brand = dd_site_get('site_brand') ?: 'Store';
  $esc = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
  $body = '<p style="font-size:13px">Customer requested <strong>' . $esc((string) $r['type']) . '</strong> on order #' . $orderId . '</p>'
    . '<p style="font-size:13px;margin:4px 0"><strong>Reason:</strong> ' . $esc((string) $r['reason']) . '</p>'
    . ($r['details'] ? '<p style="font-size:13px;margin:4px 0"><strong>Details:</strong> ' . $esc((string) $r['details']) . '</p>' : '')
    . '<p style="font-size:13px;margin:4px 0"><strong>From:</strong> ' . $esc((string) ($o['customer_name'] ?? '')) . ' · ' . $esc((string) ($o['phone'] ?? '')) . '</p>'
    . '<p style="font-size:12px;color:#666">Approve or reject it from the order notes panel in Admin → Orders.</p>';
  dd_try_email($adminTo, 'Request: ' . $r['type'] . ' — order #' . $orderId, dd_email_layout($brand, 'New customer request', $body));
}
function dd_notify_request_decision(int $orderId, ?array $request, string $decision, string $note): void {
  if (!dd_erp_bool('email_customer_updates', true)) return;
  if (!$request) return;
  $o = dd_fetch_order_full($orderId);
  if (!$o) return;
  $to = trim((string) (($o['user_email'] ?? '') ?: ($o['guest_email'] ?? '')));
  if ($to === '') return;
  $brand = dd_site_get('site_brand') ?: 'Store';
  $esc = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
  $line = 'Your ' . $esc((string) $request['type']) . ' request for order #' . $orderId . ' was <strong>' . $esc($decision) . '</strong>.'
    . ($note !== '' ? '<br>Note from the store: ' . $esc($note) : '');
  if ($decision === 'approved') {
    $line .= '<br><br>If a refund is due, it will be issued to the original payment method (or collected/returned with the courier for COD). Please keep the item(s) with their packaging for pickup or hand-over.';
  }
  dd_try_email($to, 'Update on your request — order #' . $orderId, dd_email_layout($brand, 'Request ' . $decision, '<p style="font-size:13px">' . $line . '</p>'));
}

/* ═══════════════════════════════════════════════════════════
   ERP milestone 3 — abandoned-cart recovery & guest order tracking
   ═══════════════════════════════════════════════════════════ */

function dd_cart_token_ok(string $token): bool {
  return (bool) preg_match('/^[a-f0-9]{32,64}$/', $token);
}
function dd_clean_cart_items($raw): array {
  if (!is_array($raw)) return [];
  $out = [];
  foreach (array_slice($raw, 0, 50) as $line) {
    if (!is_array($line)) continue;
    $id = trim((string) ($line['id'] ?? ''));
    $qty = (int) ($line['qty'] ?? 1);
    $qty = max(1, min(50, $qty > 0 ? $qty : 1));
    if ($id === '' || strlen($id) > 64) continue;
    $out[] = ['id' => $id, 'qty' => $qty];
  }
  return $out;
}
/** Resolve a stored [{id,qty}] cart against live products; drops stale lines, returns [items, total]. */
function dd_cart_resolve(array $lines): array {
  if (!$lines) return [[], 0];
  $ids = array_map(fn ($l) => $l['id'], $lines);
  $in = implode(',', array_fill(0, count($ids), '?'));
  $stmt = dd_db()->prepare("SELECT id, name, price, img, stock FROM products WHERE id IN ($in) AND active = 1");
  $stmt->execute($ids);
  $byId = [];
  foreach ($stmt->fetchAll() as $p) $byId[(string) $p['id']] = $p;
  $items = [];
  $total = 0;
  foreach ($lines as $l) {
    $p = $byId[$l['id']] ?? null;
    if (!$p) continue;
    $total += (int) $p['price'] * $l['qty'];
    $items[] = ['id' => $l['id'], 'qty' => $l['qty'], 'name' => (string) $p['name'],
                'price' => (int) $p['price'], 'img' => (string) $p['img'], 'stock' => (int) $p['stock']];
  }
  return [$items, $total];
}

/**
 * POST /cart/abandon — public, throttled. Stores (or refreshes) the caller's
 * cart under a client-generated token so the cron can remind them later.
 * Never stores anything without a way to reach the person (account or email).
 */
function route_cart_abandon(array $req): array {
  if (dd_throttle_attempt('cart|' . dd_ip($req))) throw new DdHttpError(429, 'Too many requests');
  $b = dd_body_json($req);
  $token = strtolower(trim((string) ($b['token'] ?? '')));
  if (!dd_cart_token_ok($token)) throw new DdHttpError(400, 'Invalid cart token');
  $me = dd_current_user($req);
  $email = strtolower(trim((string) ($b['email'] ?? '')));
  if ($email !== '' && !dd_email_ok($email)) throw new DdHttpError(400, "That email doesn't look right");
  if (mb_strlen($email) > 190) $email = '';
  $phone = mb_substr(trim((string) ($b['phone'] ?? '')), 0, 32);
  if ($me) $email = strtolower((string) ($me['email'] ?? '')); // account email always wins

  $lines = dd_clean_cart_items($b['items'] ?? []);
  $db = dd_db();

  if (count($lines) === 0) { // empty cart clears the snapshot entirely
    $db->prepare('DELETE FROM abandoned_carts WHERE token = ?')->execute([$token]);
    return dd_json_out(['ok' => true, 'stored' => false]);
  }
  [$items, $total] = dd_cart_resolve($lines);
  if (!$items) {
    $db->prepare('DELETE FROM abandoned_carts WHERE token = ?')->execute([$token]);
    return dd_json_out(['ok' => true, 'stored' => false]);
  }
  if (!$me && $email === '' && $phone === '') {
    // no channel to reach them — nothing worth storing; drop any old snapshot
    $db->prepare('DELETE FROM abandoned_carts WHERE token = ?')->execute([$token]);
    return dd_json_out(['ok' => true, 'stored' => false]);
  }
  $db->prepare("INSERT INTO abandoned_carts (user_id, email, phone, token, items_json, total, updated_at)
      VALUES (?,?,?,?,?,?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        user_id = COALESCE(VALUES(user_id), user_id),
        email = COALESCE(VALUES(email), email),
        phone = IF(VALUES(phone) <> '', VALUES(phone), phone),
        items_json = VALUES(items_json),
        total = VALUES(total),
        updated_at = UTC_TIMESTAMP(),
        reminded_at = IF(items_json <> VALUES(items_json), NULL, reminded_at),
        recovered_order_id = IF(items_json <> VALUES(items_json), NULL, recovered_order_id)")
    ->execute([$me ? (int) $me['id'] : null, $email !== '' ? $email : null, $phone, $token,
               json_encode(array_map(fn ($i) => ['id' => $i['id'], 'qty' => $i['qty']], $items), JSON_UNESCAPED_UNICODE), $total]);
  return dd_json_out(['ok' => true, 'stored' => true]);
}

/** GET /cart/restore?t=<token> — current product data for a saved cart. */
function route_cart_restore(array $req): array {
  if (dd_throttle_attempt('restore|' . dd_ip($req))) throw new DdHttpError(429, 'Too many requests');
  $token = strtolower(trim((string) (($req['query'] ?? [])['t'] ?? '')));
  if (!dd_cart_token_ok($token)) throw new DdHttpError(400, 'Invalid restore link');
  $stmt = dd_db()->prepare('SELECT items_json FROM abandoned_carts WHERE token = ?');
  $stmt->execute([$token]);
  $row = $stmt->fetch();
  if (!$row) throw new DdHttpError(404, 'That saved cart is no longer available');
  [$items] = dd_cart_resolve(dd_clean_cart_items(dd_parse_items((string) $row['items_json'])));
  if (!$items) throw new DdHttpError(410, 'None of the items in that saved cart are available any more');
  return dd_json_out(['items' => $items]);
}

/**
 * POST /track — public, hard-throttled guest "where is my order" lookup.
 * Requires order number + the phone or email used at checkout; a generic 404
 * is returned for both "no such order" and "contact mismatch" so order ids
 * can't be enumerated. Never returns address, notes or payment details.
 */
function route_track_order(array $req): array {
  if (dd_throttle_attempt('track|' . dd_ip($req))) throw new DdHttpError(429, 'Too many attempts — please try again in a few minutes');
  $b = dd_body_json($req);
  $idRaw = trim((string) ($b['order_id'] ?? ''));
  if (!ctype_digit($idRaw)) throw new DdHttpError(400, 'Enter your order number (numbers only)');
  $orderId = (int) $idRaw;
  $contact = mb_substr(strtolower(trim((string) ($b['contact'] ?? ''))), 0, 190);
  if ($contact === '') throw new DdHttpError(400, 'Enter the phone number or email used on the order');
  $contactPhone = preg_replace('/\\D+/', '', $contact) ?? '';
  $notFound = new DdHttpError(404, 'We couldn’t find an order with that number and contact detail');

  $stmt = dd_db()->prepare('SELECT o.id, o.status, o.delivery_method, o.payment, o.total, o.courier,
      o.tracking_number, o.tracking_url, o.expected_delivery, o.shipped_at, o.created_at, o.items_json,
      o.phone, o.guest_email, u.email AS user_email
    FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?');
  $stmt->execute([$orderId]);
  $o = $stmt->fetch();
  $matched = false;
  if ($o) {
    $storedPhone = preg_replace('/\\D+/', '', (string) ($o['phone'] ?? '')) ?? '';
    if (strlen($contactPhone) >= 10 && strlen($storedPhone) >= 10
        && substr($contactPhone, -10) === substr($storedPhone, -10)) $matched = true;
    $acctEmail = strtolower(trim((string) (($o['user_email'] ?? '') ?: ($o['guest_email'] ?? ''))));
    if (!$matched && $acctEmail !== '' && $contact === $acctEmail) $matched = true;
  }
  if (!$o || !$matched) throw $notFound;
  $items = dd_parse_items($o['items_json'] ?? null);
  $qty = 0;
  foreach ($items as $it) { if (is_array($it)) $qty += max(1, (int) ($it['qty'] ?? 1)); }
  return dd_json_out(['order' => [
    'id' => (int) $o['id'], 'status' => (string) $o['status'],
    'delivery_method' => (string) $o['delivery_method'], 'total' => (int) $o['total'],
    'created_at' => (string) $o['created_at'], 'items_count' => $qty,
    'courier' => $o['courier'] ?? null, 'tracking_number' => $o['tracking_number'] ?? null,
    'tracking_url' => $o['tracking_url'] ?? null, 'expected_delivery' => $o['expected_delivery'] ?? null,
    'shipped_at' => $o['shipped_at'] ?? null,
  ]]);
}

/**
 * Build the reminder email for an abandoned cart. Returns false when the
 * cart resolves to nothing (items all gone) — caller skips and leaves
 * reminded_at NULL so a later run can reconsider (or the row is stale).
 */
function dd_abandoned_cart_email(array $row, string $restoreUrl): ?array {
  [$items, $total] = dd_cart_resolve(dd_clean_cart_items(dd_parse_items((string) $row['items_json'])));
  if (!$items) return null;
  $brand = dd_site_get('site_brand') ?: 'Store';
  $esc = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
  $rows = '';
  foreach ($items as $it) {
    $rows .= '<tr><td style="padding:4px 8px;border-bottom:1px solid #f0ece1">' . $esc($it['name']) . ' × ' . (int) $it['qty'] . '</td>'
      . '<td style="padding:4px 8px;border-bottom:1px solid #f0ece1;text-align:right">₹' . number_format($it['price'] * $it['qty']) . '</td></tr>';
  }
  $body = '<p style="font-size:13px">You left a few things in your cart — they’re still available and reserved just for you:</p>'
    . '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0">' . $rows . '</table>'
    . '<p style="font-size:15px;margin:8px 0"><strong>Total: ₹' . number_format($total) . '</strong></p>'
    . '<p style="font-size:13px"><a href="' . $esc($restoreUrl) . '" style="display:inline-block;background:#141414;color:#FAF6EF;padding:11px 22px;border-radius:999px;text-decoration:none;font-weight:700">Complete my order →</a></p>'
    . '<p style="font-size:11px;color:#888;margin-top:10px">Only one reminder is sent per cart — if this isn’t for you, just ignore it.</p>';
  return ['subject' => 'Your cart is waiting for you', 'html' => dd_email_layout($brand, 'Still thinking it over?', $body)];
}
