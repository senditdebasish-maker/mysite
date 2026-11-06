/* /store.html — full catalogue: filters · cart drawer · checkout (same order API as the shelf) */
(function () {
  const SITE = { whatsapp: "910000000000", brand: "Debasish Das" };   // ⚠️ placeholder — keep in sync with app.js
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const fmtINR = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* offline fallback — live site fetches /api/products */
  let PRODUCTS = [
    { id:"p1", name:"Ergo Wireless Mouse",     meta:"2.4GHz + Bluetooth · 3 modes",     price:499,  was:799,  img:"assets/img/product-mouse.jpg",     tag:"Tech",          rating:"4.6", stock:40 },
    { id:"p2", name:"Luma LED Desk Lamp",      meta:"3 light tones · USB charge port",  price:899,  was:1299, img:"assets/img/product-lamp.jpg",      tag:"Home & Living", rating:"4.8", stock:32 },
    { id:"p3", name:"USB-C 6-in-1 Hub 100W",   meta:"4K HDMI · PD 100W · SD reader",    price:1299, was:1799, img:"assets/img/product-hub.jpg",       tag:"Tech",          rating:"4.5", stock:25 },
    { id:"p4", name:"Terra Bluetooth Speaker", meta:"12h playtime · TWS pairing",       price:1499, was:2199, img:"assets/img/product-speaker.jpg",   tag:"Tech",          rating:"4.7", stock:18 },
    { id:"p5", name:"Speckled Ceramic Mug",    meta:"350 ml · handmade · microwave safe", price:349, was:499, img:"assets/img/product-mug.jpg",      tag:"Home & Living", rating:"4.9", stock:60 },
    { id:"p6", name:"Walnut Desk Organiser",   meta:"Solid walnut · phone + pen slots", price:749,  was:1099, img:"assets/img/product-organizer.jpg", tag:"Home & Living", rating:"4.8", stock:4 },
    { id:"p7", name:"Aura TKL Keyboard 68",    meta:"Tri-mode · linear red switches",   price:1999, was:2499, img:"assets/img/product-keyboard.jpg",  tag:"Tech",          rating:"4.7", stock:12 },
    { id:"p8", name:"Copper Hammered Bottle",  meta:"750 ml · 99.9% pure copper",       price:799,  was:1199, img:"assets/img/product-bottle.jpg",    tag:"Home & Living", rating:"4.8", stock:3 },
  ];

  /* ═══════════ GRID + FILTERS ═══════════ */
  let filter = "all";
  const FILTERS = [
    { id:"all",   label:"All" },
    { id:"tech",  label:"Tech" },
    { id:"home",  label:"Home & Living" },
    { id:"value", label:"Under ₹1,000" },
  ];
  function applyFilter(list) {
    if (filter === "tech")  return list.filter(p => p.tag === "Tech");
    if (filter === "home")  return list.filter(p => p.tag === "Home & Living");
    if (filter === "value") return list.filter(p => Number(p.price) < 1000);
    return list;
  }
  const cardHTML = (p) => `
    <article class="product-card" data-id="${esc(p.id)}">
      <div class="product-media">
        <span class="product-tag">${esc(p.tag)}</span>
        ${Number(p.stock ?? 10) > 0
          ? `<span class="stock">In stock · ★ ${esc(p.rating)}</span>`
          : `<span class="stock stock-out">Sold out</span>`}
        <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="400" height="400" />
      </div>
      <div class="product-body">
        <h3 class="product-name">${esc(p.name)}</h3>
        <p class="product-meta">${esc(p.meta)}</p>
        <div class="product-foot">
          <div class="price-wrap">
            ${p.was ? `<span class="mrp">M.R.P. ${fmtINR(p.was)}</span>` : ""}
            <span class="price">${fmtINR(p.price)}</span>
          </div>
          <button class="add-btn" data-add="${esc(p.id)}" ${Number(p.stock ?? 10) > 0 ? "" : "disabled"} aria-label="Add ${esc(p.name)} to cart">
            Add
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
    </article>`;

  function renderGrid() {
    const list = applyFilter(PRODUCTS);
    $("#storeGrid").innerHTML = list.map(cardHTML).join("") || `<p class="muted" style="grid-column:1/-1;padding:1rem .2rem">Nothing in this filter right now — try “All”.</p>`;
    $$("#filterChips .chip").forEach(c => c.classList.toggle("is-active", c.dataset.filter === filter));
    $("#resultCount").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
  }

  $("#filterChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    filter = chip.dataset.filter; renderGrid();
  });

  async function loadProducts() {
    try {
      const res = await fetch("api/products");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.products) && data.products.length) {
        PRODUCTS = data.products;
        renderGrid();
      }
    } catch { /* static hosting — offline fallback already rendered */ }
  }

  /* ═══════════ CART (shared key dd_cart_v1) ═══════════ */
  const FREE_AT = 999, FEE = 49;
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("dd_cart_v1") || "[]"); } catch { cart = []; }
  const saveCart = () => { try { localStorage.setItem("dd_cart_v1", JSON.stringify(cart)); } catch {} };
  const findProduct = (id) => PRODUCTS.find(p => p.id === id);
  const cartItems = () => cart.map(i => { const p = findProduct(i.id); return p ? { ...p, qty: i.qty } : null; }).filter(Boolean);
  const subtotal  = () => cartItems().reduce((s, i) => s + i.price * i.qty, 0);
  const count     = () => cart.reduce((s, i) => s + i.qty, 0);

  function showToast(html) {
    const t = $("#toast"); if (!t) return;
    t.innerHTML = html; t.classList.add("is-show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("is-show"), 2600);
  }

  function renderCart() {
    const items = cartItems();
    $("#cartBadge") && ($("#cartBadge").textContent = String(count()));
    $("#navCartBadge") && ($("#navCartBadge").textContent = String(count()));
    $("#cartCountLabel").textContent = `${count()} item${count() === 1 ? "" : "s"}`;
    $("#cartSummaryText").textContent = `${count()} item${count() === 1 ? "" : "s"} · ${fmtINR(subtotal())}`;
    const empty = items.length === 0;
    $("#cartEmpty").hidden = !empty;
    $("#cartItems").innerHTML = items.map(p => `
      <div class="cart-item">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" width="74" height="74" />
        <div class="ci-body">
          <div class="ci-name">${esc(p.name)}</div>
          <div class="ci-price">${fmtINR(p.price)}</div>
          <div class="qty">
            <button class="qty-btn" data-dec="${esc(p.id)}" aria-label="Decrease quantity">−</button>
            <span class="qty-num">${p.qty}</span>
            <button class="qty-btn" data-inc="${esc(p.id)}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="ci-remove" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">✕</button>
      </div>`).join("");
    const sub = subtotal();
    $("#cartTotal").textContent = fmtINR(sub);
    $("#deliveryNote").textContent = sub >= FREE_AT ? "FREE" : `₹${FEE} (free above ₹999)`;
    const fill = Math.min(100, (sub / FREE_AT) * 100);
    $("#shipFill").style.width = fill + "%";
    $("#shipText").innerHTML = sub >= FREE_AT ? "✓ Free delivery unlocked" : `Add <strong>${fmtINR(FREE_AT - sub)}</strong> more for FREE delivery`;
    $("#cartFoot").style.display = empty ? "none" : "block";
    $("#cartItems").style.display = empty ? "none" : "";
    $("#shipMeter").style.display = empty ? "none" : "block";
  }

  const drawer = $("#cartDrawer");
  function openCart()  { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); $("#cartClose").focus(); }
  function closeCart() { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
  $("#cartOpen").addEventListener("click", openCart);
  $("#cartClose").addEventListener("click", closeCart);
  $("#cartDrawer .cart-close-x")?.addEventListener("click", closeCart);
  drawer.addEventListener("click", (e) => { if (e.target === drawer) closeCart(); });
  $$("[data-open-cart]").forEach(b => b.addEventListener("click", openCart));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });

  $("#storeGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]"); if (!btn || btn.disabled) return;
    const id = btn.dataset.add;
    const line = cart.find(i => i.id === id);
    if (line) line.qty += 1; else cart.push({ id, qty: 1 });
    saveCart(); renderCart();
    const p = findProduct(id);
    showToast(`<b>${esc(p ? p.name : "Item")}</b> added to your cart`);
  });

  $("#cartItems").addEventListener("click", (e) => {
    const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), rem = e.target.closest("[data-remove]");
    if (inc) { const l = cart.find(i => i.id === inc.dataset.inc); if (l) l.qty = Math.min(99, l.qty + 1); }
    else if (dec) { const l = cart.find(i => i.id === dec.dataset.dec); if (l) { l.qty -= 1; if (l.qty <= 0) cart = cart.filter(i => i.id !== dec.dataset.dec); } }
    else if (rem) { cart = cart.filter(i => i.id !== rem.dataset.remove); }
    else return;
    saveCart(); renderCart();
  });

  /* ═══════════ CHECKOUT (same flow as the shelf) ═══════════ */
  const checkoutForm = $("#checkoutForm");
  const orderSuccess = $("#orderSuccess");
  const waLink = (text) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;

  function showCheckout() {
    if (count() === 0) return;
    $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
    $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true;
    checkoutForm.hidden = false;
    $("#co-name").focus();
    // prefill from the session if signed in
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
    const btn = $("#coConfirm"); btn.disabled = true; btn.textContent = "Placing order…";
    try {
      let me = null;
      try { me = (await (await fetch("api/me")).json()).user || null; } catch {}
      const res = await fetch("api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: name.value, phone: phone.value, address: address.value, items: cart.map(i => ({ id: i.id, qty: i.qty })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't place the order");
      const o = data.order;

      cart = []; saveCart(); renderCart();
      $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
      $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true;
      checkoutForm.hidden = true;
      $("#osOrderId").textContent = "#" + o.id;
      $("#osTotal").textContent = fmtINR(o.total);
      $("#osTrack").href = me ? "dashboard.html" : "login.html?next=dashboard.html";
      $("#osTrack").textContent = me ? "Track my orders →" : "Sign in to track orders →";
      orderSuccess.hidden = false;
      loadProducts();

      const lines = o.items.map(i => `• ${i.qty} × ${i.name} — ${fmtINR(i.price * i.qty)}`);
      const msg = [`Hi ${SITE.brand}! I just placed order #${o.id} on your website:`, ...lines, `Total: ${fmtINR(o.total)}`, `Name: ${name.value} · ${phone.value}`, address.value ? `Address: ${address.value}` : null, `Please confirm stock & payment.`].filter(Boolean).join("\n");
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

  /* cart empty → browse button closes the drawer */
  $("#cartEmpty").addEventListener("click", (e) => { if (e.target.closest("[data-close-cart]")) closeCart(); });

  /* ═══════════ boot ═══════════ */
  renderGrid();
  renderCart();
  loadProducts();
})();
