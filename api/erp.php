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
  return dd_json_out(['events' => dd_events_for((int) $id, false)]);
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
    'delivered' => ['Order #%d delivered', 'Your order was marked as delivered. Enjoy, and thank you for shopping with us!'],
    'cancelled' => ['Order #%d cancelled', 'Your order was cancelled. If this is unexpected, please contact us right away.'],
    'refunded'  => ['Order #%d refunded', 'Your order was refunded. Depending on payment mode, the amount returns to the original payment method or is adjusted with the courier.'],
  ];
  if (!isset($map[$status])) return;
  [$subj, $line] = $map[$status];
  $items = dd_parse_items($o['items_json'] ?? null);
  dd_try_email($to, sprintf($subj, $orderId),
    dd_email_layout($brand, sprintf($subj, $orderId),
      '<p style="font-size:13px">' . htmlspecialchars($line, ENT_QUOTES, 'UTF-8') . '</p>' . dd_order_summary_html($o, $items)));
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
