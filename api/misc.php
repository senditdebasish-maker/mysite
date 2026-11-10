<?php
/** sitemap.xml + robots.txt — test seam: dd_misc_handle($what, $req). */
declare(strict_types=1);
require_once __DIR__ . '/core.php';

function dd_misc_handle(string $what, array $req): array {
  dd_boot_seed(); // idempotent: sitemap lists seeded products
  $base = dd_base_url($req);
  if ($what === 'sitemap') {
    $urls = ['/', '/services.html', '/hosting.html', '/store.html', '/contact.html', '/policies.html', '/login.html'];
    $prods = dd_db()->query('SELECT id FROM products WHERE active = 1 ORDER BY id')->fetchAll();
    $today = gmdate('Y-m-d');
    $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
    foreach ($urls as $u) {
      $xml .= "  <url><loc>$base$u</loc><lastmod>$today</lastmod><changefreq>weekly</changefreq><priority>" . ($u === '/' ? '1.0' : '0.8') . "</priority></url>\n";
    }
    foreach ($prods as $p) {
      $xml .= "  <url><loc>$base/product/" . $p['id'] . "</loc><lastmod>$today</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n";
    }
    $xml .= "</urlset>";
    return ['status' => 200, 'headers' => ['Cache-Control' => 'public, max-age=3600'], 'body' => $xml, 'content_type' => 'application/xml; charset=utf-8'];
  }
  if ($what === 'robots') {
    $body = "User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /dashboard.html\nDisallow: /invoice.html\nDisallow: /api/\n\nSitemap: $base/sitemap.xml\n";
    return ['status' => 200, 'headers' => [], 'body' => $body, 'content_type' => 'text/plain; charset=utf-8'];
  }
  return ['status' => 404, 'headers' => [], 'body' => 'Not found', 'content_type' => 'text/plain; charset=utf-8'];
}

function dd_misc_main(): void {
  $what = (string) ($_GET['what'] ?? '');
  $headers = [];
  foreach ($_SERVER as $k => $v) {
    if (is_string($v) && strncmp($k, 'HTTP_', 5) === 0) {
      $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
    }
  }
  $https = dd_request_is_https();
  $req = ['method' => $_SERVER['REQUEST_METHOD'] ?? 'GET', 'headers' => $headers, 'https' => $https];
  try {
    $resp = dd_misc_handle($what, $req);
  } catch (Throwable $e) {
    error_log('[misc] ' . $e);
    $resp = ['status' => 503, 'headers' => ['Cache-Control' => 'no-store'], 'body' => 'Service temporarily unavailable.', 'content_type' => 'text/plain; charset=utf-8'];
  }
  http_response_code($resp['status']);
  dd_emit_security_headers($https);
  foreach (($resp['headers'] ?? []) as $n => $v) header("$n: $v");
  header('Content-Type: ' . ($resp['content_type'] ?? 'text/plain; charset=utf-8'));
  echo $resp['body'];
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__ && !defined('DD_CLI_TEST')) {
  dd_misc_main();
}
