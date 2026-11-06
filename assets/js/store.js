/* /store.html — The Shelf · enterprise storefront
   search · facets · sort · deals + countdown · quick view · wishlist ·
   coupon engine · COD/UPI on delivery · GST breakdown · WhatsApp confirmation */
(function () {
  const SITE = { whatsapp: "910000000000", brand: "Debasish Das" };   // ⚠️ placeholder — keep in sync with app.js
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const fmtINR = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $n = (v) => Number(v) || 0;

  /* offline fallback — live site uses GET /api/products */
  let PRODUCTS = [
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

  let CONFIG = { freeAt: 999, deliveryFee: 49, codEnabled: true, codMin: 0, maxQty: 99, storeLive: true, announce: "" };
  const findProduct = (id) => PRODUCTS.find(p => p.id === id);
  const discountPct = (p) => (p.was && p.was > p.price) ? Math.round((1 - p.price / p.was) * 100) : 0;
  const etaStr = (() => {
    const d = new Date(Date.now() + 3 * 864e5);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  })();
  const codOk = () => CONFIG.codEnabled;

  /* ═══════════ state ═══════════ */
  let filter = { cat: "all", price: "all", stockOnly: false, wishlistOnly: false, q: "", sort: "popular" };
  let wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem("dd_wishlist_v1") || "[]"); } catch { wishlist = []; }
  const saveWishlist = () => { try { localStorage.setItem("dd_wishlist_v1", JSON.stringify(wishlist)); } catch {} };
  const inWishlist = (id) => wishlist.includes(id);

  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("dd_cart_v1") || "[]"); } catch { cart = []; }
  const saveCart = () => { try { localStorage.setItem("dd_cart_v1", JSON.stringify(cart)); } catch {} };

  let coupon = null;   // { code, type, value, discount }

  function showToast(html) {
    const t = $("#toast"); if (!t) return;
    t.innerHTML = html; t.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ═══════════ filtering & sorting ═══════════ */
  const priceOk = (p) => ({
    all: true,
    lt500: p.price < 500,
    "500-1000": p.price >= 500 && p.price <= 1000,
    "1000-2000": p.price > 1000 && p.price <= 2000,
    gt2000: p.price > 2000,
  }[filter.price]);

  function visibleProducts() {
    let list = PRODUCTS.filter(p =>
      (filter.cat === "all" || p.tag === filter.cat) &&
      priceOk(p) &&
      (!filter.stockOnly || $n(p.stock) > 0) &&
      (!filter.wishlistOnly || inWishlist(p.id)) &&
      (!filter.q || (p.name + " " + p.meta + " " + p.tag).toLowerCase().includes(filter.q))
    );
    const by = {
      "popular":   (a, b) => $n(b.reviews) - $n(a.reviews),
      "discount":  (a, b) => discountPct(b) - discountPct(a),
      "price-asc": (a, b) => a.price - b.price,
      "price-desc":(a, b) => b.price - a.price,
      "rating":    (a, b) => ($n(b.rating) - $n(a.rating)) || ($n(b.reviews) - $n(a.reviews)),
      "name":      (a, b) => a.name.localeCompare(b.name),
    }[filter.sort] || ((a, b) => 0);
    return [...list].sort(by);
  }

  /* ═══════════ card renderers ═══════════ */
  const stars = (r) => {
    const full = Math.round($n(r));
    return "★".repeat(Math.min(5, full)) + "☆".repeat(Math.max(0, 5 - full));
  };

  const cardHTML = (p) => {
    const stock = $n(p.stock);
    const soldOut = stock <= 0;
    const disc = discountPct(p);
    const low = stock > 0 && stock <= 5;
    return `
    <article class="product-card v2" data-id="${esc(p.id)}">
      <div class="product-media">
        ${disc ? `<span class="disc-badge">−${disc}%</span>` : ""}
        <span class="product-tag">${esc(p.tag)}</span>
        <button class="wish-btn${inWishlist(p.id) ? " is-on" : ""}" data-wish="${esc(p.id)}" aria-pressed="${inWishlist(p.id)}" aria-label="${inWishlist(p.id) ? "Remove from" : "Add to"} wishlist">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="${inWishlist(p.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.7-9.3-9.6C1.7 7.4 4.4 4.5 7.7 4.5c1.9 0 3.3 1 4.3 2.4 1-1.4 2.4-2.4 4.3-2.4 3.3 0 6 2.9 5 5.9C19.5 15.3 12 20 12 20z"/></svg>
        </button>
        <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="400" height="400" data-quick="${esc(p.id)}" />
        <button class="quick-btn" data-quick="${esc(p.id)}" type="button">Quick view</button>
      </div>
      <div class="product-body">
        <h3 class="product-name">${esc(p.name)}</h3>
        <p class="product-meta">${esc(p.meta)}</p>
        <p class="rating-line"><span class="stars" aria-hidden="true">${stars(p.rating)}</span> <strong>${esc(p.rating)}</strong><span class="muted"> · ${$n(p.reviews)} reviews</span></p>
        <p class="delivery-line">${soldOut ? "Currently sold out" : `<strong>${p.price >= CONFIG.freeAt ? "Free delivery" : "Delivery ₹" + CONFIG.deliveryFee}</strong> · by ${etaStr}`}</p>
        <div class="product-foot">
          <div class="price-wrap">
            ${p.was ? `<span class="mrp">M.R.P. ${fmtINR(p.was)}</span>` : ""}
            <span class="price">${fmtINR(p.price)}</span>
          </div>
          <button class="add-btn" data-add="${esc(p.id)}" ${soldOut || !CONFIG.storeLive ? "disabled" : ""} aria-label="Add ${esc(p.name)} to cart">
            Add
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        ${low ? `<p class="low-stock">Only ${stock} left — order soon</p>` : ""}
      </div>
    </article>`;
  };

  function renderGrid() {
    const list = visibleProducts();
    $("#storeGrid").innerHTML = list.map(cardHTML).join("");
    $("#storeEmpty").hidden = list.length !== 0;
    $("#resultCount").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
  }
  function renderCounts() {
    $("#cntAll").textContent  = PRODUCTS.length;
    $("#cntTech").textContent = PRODUCTS.filter(p => p.tag === "Tech").length;
    $("#cntHome").textContent = PRODUCTS.filter(p => p.tag === "Home & Living").length;
    $("#wishlistCount").textContent = wishlist.length;
    $("#wishlistOnly").setAttribute("aria-pressed", String(filter.wishlistOnly));
    $("#wishlistOnly").classList.toggle("is-active", filter.wishlistOnly);
  }
  function renderDeals() {
    const deals = PRODUCTS.filter(p => discountPct(p) > 0 && $n(p.stock) > 0)
      .sort((a, b) => discountPct(b) - discountPct(a)).slice(0, 8);
    $("#dealTrack").innerHTML = deals.map(p => `
      <article class="deal-card" data-id="${esc(p.id)}">
        <div class="deal-media"><span class="disc-badge">−${discountPct(p)}%</span><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="300" height="300" data-quick="${esc(p.id)}" /></div>
        <div class="deal-body">
          <p class="deal-name">${esc(p.name)}</p>
          <div class="deal-price"><span class="price">${fmtINR(p.price)}</span>${p.was ? `<span class="mrp">${fmtINR(p.was)}</span>` : ""}</div>
          <button class="btn btn-ink btn-sm deal-add" data-add="${esc(p.id)}" ${CONFIG.storeLive ? "" : "disabled"}>Add · ${fmtINR(p.price)}</button>
        </div>
      </article>`).join("");
    $(".deals").style.display = deals.length ? "" : "none";
  }

  /* deal countdown → midnight */
  function tickDealTimer() {
    const el = $("#dealTimer"); if (!el) return;
    const now = new Date(), end = new Date(now); end.setHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((end - now) / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, "0"), m = String(Math.floor((s % 3600) / 60)).padStart(2, "0"), sec = String(s % 60).padStart(2, "0");
    el.textContent = `${h}:${m}:${sec}`;
  }
  setInterval(tickDealTimer, 1000);

  /* ═══════════ cart core ═══════════ */
  const cartLines = () => cart.map(i => { const p = findProduct(i.id); return p ? { ...p, qty: i.qty } : null; }).filter(Boolean);
  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
  const subtotal  = () => cartLines().reduce((s, i) => s + i.price * i.qty, 0);
  const discountFor = (c, sub) => !c ? 0 : (sub < (c.min_order || 0) ? 0 : (c.type === "percent" ? Math.round(sub * c.value / 100) : Math.min(c.value, sub)));

  function renderCart() {
    const lines = cartLines();
    const count = cartCount(), sub = subtotal();

    // prune coupon if the basket no longer qualifies
    if (coupon && sub < (coupon.min_order || 0)) {
      coupon = null;
      $("#couponMsg").textContent = "Coupon removed — basket no longer meets its minimum.";
      $("#couponMsg").className = "coupon-msg is-error";
    }
    const discount = discountFor(coupon, sub);
    const delivery = sub >= CONFIG.freeAt ? 0 : (lines.length ? CONFIG.deliveryFee : 0);
    const total = Math.max(0, sub - discount + delivery);
    const gstIncl = Math.round(total * 18 / 118);

    $("#cartBadge") && ($("#cartBadge").textContent = String(count));
    $("#cartCountLabel").textContent = `${count} item${count === 1 ? "" : "s"}`;
    $("#cartSummaryText").textContent = `${count} item${count === 1 ? "" : "s"} · ${fmtINR(sub)}`;

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
    if (!CONFIG.storeLive) { showToast("The store is restocking right now — back shortly"); return; }
    const p = findProduct(id); if (!p) return;
    const line = cart.find(i => i.id === id);
    const cap = Math.min($n(p.stock) || 1, CONFIG.maxQty);
    const next = Math.min(cap, (line ? line.qty : 0) + qty);
    if (line) line.qty = next; else cart.push({ id, qty: Math.min(qty, cap) });
    saveCart(); renderCart();
    showToast(`<b>${esc(p.name)}</b> added to your cart`);
  }

  /* ═══════════ drawer open/close ═══════════ */
  const drawer = $("#cartDrawer");
  function openCart()  { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); $("#cartClose").focus(); }
  function closeCart() { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
  $("#cartOpen").addEventListener("click", openCart);
  $("#cartClose").addEventListener("click", closeCart);
  drawer.addEventListener("click", (e) => { if (e.target === drawer) closeCart(); });
  $$("[data-open-cart]").forEach(b => b.addEventListener("click", openCart));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCart(); closeQuickView(); } });
  $("#emptyBrowse").addEventListener("click", () => { closeCart(); $("#searchInput").focus({ preventScroll: false }); });

  /* ═══════════ grid & deal actions (delegated) ═══════════ */
  const onActionClick = (e) => {
    const add = e.target.closest("[data-add]");
    if (add) { if (!add.disabled) addToCart(add.dataset.add, 1); return; }
    const wish = e.target.closest("[data-wish]");
    if (wish) {
      const id = wish.dataset.wish;
      wishlist = inWishlist(id) ? wishlist.filter(x => x !== id) : [...wishlist, id];
      saveWishlist(); renderCounts(); renderGrid();
      showToast(inWishlist(id) ? "Saved to wishlist ♥" : "Removed from wishlist");
      return;
    }
    const quick = e.target.closest("[data-quick]");
    if (quick) { openQuickView(quick.dataset.quick); return; }
  };
  $("#storeGrid").addEventListener("click", onActionClick);
  $("#dealTrack").addEventListener("click", onActionClick);

  $("#cartItems").addEventListener("click", (e) => {
    const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), rem = e.target.closest("[data-remove]");
    if (inc) { const p = findProduct(inc.dataset.inc); const l = cart.find(i => i.id === inc.dataset.inc); if (l) l.qty = Math.min(Math.min($n(p.stock) || CONFIG.maxQty, CONFIG.maxQty), l.qty + 1); }
    else if (dec) { const l = cart.find(i => i.id === dec.dataset.dec); if (l) { l.qty -= 1; if (l.qty <= 0) cart = cart.filter(i => i.id !== dec.dataset.dec); } }
    else if (rem) { cart = cart.filter(i => i.id !== rem.dataset.remove); }
    else return;
    saveCart(); renderCart();
  });

  /* ═══════════ filters / search / sort ═══════════ */
  $("#catFilters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]"); if (!btn) return;
    filter.cat = btn.dataset.cat;
    $$("#catFilters .filter-opt").forEach(b => b.classList.toggle("is-active", b === btn));
    renderGrid();
  });
  $("#priceFilters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-price]"); if (!btn) return;
    filter.price = btn.dataset.price;
    $$("#priceFilters .filter-opt").forEach(b => b.classList.toggle("is-active", b === btn));
    renderGrid();
  });
  $("#inStockOnly").addEventListener("change", (e) => { filter.stockOnly = e.target.checked; renderGrid(); });
  $("#wishlistOnly").addEventListener("click", () => { filter.wishlistOnly = !filter.wishlistOnly; renderCounts(); renderGrid(); });

  const resetFilters = () => {
    filter = { ...filter, cat: "all", price: "all", stockOnly: false, wishlistOnly: false, q: "", sort: filter.sort };
    $("#inStockOnly").checked = false;
    $("#searchInput").value = "";
    $$("#catFilters .filter-opt").forEach(b => b.classList.toggle("is-active", b.dataset.cat === "all"));
    $$("#priceFilters .filter-opt").forEach(b => b.classList.toggle("is-active", b.dataset.price === "all"));
    renderCounts(); renderGrid();
  };
  $("#clearFilters").addEventListener("click", resetFilters);
  $("#emptyClear").addEventListener("click", resetFilters);

  let searchT;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { filter.q = e.target.value.trim().toLowerCase(); renderGrid(); }, 120);
  });
  $("#sortSelect").addEventListener("change", (e) => { filter.sort = e.target.value; renderGrid(); });

  $("#applyWelcome10").addEventListener("click", () => {
    const input = $("#couponInput");
    input.value = "WELCOME10";
    couponMessage("Code filled — press Apply", "ok");
    input.focus();
  });

  /* ═══════════ coupon ═══════════ */
  function couponMessage(msg, kind) {
    const el = $("#couponMsg");
    el.textContent = msg;
    el.className = "coupon-msg" + (kind === "ok" ? " is-ok" : kind === "error" ? " is-error" : "");
  }
  async function applyCoupon() {
    const code = $("#couponInput").value.trim().toUpperCase();
    if (!code) { couponMessage("Enter a code first", "error"); return; }
    const sub = subtotal();
    if (sub === 0) { couponMessage("Add something to the cart first", "error"); return; }
    const btn = $("#applyCoupon"); btn.disabled = true; btn.textContent = "…";
    try {
      const res = await fetch("api/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, subtotal: sub }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Coupon not applicable");
      coupon = { code: data.code, type: data.type, value: data.value, min_order: $n(data.min_order), discount: data.discount };
      couponMessage(`${data.code} applied — you save ${fmtINR(data.discount)} 🎉`, "ok");
      renderCart();
    } catch (err) {
      coupon = null;
      couponMessage(err.message, "error");
      renderCart();
    } finally {
      btn.disabled = false; btn.textContent = "Apply";
    }
  }
  $("#applyCoupon").addEventListener("click", applyCoupon);
  $("#couponInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } });

  /* ═══════════ quick view ═══════════ */
  const qv = $("#quickView");
  let qvId = null, qvQty = 1;
  function openQuickView(id) {
    const p = findProduct(id); if (!p) return;
    qvId = id; qvQty = 1;
    const disc = discountPct(p);
    $("#qvImg").src = p.img; $("#qvImg").alt = p.name;
    $("#qvDiscount").textContent = disc ? `−${disc}%` : ""; $("#qvDiscount").style.display = disc ? "" : "none";
    $("#qvTag").textContent = p.tag;
    $("#qvName").textContent = p.name;
    $("#qvMeta").textContent = p.meta;
    $("#qvStars").textContent = stars(p.rating);
    $("#qvRating").textContent = p.rating;
    $("#qvReviews").textContent = $n(p.reviews);
    $("#qvPrice").textContent = fmtINR(p.price);
    $("#qvMrp").textContent = p.was ? fmtINR(p.was) : "";
    $("#qvMrp").style.display = p.was ? "" : "none";
    $("#qvSave").textContent = p.was ? `Save ${fmtINR(Math.max(0, p.was - p.price))}` : "";
    $("#qvSave").style.display = p.was ? "" : "none";
    const stock = $n(p.stock);
    $("#qvStock").textContent = stock > 0 ? (stock <= 5 ? `Only ${stock} left in stock` : "In stock") : "Sold out";
    $("#qvStock").className = stock > 0 ? (stock <= 5 ? "qv-stock-low" : "qv-stock-ok") : "qv-stock-out";
    $("#qvEta").textContent = etaStr;
    $("#qvQty").textContent = "1";
    $("#qvDec").disabled = true;
    $("#qvInc").disabled = $n(p.stock) <= 1;
    $("#qvAdd").disabled = stock <= 0 || !CONFIG.storeLive;
    $("#qvBuy").disabled = stock <= 0 || !CONFIG.storeLive;
    qv.hidden = false;
    $("#qvClose").focus();
  }
  function closeQuickView() { qv.hidden = true; qvId = null; }
  $("#qvClose").addEventListener("click", closeQuickView);
  qv.addEventListener("click", (e) => { if (e.target === qv) closeQuickView(); });
  const qvClamp = () => {
    const p = findProduct(qvId); if (!p) return;
    const maxQ = Math.min($n(p.stock) || 1, CONFIG.maxQty);
    qvQty = Math.max(1, Math.min(maxQ, qvQty));
    $("#qvQty").textContent = qvQty;
    $("#qvDec").disabled = qvQty <= 1;
    $("#qvInc").disabled = qvQty >= maxQ;
  };
  $("#qvDec").addEventListener("click", () => { qvQty -= 1; qvClamp(); });
  $("#qvInc").addEventListener("click", () => { qvQty += 1; qvClamp(); });
  $("#qvAdd").addEventListener("click", () => { if (qvId) { addToCart(qvId, qvQty); closeQuickView(); } });
  $("#qvBuy").addEventListener("click", () => { if (qvId) { addToCart(qvId, qvQty); closeQuickView(); openCart(); } });
  $("#qvShare").addEventListener("click", async () => {
    if (!qvId) return;
    const url = location.origin + location.pathname + "#p-" + qvId;
    try { await navigator.clipboard.writeText(url); showToast("Product link copied ✓"); }
    catch { showToast("Couldn't copy — long-press to share"); }
  });

  /* ═══════════ checkout ═══════════ */
  const checkoutForm = $("#checkoutForm");
  const orderSuccess = $("#orderSuccess");
  const waLink = (text) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;

  function showCheckout() {
    if (cartCount() === 0) return;
    $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
    $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true;
    checkoutForm.hidden = false;
    $("#co-name").focus();
    fetch("api/me").then(r => r.json()).then(d => {
      const me = d.user;
      if (me) { $("#co-name").value = $("#co-name").value || me.name; $("#co-phone").value = $("#co-phone").value || me.phone || ""; }
    }).catch(() => {});
  }
  function hideCheckout() {
    checkoutForm.hidden = true;
    $("#cartFoot").hidden = false;
    renderCart();
  }
  $("#placeOrder").addEventListener("click", showCheckout);
  $("#coBack").addEventListener("click", hideCheckout);

  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#co-name"), phone = $("#co-phone"), address = $("#co-address");
    if (!name.value.trim())  { name.focus(); showToast("Please tell me your name"); return; }
    if (!phone.value.trim()) { phone.focus(); showToast("Please share a contact phone"); return; }
    const payMethod = $("#payMethod").value;
    const btn = $("#coConfirm"); btn.disabled = true; btn.textContent = "Placing order…";
    try {
      let me = null;
      try { me = (await (await fetch("api/me")).json()).user || null; } catch {}
      const res = await fetch("api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: name.value, phone: phone.value, address: address.value,
          items: cart.map(i => ({ id: i.id, qty: i.qty })), coupon: coupon ? coupon.code : undefined, payment: payMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't place the order");
      const o = data.order;

      const placedCoupon = o.coupon;
      cart = []; coupon = null;
      saveCart(); renderCart();
      $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
      $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true;
      checkoutForm.hidden = true;
      $("#osOrderId").textContent = "#" + o.id;
      $("#osTotal").textContent = fmtINR(o.total);
      $("#osDetails").innerHTML = `Total <strong>${fmtINR(o.total)}</strong>${o.discount ? ` (you saved ${fmtINR(o.discount)} with ${esc(placedCoupon || "coupon")})` : ""} · ${o.payment === "upi" ? "UPI on delivery" : "Cash on Delivery"}<br />Confirm on WhatsApp — then track delivery status in your account.`;
      $("#osTrack").href = me ? "dashboard.html" : "login.html?next=dashboard.html";
      $("#osTrack").textContent = me ? "Track my orders →" : "Sign in to track orders →";
      orderSuccess.hidden = false;
      loadProducts();

      const lines = o.items.map(i => `• ${i.qty} × ${i.name} — ${fmtINR(i.price * i.qty)}`);
      const msg = [`Hi ${SITE.brand}! I just placed order #${o.id} on your website:`, ...lines,
        placedCoupon ? `Coupon: ${placedCoupon} (−${fmtINR(o.discount)})` : null,
        `Total: ${fmtINR(o.total)} · ${o.payment === "upi" ? "UPI on delivery" : "COD"}`,
        `Name: ${name.value} · ${phone.value}`, address.value ? `Address: ${address.value}` : null,
        `Please confirm stock & delivery.`].filter(Boolean).join("\n");
      window.open(waLink(msg), "_blank", "noopener");
      showToast(`<b>Order #${o.id} placed</b> — confirm on WhatsApp`);
    } catch (err) {
      showToast(err.message || "Couldn't place the order");
    } finally {
      btn.disabled = false; btn.textContent = "Confirm & Place Order";
    }
  });

  $("#osContinue").addEventListener("click", () => {
    orderSuccess.hidden = true;
    $("#cartEmpty").style.display = "";
    $("#cartFoot").hidden = false;
    renderCart();
    closeCart();
  });

  /* ═══════════ boot ═══════════ */
  async function loadConfig() {
    try {
      const cfg = await (await fetch("api/store/config")).json();
      CONFIG = { ...CONFIG, ...cfg };
      if (cfg.announce) $("#announceText").textContent = cfg.announce;
      if (!cfg.storeLive) {
        const bar = $("#announceBar");
        bar.classList.add("announce-warn");
        $("#announceText").textContent = "Store is restocking right now — checkout is temporarily unavailable";
      }
      // COD availability
      const codOpt = $("#payMethod").querySelector('option[value="cod"]');
      if (codOpt && !cfg.codEnabled) { codOpt.textContent = "Cash on Delivery — unavailable"; codOpt.disabled = true; $("#payMethod").value = "upi"; }
      $("#etaDate").textContent = etaStr;
    } catch { /* offline — defaults stand */ }
  }

  async function loadProducts() {
    try {
      const res = await fetch("api/products");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.products) && data.products.length) {
        PRODUCTS = data.products.map(p => ({ ...p, rating: $n(p.rating) }));
        renderDeals(); renderCounts(); renderGrid(); renderCart();
        // deep link: store.html#p-<id> opens quick view
        const m = location.hash.match(/^#p-(.+)$/);
        if (m && findProduct(m[1])) openQuickView(m[1]);
      }
    } catch { /* offline fallback already rendered */ }
  }

  (async function init() {
    $("#etaDate").textContent = etaStr;
    await loadConfig();
    tickDealTimer();
    renderDeals(); renderCounts(); renderGrid(); renderCart();
    await loadProducts();
  })();
})();
