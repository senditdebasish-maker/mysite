/* store-core.js — shared engine for the shelf (storefront + product pages)
   Config + catalog loading · cart (dd_cart_v1) · wishlist (dd_wishlist_v1)
   Cart drawer · coupons · checkout · WhatsApp hand-off · GST-inclusive math */
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
      coupon = null;
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

  async function applyCoupon() {
    const input = $("#couponInput"); if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) { couponMessage("Enter a code first", "error"); return; }
    const sub = subtotal();
    if (sub === 0) { couponMessage("Add something to the cart first", "error"); return; }
    const btn = $("#applyCoupon"); btn.disabled = true; btn.textContent = "…";
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
      couponMessage(`${data.code} applied — you save ${fmtINR(data.discount)} 🎉`, "ok");
      renderCart();
    } catch (err) {
      coupon = null;
      couponMessage(err.message || "Coupon not applicable", "error");
      renderCart();
    } finally {
      btn.disabled = false; btn.textContent = "Apply";
    }
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

  /* ═══════════ checkout ═══════════ */
  const waLink = (text) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
  const checkoutForm = $("#checkoutForm");
  const orderSuccess = $("#orderSuccess");

  function showCheckout() {
    if (!checkoutForm || cartCount() === 0) return;
    $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
    $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true;
    checkoutForm.hidden = false;
    $("#co-name")?.focus();
    fetch("api/me").then(r => r.json()).then(d => {
      const me = d.user;
      if (me) { $("#co-name").value = $("#co-name").value || me.name; $("#co-phone").value = $("#co-phone").value || me.phone || ""; }
    }).catch(() => {});
  }
  function hideCheckout() {
    if (!checkoutForm) return;
    checkoutForm.hidden = true;
    $("#cartFoot").hidden = false;
    renderCart();
  }
  $("#placeOrder")?.addEventListener("click", showCheckout);
  $("#coBack")?.addEventListener("click", hideCheckout);

  checkoutForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#co-name"), phone = $("#co-phone"), address = $("#co-address");
    if (!name.value.trim())  { name.focus(); toast("Please tell me your name"); return; }
    if (!phone.value.trim()) { phone.focus(); toast("Please share a contact phone"); return; }
    const payMethod = $("#payMethod").value;
    const btn = $("#coConfirm"); btn.disabled = true; btn.textContent = "Placing order…";
    try {
      let me = null;
      try { me = (await (await fetch("api/me")).json()).user || null; } catch {}
      // Static-host (no backend) fallback: the order goes straight to WhatsApp.
      const offlineOrder = () => {
        const lines = cartLines();
        const sub = subtotal();
        const discount = discountFor(coupon, sub);
        const delivery = sub >= CONFIG.freeAt ? 0 : CONFIG.deliveryFee;
        const total = Math.max(0, sub - discount + delivery);
        const msg = [`Hi ${SITE.brand}! I'd like to order from your store:`,
          ...lines.map(l => `• ${l.qty} × ${l.name} — ${fmtINR(l.price * l.qty)}`),
          coupon ? `Coupon: ${coupon.code} (−${fmtINR(discount)})` : null,
          `Delivery: ${delivery === 0 ? "FREE" : fmtINR(delivery)}`,
          `Total: ${fmtINR(total)}`, `${payMethod === "upi" ? "UPI" : "Cash on Delivery"} on delivery`,
          `Name: ${name.value} · ${phone.value}`, address.value ? `Address: ${address.value}` : null,
          `Please confirm stock & delivery.`].filter(Boolean).join("\n");
        return { wa: waLink(msg), total };
      };
      let res, data = null, backendOk = true;
      try {
        res = await fetch("api/orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_name: name.value, phone: phone.value, address: address.value,
            items: cart.map(i => ({ id: i.id, qty: i.qty })), coupon: coupon ? coupon.code : undefined, payment: payMethod }),
        });
        try { data = await res.json(); } catch { data = null; }
        if (!res.ok) {
          if (!data) { backendOk = false; }   // static host / proxy 404 (HTML body) → WhatsApp fallback
          else { const err = new Error(data.error || "Couldn't place the order"); err.status = res.status; throw err; }
        }
      } catch (err) {
        if (err.status) throw err;            // server reached, business error (e.g. out of stock)
        backendOk = false;                   // network / no backend at all
      }
      if (!backendOk) {
        const offline = offlineOrder();
        cart = []; coupon = null; saveCart(); renderCart();
        $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
        $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true; checkoutForm.hidden = true;
        if (orderSuccess) {
          $("#osOrderId").textContent = "via WhatsApp";
          $("#osDetails").innerHTML = `Total <strong>${fmtINR(offline.total)}</strong> · ${payMethod === "upi" ? "UPI" : "Cash on Delivery"} on delivery — the store will confirm stock on WhatsApp.<br />No account needed.`;
          const track = $("#osTrack"); track.href = offline.wa; track.textContent = "Open WhatsApp again ↗";
          orderSuccess.hidden = false;
        }
        window.open(offline.wa, "_blank", "noopener");
        toast(`<b>Order sent via WhatsApp</b> — confirm with the store there`);
        return;
      }
      const o = data.order;

      const placedCoupon = o.coupon;
      cart = []; coupon = null;
      saveCart(); renderCart();
      $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
      $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true;
      checkoutForm.hidden = true;
      if (orderSuccess) {
        $("#osOrderId").textContent = "#" + o.id;
        $("#osTotal").textContent = fmtINR(o.total);
        $("#osDetails").innerHTML = `Total <strong>${fmtINR(o.total)}</strong>${o.discount ? ` (you saved ${fmtINR(o.discount)} with ${esc(placedCoupon || "coupon")})` : ""} · ${o.payment === "upi" ? "UPI on delivery" : "Cash on Delivery"}<br />Confirm on WhatsApp — then track delivery status in your account.`;
        const track = $("#osTrack");
        track.href = me ? "dashboard.html" : "login.html?next=dashboard.html";
        track.textContent = me ? "Track my orders →" : "Sign in to track orders →";
        orderSuccess.hidden = false;
      }
      refreshProducts().then(() => window.dispatchEvent(new CustomEvent("dd:products-changed")));

      const lines = o.items.map(i => `• ${i.qty} × ${i.name} — ${fmtINR(i.price * i.qty)}`);
      const msg = [`Hi ${SITE.brand}! I just placed order #${o.id} on your website:`, ...lines,
        placedCoupon ? `Coupon: ${placedCoupon} (−${fmtINR(o.discount)})` : null,
        `Total: ${fmtINR(o.total)} · ${o.payment === "upi" ? "UPI on delivery" : "COD"}`,
        `Name: ${name.value} · ${phone.value}`, address.value ? `Address: ${address.value}` : null,
        `Please confirm stock & delivery.`].filter(Boolean).join("\n");
      window.open(waLink(msg), "_blank", "noopener");
      toast(`<b>Order #${o.id} placed</b> — confirm on WhatsApp`);
    } catch (err) {
      toast(err.message || "Couldn't place the order");
    } finally {
      btn.disabled = false; btn.textContent = "Confirm & Place Order";
    }
  });

  $("#osContinue")?.addEventListener("click", () => {
    if (orderSuccess) orderSuccess.hidden = true;
    $("#cartEmpty").style.display = "";
    $("#cartFoot").hidden = false;
    renderCart();
    closeCart();
  });

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
      const codOpt = $("#payMethod")?.querySelector('option[value="cod"]');
      if (codOpt && !cfg.codEnabled) { codOpt.textContent = "Cash on Delivery — unavailable"; codOpt.disabled = true; $("#payMethod").value = "upi"; }
      const eta = $("#etaDate"); if (eta) eta.textContent = ETA;
    } catch { /* offline defaults */ }
    await refreshProducts();
    renderCart();
  })();

  return {
    $, $$, fmtINR, esc, ETA, discountPct, stars, findProduct, toast,
    config: () => CONFIG,
    products: () => PRODUCTS,
    ready,
    refreshProducts,
    wish,
    cart: { add: addToCart, open: openCart, close: closeCart, render: renderCart, count: cartCount, subtotal },
  };
})();
