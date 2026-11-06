/* ════════════════════════════════════════════════════════════════
   Debasish Das — Web Studio & Store · FULL-STACK SERVER
   Express + SQLite (node:sqlite, zero native deps)
   Serves the static site AND the JSON API under /api
   ────────────────────────────────────────────────────────────────
   Run:  npm start        (→ http://localhost:8000)
   Env:  PORT, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_DAYS
   ════════════════════════════════════════════════════════════════ */
const path    = require("path");
const fs      = require("fs");
const crypto  = require("crypto");
const os      = require("os");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const PORT    = process.env.PORT || 8000;
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

/* ════════════════ INSTALL / DB RESOLUTION ════════════════
   Precedence: env DB_PATH → data/install.json (written by the /setup.html
   wizard) → default data/site.db. */
const INSTALL_FILE = path.join(DATA_DIR, "install.json");
const readInstall  = () => { try { return JSON.parse(fs.readFileSync(INSTALL_FILE, "utf8")) || {}; } catch { return {}; } };
const writeInstall = (obj) => { try { fs.writeFileSync(INSTALL_FILE, JSON.stringify(obj, null, 2)); } catch (e) { console.warn("[install] could not persist install.json:", e.message); } };
const resolveDbTarget = (p) => {
  let s = String(p || "").trim() || path.join(DATA_DIR, "site.db");
  if (s.startsWith("~")) s = path.join(process.env.HOME || "/", s.slice(1));
  const abs = path.isAbsolute(s) ? path.normalize(s) : path.resolve(ROOT, s);
  if (abs.includes("\0")) throw Object.assign(new Error("Invalid path"), { status: 400 });
  return abs;
};
const ENV_DB_PATH   = process.env.DB_PATH ? resolveDbTarget(process.env.DB_PATH) : null;
let currentDbPath   = ENV_DB_PATH || readInstall().dbPath || path.join(DATA_DIR, "site.db");

/* ════════════════ DATABASE ════════════════ */
let db = null;
const ensureSchema = () => db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  meta       TEXT NOT NULL DEFAULT '',
  tag        TEXT NOT NULL DEFAULT 'Tech',
  price      INTEGER NOT NULL CHECK(price >= 0),
  was        INTEGER NOT NULL DEFAULT 0,
  rating     REAL NOT NULL DEFAULT 4.5,
  stock      INTEGER NOT NULL DEFAULT 10,
  img        TEXT NOT NULL DEFAULT 'assets/img/product-mouse.jpg',
  active     INTEGER NOT NULL DEFAULT 1,
  reviews    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  items_json    TEXT NOT NULL,
  total         INTEGER NOT NULL CHECK(total >= 0),
  payment       TEXT NOT NULL DEFAULT 'cod',
  coupon_code   TEXT NOT NULL DEFAULT '',
  discount      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','confirmed','shipped','delivered','cancelled')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inquiries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  need       TEXT NOT NULL DEFAULT '',
  budget     TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupons (
  code       TEXT PRIMARY KEY,
  type       TEXT NOT NULL DEFAULT 'percent' CHECK(type IN ('percent','flat')),
  value      INTEGER NOT NULL CHECK(value > 0),
  min_order  INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  used       INTEGER NOT NULL DEFAULT 0,
  max_uses   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS store_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL DEFAULT 'Customer',
  rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_product  ON reviews(product_id);
`);

/* ── migrations for databases created before the storefront build ── */
const runMigrations = () => {
  const _cols = (tbl) => db.prepare(`PRAGMA table_info(${tbl})`).all().map(r => r.name);
  if (!_cols("products").includes("reviews"))   db.exec("ALTER TABLE products ADD COLUMN reviews INTEGER NOT NULL DEFAULT 0");
  if (!_cols("orders").includes("payment"))     db.exec("ALTER TABLE orders ADD COLUMN payment TEXT NOT NULL DEFAULT 'cod'");
  if (!_cols("orders").includes("coupon_code")) db.exec("ALTER TABLE orders ADD COLUMN coupon_code TEXT NOT NULL DEFAULT ''");
  if (!_cols("orders").includes("discount"))    db.exec("ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0");
};
const openDb = (p) => { const nd = new DatabaseSync(p); db = nd; ensureSchema(); runMigrations(); };
openDb(currentDbPath);

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const mkUser = (name, email, phone, password, role) => {
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("INSERT INTO users (name,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?,?)")
    .run(name, email.toLowerCase(), phone, hashPw(password, salt), salt, role);
};
const adminEmail = (process.env.ADMIN_EMAIL || "admin@debasishdas.in").toLowerCase();
const adminPw    = process.env.ADMIN_PASSWORD || "admin123";
  const DEFAULT_SETTINGS = {
    announce:      "Free delivery over ₹999 ✦ 7-day easy returns ✦ COD & UPI on delivery",
    free_at:       "999",
    deliver_fee:   "49",
    cod_enabled:   "1",
    cod_min:       "0",
    max_qty:       "99",
    store_live:    "1",
    featured_ids:  '["p1","p4","p7","p2"]',
  };
const getSetting = (k) => {
  const row = db.prepare("SELECT value FROM store_settings WHERE key = ?").get(k);
  return row ? row.value : DEFAULT_SETTINGS[k];
};
const setSetting = (k, v) => db.prepare("INSERT INTO store_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, String(v));

/* ════════════════ SEED (idempotent) ════════════════ */
const seedDatabase = ({ demo = true } = {}) => {
  /* store_settings defaults are ALWAYS ensured; demo content only when demo=true */
  try { setSetting("seed_intent", demo ? "demo" : "empty"); } catch {}


  if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get(adminEmail)) {
    mkUser("Debasish Das", adminEmail, "+91 00000 00000", adminPw, "admin");
    console.log(`[seed] admin created → ${adminEmail}`);
  }
  if (demo && !db.prepare("SELECT 1 FROM users WHERE email = ?").get("rohit@demo.in")) {
    mkUser("Rohit Sharma", "rohit@demo.in", "+91 98765 01020", "customer123", "user");
  }

  const SEED_PRODUCTS = [
    ["p1","Ergo Wireless Mouse","2.4GHz + Bluetooth · 3 modes","Tech",499,799,4.6,40,"assets/img/product-mouse.jpg",483],
    ["p2","Luma LED Desk Lamp","3 light tones · USB charge port","Home & Living",899,1299,4.8,32,"assets/img/product-lamp.jpg",391],
    ["p3","USB-C 6-in-1 Hub 100W","4K HDMI · PD 100W · SD reader","Tech",1299,1799,4.5,25,"assets/img/product-hub.jpg",512],
    ["p4","Terra Bluetooth Speaker","12h playtime · TWS pairing","Tech",1499,2199,4.7,18,"assets/img/product-speaker.jpg",428],
    ["p5","Speckled Ceramic Mug","350 ml · handmade · microwave safe","Home & Living",349,499,4.9,60,"assets/img/product-mug.jpg",607],
    ["p6","Walnut Desk Organiser","Solid walnut · phone + pen slots","Home & Living",749,1099,4.8,4,"assets/img/product-organizer.jpg",214],
    ["p7","Aura TKL Keyboard 68","Tri-mode · linear red switches","Tech",1999,2499,4.7,12,"assets/img/product-keyboard.jpg",356],
    ["p8","Copper Hammered Bottle","750 ml · 99.9% pure copper","Home & Living",799,1199,4.8,3,"assets/img/product-bottle.jpg",289],
    ["p9","Arc Brass Desk Clock","Silent sweep movement · walnut base","Home & Living",899,1199,4.7,22,"assets/img/product-clock.jpg",173],
    ["p10","Terracotta Herb Planter","Handmade · with saucer · drainage hole","Home & Living",449,599,4.6,35,"assets/img/product-planter.jpg",141],
    ["p11","Sage Linen Cushion 18″","Washed linen · hidden zip · feather-touch","Home & Living",349,499,4.5,48,"assets/img/product-cushion.jpg",198],
    ["p12","Amber Ceramic Candle","Soy wax · sandalwood & vanilla · 40h burn","Home & Living",299,399,4.8,40,"assets/img/product-candle.jpg",263],
    ["p13","Magnetic Desk Cable Dock","Anodised aluminium · 3 cable slots","Tech",549,799,4.4,52,"assets/img/product-dock.jpg",187],
    ["p14","Bamboo Wireless Charger","15W fast charge · phone stand · Qi certified","Tech",699,999,4.6,29,"assets/img/product-charger.jpg",235],
  ];
  if (demo && db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) {
    const ins = db.prepare("INSERT INTO products (id,name,meta,tag,price,was,rating,stock,img,reviews) VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const p of SEED_PRODUCTS) ins.run(...p);
    console.log("[seed] 14 products inserted");
  } else {
    // existing DBs: backfill the review counts for the seeded catalogue
    const bf = db.prepare("UPDATE products SET reviews = ? WHERE id = ? AND reviews = 0");
    for (const p of SEED_PRODUCTS) bf.run(p[9], p[0]);
  }

  /* ── store settings + coupons (seeded once, admin-editable) ── */
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!db.prepare("SELECT 1 FROM store_settings WHERE key = ?").get(k)) setSetting(k, v);
  }

  if (demo && db.prepare("SELECT COUNT(*) AS n FROM coupons").get().n === 0) {
    const idc = db.prepare("INSERT INTO coupons (code,type,value,min_order,max_uses) VALUES (?,?,?,?,?)");
    idc.run("WELCOME10", "percent", 10, 0,   0);
    idc.run("FLAT100",   "flat",    100, 999, 0);
    idc.run("SHELF150",  "flat",    150, 1499, 100);
    console.log("[seed] coupons: WELCOME10 · FLAT100 · SHELF150");
  }

  /* ── sample reviews (seeded once; wiped by deleting data/site.db) ── */
  if (demo && getSetting("reviews_seeded") !== "1") {
    const sample = [
      ["p1", [ ["Rohit Sharma", 5, "Daily driver, zero complaints", "Pairs with both my laptop and phone. Battery lasts forever and the scroll wheel is buttery."],
               ["Ananya Iyer", 4, "Versatile but a bit light", "Three connection modes are genuinely useful. Would prefer a heavier shell for desk stability."],
               ["Debasish Banerjee", 5, "Best mouse under ₹500", "I have used it 8 hours a day for 3 months. Zero double-click issues so far."] ] ],
      ["p2", [ ["Megha Kulkarni", 5, "Perfect for late-night work", "The warm tone is easy on the eyes and the USB port charges my Kindle. Highly recommend."],
               ["Suresh Pillai", 5, "Premium look", "Metal build, three brightness levels and a wobble-free base. Worth every rupee."],
               ["Priya Nair", 4, "Very good, bright max", "Runs a bit bright on max for small desks — but the lowest tone is ideal for reading."] ] ],
      ["p3", [ ["Arvind Menon", 5, "Desk setup sorted", "HDMI + 100W PD + SD reader — one cable to my monitor and the laptop charges. Elite hub."],
               ["Kavya Deshmukh", 4, "Gets warm under load", "Works flawlessly. It warms up during long 4K transfers, nothing worrying."],
               ["Rahul Verma", 4, "Great value", "PD pass-through is the killer feature. Packaging was solid."] ] ],
      ["p4", [ ["Ishita Roy", 5, "Bass for days", "Paired two units for party stereo. 12h battery claim is accurate — charged once all weekend."],
               ["Nikhil Joshi", 5, "Monsoon-proof sound", "Took it to a lake-side trip. IPX5 and still going strong."],
               ["Sneha Kulkarni", 4, "Excellent for the price", "TWS pairing is a bit fiddly the first time, then it just works."] ] ],
      ["p5", [ ["Tanvi Chopra", 5, "My morning ritual", "Handmade glaze is gorgeous, tea stays hot forever, microwave safe. Bought six for gifts."],
               ["Rohit Sharma", 5, "Restaurant vibes at home", "350 ml is the perfect chai size. Will reorder in different colours."],
               ["Divya Menon", 5, "Zero chips after months", "Daily office use for 4 months — no cracks, no glaze fade."] ] ],
      ["p6", [ ["Arjun Malhotra", 5, "Desk candy", "Solid walnut, holds phone + pens + cards. Smells amazing. Build quality is heirloom grade."],
               ["Pooja Rao", 4, "Beautiful but compact", "Smaller than expected — ideal for single-monitor setups. Craftsmanship is superb."],
               ["Vikram Shetty", 5, "Gift-worthy", "Bought it as a gift, ended up keeping one for myself too."] ] ],
      ["p7", [ ["Rohit Sharma", 5, "Creamy typing", "Linear reds are office-quiet, tri-mode works across PC + tablet + phone. 68 keys is the sweet spot."],
               ["Ananya Iyer", 5, "Kept my old keyboard for nothing", "Sound profile is thocky out of the box. Stabilisers lubed well."],
               ["Debasish Banerjee", 4, "Great board, dongle life", "One 2.4 GHz dongle, works perfectly. Bluetooth mode has slight lag for gaming."] ] ],
      ["p8", [ ["Megha Kulkarni", 5, "Tradition, modern finish", "Hammered finish is stunning, water tastes noticeably fresher. Easy to hand-wash."],
               ["Suresh Pillai", 4, "Heavy but worth it", "750 ml full copper is no joke on weight — but the temperature retention is unreal."],
               ["Priya Nair", 5, "Daily ayurveda", "Using it for 6 months. Once a month a lemon-salt polish keeps it glowing."] ] ],
      ["p9", [ ["Arvind Menon", 5, "Silent and classy", "Sweep second hand means zero tick noise. Walnut base matches my desk perfectly."],
               ["Kavya Deshmukh", 4, "Accurate time", "Gained 2 seconds in a month. Looks way more expensive than it is."],
               ["Rahul Verma", 5, "Vintage soul", "The brass patina is developing beautifully. 10/10 desk upgrade."] ] ],
      ["p10", [ ["Ishita Roy", 5, "Basil is thriving", "Drainage hole + saucer, exactly as described. Herbs love this thing."],
                ["Nikhil Joshi", 5, "Handmade charm", "No two are alike — mine has lovely texture. Packed with zero breakage."],
                ["Sneha Kulkarni", 4, "Perfect size", "Ideal for kitchen herbs. Wish it came in a 10-inch variant too."] ] ],
      ["p11", [ ["Tanvi Chopra", 5, "Softest cushion ever", "Washed linen is pre-distressed to perfection. Sage colour matches the photos exactly."],
                ["Rohit Sharma", 4, "True to colour", "Feather-touch feel is real. The insert could be a touch firmer."],
                ["Divya Menon", 5, "Sofa transformed", "Bought two. The hidden zip is invisible even up close."] ] ],
      ["p12", [ ["Arjun Malhotra", 5, "Sandalwood heaven", "40-hour burn claim is real — mine is on week 3. Fills the living room, never overpowering."],
                ["Pooja Rao", 5, "Date-night staple", "Vanilla-sandalwood blend is unisex and elegant. Dinner-party essential."],
                ["Vikram Shetty", 4, "Lovely, wish for bigger jars", "Fragrance throw is excellent. Would love a 100-hour XL size."] ] ],
      ["p13", [ ["Rohit Sharma", 5, "Bye-bye cable nest", "Three slots, magnetic pop-up ends, holds Lightning + USB-C + Watch. Desk finally looks adult."],
                ["Ananya Iyer", 4, "Strong magnets", "Cables snap in satisfyingly. A hair lighter would be nice but stability is great."],
                ["Debasish Banerjee", 4, "Minimal and useful", "Does exactly what it says. Anodised finish resists scratches."] ] ],
      ["p14", [ ["Megha Kulkarni", 5, "Charging, standing", "15W fast charge works — phone goes 0→50% before my morning chai. Bamboo base is gorgeous."],
                ["Suresh Pillai", 5, "Gift success", "Gave one to my dad; he uses it daily. Stand angle is perfect for video calls."],
                ["Priya Nair", 4, "Case friendly", "Charges through my rugged case. Superb value for the price."] ] ],
    ];
    const ins = db.prepare("INSERT INTO reviews (product_id, user_id, name, rating, title, body) VALUES (?, NULL, ?, ?, ?, ?)");
    db.exec("BEGIN");
    try {
      for (const [pid, rows] of sample) for (const [n, r, ttl, b] of rows) ins.run(pid, n, r, ttl, b);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    setSetting("reviews_seeded", "1");
    console.log("[seed] sample reviews inserted");
  }

  if (demo && db.prepare("SELECT COUNT(*) AS n FROM orders").get().n === 0) {
    const cust = db.prepare("SELECT id FROM users WHERE email = 'rohit@demo.in'").get();
    if (cust) {
      const ins = db.prepare(`INSERT INTO orders (user_id,customer_name,phone,address,note,items_json,total,status,created_at)
                              VALUES (?,?,?,?,?,?,?,?,datetime('now', ?))`);
      ins.run(cust.id, "Rohit Sharma", "+91 98765 01020", "14B, Gariahat Road, Kolkata 700029", "Call before delivery",
              JSON.stringify([{id:"p3",name:"USB-C 6-in-1 Hub 100W",price:1299,qty:1},{id:"p1",name:"Ergo Wireless Mouse",price:499,qty:1}]),
              1798, "delivered", "-9 days");
      ins.run(cust.id, "Rohit Sharma", "+91 98765 01020", "14B, Gariahat Road, Kolkata 700029", "",
              JSON.stringify([{id:"p4",name:"Terra Bluetooth Speaker",price:1499,qty:1}]),
              1499, "shipped", "-2 days");
      ins.run(cust.id, "Rohit Sharma", "+91 98765 01020", "14B, Gariahat Road, Kolkata 700029", "Gift wrap please",
              JSON.stringify([{id:"p2",name:"Luma LED Desk Lamp",price:899,qty:1},{id:"p5",name:"Speckled Ceramic Mug",price:349,qty:2}]),
              1597, "confirmed", "-6 hours");
      console.log("[seed] 3 demo orders for rohit@demo.in");
    }
    if (!db.prepare("SELECT 1 FROM inquiries LIMIT 1").get()) {
      db.prepare("INSERT INTO inquiries (name,phone,need,budget,message,created_at) VALUES (?,?,?,?,?,datetime('now','-1 day'))")
        .run("Meera Iyer", "+91 98101 23456", "Business website design & development", "₹5,000 – ₹15,000", "Need a site for my boutique — catalogue + WhatsApp enquiry. 10-day deadline if possible.");
    }
  }

};

/* boot: seed an entirely fresh database (fresh clones & first deploys).
   An install that chose “empty store” in the wizard is never re-stocked with demo data. */
try {
  const fresh = db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0;
  let intent = "";
  try { const r = db.prepare("SELECT value FROM store_settings WHERE key = 'seed_intent'").get(); intent = r ? r.value : ""; } catch {}
  if (fresh) seedDatabase({ demo: intent !== "empty" });
} catch (e) { console.error("[seed]", e); }

/* ════════════════ HELPERS ════════════════ */
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "120kb" }));
app.use((req, res, next) => {   // minimal security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

/* Fresh deploys: until the owner completes /setup.html, GETs hold at the wizard.
   API, static assets, the wizard itself and robots/sitemap stay open. */
const SETUP_FREE = [/^\/api\//, /^\/assets\//, /^\/setup\.html$/, /^\/favicon\.ico$/, /^\/robots\.txt$/, /^\/sitemap\.xml$/];
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (isSetupComplete()) return next();
  if (SETUP_FREE.some(rx => rx.test(req.path))) return next();
  return res.redirect(302, "/setup.html");
});

const parseCookies = (req) => {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
};
const userPublic = (u) => u && ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, created_at: u.created_at });

const currentUser = (req) => {
  const { dd_sid } = parseCookies(req);
  if (!dd_sid) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token = ? AND s.expires_at > datetime('now')`).get(dd_sid);
  return row || null;
};
const createSession = (res, userId) => {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,datetime('now', ?))")
    .run(token, userId, `+${SESSION_DAYS} days`);
  res.setHeader("Set-Cookie", `dd_sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
};
const destroySession = (req, res) => {
  const { dd_sid } = parseCookies(req);
  if (dd_sid) db.prepare("DELETE FROM sessions WHERE token = ?").run(dd_sid);
  res.setHeader("Set-Cookie", "dd_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
};

const requireAuth  = (req, res, next) => { const u = currentUser(req); if (!u) return res.status(401).json({ error: "Sign in required" }); req.user = u; next(); };
const requireAdmin = (req, res, next) => { const u = currentUser(req); if (!u) return res.status(401).json({ error: "Sign in required" }); if (u.role !== "admin") return res.status(403).json({ error: "Admins only" }); req.user = u; next(); };

const asyncWrap = (fn) => (req, res) => { Promise.resolve()
  .then(() => fn(req, res))
  .catch(err => { console.error("[api]", err); res.status(500).json({ error: "Something went wrong" }); }); };

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());

/* naive login throttle (per IP+email) */
const attempts = new Map();
const throttled = (key) => {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) { attempts.delete(key); return false; }
  return rec.count >= 8;
};
const bumpAttempt = (key) => {
  const rec = attempts.get(key) || { count: 0, resetAt: Date.now() + 5 * 60 * 1000 };
  rec.count += 1; attempts.set(key, rec);
};

/* ════════════════ AUTH API ════════════════ */
app.post("/api/auth/register", asyncWrap(async (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !String(name).trim())        return res.status(400).json({ error: "Please tell me your name" });
  if (!emailOk(email))                      return res.status(400).json({ error: "That email doesn't look right" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  const norm = String(email).trim().toLowerCase();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(norm)) {
    return res.status(409).json({ error: "An account with this email already exists — try signing in" });
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const info = db.prepare("INSERT INTO users (name,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?,'user')")
    .run(String(name).trim(), norm, String(phone || "").trim(), hashPw(String(password), salt), salt);
  createSession(res, Number(info.lastInsertRowid));
  res.status(201).json({ user: userPublic(db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid))) });
}));

app.post("/api/auth/login", asyncWrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  const norm = String(email).trim().toLowerCase();
  const key = `${req.ip}|${norm}`;
  if (throttled(key)) return res.status(429).json({ error: "Too many attempts — try again in 5 minutes" });
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(norm);
  if (!u || hashPw(String(password), u.password_salt) !== u.password_hash) {
    bumpAttempt(key);
    return res.status(401).json({ error: "Invalid email or password" });
  }
  attempts.delete(key);
  createSession(res, u.id);
  res.json({ user: userPublic(u) });
}));

app.post("/api/auth/logout", asyncWrap(async (req, res) => { destroySession(req, res); res.json({ ok: true }); }));
app.get("/api/me", (req, res) => res.json({ user: userPublic(currentUser(req)) }));
app.put("/api/me", requireAuth, asyncWrap(async (req, res) => {
  const name = String(req.body?.name ?? req.user.name).trim();
  const phone = String(req.body?.phone ?? req.user.phone).trim();
  if (!name) return res.status(400).json({ error: "Name can't be empty" });
  db.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?").run(name, phone, req.user.id);
  res.json({ user: userPublic(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)) });
}));

/* ════════════════ PRODUCTS ════════════════ */
const productOut = (p) => ({ id: p.id, name: p.name, meta: p.meta, tag: p.tag,
  price: p.price, was: p.was, rating: p.rating, stock: p.stock, img: p.img,
  reviews: Number(p.reviews || 0), active: !!p.active });

/* ════════════════ STORE CONFIG (public) ════════════════ */
const numSetting = (k, fallback) => { const n = Number(getSetting(k)); return Number.isFinite(n) && n >= 0 ? n : fallback; };
const storeConfig = () => {
  let featured = [];
  try { const a = JSON.parse(getSetting("featured_ids")); if (Array.isArray(a)) featured = a.filter(x => typeof x === "string").slice(0, 8); } catch {}
  return {
    announce:    getSetting("announce"),
    freeAt:      numSetting("free_at", 999),
    deliveryFee: numSetting("deliver_fee", 49),
    codEnabled:  getSetting("cod_enabled") === "1",
    codMin:      numSetting("cod_min", 0),
    maxQty:      numSetting("max_qty", 99),
    storeLive:   getSetting("store_live") === "1",
    featuredIds: featured,
  };
};

app.get("/api/store/config", (req, res) => res.json(storeConfig()));

/* ════════════════ COUPONS (server-authoritative) ════════════════ */
const couponRow = (raw) => db.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1")
  .get(String(raw || "").trim().toUpperCase()) || null;
const couponUsable = (c) => !!c && (!c.max_uses || Number(c.used) < Number(c.max_uses));
const computeDiscount = (c, subtotal) => {
  if (!c || subtotal < (c.min_order || 0)) return 0;
  return c.type === "percent" ? Math.round(subtotal * (c.value / 100)) : Math.min(c.value, subtotal);
};

app.post("/api/coupons/validate", asyncWrap(async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const subtotal = Math.max(0, Math.round(Number(req.body?.subtotal) || 0));
  if (!code) return res.status(400).json({ error: "Enter a coupon code" });
  const c = couponRow(code);
  if (!c) return res.status(404).json({ error: "That coupon code doesn't exist" });
  if (!couponUsable(c)) return res.status(409).json({ error: "This coupon has been fully used" });
  if (subtotal < c.min_order) return res.status(400).json({ error: `Spend at least ₹${c.min_order} to use ${c.code}` });
  res.json({ valid: true, code: c.code, type: c.type, value: c.value, min_order: c.min_order, discount: computeDiscount(c, subtotal) });
}));

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY created_at, id").all();
  res.json({ products: rows.map(productOut) });
});

/* ════════════════ ORDERS ════════════════ */
const parseItems = (s) => { try { return JSON.parse(s); } catch { return []; } };

app.post("/api/orders", asyncWrap(async (req, res) => {
  const { customer_name, phone, address, note, items, coupon, payment } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Your cart is empty" });
  const cfg = storeConfig();
  if (!cfg.storeLive) return res.status(503).json({ error: "The store is momentarily closed — please try again shortly" });
  const me = currentUser(req);
  const name = String(customer_name || (me && me.name) || "").trim();
  if (!name) return res.status(400).json({ error: "Please tell me your name" });

  const pay = payment === "upi" ? "upi" : "cod";
  if (pay === "cod" && !cfg.codEnabled) return res.status(400).json({ error: "Cash on Delivery is temporarily unavailable — please choose UPI on delivery" });
  const picked = [];
  let subtotal = 0;
  for (const line of items) {
    const qty = Math.max(1, Math.min(cfg.maxQty, Number(line.qty) || 1));
    const p = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(String(line.id));
    if (!p) return res.status(400).json({ error: "One of the items is no longer available" });
    if (p.stock < qty) return res.status(400).json({ error: `Only ${p.stock} left of ${p.name}` });
    picked.push({ id: p.id, name: p.name, price: p.price, qty });
    subtotal += p.price * qty;
  }

  // coupon — validate server-side, never trust the client's maths
  let couponCode = "", discount = 0;
  if (coupon && String(coupon).trim()) {
    const c = couponRow(coupon);
    if (!c) return res.status(400).json({ error: "That coupon code doesn't exist" });
    if (!couponUsable(c)) return res.status(409).json({ error: "This coupon has been fully used" });
    if (subtotal < c.min_order) return res.status(400).json({ error: `Spend at least ₹${c.min_order} to use ${c.code}` });
    discount = computeDiscount(c, subtotal);
    couponCode = c.code;
  }

  if (pay === "cod" && cfg.codMin > 0 && subtotal < cfg.codMin) {
    return res.status(400).json({ error: `Cash on Delivery is available on orders of ₹${cfg.codMin} and above — please add ${(cfg.codMin - subtotal).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} more, or choose UPI on delivery` });
  }

  const delivery = subtotal >= cfg.freeAt ? 0 : cfg.deliveryFee;
  const total    = Math.max(0, subtotal - discount + delivery);
  const info = db.prepare(`INSERT INTO orders (user_id,customer_name,phone,address,note,items_json,total,payment,coupon_code,discount,status)
                           VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`)
    .run(me ? me.id : null, name, String(phone || "").trim(), String(address || "").trim(), String(note || "").trim(),
         JSON.stringify(picked), total, pay, couponCode, discount);
  if (couponCode) db.prepare("UPDATE coupons SET used = used + 1 WHERE code = ?").run(couponCode);
  // decrement stock
  const dec = db.prepare("UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?");
  for (const it of picked) dec.run(it.qty, it.id);

  res.status(201).json({ order: { id: Number(info.lastInsertRowid), total, subtotal, discount, delivery,
    coupon: couponCode || null, payment: pay, status: "pending", items: picked } });
}));

app.get("/api/my/orders", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY datetime(created_at) DESC, id DESC").all(req.user.id);
  res.json({ orders: rows.map(o => ({ ...o, items: parseItems(o.items_json) })) });
});

/* ════════════════ INQUIRIES ════════════════ */
app.post("/api/inquiries", asyncWrap(async (req, res) => {
  const { name, phone, need, budget, message } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
  db.prepare("INSERT INTO inquiries (name,phone,need,budget,message) VALUES (?,?,?,?,?)")
    .run(String(name).trim(), String(phone || "").trim(), String(need || "").trim(), String(budget || "").trim(), String(message || "").trim());
  res.status(201).json({ ok: true });
}));

/* ════════════════ ADMIN API ════════════════ */
app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const revenue  = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled'").get().s;
  const orders   = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const pending  = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").get().n;
  const customers= db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'user'").get().n;
  const products = db.prepare("SELECT COUNT(*) AS n FROM products WHERE active = 1").get().n;
  const lowStock = db.prepare("SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock <= 5").get().n;
  const inquiries= db.prepare("SELECT COUNT(*) AS n FROM inquiries").get().n;
  const todayRev = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled' AND date(created_at) = date('now')").get().s;
  res.json({ revenue, todayRev, orders, pending, customers, products, lowStock, inquiries });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id
                           ORDER BY datetime(o.created_at) DESC, o.id DESC LIMIT 200`).all();
  res.json({ orders: rows.map(o => ({ ...o, items: parseItems(o.items_json) })) });
});
app.put("/api/admin/orders/:id/status", requireAdmin, asyncWrap(async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["pending","confirmed","shipped","delivered","cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const info = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "Order not found" });
  res.json({ ok: true });
}));

app.get("/api/admin/products", requireAdmin, (req, res) => {
  res.json({ products: db.prepare("SELECT * FROM products ORDER BY created_at, id").all().map(productOut) });
});
const readProductBody = (body, existing = {}) => {
  const name  = String(body.name ?? existing.name ?? "").trim();
  if (!name) throw Object.assign(new Error("Name is required"), { status: 400 });
  const price = Math.max(0, Math.round(Number(body.price ?? existing.price ?? 0)));
  const was   = Math.max(0, Math.round(Number(body.was   ?? existing.was   ?? 0)));
  const stock = Math.max(0, Math.round(Number(body.stock ?? existing.stock ?? 0)));
  const rating= Math.min(5, Math.max(0, Number(body.rating ?? existing.rating ?? 4.5)));
  return {
    name, price, was, stock, rating,
    meta:   String(body.meta   ?? existing.meta   ?? "").trim(),
    tag:    String(body.tag    ?? existing.tag    ?? "Tech").trim() || "Tech",
    img:    String(body.img    ?? existing.img    ?? "assets/img/product-mouse.jpg").trim(),
    active: (body.active ?? existing.active ?? true) ? 1 : 0,
  };
};
app.post("/api/admin/products", requireAdmin, asyncWrap(async (req, res) => {
  let p; try { p = readProductBody(req.body || {}); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const id = "pr_" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  db.prepare("INSERT INTO products (id,name,meta,tag,price,was,rating,stock,img,active) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, p.name, p.meta, p.tag, p.price, p.was, p.rating, p.stock, p.img, p.active);
  res.status(201).json({ product: productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(id)) });
}));
app.put("/api/admin/products/:id", requireAdmin, asyncWrap(async (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(String(req.params.id));
  if (!existing) return res.status(404).json({ error: "Product not found" });
  let p; try { p = readProductBody(req.body || {}, existing); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  db.prepare("UPDATE products SET name=?,meta=?,tag=?,price=?,was=?,rating=?,stock=?,img=?,active=? WHERE id=?")
    .run(p.name, p.meta, p.tag, p.price, p.was, p.rating, p.stock, p.img, p.active, existing.id);
  res.json({ product: productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(existing.id)) });
}));
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  const info = db.prepare("UPDATE products SET active = 0 WHERE id = ?").run(String(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "Product not found" });
  res.json({ ok: true });
});

app.get("/api/admin/customers", requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.name, u.email, u.phone, u.created_at,
                                  COUNT(o.id) AS orders,
                                  COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS revenue
                           FROM users u LEFT JOIN orders o ON o.user_id = u.id
                           WHERE u.role = 'user' GROUP BY u.id ORDER BY revenue DESC, u.id`).all();
  res.json({ customers: rows });
});
app.get("/api/admin/inquiries", requireAdmin, (req, res) => {
  res.json({ inquiries: db.prepare("SELECT * FROM inquiries ORDER BY datetime(created_at) DESC, id DESC LIMIT 100").all() });
});

/* ════════════════ REVIEWS ════════════════ */
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const getProductActive = (id) => db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(String(id));

app.get("/api/products/:id/reviews", (req, res) => {
  const pid = String(req.params.id || "");
  if (!getProductActive(pid)) return res.status(404).json({ error: "Product not found" });
  const rows = db.prepare("SELECT id, name, rating, title, body, created_at FROM reviews WHERE product_id = ? ORDER BY id DESC LIMIT 12").all(pid);
  res.json({ reviews: rows });
});

app.post("/api/products/:id/reviews", requireAuth, asyncWrap(async (req, res) => {
  const pid = String(req.params.id || "");
  const prod = getProductActive(pid);
  if (!prod) return res.status(404).json({ error: "Product not found" });
  const rating = Math.round(Number(req.body?.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Pick a star rating (1–5)" });
  const title = String(req.body?.title || "").trim().slice(0, 80);
  const body  = String(req.body?.body  || "").trim().slice(0, 600);
  if (body.length < 4) return res.status(400).json({ error: "Please write a few words about the product" });
  const exists = db.prepare("SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?").get(pid, req.user.id);
  if (exists) return res.status(409).json({ error: "You’ve already reviewed this product" });
  db.prepare("INSERT INTO reviews (product_id, user_id, name, rating, title, body) VALUES (?,?,?,?,?,?)")
    .run(pid, req.user.id, req.user.name, rating, title, body);
  db.prepare("UPDATE products SET reviews = reviews + 1 WHERE id = ?").run(pid);
  const review = db.prepare("SELECT id, name, rating, title, body, created_at FROM reviews WHERE product_id = ? AND user_id = ?").get(pid, req.user.id);
  res.status(201).json({ ok: true, review });
}));

/* ════════════════ INVOICES (owner or admin only) ════════════════ */
const siteGet = (k) => { try { const v = getSetting(k); return v === undefined || v === null ? "" : String(v); } catch { return ""; } };
const sellerInfo = () => ({
  name: siteGet("site_brand") || "Debasish Das — Web Studio & Store",
  line: siteGet("site_tagline") || process.env.SELLER_LINE || "Web design · Hosting · Handpicked store",
  addr: siteGet("site_address") || process.env.SELLER_ADDR || "Kolkata, West Bengal 700001, India",
  gstin: siteGet("site_gstin") || process.env.SELLER_GSTIN || "19ABCDE1234F1Z5 (sample)",
  email: siteGet("site_email") || process.env.SELLER_EMAIL || "hello@example.com",
  phone: siteGet("site_phone") || process.env.SELLER_PHONE || "+91 00000 00000",
});

app.get("/api/invoices/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const o = Number.isInteger(id) ? db.prepare("SELECT * FROM orders WHERE id = ?").get(id) : null;
  if (!o) return res.status(404).json({ error: "Invoice not found" });
  if (o.user_id !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "Not your invoice" });
  const items = parseItems(o.items_json);
  const subtotal = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 0), 0);
  const discount = Number(o.discount || 0);
  const delivery = Math.max(0, Number(o.total) - subtotal + discount);
  const gst = Math.round(Number(o.total) * 18 / 118);
  res.json({
    invoice: {
      id: o.id, createdAt: o.created_at, status: o.status,
      customer: { name: o.customer_name, phone: o.phone, address: o.address },
      items: items.map(i => ({ id: i.id, name: i.name, price: Number(i.price || 0), qty: Number(i.qty || 0), lineTotal: Number(i.price || 0) * Number(i.qty || 0) })),
      subtotal, discount, delivery, total: Number(o.total), gstIncluded: gst,
      payment: o.payment || "cod", coupon: o.coupon_code || "",
    },
    seller: sellerInfo(),
  });
});

/* ════════════════ ADMIN · REPORT (last 30 days) ════════════════ */
app.get("/api/admin/report", requireAdmin, (req, res) => {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const key = d.toISOString().slice(0, 10);
    const row = db.prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE status != 'cancelled' AND date(created_at) = date(?)").get(key);
    days.push({ date: key, orders: row.orders, revenue: row.revenue });
  }
  const recent = db.prepare("SELECT items_json, total, payment, coupon_code, discount, status FROM orders WHERE status != 'cancelled' AND datetime(created_at) >= datetime('now','-30 days')").all();
  const byProduct = new Map();
  let cod = 0, upi = 0, codRev = 0, upiRev = 0, couponOrders = 0, couponSaved = 0, units = 0;
  for (const o of recent) {
    if (o.payment === "upi") { upi++; upiRev += o.total; } else { cod++; codRev += o.total; }
    if (o.coupon_code) { couponOrders++; couponSaved += Number(o.discount || 0); }
    for (const it of parseItems(o.items_json)) {
      const key = it.id;
      const agg = byProduct.get(key) || { id: it.id, name: it.name, units: 0, revenue: 0 };
      agg.units += Number(it.qty || 0); agg.revenue += Number(it.price || 0) * Number(it.qty || 0);
      byProduct.set(key, agg); units += Number(it.qty || 0);
    }
  }
  const topProducts = [...byProduct.values()].sort((a, b) => b.units - a.units).slice(0, 5);
  const allTime = db.prepare("SELECT COALESCE(AVG(total),0) AS aov, COUNT(*) AS orders FROM orders WHERE status != 'cancelled'").get();
  res.json({ days, topProducts, payment: { cod, upi, codRevenue: codRev, upiRevenue: upiRev }, coupons: { orders: couponOrders, saved: couponSaved }, units30d: units, aov: Math.round(allTime.aov), ordersAllTime: allTime.orders });
});

/* ════════════════ ADMIN · STOREFRONT ════════════════ */
/* ════════════════ ADMIN · STOREFRONT ════════════════ */
app.get("/api/admin/store-config", requireAdmin, (req, res) => {
  const cfg = storeConfig();
  const inv = db.prepare("SELECT COALESCE(SUM(price * stock),0) AS value, COALESCE(SUM(stock),0) AS units, COUNT(*) AS skus FROM products WHERE active = 1").get();
  const out = db.prepare("SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock = 0").get().n;
  const low = db.prepare("SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock > 0 AND stock <= 5").get().n;
  res.json({ ...cfg, inventoryValue: inv.value, unitsInStock: inv.units, activeSkus: inv.skus, outOfStock: out, lowStock: low });
});

app.put("/api/admin/store-config", requireAdmin, asyncWrap(async (req, res) => {
  const body = req.body || {};
  const boolish = (v) => (v === true || v === "true" || v === 1 || v === "1") ? "1" : "0";
  const num = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return String(fallback);
    return String(Math.min(max, Math.max(min, n)));
  };
  if (body.announce !== undefined) {
    const s = String(body.announce).trim().slice(0, 140);
    setSetting("announce", s || DEFAULT_SETTINGS.announce);
  }
  if (body.freeAt !== undefined)      setSetting("free_at",     num(body.freeAt, 0, 100000, 999));
  if (body.deliveryFee !== undefined) setSetting("deliver_fee", num(body.deliveryFee, 0, 1000, 49));
  if (body.codEnabled !== undefined)  setSetting("cod_enabled", boolish(body.codEnabled));
  if (body.codMin !== undefined)      setSetting("cod_min",     num(body.codMin, 0, 100000, 0));
  if (body.maxQty !== undefined)      setSetting("max_qty",     num(body.maxQty, 1, 99, 99));
  if (body.storeLive !== undefined)   setSetting("store_live",  boolish(body.storeLive));
  if (body.featuredIds !== undefined) {
    const ids = Array.isArray(body.featuredIds) ? body.featuredIds.filter(x => typeof x === "string").slice(0, 8) : [];
    // keep only ids that exist
    const valid = ids.filter(id => db.prepare("SELECT 1 FROM products WHERE id = ?").get(id));
    setSetting("featured_ids", JSON.stringify(valid));
  }
  res.json({ ok: true, config: storeConfig() });
}));

app.get("/api/admin/coupons", requireAdmin, (req, res) => {
  res.json({ coupons: db.prepare("SELECT * FROM coupons ORDER BY active DESC, created_at DESC, code").all() });
});
app.post("/api/admin/coupons", requireAdmin, asyncWrap(async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return res.status(400).json({ error: "Code must be 3–20 characters: A–Z, 0–9, hyphen, underscore" });
  const type = req.body?.type === "flat" ? "flat" : "percent";
  const value = Math.round(Number(req.body?.value) || 0);
  if (type === "percent" && (value < 1 || value > 90)) return res.status(400).json({ error: "Percentage must be 1–90" });
  if (type === "flat" && value < 1) return res.status(400).json({ error: "Flat discount must be at least ₹1" });
  const min_order = Math.max(0, Math.round(Number(req.body?.min_order) || 0));
  const max_uses  = Math.max(0, Math.round(Number(req.body?.max_uses) || 0));
  if (db.prepare("SELECT 1 FROM coupons WHERE code = ?").get(code)) {
    return res.status(409).json({ error: `Coupon ${code} already exists` });
  }
  db.prepare("INSERT INTO coupons (code,type,value,min_order,max_uses) VALUES (?,?,?,?,?)").run(code, type, value, min_order, max_uses);
  res.status(201).json({ coupon: db.prepare("SELECT * FROM coupons WHERE code = ?").get(code) });
}));
app.put("/api/admin/coupons/:code", requireAdmin, asyncWrap(async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const c = db.prepare("SELECT * FROM coupons WHERE code = ?").get(code);
  if (!c) return res.status(404).json({ error: "Coupon not found" });
  if (req.body?.active !== undefined) {
    db.prepare("UPDATE coupons SET active = ? WHERE code = ?").run((req.body.active === true || req.body.active === "true" || req.body.active === 1 || req.body.active === "1") ? 1 : 0, code);
  }
  res.json({ coupon: db.prepare("SELECT * FROM coupons WHERE code = ?").get(code) });
}));
app.delete("/api/admin/coupons/:code", requireAdmin, (req, res) => {
  const info = db.prepare("DELETE FROM coupons WHERE code = ?").run(String(req.params.code || "").toUpperCase());
  if (!info.changes) return res.status(404).json({ error: "Coupon not found" });
  res.json({ ok: true });
});

/* ════════════════ PRODUCT PAGE (server-rendered head for SEO/social) ════════════════ */
const fmtInrServer = (n) => "₹" + Number(n).toLocaleString("en-IN");
const productTemplate = (() => {
  let cache = null;
  return () => {
    if (cache) return cache;
    try { cache = fs.readFileSync(path.join(ROOT, "product.html"), "utf8"); } catch { cache = null; }
    return cache;
  };
})();
app.get("/product/:id", (req, res) => {
  const id = String(req.params.id || "");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return res.status(404).sendFile(path.join(ROOT, "404.html"));
  const p = getProductActive(id);
  if (!p) return res.status(404).sendFile(path.join(ROOT, "404.html"));

  const base = `${req.protocol}://${req.get("host")}`;
  const imgAbs = `${base}/${p.img.replace(/^\/+/, "")}`;
  const url = `${base}/product/${p.id}`;
  const title = `${p.name} — ${fmtInrServer(p.price)} | The Shelf · debasish.`;
  const desc = `${p.name} — ${p.meta}. ${fmtInrServer(p.price)} (GST included). Free delivery above ₹999 · COD & UPI on delivery · 7-day easy returns.`;
  const jsonld = JSON.stringify({
    "@context": "https://schema.org", "@type": "Product",
    name: p.name, sku: p.id.toUpperCase(), image: imgAbs,
    description: `${p.name} — ${p.meta}.`,
    brand: { "@type": "Brand", name: "debasish." },
    aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews },
    offers: {
      "@type": "Offer", url, priceCurrency: "INR", price: p.price, itemCondition: "https://schema.org/NewCondition",
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "debasish. — Web Studio & Store" },
    },
  }).replace(/</g, "\\u003c");

  const template = productTemplate();
  if (!template) return res.status(500).send("Product template missing");
  const repl = { "__PRODUCT_ID_TOKEN__": p.id, "__BASE__": base, "__TITLE__": escHtml(title), "__DESC__": escHtml(desc), "__OG_IMAGE__": imgAbs, "__CANONICAL__": url, "__JSONLD__": jsonld };
  const html = Object.entries(repl).reduce((acc, [k, v]) => acc.split(k).join(v), template);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(html);
});

/* ════════════════ SITEMAP + ROBOTS (publicity) ════════════════ */
app.get("/sitemap.xml", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  const urls = ["/", "/services.html", "/hosting.html", "/store.html", "/contact.html", "/login.html"];
  const prods = db.prepare("SELECT id, created_at FROM products WHERE active = 1 ORDER BY id").all();
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${base}${u}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${u === "/" ? "1.0" : "0.8"}</priority></url>`).join("\n")}
${prods.map(p => `  <url><loc>${base}/product/${p.id}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`).join("\n")}
</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(xml);
});
app.get("/robots.txt", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /dashboard.html\nDisallow: /invoice.html\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`);
});

/* ════════════════ SETUP WIZARD (/setup.html) ════════════════ */
const isSetupComplete = () => { try { return getSetting("setup_completed") === "1"; } catch { return false; } };
const siteSettings = () => ({
  brand: siteGet("site_brand"), tagline: siteGet("site_tagline"), address: siteGet("site_address"),
  gstin: siteGet("site_gstin"), email: siteGet("site_email"), phone: siteGet("site_phone"), whatsapp: siteGet("site_whatsapp"),
});
const dbCounts = () => ({
  users: db.prepare("SELECT COUNT(*) n FROM users").get().n,
  products: db.prepare("SELECT COUNT(*) n FROM products").get().n,
  orders: db.prepare("SELECT COUNT(*) n FROM orders").get().n,
  reviews: db.prepare("SELECT COUNT(*) n FROM reviews").get().n,
  coupons: db.prepare("SELECT COUNT(*) n FROM coupons").get().n,
  inquiries: db.prepare("SELECT COUNT(*) n FROM inquiries").get().n,
});
const dbInfo = () => {
  let size = null; try { size = fs.statSync(currentDbPath).size; } catch {}
  return { engine: "SQLite (node:sqlite — built into Node, zero external services)",
           path: currentDbPath, defaultPath: path.join(DATA_DIR, "site.db"), envLocked: !!ENV_DB_PATH, size, counts: dbCounts() };
};
const requireSetupOpen = (req, res, next) => {
  if (!isSetupComplete()) return next();
  const u = currentUser(req);
  if (u && u.role === "admin") return next();
  return res.status(403).json({ error: "Setup is already complete — sign in as admin to change these settings." });
};
const WIPE_TABLES = ["reviews", "orders", "sessions", "coupons", "inquiries", "products", "users", "store_settings"];
const wipeAllTables = () => {   // used by the wizard's explicit “erase & reinstall”
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of WIPE_TABLES) db.prepare(`DELETE FROM ${t}`).run();
  db.exec("PRAGMA foreign_keys = ON");
  try { db.exec("VACUUM"); } catch {}
};

app.get("/api/setup/status", (req, res) => {
  const installed = isSetupComplete();
  const u = currentUser(req);
  if (installed && (!u || u.role !== "admin")) return res.json({ installed: true });
  res.json({ installed, completedAt: siteGet("setup_completed_at") || null, signedInAs: u ? { name: u.name, role: u.role } : null,
             ...dbInfo(), settings: siteSettings(), store: storeConfig() });
});

app.post("/api/setup/test-db", requireSetupOpen, asyncWrap(async (req, res) => {
  const target = resolveDbTarget(req.body?.path);
  const existed = fs.existsSync(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let test = null;
  try {
    test = new DatabaseSync(target);
    const integ = Object.values(test.prepare("PRAGMA integrity_check").get())[0];
    const has = (t) => !!test.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(t);
    let counts = null;
    if (has("users") && has("products")) {
      counts = { users: test.prepare("SELECT COUNT(*) n FROM users").get().n,
                 products: test.prepare("SELECT COUNT(*) n FROM products").get().n,
                 orders: test.prepare("SELECT COUNT(*) n FROM orders").get().n };
    }
    test.close();
    if (!existed) { try { fs.unlinkSync(target); } catch {} }   // test must not leave stray files
    res.json({ ok: true, path: target, existed, counts, integrity: integ });
  } catch (e) {
    if (test) try { test.close(); } catch {}
    if (!existed) { try { fs.unlinkSync(target); } catch {} }
    res.status(400).json({ error: "Can't use that file as the site database: " + e.message });
  }
}));

app.post("/api/setup/database", requireSetupOpen, asyncWrap(async (req, res) => {
  const mode = req.body?.mode === "empty" ? "empty" : "demo";
  const confirmReset = req.body?.confirmReset === true || req.body?.confirmReset === "true";
  const target = resolveDbTarget(req.body?.path);
  const sameFile = path.resolve(target) === path.resolve(currentDbPath);
  if (sameFile) {
    const n = dbCounts().users + dbCounts().products;
    if (n > 0 && mode === "empty" && !confirmReset) return res.status(409).json({ error: "That database already holds data — tick “erase existing data” to wipe and reinstall.", needsReset: true, counts: dbCounts() });
    if (n > 0 && confirmReset) wipeAllTables();
    if (n === 0 || confirmReset) seedDatabase({ demo: mode === "demo" });
    return res.json({ ok: true, path: currentDbPath, seeded: (n === 0 || confirmReset) ? mode : "kept-existing", counts: dbCounts() });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const test = new DatabaseSync(target);   // creates/validates the file
  const had = !!test.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'users'").get();
  let n = 0;
  if (had) { try { n = test.prepare("SELECT COUNT(*) n FROM users").get().n + test.prepare("SELECT COUNT(*) n FROM products").get().n; } catch {} }
  test.close();
  if (n > 0 && mode === "empty" && !confirmReset) return res.status(409).json({ error: "That database already holds data — tick “erase existing data” to wipe and reinstall.", needsReset: true, counts: null });
  try { db.close(); } catch {}
  currentDbPath = target;
  openDb(currentDbPath);
  if (n > 0) wipeAllTables();
  if (n === 0 || confirmReset) seedDatabase({ demo: mode === "demo" });
  writeInstall({ dbPath: currentDbPath });
  res.json({ ok: true, path: currentDbPath, seeded: (n === 0 || confirmReset) ? mode : "kept-existing", counts: dbCounts() });
}));

app.post("/api/setup/site", requireSetupOpen, (req, res) => {
  const b = req.body || {};
  const clean = (v, max) => String(v ?? "").trim().slice(0, max);
  if (b.brand !== undefined)    setSetting("site_brand", clean(b.brand, 80));
  if (b.tagline !== undefined)  setSetting("site_tagline", clean(b.tagline, 140));
  if (b.address !== undefined)  setSetting("site_address", clean(b.address, 160));
  if (b.gstin !== undefined)    setSetting("site_gstin", clean(b.gstin, 32));
  if (b.email !== undefined) {
    const e = clean(b.email, 120);
    if (e && !emailOk(e)) return res.status(400).json({ error: "That email looks invalid" });
    setSetting("site_email", e);
  }
  if (b.phone !== undefined)    setSetting("site_phone", clean(b.phone, 32));
  if (b.whatsapp !== undefined) setSetting("site_whatsapp", clean(b.whatsapp, 20).replace(/\D/g, ""));
  res.json({ ok: true, settings: siteSettings() });
});

app.post("/api/setup/admin", requireSetupOpen, asyncWrap(async (req, res) => {
  const b = req.body || {};
  const name  = String(b.name || "").trim().slice(0, 80) || "Site Admin";
  const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(b.password || "");
  const phone = String(b.phone || "").trim().slice(0, 32);
  if (!emailOk(email)) return res.status(400).json({ error: "Enter a valid admin email" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (password.length > 100) return res.status(400).json({ error: "Password too long" });
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPw(password, salt);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  const { dd_sid } = parseCookies(req);
  if (existing) {
    db.prepare("UPDATE users SET name=?, phone=?, password_hash=?, password_salt=?, role='admin' WHERE id=?").run(name, phone, hash, salt, existing.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token <> ?").run(existing.id, dd_sid || "");
  } else {
    db.prepare("INSERT INTO users (name,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?, 'admin')").run(name, email, phone, hash, salt);
  }
  res.json({ ok: true, email, updated: !!existing });
}));

app.post("/api/setup/store", requireSetupOpen, (req, res) => {
  const b = req.body || {};
  const boolish = (v) => (v === true || v === "true" || v === 1 || v === "1") ? "1" : "0";
  const num = (v, min, max, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? String(Math.min(max, Math.max(min, n))) : String(fallback); };
  if (b.announce !== undefined)    setSetting("announce", String(b.announce).trim().slice(0, 140) || DEFAULT_SETTINGS.announce);
  if (b.freeAt !== undefined)      setSetting("free_at",     num(b.freeAt, 0, 100000, 999));
  if (b.deliveryFee !== undefined) setSetting("deliver_fee", num(b.deliveryFee, 0, 1000, 49));
  if (b.codEnabled !== undefined)  setSetting("cod_enabled", boolish(b.codEnabled));
  if (b.codMin !== undefined)      setSetting("cod_min",     num(b.codMin, 0, 100000, 0));
  if (b.maxQty !== undefined)      setSetting("max_qty",     num(b.maxQty, 1, 99, 99));
  if (b.storeLive !== undefined)   setSetting("store_live",  boolish(b.storeLive));
  res.json({ ok: true, config: storeConfig() });
});

app.post("/api/setup/complete", requireSetupOpen, (req, res) => {
  setSetting("setup_completed", "1");
  setSetting("setup_completed_at", new Date().toISOString());
  res.json({ ok: true });
});

app.get("/setup.html", (req, res) => {
  if (isSetupComplete() && currentUser(req)?.role !== "admin") return res.redirect(302, "/login.html?next=/setup.html");
  res.sendFile(path.join(ROOT, "setup.html"));
});

app.get("/api/admin/backup", requireAdmin, (req, res) => {
  const tmp = path.join(os.tmpdir(), `mysite-backup-${Date.now()}.db`);
  try { db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); }
  catch (e) { return res.status(500).json({ error: "Backup failed: " + e.message }); }
  res.download(tmp, `mysite-backup-${new Date().toISOString().slice(0, 10)}.db`, () => { try { fs.unlinkSync(tmp); } catch {} });
});

app.post("/api/admin/restore", requireAdmin, express.raw({ type: () => true, limit: "40mb" }), asyncWrap(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 100) return res.status(400).json({ error: "Empty or unreadable upload — pick the .db backup file." });
  if (buf.subarray(0, 16).toString("latin1") !== "SQLite format 3\u0000") return res.status(400).json({ error: "That file is not a SQLite database." });
  const target = currentDbPath;
  const backup = `${target}.bak-${Date.now()}`;
  try { fs.copyFileSync(target, backup); } catch (e) { return res.status(500).json({ error: "Could not snapshot the current database first: " + e.message }); }
  try { db.close(); } catch {}
  const tmpFile = `${target}.restore-tmp`;
  fs.writeFileSync(tmpFile, buf);
  try {
    const test = new DatabaseSync(tmpFile);
    const integ = Object.values(test.prepare("PRAGMA integrity_check").get())[0];
    const ok = test.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'users'").get();
    test.close();
    if (!ok || integ !== "ok") throw new Error("missing required schema or failed integrity check");
    fs.renameSync(tmpFile, target);
  } catch (e) {
    try { fs.copyFileSync(backup, target); } catch {}
    try { fs.unlinkSync(tmpFile); } catch {}
    openDb(target);
    return res.status(400).json({ error: "Restore rolled back — " + e.message });
  }
  openDb(target);
  res.json({ ok: true, counts: dbCounts(), backup: path.basename(backup) });
}));

/* ════════════════ STATIC SITE ════════════════ */
/* Never serve the database, server source, or anything sensitive. */
const STATIC_BLOCK = [/^\/data(\/|$)/i, /^\/server(\/|$)/i, /^\/node_modules(\/|$)/i, /^\/package(-lock)?\.json$/i, /^\/README\.md$/i];
app.use((req, res, next) => {
  if (STATIC_BLOCK.some(rx => rx.test(req.path))) return res.status(404).send("Not found");
  next();
});

/* JS assets get the same contact-placeholder substitution as the HTML pages,
   so runtime-built links (wa.me/…, mailto:) follow the setup wizard too. */
const jsCache = new Map();
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!/^\/assets\/js\/[\w.-]+\.js$/.test(req.path)) return next();
  let src = jsCache.get(req.path);
  if (src === undefined) {
    try { src = fs.readFileSync(path.join(ROOT, req.path), "utf8"); jsCache.set(req.path, src); } catch { return next(); }
  }
  let out = src;
  const wa = siteGet("site_whatsapp").replace(/\D/g, "");
  const se = siteGet("site_email");
  const sp = siteGet("site_phone");
  if (wa) out = out.split("910000000000").join(wa);
  if (se) out = out.split("hello@example.com").join(se);
  if (sp) out = out.split("+91 00000 00000").join(sp);
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(out);
});

/* HTML pages get __BASE__ tokens resolved to the request origin (OG/canonical URLs) */
app.get("/index.html", (req, res) => res.redirect(301, "/"));
app.get("/index", (req, res) => res.redirect(301, "/"));
const HTML_PAGES = { "/": "index.html", "/services.html": "services.html", "/hosting.html": "hosting.html", "/store.html": "store.html", "/contact.html": "contact.html" };
const pageCache = new Map();
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const file = HTML_PAGES[req.path];
  if (!file) return next();
  let html = pageCache.get(file);
  if (!html) {
    try { html = fs.readFileSync(path.join(ROOT, file), "utf8"); pageCache.set(file, html); } catch { return next(); }
  }
  const base = `${req.protocol}://${req.get("host")}`;
  let out = html.split("__BASE__").join(base);
  const wa = siteGet("site_whatsapp").replace(/\D/g, "");
  const se = siteGet("site_email");
  const sp = siteGet("site_phone");
  if (wa) out = out.split("910000000000").join(wa);
  if (se) out = out.split("hello@example.com").join(se);
  if (sp) out = out.split("+91 00000 00000").join(sp);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(out);
});

app.use(express.static(ROOT, {
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (/\.(css|js|jpg|jpeg|png|svg|woff2?)$/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=3600");
    else res.setHeader("Cache-Control", "no-cache");
  },
}));

/* API 404 (JSON) + branded 404 page for everything else */
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
app.use((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(404).send("Not found");
  res.status(404).sendFile(path.join(ROOT, "404.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Debasish Das — Web Studio & Store`);
  console.log(`  ➜  http://0.0.0.0:${PORT}\n  Admin: ${adminEmail}\n`);
});
