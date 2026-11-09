<?php
/** /assets/js/*.js — placeholder substitution so runtime-built links follow the wizard. */
declare(strict_types=1);
require_once __DIR__ . '/api/core.php';

function dd_render_js(string $file): array {
  dd_boot_seed(); // idempotent: substitutions read settings from the DB
  if (!preg_match('/^[\w.-]+\.js$/', $file)) return ['status' => 404, 'headers' => [], 'body' => 'Not found', 'content_type' => 'text/plain; charset=utf-8'];
  $full = DD_ROOT . '/assets/js/' . $file;
  if (!is_file($full)) return ['status' => 404, 'headers' => [], 'body' => 'Not found', 'content_type' => 'text/plain; charset=utf-8'];
  $src = (string) file_get_contents($full);
  $body = dd_contact_substitutions(str_replace('__BASE_PATH__', dd_base_path(), $src));
  return ['status' => 200, 'headers' => ['Cache-Control' => 'no-cache'],
          'body' => $body, 'content_type' => 'application/javascript; charset=utf-8'];
}

function dd_js_main(): void {
  $resp = dd_render_js((string) ($_GET['file'] ?? ''));
  http_response_code($resp['status']);
  header('X-Content-Type-Options: nosniff');
  foreach (($resp['headers'] ?? []) as $n => $v) header("$n: $v");
  header('Content-Type: ' . $resp['content_type']);
  echo $resp['body'];
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__ && !defined('DD_CLI_TEST')) {
  dd_js_main();
}
