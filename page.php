<?php
/** HTML page handler — substitution + setup gate. Test seam: dd_render_page($page, $req). */
declare(strict_types=1);
require_once __DIR__ . '/api/core.php';

function dd_render_page(string $page, array $req): array {
  dd_boot_seed(); // idempotent: seeds demo catalogue on a brand-new DB
  $method = strtoupper($req['method'] ?? 'GET');
  if ($method !== 'GET' && $method !== 'HEAD') return ['status' => 404, 'headers' => [], 'body' => 'Not found', 'content_type' => 'text/plain; charset=utf-8'];

  $path = '/' . ltrim($page, '/');
  if ($path === '/') $path = '/';

  // hard blocks
  if (preg_match('#^/(data|\.git|\.github)(/|$)#i', $path)
      || preg_match('#^/(composer(\.json|\.lock)|README\.md)$#i', $path)) {
    return dd_page_404();
  }

  $file = $path === '/' ? 'index.html' : basename($path);
  if (!preg_match('/\.html$/i', $file)) return dd_page_404();

  $full = DD_ROOT . '/' . $file;
  $isSetupPage = ($file === 'setup.html');

  // fresh installs hold every page at the wizard (API/assets stay open)
  if (!dd_is_setup_complete() && !$isSetupPage) {
    return ['status' => 302, 'headers' => ['Location' => '/setup.html'], 'body' => '', 'content_type' => 'text/plain; charset=utf-8'];
  }
  // the wizard itself is admin-only once setup is done
  if ($isSetupPage && dd_is_setup_complete()) {
    $u = dd_current_user($req);
    if (!$u || ($u['role'] ?? '') !== 'admin') {
      return ['status' => 302, 'headers' => ['Location' => '/login.html?next=/setup.html'], 'body' => '', 'content_type' => 'text/plain; charset=utf-8'];
    }
  }

  if (!is_file($full)) return dd_page_404();
  $html = (string) file_get_contents($full);
  $base = dd_base_url($req);
  $out = str_replace('__BASE__', $base, $html);
  $out = dd_contact_substitutions($out);
  return ['status' => 200, 'headers' => ['Cache-Control' => 'no-cache'], 'body' => $out, 'content_type' => 'text/html; charset=utf-8'];
}


function dd_page_main(): void {
  $headers = [];
  foreach ($_SERVER as $k => $v) {
    if (is_string($v) && strncmp($k, 'HTTP_', 5) === 0) {
      $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
    }
  }
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
  $page = (string) ($_GET['page'] ?? '/');
  if ($page === '' || $page === '/') $page = '/';
  $req = ['method' => $_SERVER['REQUEST_METHOD'] ?? 'GET', 'headers' => $headers, 'https' => $https];
  $resp = dd_render_page($page, $req);
  http_response_code($resp['status']);
  header('X-Content-Type-Options: nosniff');
  header('X-Frame-Options: SAMEORIGIN');
  header('Referrer-Policy: strict-origin-when-cross-origin');
  foreach (($resp['headers'] ?? []) as $n => $v) header("$n: $v");
  header('Content-Type: ' . ($resp['content_type'] ?? 'text/html; charset=utf-8'));
  echo $resp['body'];
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__ && !defined('DD_CLI_TEST')) {
  dd_page_main();
}
