<?php
/** Seed data + idempotent database seeder. */
declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/scrypt.php';

const DD_SEED_PRODUCTS_JSON = <<<'JSON'
[["p1","Ergo Wireless Mouse","2.4GHz + Bluetooth · 3 modes","Tech",499,799,4.6,40,"assets/img/product-mouse.jpg",483],["p2","Luma LED Desk Lamp","3 light tones · USB charge port","Home & Living",899,1299,4.8,32,"assets/img/product-lamp.jpg",391],["p3","USB-C 6-in-1 Hub 100W","4K HDMI · PD 100W · SD reader","Tech",1299,1799,4.5,25,"assets/img/product-hub.jpg",512],["p4","Terra Bluetooth Speaker","12h playtime · TWS pairing","Tech",1499,2199,4.7,18,"assets/img/product-speaker.jpg",428],["p5","Speckled Ceramic Mug","350 ml · handmade · microwave safe","Home & Living",349,499,4.9,60,"assets/img/product-mug.jpg",607],["p6","Walnut Desk Organiser","Solid walnut · phone + pen slots","Home & Living",749,1099,4.8,4,"assets/img/product-organizer.jpg",214],["p7","Aura TKL Keyboard 68","Tri-mode · linear red switches","Tech",1999,2499,4.7,12,"assets/img/product-keyboard.jpg",356],["p8","Copper Hammered Bottle","750 ml · 99.9% pure copper","Home & Living",799,1199,4.8,3,"assets/img/product-bottle.jpg",289],["p9","Arc Brass Desk Clock","Silent sweep movement · walnut base","Home & Living",899,1199,4.7,22,"assets/img/product-clock.jpg",173],["p10","Terracotta Herb Planter","Handmade · with saucer · drainage hole","Home & Living",449,599,4.6,35,"assets/img/product-planter.jpg",141],["p11","Sage Linen Cushion 18″","Washed linen · hidden zip · feather-touch","Home & Living",349,499,4.5,48,"assets/img/product-cushion.jpg",198],["p12","Amber Ceramic Candle","Soy wax · sandalwood & vanilla · 40h burn","Home & Living",299,399,4.8,40,"assets/img/product-candle.jpg",263],["p13","Magnetic Desk Cable Dock","Anodised aluminium · 3 cable slots","Tech",549,799,4.4,52,"assets/img/product-dock.jpg",187],["p14","Bamboo Wireless Charger","15W fast charge · phone stand · Qi certified","Tech",699,999,4.6,29,"assets/img/product-charger.jpg",235]]
JSON;

const DD_SEED_REVIEWS_JSON = <<<'JSON'
[["p1",[["Rohit Sharma",5,"Daily driver, zero complaints","Pairs with both my laptop and phone. Battery lasts forever and the scroll wheel is buttery."],["Ananya Iyer",4,"Versatile but a bit light","Three connection modes are genuinely useful. Would prefer a heavier shell for desk stability."],["Debasish Banerjee",5,"Best mouse under ₹500","I have used it 8 hours a day for 3 months. Zero double-click issues so far."]]],["p2",[["Megha Kulkarni",5,"Perfect for late-night work","The warm tone is easy on the eyes and the USB port charges my Kindle. Highly recommend."],["Suresh Pillai",5,"Premium look","Metal build, three brightness levels and a wobble-free base. Worth every rupee."],["Priya Nair",4,"Very good, bright max","Runs a bit bright on max for small desks — but the lowest tone is ideal for reading."]]],["p3",[["Arvind Menon",5,"Desk setup sorted","HDMI + 100W PD + SD reader — one cable to my monitor and the laptop charges. Elite hub."],["Kavya Deshmukh",4,"Gets warm under load","Works flawlessly. It warms up during long 4K transfers, nothing worrying."],["Rahul Verma",4,"Great value","PD pass-through is the killer feature. Packaging was solid."]]],["p4",[["Ishita Roy",5,"Bass for days","Paired two units for party stereo. 12h battery claim is accurate — charged once all weekend."],["Nikhil Joshi",5,"Monsoon-proof sound","Took it to a lake-side trip. IPX5 and still going strong."],["Sneha Kulkarni",4,"Excellent for the price","TWS pairing is a bit fiddly the first time, then it just works."]]],["p5",[["Tanvi Chopra",5,"My morning ritual","Handmade glaze is gorgeous, tea stays hot forever, microwave safe. Bought six for gifts."],["Rohit Sharma",5,"Restaurant vibes at home","350 ml is the perfect chai size. Will reorder in different colours."],["Divya Menon",5,"Zero chips after months","Daily office use for 4 months — no cracks, no glaze fade."]]],["p6",[["Arjun Malhotra",5,"Desk candy","Solid walnut, holds phone + pens + cards. Smells amazing. Build quality is heirloom grade."],["Pooja Rao",4,"Beautiful but compact","Smaller than expected — ideal for single-monitor setups. Craftsmanship is superb."],["Vikram Shetty",5,"Gift-worthy","Bought it as a gift, ended up keeping one for myself too."]]],["p7",[["Rohit Sharma",5,"Creamy typing","Linear reds are office-quiet, tri-mode works across PC + tablet + phone. 68 keys is the sweet spot."],["Ananya Iyer",5,"Kept my old keyboard for nothing","Sound profile is thocky out of the box. Stabilisers lubed well."],["Debasish Banerjee",4,"Great board, dongle life","One 2.4 GHz dongle, works perfectly. Bluetooth mode has slight lag for gaming."]]],["p8",[["Megha Kulkarni",5,"Tradition, modern finish","Hammered finish is stunning, water tastes noticeably fresher. Easy to hand-wash."],["Suresh Pillai",4,"Heavy but worth it","750 ml full copper is no joke on weight — but the temperature retention is unreal."],["Priya Nair",5,"Daily ayurveda","Using it for 6 months. Once a month a lemon-salt polish keeps it glowing."]]],["p9",[["Arvind Menon",5,"Silent and classy","Sweep second hand means zero tick noise. Walnut base matches my desk perfectly."],["Kavya Deshmukh",4,"Accurate time","Gained 2 seconds in a month. Looks way more expensive than it is."],["Rahul Verma",5,"Vintage soul","The brass patina is developing beautifully. 10/10 desk upgrade."]]],["p10",[["Ishita Roy",5,"Basil is thriving","Drainage hole + saucer, exactly as described. Herbs love this thing."],["Nikhil Joshi",5,"Handmade charm","No two are alike — mine has lovely texture. Packed with zero breakage."],["Sneha Kulkarni",4,"Perfect size","Ideal for kitchen herbs. Wish it came in a 10-inch variant too."]]],["p11",[["Tanvi Chopra",5,"Softest cushion ever","Washed linen is pre-distressed to perfection. Sage colour matches the photos exactly."],["Rohit Sharma",4,"True to colour","Feather-touch feel is real. The insert could be a touch firmer."],["Divya Menon",5,"Sofa transformed","Bought two. The hidden zip is invisible even up close."]]],["p12",[["Arjun Malhotra",5,"Sandalwood heaven","40-hour burn claim is real — mine is on week 3. Fills the living room, never overpowering."],["Pooja Rao",5,"Date-night staple","Vanilla-sandalwood blend is unisex and elegant. Dinner-party essential."],["Vikram Shetty",4,"Lovely, wish for bigger jars","Fragrance throw is excellent. Would love a 100-hour XL size."]]],["p13",[["Rohit Sharma",5,"Bye-bye cable nest","Three slots, magnetic pop-up ends, holds Lightning + USB-C + Watch. Desk finally looks adult."],["Ananya Iyer",4,"Strong magnets","Cables snap in satisfyingly. A hair lighter would be nice but stability is great."],["Debasish Banerjee",4,"Minimal and useful","Does exactly what it says. Anodised finish resists scratches."]]],["p14",[["Megha Kulkarni",5,"Charging, standing","15W fast charge works — phone goes 0→50% before my morning chai. Bamboo base is gorgeous."],["Suresh Pillai",5,"Gift success","Gave one to my dad; he uses it daily. Stand angle is perfect for video calls."],["Priya Nair",4,"Case friendly","Charges through my rugged case. Superb value for the price."]]]]
JSON;

function dd_hash_pw(string $pw, string $salt): string {
  // scrypt format (see core.php); returns 128-hex + 32-hex salt pair
  return bin2hex(\scrypt_hash($pw, $salt, 16384, 8, 1, 64));
}

function dd_mk_user(string $name, string $email, string $phone, string $password, string $role): void {
  $pair = dd_password_pair($password);
  $stmt = dd_db()->prepare("INSERT INTO users (name,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?,?)");
  $stmt->execute([$name, strtolower($email), $phone, $pair['hash'], $pair['salt'], $role]);
}

function dd_is_legacy_scrypt_user(array $u): bool {
  return !empty($u['password_salt']) && $u['password_salt'] !== 'bcrypt' && strlen((string) $u['password_hash']) === 128;
}

const DD_DEFAULT_SETTINGS = [
  'announce'      => 'Free delivery over ₹999 ✦ 7-day easy returns ✦ COD & UPI on delivery',
  'free_at'       => '999',
  'deliver_fee'   => '49',
  'express_fee'   => '99',
  'cod_enabled'   => '1',
  'cod_min'       => '0',
  'max_qty'       => '99',
  'store_live'    => '1',
  'featured_ids'  => '["p1","p4","p7","p2"]',
];

function dd_get_setting(string $k) {
  $row = dd_db()->prepare("SELECT value FROM store_settings WHERE key = ?");
  $row->execute([$k]);
  $r = $row->fetch();
  return $r ? $r['value'] : (DD_DEFAULT_SETTINGS[$k] ?? null);
}
function dd_set_setting(string $k, $v): void {
  $stmt = dd_db()->prepare("INSERT INTO store_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  $stmt->execute([$k, (string) $v]);
}

function dd_admin_email(): string { return strtolower((string) (getenv('ADMIN_EMAIL') ?: 'admin@debasishdas.in')); }
function dd_admin_password(): string { return (string) (getenv('ADMIN_PASSWORD') ?: 'admin123'); }

/** Seed a fresh database. Demo content only when $demo is true. Idempotent. */
function dd_seed_database(bool $demo = true): void {
  dd_set_setting('seed_intent', $demo ? 'demo' : 'empty');

  $check = dd_db()->prepare("SELECT 1 FROM users WHERE email = ?");
  $check->execute([dd_admin_email()]);
  if (!$check->fetch()) {
    dd_mk_user('Debasish Das', dd_admin_email(), '+91 00000 00000', dd_admin_password(), 'admin');
    error_log('[seed] admin created → ' . dd_admin_email());
  }
  if ($demo) {
    $check->execute(['rohit@demo.in']);
    if (!$check->fetch()) dd_mk_user('Rohit Sharma', 'rohit@demo.in', '+91 98765 01020', 'customer123', 'user');
  }

  $products = json_decode(DD_SEED_PRODUCTS_JSON, true);
  if ($demo) {
    $count = (int) dd_db()->query("SELECT COUNT(*) AS n FROM products")->fetch()['n'];
    if ($count === 0) {
      $ins = dd_db()->prepare("INSERT INTO products (id,name,meta,tag,price,was,rating,stock,img,reviews) VALUES (?,?,?,?,?,?,?,?,?,?)");
      $db = dd_db();
      $db->beginTransaction();
      try {
        foreach ($products as $p) $ins->execute($p);
        $db->commit();
      } catch (Throwable $e) { $db->rollBack(); throw $e; }
      error_log('[seed] 14 products inserted');
    } else {
      $bf = dd_db()->prepare("UPDATE products SET reviews = ? WHERE id = ? AND reviews = 0");
      foreach ($products as $p) $bf->execute([$p[9], $p[0]]);
    }
  }

  /* store settings defaults are always ensured */
  foreach (DD_DEFAULT_SETTINGS as $k => $v) {
    $row = dd_db()->prepare("SELECT 1 FROM store_settings WHERE key = ?");
    $row->execute([$k]);
    if (!$row->fetch()) dd_set_setting($k, $v);
  }

  if ($demo) {
    $count = (int) dd_db()->query("SELECT COUNT(*) AS n FROM coupons")->fetch()['n'];
    if ($count === 0) {
      $idc = dd_db()->prepare("INSERT INTO coupons (code,type,value,min_order,max_uses) VALUES (?,?,?,?,?)");
      $idc->execute(['WELCOME10', 'percent', 10, 0, 0]);
      $idc->execute(['FLAT100', 'flat', 100, 999, 0]);
      $idc->execute(['SHELF150', 'flat', 150, 1499, 100]);
      error_log('[seed] coupons: WELCOME10 · FLAT100 · SHELF150');
    }

    if (dd_get_setting('reviews_seeded') !== '1') {
      $sample = json_decode(DD_SEED_REVIEWS_JSON, true);
      $ins = dd_db()->prepare("INSERT INTO reviews (product_id, user_id, name, rating, title, body) VALUES (?, NULL, ?, ?, ?, ?)");
      $db = dd_db();
      $db->beginTransaction();
      try {
        foreach ($sample as [$pid, $rows]) {
          foreach ($rows as [$name, $rating, $title, $body]) $ins->execute([$pid, $name, $rating, $title, $body]);
        }
        $db->commit();
      } catch (Throwable $e) { $db->rollBack(); throw $e; }
      dd_set_setting('reviews_seeded', '1');
      error_log('[seed] sample reviews inserted');
    }

    $count = (int) dd_db()->query("SELECT COUNT(*) AS n FROM orders")->fetch()['n'];
    if ($count === 0) {
      $cust = dd_db()->prepare("SELECT id FROM users WHERE email = 'rohit@demo.in'");
      $cust->execute();
      $cust = $cust->fetch();
      if ($cust) {
        $ins = dd_db()->prepare("INSERT INTO orders (user_id,customer_name,phone,address,note,items_json,total,status,created_at)
                                 VALUES (?,?,?,?,?,?,?,?,datetime('now', ?))");
        $ins->execute([$cust['id'], 'Rohit Sharma', '+91 98765 01020', '14B, Gariahat Road, Kolkata 700029', 'Call before delivery',
                       json_encode([['id' => 'p3', 'name' => 'USB-C 6-in-1 Hub 100W', 'price' => 1299, 'qty' => 1], ['id' => 'p1', 'name' => 'Ergo Wireless Mouse', 'price' => 499, 'qty' => 1]], JSON_UNESCAPED_UNICODE),
                       1798, 'delivered', '-9 days']);
        $ins->execute([$cust['id'], 'Rohit Sharma', '+91 98765 01020', '14B, Gariahat Road, Kolkata 700029', '',
                       json_encode([['id' => 'p4', 'name' => 'Terra Bluetooth Speaker', 'price' => 1499, 'qty' => 1]], JSON_UNESCAPED_UNICODE),
                       1499, 'shipped', '-2 days']);
        $ins->execute([$cust['id'], 'Rohit Sharma', '+91 98765 01020', '14B, Gariahat Road, Kolkata 700029', 'Gift wrap please',
                       json_encode([['id' => 'p2', 'name' => 'Luma LED Desk Lamp', 'price' => 899, 'qty' => 1], ['id' => 'p5', 'name' => 'Speckled Ceramic Mug', 'price' => 349, 'qty' => 2]], JSON_UNESCAPED_UNICODE),
                       1597, 'confirmed', '-6 hours']);
        error_log('[seed] 3 demo orders for rohit@demo.in');
      }
      $row = dd_db()->query("SELECT 1 FROM inquiries LIMIT 1")->fetch();
      if (!$row) {
        $ins = dd_db()->prepare("INSERT INTO inquiries (name,phone,need,budget,message,created_at) VALUES (?,?,?,?,?,datetime('now','-1 day'))");
        $ins->execute(['Meera Iyer', '+91 98101 23456', 'Business website design & development', '₹5,000 – ₹15,000', 'Need a site for my boutique — catalogue + WhatsApp enquiry. 10-day deadline if possible.']);
      }
    }
  }
}

/** Boot-time seed for entirely fresh databases. */
function dd_boot_seed(): void {
  try {
    $fresh = (int) dd_db()->query("SELECT COUNT(*) AS n FROM users")->fetch()['n'] === 0;
    $intent = '';
    try { $r = dd_get_setting('seed_intent'); $intent = $r === null ? '' : (string) $r; } catch (Throwable $e) {}
    if ($fresh) dd_seed_database($intent !== 'empty');
  } catch (Throwable $e) { error_log('[seed] ' . $e->getMessage()); }
}
