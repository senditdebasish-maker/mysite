/* store-core.js — shared engine for the shelf (storefront + product pages)
   Config + catalog loading · cart (dd_cart_v1) · wishlist (dd_wishlist_v1)
   Cart drawer · coupons · WhatsApp hand-off · GST-inclusive math
   Full checkout lives on checkout.html (checkout.js) — the drawer links there. */
window.DD = (function () {
  const SITE = { whatsapp: "910000000000", brand: "Debasish Das" };   // ⚠️ placeholder — keep in sync with app.js
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const $n = (v) => Number(v) || 0;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* offline fallback — live site uses GET /api/products */
  const FALLBACK = [
    { id:"p1", name:"Ergo Wireless Mouse",     meta:"2.4GHz + Bluetooth · 3 modes",     price:499,  was:799,  img:"assets/img/product-mouse.jpg",     tag:"Tech",          rating:4.6, reviews:483, stock:40 },
    { id:"p2", name:"Luma LED Desk Lamp",      meta:"3 light tones · USB charge port",  price:899,  was:1299, img:"assets/img/product-lamp.jpg",      tag:"Home & Living", rating:4.8, reviews:391, stock:32 },
    { id:"p3", name:"USB-C 6-in-1 Hub 100W",   meta:"4K HDMI · PD 100W · SD reader",    price:1299, was:1799, img:"assets/img/product-hub.jpg",       tag:"Tech",          rating:4.5, reviews:512, stock:25 },
    { id:"p4", name:"Terra Bluetooth Speaker", meta:"12h playtime · TWS pairing",       price:1499, was:2199, img:"assets/img/product-speaker.jpg",   tag:"Tech",          rating:4.7, reviews:428, stock:18 },
    { id:"p5", name:"Speckled Ceramic Mug",    meta:"350 ml · handmade · microwave safe", price:349, was:499, img:"assets/img/product-mug.jpg",      tag:"Home & Living", rating:4.9, reviews:607, stock:60 },
    { id:"p6", name:"Walnut Desk Organiser",   meta:"Solid walnut · phone + pen slots", price:749,  was:1099, img:"assets/img/product-organizer.jpg", tag:"Home & Living", rating:4.8, reviews:214, stock:4 },
    { id:"p7", name:"Aura TKL Keyboard 68",    meta:"Tri-mode · linear red switches",   price:1999, was:2499, img:"assets/img/product-keyboard.jpg",  tag:"Tech",          rating:4.7, reviews:356, stock:12 },
    { id:"p8", name:"Copper Hammered Bottle",  meta:"750 ml · 99.9% pure copper",       price:799,  was:1199, img:"assets/img/product-bottle.jpg",    tag:"Home & Living", rating:4.8, reviews:289, stock:3 },
    { id:"p9", name:"Arc Brass Desk Clock",    meta:"Silent sweep movement · walnut base", price:899, was:1199, img:"assets/img/product-clock.jpg",   tag:"Home & Living", rating:4.7, reviews:173, stock:22 },
    { id:"p10", name:"Terracotta Herb Planter", meta:"Handmade · with saucer · drainage hole", price:449, was:599, img:"assets/img/product-planter.jpg", tag:"Home & Living", rating:4.6, reviews:141, stock:35 },
    { id:"p11", name:"Sage Linen Cushion 18″", meta:"Washed linen · hidden zip · feather-touch", price:349, was:499, img:"assets/img/product-cushion.jpg", tag:"Home & Living", rating:4.5, reviews:198, stock:48 },
    { id:"p12", name:"Amber Ceramic Candle",   meta:"Soy wax · sandalwood & vanilla · 40h burn", price:299, was:399, img:"assets/img/product-candle.jpg", tag:"Home & Living", rating:4.8, reviews:263, stock:40 },
    { id:"p13", name:"Magnetic Desk Cable Dock", meta:"Anodised aluminium · 3 cable slots", price:549, was:799, img:"assets/img/product-dock.jpg",    tag:"Tech",          rating:4.4, reviews:187, stock:52 },
    { id:"p14", name:"Bamboo Wireless Charger", meta:"15W fast charge · phone stand · Qi certified", price:699, was:999, img:"assets/img/product-charger.jpg", tag:"Tech",        rating:4.6, reviews:235, stock:29 },
  ];

  let PRODUCTS = FALLBACK.slice();
  let CONFIG = { freeAt: 999, deliveryFee: 49, codEnabled: true, codMin: 0, maxQty: 99, storeLive: true, announce: "" };

  const findProduct = (id) => PRODUCTS.find(p => p.id === id);
  const discountPct = (p) => (p.was && p.was > p.price) ? Math.round((1 - p.price / p.was) * 100) : 0;
  const stars = (r) => { const full = Math.round($n(r)); return "★".repeat(Math.min(5, full)) + "☆".repeat(Math.max(0, 5 - full)); };
  const ETA = (() => { const d = new Date(Date.now() + 3 * 864e5); return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); })();

  function toast(html) {
    const t = $("#toast"); if (!t) return;
    t.innerHTML = html; t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ═══════════ wishlist ═══════════ */
  let wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem("dd_wishlist_v1") || "[]"); } catch { wishlist = []; }
  const saveWishlist = () => { try { localStorage.setItem("dd_wishlist_v1", JSON.stringify(wishlist)); } catch {} };
  const wish = {
    has: (id) => wishlist.includes(id),
    list: () => wishlist.slice(),
    count: () => wishlist.length,
    toggle(id) {
      wishlist = wishlist.includes(id) ? wishlist.filter(x => x !== id) : [...wishlist, id];
      saveWishlist();
      return wishlist.includes(id);
    },
  };

  /* ═══════════ cart state ═══════════ */
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("dd_cart_v1") || "[]"); } catch { cart = []; }
  let coupon = null;  // { code, type, value, min_order, discount }
  try { const c = JSON.parse(localStorage.getItem("dd_coupon_v1") || "null"); if (c && typeof c === "object" && c.code) coupon = c; } catch { coupon = null; }
  const saveCoupon = () => { try { coupon ? localStorage.setItem("dd_coupon_v1", JSON.stringify(coupon)) : localStorage.removeItem("dd_coupon_v1"); } catch {} };
  const saveCart = () => { try { localStorage.setItem("dd_cart_v1", JSON.stringify(cart)); } catch {} };

  const cartLines = () => cart.map(i => { const p = findProduct(i.id); return p ? { ...p, qty: i.qty } : null; }).filter(Boolean);
  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
  const subtotal  = () => cartLines().reduce((s, i) => s + i.price * i.qty, 0);
  const discountFor = (c, sub) => !c ? 0 : (sub < (c.min_order || 0) ? 0 : (c.type === "percent" ? Math.round(sub * c.value / 100) : Math.min(c.value, sub)));

  function renderCart() {
    const lines = cartLines();
    if (!$("#cartBadge")) return;   // page without a drawer
    const count = cartCount(), sub = subtotal();

    if (coupon && sub < (coupon.min_order || 0)) {
      coupon = null; saveCoupon();
      const msg = $("#couponMsg");
      if (msg) { msg.textContent = "Coupon removed — basket no longer meets its minimum."; msg.className = "coupon-msg is-error"; }
    }
    const discount = discountFor(coupon, sub);
    const delivery = sub >= CONFIG.freeAt ? 0 : (lines.length ? CONFIG.deliveryFee : 0);
    const total = Math.max(0, sub - discount + delivery);
    const gstIncl = Math.round(total * 18 / 118);

    $("#cartBadge").textContent = String(count);
    $("#cartCountLabel").textContent = `${count} item${count === 1 ? "" : "s"}`;
    const sumTxt = $("#cartSummaryText");
    if (sumTxt) sumTxt.textContent = `${count} item${count === 1 ? "" : "s"} · ${fmtINR(sub)}`;

    const empty = lines.length === 0;
    $("#cartEmpty").hidden = !empty;
    $("#cartItems").innerHTML = lines.map(p => {
      const maxQ = Math.min($n(p.stock) || CONFIG.maxQty, CONFIG.maxQty);
      return `
      <div class="cart-item">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" width="74" height="74" />
        <div class="ci-body">
          <div class="ci-name">${esc(p.name)}</div>
          <div class="ci-price">${fmtINR(p.price)}</div>
          <div class="qty">
            <button class="qty-btn" data-dec="${esc(p.id)}" aria-label="Decrease quantity">−</button>
            <span class="qty-num">${p.qty}</span>
            <button class="qty-btn" data-inc="${esc(p.id)}" aria-label="Increase quantity" ${p.qty >= maxQ ? "disabled" : ""}>+</button>
          </div>
        </div>
        <button class="ci-remove" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">✕</button>
      </div>`;
    }).join("");

    $("#sumSub").textContent = fmtINR(sub);
    $("#sumDiscountRow").hidden = discount === 0;
    if (discount > 0) { $("#sumDiscount").textContent = fmtINR(discount); $("#sumCouponCode").textContent = coupon.code; }
    $("#gstNote").textContent = fmtINR(gstIncl);
    $("#cartTotal").textContent = fmtINR(total);
    $("#deliveryNote").textContent = sub >= CONFIG.freeAt ? "FREE" : `₹${CONFIG.deliveryFee} (free above ${fmtINR(CONFIG.freeAt)})`;
    const fill = Math.min(100, (sub / Math.max(1, CONFIG.freeAt)) * 100);
    $("#shipFill").style.width = fill + "%";
    $("#shipText").innerHTML = sub >= CONFIG.freeAt ? "✓ Free delivery unlocked" : `Add <strong>${fmtINR(Math.max(0, CONFIG.freeAt - sub))}</strong> more for FREE delivery`;
    $("#cartFoot").style.display = empty ? "none" : "block";
    $("#cartItems").style.display = empty ? "none" : "";
    $("#shipMeter").style.display = empty ? "none" : "block";
  }

  function addToCart(id, qty = 1) {
    if (!CONFIG.storeLive) { toast("The store is restocking right now — back shortly"); return false; }
    const p = findProduct(id); if (!p) return false;
    if ($n(p.stock) <= 0) { toast("That item just sold out"); return false; }
    const line = cart.find(i => i.id === id);
    const cap = Math.min($n(p.stock), CONFIG.maxQty);
    const next = Math.min(cap, (line ? line.qty : 0) + qty);
    if (line) line.qty = next; else cart.push({ id, qty: Math.min(qty, cap) });
    saveCart(); renderCart();
    toast(`<b>${esc(p.name)}</b> added to your cart`);
    return true;
  }

  const couponMessage = (msg, kind) => {
    const el = $("#couponMsg"); if (!el) return;
    el.textContent = msg;
    el.className = "coupon-msg" + (kind === "ok" ? " is-ok" : kind === "error" ? " is-error" : "");
  };

  async function applyCouponCode(code, { messageEl } = {}) {
    code = String(code || "").trim().toUpperCase();
    const note = (msg, kind) => { const m = messageEl || $("#couponMsg"); if (m) { m.textContent = msg; m.className = "coupon-msg is-" + (kind || "ok"); } };
    if (!code) { note("Enter a code first", "error"); return null; }
    const sub = subtotal();
    if (sub === 0) { note("Add something to the cart first", "error"); return null; }
    const OFFLINE_COUPONS = [
      { code: "WELCOME10", type: "percent", value: 10, min_order: 0 },
      { code: "FLAT100",   type: "flat",    value: 100, min_order: 999 },
      { code: "SHELF150",  type: "flat",    value: 150, min_order: 1499 },
    ];
    try {
      let data = null, res = null;
      try {
        res = await fetch("api/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, subtotal: sub }) });
        data = await res.json().catch(() => null);
      } catch { data = null; }
      if (!res || !res.ok) {
        if (data && data.error) throw new Error(data.error);          // server said no — respect it
        const off = OFFLINE_COUPONS.find(c => c.code === code);       // static/no-backend → offline rules
        if (!off) throw new Error("That code can't be verified on this connection");
        if (sub < off.min_order) throw new Error(`Spend at least ₹${off.min_order} to use ${off.code}`);
        data = { code: off.code, type: off.type, value: off.value, min_order: off.min_order,
                 discount: off.type === "percent" ? Math.round(sub * off.value / 100) : Math.min(off.value, sub) };
      }
      coupon = { code: data.code, type: data.type, value: data.value, min_order: $n(data.min_order), discount: data.discount };
      note(`${data.code} applied — you save ${fmtINR(data.discount)} 🎉`, "ok");
      saveCoupon();
      renderCart();
      return coupon;
    } catch (err) {
      coupon = null; saveCoupon();
      note(err.message || "Coupon not applicable", "error");
      renderCart();
      return null;
    }
  }
  async function applyCoupon() {
    const input = $("#couponInput"); if (!input) return;
    const btn = $("#applyCoupon"); btn.disabled = true; btn.textContent = "…";
    await applyCouponCode(input.value);
    btn.disabled = false; btn.textContent = "Apply";
  }

  /* ═══════════ drawer wiring ═══════════ */
  const drawer = $("#cartDrawer");
  const openCart  = () => { if (!drawer) return; drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); $("#cartClose")?.focus(); };
  const closeCart = () => { if (!drawer) return; drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); };

  if (drawer) {
    $("#cartOpen")?.addEventListener("click", openCart);
    $("#cartClose")?.addEventListener("click", closeCart);
    drawer.addEventListener("click", (e) => { if (e.target === drawer) closeCart(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });
    $("#emptyBrowse")?.addEventListener("click", () => { closeCart(); const s = $("#searchInput"); if (s) s.focus(); });
    $$("[data-open-cart]").forEach(b => b.addEventListener("click", openCart));

    $("#cartItems")?.addEventListener("click", (e) => {
      const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), rem = e.target.closest("[data-remove]");
      if (inc) { const p = findProduct(inc.dataset.inc); const l = cart.find(i => i.id === inc.dataset.inc); if (l) l.qty = Math.min(Math.min($n(p.stock) || CONFIG.maxQty, CONFIG.maxQty), l.qty + 1); }
      else if (dec) { const l = cart.find(i => i.id === dec.dataset.dec); if (l) { l.qty -= 1; if (l.qty <= 0) cart = cart.filter(i => i.id !== dec.dataset.dec); } }
      else if (rem) { cart = cart.filter(i => i.id !== rem.dataset.remove); }
      else return;
      saveCart(); renderCart();
    });

    $("#applyCoupon")?.addEventListener("click", applyCoupon);
    $("#couponInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } });
  }

  /* ═══════════ checkout → dedicated full page ═══════════ */
  const waLink = (text) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
  $("#placeOrder")?.addEventListener("click", () => { if (cartCount() > 0) location.href = "checkout.html"; });

  /* ═══════════ recently viewed ═══════════ */
  const RV_KEY = "dd_recently_viewed";
  const rvRead = () => { try { const a = JSON.parse(localStorage.getItem(RV_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; } catch { return []; } };
  const recentlyViewed = {
    record(id) { const list = [id, ...rvRead().filter(x => x !== id)].slice(0, 10); try { localStorage.setItem(RV_KEY, JSON.stringify(list)); } catch {} },
    list() { return rvRead(); },
  };

  /* ═══════════ boot: config + catalog ═══════════ */
  async function refreshProducts() {
    try {
      const res = await fetch("api/products");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.products) && data.products.length) {
          PRODUCTS = data.products.map(p => ({ ...p, rating: $n(p.rating) }));
        }
      }
    } catch { /* offline — fallback list stands */ }
    return PRODUCTS;
  }

  const ready = (async function boot() {
    try {
      const cfg = await (await fetch("api/store/config")).json();
      CONFIG = { ...CONFIG, ...cfg };
      const text = $("#announceText");
      if (cfg.announce && text) text.textContent = cfg.announce;
      if (!cfg.storeLive) {
        const bar = $("#announceBar");
        if (bar) { bar.classList.add("announce-warn"); }
        if (text) text.textContent = "Store is restocking right now — checkout is temporarily unavailable";
      }
      const eta = $("#etaDate"); if (eta) eta.textContent = ETA;
    } catch { /* offline defaults */ }
    await refreshProducts();
    renderCart();
  })();

  return {
    $, $$, fmtINR, esc, ETA, discountPct, stars, findProduct, toast, waLink,
    coupon: () => coupon,
    applyCouponCode,
    clearCoupon() { coupon = null; saveCoupon(); },
    config: () => CONFIG,
    products: () => PRODUCTS,
    ready,
    refreshProducts,
    wish,
    recentlyViewed,
    cart: { add: addToCart, open: openCart, close: closeCart, render: renderCart, count: cartCount, subtotal, lines: cartLines, clear() { cart = []; saveCart(); renderCart(); } },
  };
})();
