<?php
/**
 * Local dev / CI router for `php -S` — mirrors the Apache .htaccess rules.
 * Usage:  DD_DATA_DIR=/path/to/data php -S 127.0.0.1:8010 serve.php
 * (Not used on Apache/InfinityFree — the .htaccess there does the routing.)
 */
declare(strict_types=1);
define('DD_CLI_TEST', true);
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// hard blocks
if (preg_match('#^/(data|\.git|\.github)(/|$)#i', $uri)
    || preg_match('#^/(composer(\.json|\.lock)|README\.md)$#i', $uri)) {
  http_response_code(404);
  readfile(__DIR__ . '/404.html');
  return true;
}
// /index.html and /index → the same page handler (no external redirect)
if ($uri === '/index.html' || $uri === '/index') { $_GET['page'] = 'index.html'; require __DIR__ . '/page.php'; dd_page_main(); return true; }
// API
if (preg_match('#^/api(/.*)?$#', $uri, $m)) {
  $_SERVER['PATH_INFO'] = ($m[1] ?? '') !== '' ? $m[1] : '/';
  require __DIR__ . '/api/index.php';
  dd_web_main();
  return true;
}
// pretty product URLs
if (preg_match('#^/product/([A-Za-z0-9_-]{1,32})/?$#', $uri, $m)) {
  $_GET['id'] = $m[1];
  require __DIR__ . '/product.php';
  dd_product_main();
  return true;
}
// sitemap / robots
if ($uri === '/sitemap.xml') { $_GET['what'] = 'sitemap'; require __DIR__ . '/api/misc.php'; dd_misc_main(); return true; }
if ($uri === '/robots.txt')  { $_GET['what'] = 'robots';  require __DIR__ . '/api/misc.php'; dd_misc_main(); return true; }
// JS with substitution
if (preg_match('#^/assets/js/([\w.-]+\.js)$#', $uri, $m)) { $_GET['file'] = $m[1]; require __DIR__ . '/js.php'; dd_js_main(); return true; }
// HTML pages (substitution + setup gate)
if ($uri === '/' || preg_match('#\.html$#i', $uri)) { $_GET['page'] = $uri; require __DIR__ . '/page.php'; dd_page_main(); return true; }
// static assets (let the built-in server serve them)
if (preg_match('#\.(css|jpe?g|png|svg|woff2?|ico|gif|webp|avif|mp4|webm|txt|xml)$#i', $uri)) return false;
$f = __DIR__ . $uri;
if (is_file($f)) return false;
http_response_code(404);
readfile(__DIR__ . '/404.html');
return true;
