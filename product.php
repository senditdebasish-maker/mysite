<?php
/** /product/<id> — SSR head (SEO/social) with the product template. Test seam: dd_render_product(). */
declare(strict_types=1);
require_once __DIR__ . '/api/core.php';

function dd_fmt_inr($n): string {
  return '₹' . number_format((float) $n, 0, '.', ',');
}

function dd_render_product(string $id, array $req): array {
  dd_boot_seed(); // idempotent: seeds demo catalogue on a brand-new DB
  // fresh installs: product pages hold at the wizard too (mirrors server.js SETUP_FREE)
  if (!dd_is_setup_complete()) {
    return ['status' => 302, 'headers' => ['Location' => '/setup.html'], 'body' => '', 'content_type' => 'text/plain; charset=utf-8'];
  }
  if (!preg_match('/^[A-Za-z0-9_-]{1,32}$/', $id)) return dd_page_404();
  $stmt = dd_db()->prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  $stmt->execute([$id]);
  $p = $stmt->fetch();
  if (!$p) return dd_page_404();

  $base = dd_base_url($req);
  $imgAbs = $base . '/' . ltrim((string) $p['img'], '/');
  $url = $base . '/product/' . $p['id'];
  $title = $p['name'] . ' — ' . dd_fmt_inr($p['price']) . ' | The Shelf · debasish.';
  $desc = $p['name'] . ' — ' . $p['meta'] . '. ' . dd_fmt_inr($p['price']) . ' (GST included). Free delivery above ₹999 · COD & UPI on delivery · 7-day easy returns.';
  $jsonld = json_encode([
    '@context' => 'https://schema.org', '@type' => 'Product',
    'name' => $p['name'], 'sku' => strtoupper($p['id']), 'image' => $imgAbs,
    'description' => $p['name'] . ' — ' . $p['meta'] . '.',
    'brand' => ['@type' => 'Brand', 'name' => 'debasish.'],
    'aggregateRating' => ['@type' => 'AggregateRating', 'ratingValue' => (float) $p['rating'], 'reviewCount' => (int) $p['reviews']],
    'offers' => [
      '@type' => 'Offer', 'url' => $url, 'priceCurrency' => 'INR', 'price' => (int) $p['price'],
      'itemCondition' => 'https://schema.org/NewCondition',
      'availability' => ((int) $p['stock'] > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'),
      'seller' => ['@type' => 'Organization', 'name' => 'debasish. — Web Studio & Store'],
    ],
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $jsonld = str_replace('<', '\\u003c', (string) $jsonld);

  $templatePath = DD_ROOT . '/product.html';
  if (!is_file($templatePath)) {
    return ['status' => 500, 'headers' => [], 'body' => 'Product template missing', 'content_type' => 'text/plain; charset=utf-8'];
  }
  $out = (string) file_get_contents($templatePath);
  $tEsc = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
  $dEsc = htmlspecialchars($desc, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
  $out = preg_replace('#<title>[^<]*</title>#', '<title>' . $tEsc . '</title>', $out, 1);
  $out = preg_replace('#<meta name="description" content="[^"]*"\s*/?>#', '<meta name="description" content="' . $dEsc . '" />', $out, 1);
  $out = preg_replace('#<link rel="canonical" href="[^"]*"\s*/?>#', '<link rel="canonical" href="' . $url . '" />', $out, 1);
  $out = preg_replace('#<meta property="og:title" content="[^"]*"\s*/?>#', '<meta property="og:title" content="' . $tEsc . '" />', $out, 1);
  $out = preg_replace('#<meta property="og:description" content="[^"]*"\s*/?>#', '<meta property="og:description" content="' . $dEsc . '" />', $out, 1);
  $out = preg_replace('#<meta property="og:url" content="[^"]*"\s*/?>#', '<meta property="og:url" content="' . $url . '" />', $out, 1);
  $out = preg_replace('#<meta property="og:image" content="[^"]*"\s*/?>#', '<meta property="og:image" content="' . $imgAbs . '" />', $out, 1);
  $out = preg_replace('#<meta property="og:image:alt" content="[^"]*"\s*/?>#', '<meta property="og:image:alt" content="' . $tEsc . '" />', $out, 1);
  $out = preg_replace('#<meta name="twitter:title" content="[^"]*"\s*/?>#', '<meta name="twitter:title" content="' . $tEsc . '" />', $out, 1);
  $out = preg_replace('#<meta name="twitter:description" content="[^"]*"\s*/?>#', '<meta name="twitter:description" content="' . $dEsc . '" />', $out, 1);
  $out = preg_replace('#<meta name="twitter:image" content="[^"]*"\s*/?>#', '<meta name="twitter:image" content="' . $imgAbs . '" />', $out, 1);
  $out = preg_replace('#<script type="application/ld\+json" id="productJsonLd">[^<]*</script>#', '<script type="application/ld+json" id="productJsonLd">' . $jsonld . '</script>', $out, 1);
  $out = str_replace('__PRODUCT_ID_TOKEN__', $p['id'], $out);
  $out = str_replace('__BASE__', $base, $out);
  $out = str_replace('__TITLE__', $tEsc, $out);   // tolerate tokenised templates too
  $out = str_replace('__DESC__', $dEsc, $out);
  $out = str_replace('__CANONICAL__', $url, $out);
  $out = str_replace('__OG_IMAGE__', $imgAbs, $out);
  $out = str_replace('__JSONLD__', $jsonld, $out);
  $out = dd_contact_substitutions($out);
  return ['status' => 200, 'headers' => ['Cache-Control' => 'no-cache'], 'body' => $out, 'content_type' => 'text/html; charset=utf-8'];
}

function dd_product_main(): void {
  $headers = [];
  foreach ($_SERVER as $k => $v) {
    if (is_string($v) && strncmp($k, 'HTTP_', 5) === 0) {
      $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
    }
  }
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
  $req = ['method' => $_SERVER['REQUEST_METHOD'] ?? 'GET', 'headers' => $headers, 'https' => $https];
  $id = (string) ($_GET['id'] ?? '');
  $resp = dd_render_product($id, $req);
  http_response_code($resp['status']);
  header('X-Content-Type-Options: nosniff');
  header('X-Frame-Options: SAMEORIGIN');
  header('Referrer-Policy: strict-origin-when-cross-origin');
  foreach (($resp['headers'] ?? []) as $n => $v) header("$n: $v");
  header('Content-Type: ' . ($resp['content_type'] ?? 'text/html; charset=utf-8'));
  echo $resp['body'];
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__ && !defined('DD_CLI_TEST')) {
  dd_product_main();
}
