<?php
declare(strict_types=1);

$dataDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'mysite-production-smoke-' . bin2hex(random_bytes(8));
putenv('DD_DATA_DIR=' . $dataDir);
putenv('DD_AUTH_MAX_ATTEMPTS=8');
putenv('DD_AUTH_WINDOW_SECONDS=300');
require_once __DIR__ . '/../api/index.php';

$checks = 0;
$check = static function (bool $condition, string $message) use (&$checks): void {
  if (!$condition) throw new RuntimeException($message);
  $checks++;
};

try {
  dd_write_install(['smoke' => 'isolated']);
  $check((dd_read_install()['smoke'] ?? null) === 'isolated', 'Installation settings should round-trip through the locked private file.');

  for ($i = 0; $i < 8; $i++) {
    $check(!dd_throttle_attempt('192.0.2.10|account@example.test'), 'Attempts under the configured limit should be allowed.');
  }
  $check(dd_throttle_attempt('192.0.2.10|account@example.test'), 'The limit should block the next attempt.');
  $savedThrottle = json_decode((string) file_get_contents(dd_throttle_file()), true);
  $savedKeys = array_keys($savedThrottle ?? []);
  $check(count($savedKeys) === 1 && preg_match('/^[a-f0-9]{64}$/', $savedKeys[0]) === 1, 'Throttle storage must not contain raw IP/email keys.');
  dd_clear_attempt('192.0.2.10|account@example.test');
  $check(!dd_throttle_attempt('192.0.2.10|account@example.test'), 'A successful login should clear its throttle bucket.');

  $crossOrigin = dd_handle([
    'method' => 'POST', 'subpath' => '/auth/register', 'raw' => '{}', 'ip' => '192.0.2.10', 'https' => true,
    'headers' => ['host' => 'shop.example.test', 'origin' => 'https://attacker.example.test'],
  ]);
  $check($crossOrigin['status'] === 403, 'Cross-origin state-changing API requests must be rejected.');

  $invalidJson = dd_handle([
    'method' => 'POST', 'subpath' => '/auth/register', 'raw' => '{invalid', 'ip' => '192.0.2.10', 'https' => true,
    'headers' => ['host' => 'shop.example.test', 'origin' => 'https://shop.example.test'],
  ]);
  $check($invalidJson['status'] === 400, 'Malformed JSON must return a client error.');

  for ($i = 0; $i < 8; $i++) {
    $registration = dd_handle([
      'method' => 'POST', 'subpath' => '/auth/register', 'raw' => '{}', 'ip' => '192.0.2.20', 'https' => false,
      'headers' => ['host' => 'shop.example.test', 'origin' => 'http://shop.example.test'],
    ]);
    $check($registration['status'] === 400, 'Registration attempts under the limit should reach validation.');
  }
  $blockedRegistration = dd_handle([
    'method' => 'POST', 'subpath' => '/auth/register', 'raw' => '{}', 'ip' => '192.0.2.20', 'https' => false,
    'headers' => ['host' => 'shop.example.test', 'origin' => 'http://shop.example.test'],
  ]);
  $check($blockedRegistration['status'] === 429, 'Registration should be rate limited by client IP.');

  for ($i = 0; $i < 8; $i++) {
    $otpRequest = dd_handle([
      'method' => 'POST', 'subpath' => '/auth/otp/request', 'raw' => json_encode(['identifier' => 'user' . $i]),
      'ip' => '192.0.2.30', 'https' => false,
      'headers' => ['host' => 'shop.example.test', 'origin' => 'http://shop.example.test'],
    ]);
    $check($otpRequest['status'] === 503, 'OTP delivery must fail without database and SMTP setup.');
  }
  $blockedOtpRequest = dd_handle([
    'method' => 'POST', 'subpath' => '/auth/otp/request', 'raw' => '{"identifier":"another-user"}',
    'ip' => '192.0.2.30', 'https' => false,
    'headers' => ['host' => 'shop.example.test', 'origin' => 'http://shop.example.test'],
  ]);
  $check($blockedOtpRequest['status'] === 429, 'OTP delivery must also be rate limited by client IP across accounts.');

  $check(dd_valid_host_header('localhost') && dd_valid_host_header('shop.example.test:8443'), 'Valid hosts with optional ports should be accepted.');
  $check(!dd_valid_host_header('shop.example.test:65536'), 'Out-of-range host ports must be rejected.');
  $check(dd_base_url(['https' => true, 'headers' => ['host' => 'evil.example/"><script>']]) === 'https://localhost', 'Host headers must be validated before URL generation.');
  $check(dd_base_url(['https' => false, 'headers' => ['host' => 'localhost:8765']]) === 'http://localhost:8765', 'Valid deployment hosts should be retained in generated URLs.');
  $check(isset(dd_security_headers(true)['Strict-Transport-Security']), 'HTTPS responses must advertise HSTS.');
  $check(!isset(dd_security_headers(false)['Strict-Transport-Security']), 'HTTP/local responses must not advertise HSTS.');

  [$periodFrom, $periodTo, $periodDays] = dd_report_period([], '2025-01-30');
  $check($periodFrom === '2025-01-01' && $periodTo === '2025-01-30' && $periodDays === 30,
    'Default reports should cover the last 30 calendar days, including today.');
  [, , $customDays] = dd_report_period(['from' => '2025-02-01', 'to' => '2025-02-28'], '2025-03-01');
  $check($customDays === 28, 'Leap-safe custom report ranges should include both endpoints.');
  foreach ([
    ['from' => '2025-02-30', 'to' => '2025-03-01'],
    ['from' => '2025-03-02', 'to' => '2025-03-01'],
    ['from' => '2025-01-01', 'to' => '2025-04-01'],
  ] as $invalidPeriod) {
    try {
      dd_report_period($invalidPeriod, '2025-04-01');
      $check(false, 'Invalid or overly long report ranges must be rejected.');
    } catch (DdHttpError $e) {
      $check($e->status === 400, 'Invalid report ranges should return a client error.');
    }
  }

  $billLines = dd_invoice_item_totals([
    ['id' => 'mug', 'name' => 'Mug', 'category' => 'Home', 'price' => 349, 'qty' => 2],
    ['id' => 'lamp', 'name' => 'Lamp', 'price' => 899, 'qty' => 1],
  ]);
  $check($billLines['subtotal'] === 1597
    && $billLines['items'][0]['lineTotal'] === 698
    && $billLines['items'][0]['category'] === 'Home',
    'Order bill line totals and stored category snapshots should be calculated exactly.');
  $invoiceToken = str_repeat('a', 64);
  $check(dd_invoice_token_matches(hash('sha256', $invoiceToken), $invoiceToken),
    'A guest order bill token should match its stored hash.');
  $check(!dd_invoice_token_matches(hash('sha256', $invoiceToken), str_repeat('b', 64))
    && !dd_invoice_token_matches(hash('sha256', $invoiceToken), 'invalid'),
    'Invalid guest order bill tokens must not grant access.');

  $originalHttps = $_SERVER['HTTPS'] ?? null;
  $originalPort = $_SERVER['SERVER_PORT'] ?? null;
  $originalForwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null;
  unset($_SERVER['HTTPS'], $_SERVER['SERVER_PORT']);
  $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
  putenv('DD_TRUST_PROXY=0');
  $check(!dd_request_is_https(), 'Forwarded HTTPS must not be trusted by default.');
  putenv('DD_TRUST_PROXY=1');
  $check(dd_request_is_https(), 'Forwarded HTTPS should work when an operator explicitly trusts the proxy.');
  putenv('DD_TRUST_PROXY=0');
  $_SERVER['HTTPS'] = 'on';
  $check(dd_request_is_https(), 'Direct HTTPS must be detected without proxy settings.');
  if ($originalHttps === null) unset($_SERVER['HTTPS']); else $_SERVER['HTTPS'] = $originalHttps;
  if ($originalPort === null) unset($_SERVER['SERVER_PORT']); else $_SERVER['SERVER_PORT'] = $originalPort;
  if ($originalForwardedProto === null) unset($_SERVER['HTTP_X_FORWARDED_PROTO']); else $_SERVER['HTTP_X_FORWARDED_PROTO'] = $originalForwardedProto;

  file_put_contents(dd_throttle_file(), '{invalid');
  try {
    dd_throttle_attempt('broken-store');
    $check(false, 'Corrupt throttle state must fail closed.');
  } catch (RuntimeException $e) {
    $check(str_contains($e->getMessage(), 'invalid JSON'), 'Throttle storage errors should be explicit.');
  }
  file_put_contents($dataDir . DIRECTORY_SEPARATOR . 'install.json', '{invalid');
  try {
    dd_read_install();
    $check(false, 'Corrupt installation settings must fail explicitly.');
  } catch (RuntimeException $e) {
    $check(str_contains($e->getMessage(), 'invalid JSON'), 'Installation settings errors should be explicit.');
  }
  $originalErrorLog = ini_get('error_log');
  ini_set('error_log', $dataDir . DIRECTORY_SEPARATOR . 'test-errors.log');
  try {
    $brokenInstallResponse = dd_handle([
      'method' => 'GET', 'subpath' => '/me', 'raw' => '', 'ip' => '192.0.2.10', 'https' => true,
      'headers' => ['host' => 'shop.example.test'],
    ]);
  } finally {
    ini_set('error_log', (string) $originalErrorLog);
  }
  $check($brokenInstallResponse['status'] === 500
    && (json_decode($brokenInstallResponse['body'], true)['error'] ?? '') === 'Something went wrong',
    'API bootstrap failures should be logged but not expose filesystem details.');
} finally {
  foreach ([dd_throttle_file(), $dataDir . DIRECTORY_SEPARATOR . '.htaccess', $dataDir . DIRECTORY_SEPARATOR . 'install.json', $dataDir . DIRECTORY_SEPARATOR . 'test-errors.log'] as $file) {
    if (is_file($file)) unlink($file);
  }
  if (is_dir($dataDir)) rmdir($dataDir);
}

echo "Production smoke checks passed: {$checks}\n";
