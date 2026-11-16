<?php
/**
 * Scheduled jobs — CLI only (never through the web).
 *
 *   php api/cron.php abandoned-carts [--dry-run]
 *
 * abandoned-carts: emails people who left a non-empty cart behind, at most one
 * reminder per cart, after DD_CART_REMIND_HOURS hours of inactivity
 * (default 4), batch-limited by DD_CART_REMIND_BATCH (default 25).
 * Requires DD_SITE_URL (e.g. https://store.example.com) to build restore links;
 * without it the job refuses to send rather than mail a broken link.
 * Only carts with a reachable email are mailed (account email, or the guest
 * email left at checkout). Phone-only carts are left alone — there is no SMS
 * provider configured, and we don't fake one.
 * The email_customer_updates / cart_reminder_emails ERP toggles are honoured.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
  http_response_code(403);
  exit("This script is command-line only.\n");
}

define('DD_CLI_TEST', true);           // load the API without serving HTTP
require_once __DIR__ . '/index.php';

$job = $argv[1] ?? '';
$dryRun = in_array('--dry-run', array_slice($argv, 2), true);

if ($job !== 'abandoned-carts') {
  fwrite(STDERR, "Usage: php api/cron.php abandoned-carts [--dry-run]\n");
  exit(64);
}

if (!dd_erp_bool('email_customer_updates', true) || !dd_erp_bool('cart_reminder_emails', true)) {
  echo "[abandoned-carts] cart reminder emails are disabled in ERP settings — nothing to do.\n";
  exit(0);
}

$siteUrl = rtrim(trim((string) (getenv('DD_SITE_URL') ?: '')), '/');
if ($siteUrl === '' || !preg_match('#^https?://#i', $siteUrl)) {
  fwrite(STDERR, "[abandoned-carts] DD_SITE_URL is not set (e.g. DD_SITE_URL=https://store.example.com). Refusing to send restore links we can't guarantee.\n");
  exit(78);
}
$smtp = dd_smtp_settings();
if (!$dryRun && (empty($smtp['email']) || empty($smtp['password']))) {
  fwrite(STDERR, "[abandoned-carts] Gmail SMTP is not configured — nothing can be sent. Configure it in Setup first (or use --dry-run).\n");
  exit(78);
}

$hours = filter_var(getenv('DD_CART_REMIND_HOURS') ?: '4', FILTER_VALIDATE_INT);
$hours = ($hours === false || $hours < 1) ? 4 : $hours;
$batch = filter_var(getenv('DD_CART_REMIND_BATCH') ?: '25', FILTER_VALIDATE_INT);
$batch = ($batch === false || $batch < 1) ? 25 : $batch;

try {
  $cutoff = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify("-{$hours} hours")->format('Y-m-d H:i:s');

  $stmt = dd_db()->prepare(
  "SELECT ac.*, COALESCE(u.email, ac.email) AS recipient
   FROM abandoned_carts ac
   LEFT JOIN users u ON u.id = ac.user_id
   WHERE ac.reminded_at IS NULL
     AND ac.recovered_order_id IS NULL
     AND ac.updated_at <= ?
     AND COALESCE(u.email, ac.email) IS NOT NULL
     AND COALESCE(u.email, ac.email) <> ''
   ORDER BY ac.updated_at ASC
   LIMIT $batch"
);
  $stmt->execute([$cutoff]);
  $rows = $stmt->fetchAll();
} catch (Throwable $e) {
  fwrite(STDERR, "[abandoned-carts] database error: " . $e->getMessage() . "\n");
  exit(70);
}

echo '[abandoned-carts] ' . count($rows) . " cart(s) due for a reminder (idle ≥ {$hours}h)" . ($dryRun ? " — dry run, nothing will be sent\n" : "\n");

$sent = 0;
$skipped = 0;
foreach ($rows as $row) {
  $id = (int) $row['id'];
  $recipient = strtolower(trim((string) $row['recipient']));
  $restoreUrl = $siteUrl . '/store.html?restore_cart=' . rawurlencode((string) $row['token']);
  try {
    $mail = dd_abandoned_cart_email($row, $restoreUrl);
    if ($mail === null) {
      // every item is gone — mark it reminded so we don't reconsider forever
      dd_db()->prepare('UPDATE abandoned_carts SET reminded_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$id]);
      echo "[abandoned-carts] #{$id} skipped — items no longer available\n";
      $skipped++;
      continue;
    }
    if ($dryRun) {
      echo "[abandoned-carts] would send #{$id} → {$recipient} (total ₹" . number_format((int) $row['total']) . ")\n";
      $sent++;
      continue;
    }
    dd_send_email($recipient, $mail['subject'], $mail['html']);
    dd_db()->prepare('UPDATE abandoned_carts SET reminded_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$id]);
    echo "[abandoned-carts] sent #{$id} → {$recipient}\n";
    $sent++;
  } catch (Throwable $e) {
    // leave reminded_at NULL so the next run retries
    error_log('[cron-abandoned] #' . $id . ' failed: ' . $e->getMessage());
    echo "[abandoned-carts] #{$id} FAILED — will retry next run (" . $e->getMessage() . ")\n";
    $skipped++;
  }
}

/* housekeeping: drop recovered/reminded carts older than 90 days */
if (!$dryRun) {
  $gone = dd_db()->prepare("DELETE FROM abandoned_carts
    WHERE updated_at < (UTC_TIMESTAMP() - INTERVAL 90 DAY)
      AND (recovered_order_id IS NOT NULL OR reminded_at IS NOT NULL)");
  $gone->execute();
  if ($gone->rowCount() > 0) echo '[abandoned-carts] purged ' . $gone->rowCount() . " stale cart snapshot(s)\n";
}

echo "[abandoned-carts] done — sent {$sent}, skipped {$skipped}\n";
exit(0);
