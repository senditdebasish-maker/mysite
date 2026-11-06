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
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "site.db");
const PORT    = process.env.PORT || 8000;
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

/* ════════════════ DATABASE ════════════════ */
const db = new DatabaseSync(DB_PATH);
db.exec(`
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
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
`);

/* ════════════════ SEED (idempotent) ════════════════ */
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const mkUser = (name, email, phone, password, role) => {
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("INSERT INTO users (name,email,phone,password_hash,password_salt,role) VALUES (?,?,?,?,?,?)")
    .run(name, email.toLowerCase(), phone, hashPw(password, salt), salt, role);
};

const adminEmail = (process.env.ADMIN_EMAIL || "admin@debasishdas.in").toLowerCase();
const adminPw    = process.env.ADMIN_PASSWORD || "admin123";

if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get(adminEmail)) {
  mkUser("Debasish Das", adminEmail, "+91 00000 00000", adminPw, "admin");
  console.log(`[seed] admin created → ${adminEmail}`);
}
if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get("rohit@demo.in")) {
  mkUser("Rohit Sharma", "rohit@demo.in", "+91 98765 01020", "customer123", "user");
}

const SEED_PRODUCTS = [
  ["p1","Ergo Wireless Mouse","2.4GHz + Bluetooth · 3 modes","Tech",499,799,4.6,40,"assets/img/product-mouse.jpg"],
  ["p2","Luma LED Desk Lamp","3 light tones · USB charge port","Home & Living",899,1299,4.8,32,"assets/img/product-lamp.jpg"],
  ["p3","USB-C 6-in-1 Hub 100W","4K HDMI · PD 100W · SD reader","Tech",1299,1799,4.5,25,"assets/img/product-hub.jpg"],
  ["p4","Terra Bluetooth Speaker","12h playtime · TWS pairing","Tech",1499,2199,4.7,18,"assets/img/product-speaker.jpg"],
  ["p5","Speckled Ceramic Mug","350 ml · handmade · microwave safe","Home & Living",349,499,4.9,60,"assets/img/product-mug.jpg"],
  ["p6","Walnut Desk Organiser","Solid walnut · phone + pen slots","Home & Living",749,1099,4.8,4,"assets/img/product-organizer.jpg"],
  ["p7","Aura TKL Keyboard 68","Tri-mode · linear red switches","Tech",1999,2499,4.7,12,"assets/img/product-keyboard.jpg"],
  ["p8","Copper Hammered Bottle","750 ml · 99.9% pure copper","Home & Living",799,1199,4.8,3,"assets/img/product-bottle.jpg"],
];
if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) {
  const ins = db.prepare("INSERT INTO products (id,name,meta,tag,price,was,rating,stock,img) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const p of SEED_PRODUCTS) ins.run(...p);
  console.log("[seed] 8 products inserted");
}

if (db.prepare("SELECT COUNT(*) AS n FROM orders").get().n === 0) {
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
  price: p.price, was: p.was, rating: p.rating, stock: p.stock, img: p.img, active: !!p.active });

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY created_at, id").all();
  res.json({ products: rows.map(productOut) });
});

/* ════════════════ ORDERS ════════════════ */
const DELIVERY_FREE_AT = 999, DELIVERY_FEE = 49;
const parseItems = (s) => { try { return JSON.parse(s); } catch { return []; } };

app.post("/api/orders", asyncWrap(async (req, res) => {
  const { customer_name, phone, address, note, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Your cart is empty" });
  const me = currentUser(req);
  const name = String(customer_name || (me && me.name) || "").trim();
  if (!name) return res.status(400).json({ error: "Please tell me your name" });

  const picked = [];
  let subtotal = 0;
  for (const line of items) {
    const qty = Math.max(1, Math.min(99, Number(line.qty) || 1));
    const p = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(String(line.id));
    if (!p) return res.status(400).json({ error: "One of the items is no longer available" });
    if (p.stock < qty) return res.status(400).json({ error: `Only ${p.stock} left of ${p.name}` });
    picked.push({ id: p.id, name: p.name, price: p.price, qty });
    subtotal += p.price * qty;
  }
  const total = subtotal >= DELIVERY_FREE_AT ? subtotal : subtotal + DELIVERY_FEE;
  const info = db.prepare(`INSERT INTO orders (user_id,customer_name,phone,address,note,items_json,total,status)
                           VALUES (?,?,?,?,?,?,?,'pending')`)
    .run(me ? me.id : null, name, String(phone || "").trim(), String(address || "").trim(), String(note || "").trim(),
         JSON.stringify(picked), total);
  // decrement stock
  const dec = db.prepare("UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?");
  for (const it of picked) dec.run(it.qty, it.id);

  res.status(201).json({ order: { id: Number(info.lastInsertRowid), total, subtotal,
    delivery: subtotal >= DELIVERY_FREE_AT ? 0 : DELIVERY_FEE, status: "pending", items: picked } });
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

/* ════════════════ STATIC SITE ════════════════ */
/* Never serve the database, server source, or anything sensitive. */
const STATIC_BLOCK = [/^\/data(\/|$)/i, /^\/server(\/|$)/i, /^\/node_modules(\/|$)/i, /^\/package(-lock)?\.json$/i, /^\/README\.md$/i];
app.use((req, res, next) => {
  if (STATIC_BLOCK.some(rx => rx.test(req.path))) return res.status(404).send("Not found");
  next();
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
