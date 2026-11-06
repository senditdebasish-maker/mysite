/* ══════════════════════════════════════════════════════════
   Debasish Das — Web Studio & Store
   Patterns: overflow lock · full-page scroll-snap sections ·
   horizontal snap carousels · WhatsApp checkout
   ────────────────────────────────────────────────────────
   ✏️  EDIT ME — your real details:
   ══════════════════════════════════════════════════════════ */
const SITE = {
  brand:        "Debasish Das",
  // WhatsApp: country code + number, NO +, spaces or dashes.
  // ⚠️ Placeholder below (starts with 0 = not a real subscriber). Replace it!
  whatsapp:     "910000000000",
  phoneDisplay: "+91 00000 00000",
  email:        "hello@example.com",
  location:     "Kolkata, West Bengal, India",
  hours:        "Mon–Sat · 9 AM – 8 PM IST",
};
/* ══════════════════════════════════════════════════════════ */

const waLink = (text) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
const fmtINR = (n) => "₹" + n.toLocaleString("en-IN");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

/* ───────── Store products ─────────
   These are the OFFLINE FALLBACK (used if the API is unreachable,
   e.g. static hosting). The live site fetches GET /api/products —
   manage products in the Admin Dashboard. */
let PRODUCTS = [
  { id:"p1", name:"Ergo Wireless Mouse",     meta:"2.4GHz + Bluetooth · 3 modes",     price:499,  was:799,  img:"assets/img/product-mouse.jpg",     tag:"Tech",          rating:"4.6" },
  { id:"p2", name:"Luma LED Desk Lamp",      meta:"3 light tones · USB charge port",  price:899,  was:1299, img:"assets/img/product-lamp.jpg",      tag:"Home & Living", rating:"4.8" },
  { id:"p3", name:"USB-C 6-in-1 Hub 100W",   meta:"4K HDMI · PD 100W · SD reader",    price:1299, was:1799, img:"assets/img/product-hub.jpg",       tag:"Tech",          rating:"4.5" },
  { id:"p4", name:"Terra Bluetooth Speaker", meta:"12h playtime · TWS pairing",       price:1499, was:2199, img:"assets/img/product-speaker.jpg",   tag:"Tech",          rating:"4.7" },
  { id:"p5", name:"Speckled Ceramic Mug",    meta:"350 ml · handmade · microwave safe", price:349, was:499, img:"assets/img/product-mug.jpg",      tag:"Home & Living", rating:"4.9" },
  { id:"p6", name:"Walnut Desk Organiser",   meta:"Solid walnut · phone + pen slots", price:749,  was:1099, img:"assets/img/product-organizer.jpg", tag:"Home & Living", rating:"4.8" },
  { id:"p7", name:"Aura TKL Keyboard 68",    meta:"Tri-mode · linear red switches",   price:1999, was:2499, img:"assets/img/product-keyboard.jpg",  tag:"Tech",          rating:"4.7" },
  { id:"p8", name:"Copper Hammered Bottle",  meta:"750 ml · 99.9% pure copper",       price:799,  was:1199, img:"assets/img/product-bottle.jpg",    tag:"Home & Living", rating:"4.8" },
];

/* ───────── Services ───────── */
const SERVICES = [
  { name:"Business Website",  price:"from ₹7,999",  tag:"7-day delivery", desc:"Fast, mobile-first website for your shop / clinic / salon / agency — design, code, basic SEO and launch, end to end.", wa:"Hi Debasish! I want a Business Website. Please share details & a quote." },
  { name:"E-commerce / Store",price:"from ₹12,999", tag:"Sell online",    desc:"Product catalogue, cart, WhatsApp or Razorpay checkout, order notifications — your own online shop, managed by me.", wa:"Hi Debasish! I want an online store for my business. Please share details & a quote." },
  { name:"Hosting & Domains", price:"from ₹199/yr", tag:"Free SSL",       desc:".in / .com domains, NVMe hosting, free SSL, professional email (you@yourbrand.com) and free migration from your old host.", wa:"Hi Debasish! I need hosting / a domain. Please share plans & pricing." },
  { name:"Care Plan",         price:"₹999 / mo",    tag:"Peace of mind",  desc:"Monthly updates, backups, security checks, small content edits and priority WhatsApp support for your live site.", wa:"Hi Debasish! I'm interested in the monthly Care Plan. Please share details." },
  { name:"Website Rescue",    price:"from ₹2,499",  tag:"Fix it fast",    desc:"Broken layout, hacked pages, slow loads, plugin mess — I take over, diagnose and ship a fixed, backed-up site in days.", wa:"Hi Debasish! My website has issues — I need a Website Rescue. Please help." },
  { name:"SEO & Speed Audit", price:"from ₹1,999",  tag:"Get found",      desc:"A 20-point teardown: Core Web Vitals, on-page SEO, keywords, Google Business Profile — with a clear action plan you can act on.", wa:"Hi Debasish! I want an SEO & Speed audit for my website. Please share the report details." },
];

/* ───────── Hosting plans ───────── */
const PLANS = [
  { name:"Starter",  price:"₹199", per:"/year", desc:"For your first website or a simple brochure site.", features:["1 website","5 GB NVMe storage","Free SSL certificate","Weekly backups","Free .in domain — 1st year","Email support"], popular:false, wa:"Hi Debasish! I want the Starter hosting plan (₹199/yr). Please set it up for me." },
  { name:"Business", price:"₹499", per:"/year", desc:"For growing businesses that need speed & reliability.", features:["3 websites","15 GB NVMe storage","Free SSL + daily backups","Free .in domain — 1st year","Business email included","Priority WhatsApp support"], popular:true,  wa:"Hi Debasish! I want the Business hosting plan (₹499/yr). Please set it up for me." },
  { name:"Pro",      price:"₹999", per:"/year", desc:"For agencies, stores and high-traffic sites.", features:["10 websites","40 GB NVMe storage","Free SSL + daily backups","Free domain — 1st year","Staging site + free migration","Same-day WhatsApp support"], popular:false, wa:"Hi Debasish! I want the Pro hosting plan (₹999/yr). Please set it up for me." },
];

const FREE_DELIVERY_AT = 999;
const scroller = $("#scroller");

/* ═════════ Render service carousel ═════════ */
$("#serviceTrack").innerHTML = SERVICES.map(s => `
  <article class="sc-card">
    <span class="service-tag">${s.tag}</span>
    <div class="sc-top">
      <h3 class="sc-name">${s.name}</h3>
      <div class="sc-price">${s.price}<small>all-inclusive quote</small></div>
    </div>
    <p class="sc-desc">${s.desc}</p>
    <a class="service-cta" href="${waLink(s.wa)}" target="_blank" rel="noopener">Get this on WhatsApp
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>
    </a>
  </article>`).join("");

/* ═════════ Render store carousel (re-callable after API load) ═════════ */
function renderStore(){
  $("#productTrack").innerHTML = PRODUCTS.map(p => `
  <article class="product-card">
    <div class="product-media">
      <span class="product-tag">${esc(p.tag)}</span>
      ${Number(p.stock) > 0
        ? `<span class="stock">In stock · ★ ${esc(p.rating)}</span>`
        : `<span class="stock stock-out">Sold out</span>`}
      <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="400" height="400" />
    </div>
    <div class="product-body">
      <h3 class="product-name">${esc(p.name)}</h3>
      <p class="product-meta">${esc(p.meta)}</p>
      <div class="product-foot">
        <div class="price"><small>M.R.P. ${fmtINR(p.was)}</small>${fmtINR(p.price)}</div>
        <button class="add-btn" data-add="${p.id}" ${Number(p.stock) > 0 ? "" : "disabled"} aria-label="Add ${esc(p.name)} to cart">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>
    </div>
  </article>`).join("");
  $("#productTrack").dispatchEvent(new Event("scroll"));   // refresh arrow edge-dimming
}
renderStore();

/* ═════════ Render hosting plans ═════════ */
const check = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1f9d55" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.2 5L20 6.5"/></svg>`;
$("#planGrid").innerHTML = PLANS.map(p => `
  <article class="plan ${p.popular ? "plan-popular" : ""}">
    ${p.popular ? '<span class="plan-badge">Most Popular</span>' : ''}
    <p class="plan-name">${p.name}</p>
    <div class="plan-price">${p.price}<span> ${p.per} + GST</span></div>
    <p class="plan-desc">${p.desc}</p>
    <ul>${p.features.map(f => `<li>${check}<span>${f}</span></li>`).join("")}</ul>
    <a class="plan-cta" href="${waLink(p.wa)}" target="_blank" rel="noopener">Choose ${p.name} — order on WhatsApp</a>
  </article>`).join("");

/* ═════════ Contact channel links (from SITE) ═════════ */
$("#waChannel").href = waLink(`Hi ${SITE.brand}! I found your website and would like to talk.`);
$("#callChannel").href = `tel:${SITE.whatsapp.replace(/^91(?=\d{10}$)/, "+91")}`;
$("#callChannelSub").textContent = SITE.phoneDisplay;
$("#waChannelSub").textContent = `${SITE.phoneDisplay} · usually replies in minutes`;
$("#emailChannelSub").textContent = SITE.email;
$("#emailChannel").href = `mailto:${SITE.email}`;
$("#locationLine").textContent = `${SITE.location} · ${SITE.hours}`;
$("#yearNow").textContent = new Date().getFullYear();

/* ══════════════════════════════════════════════════════════
   SECTION NAVIGATION — full-page snap helpers
   ══════════════════════════════════════════════════════════ */
const SECTION_IDS = ["home", "services", "hosting", "store", "contact"];
const sections = SECTION_IDS.map(id => document.getElementById(id));

function goTo(id){
  const target = document.getElementById(id);
  if (!target) return;
  // scroller is the scroll container on desktop; body scrolls on mobile
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  closeMobileMenu();
}
$$("[data-goto]").forEach(btn => btn.addEventListener("click", () => { closeCart(); goTo(btn.dataset.goto); }));

function setActiveSection(id){
  $$(".nav-link").forEach(l => l.classList.toggle("is-active", l.dataset.goto === id));
  $$(".rail-dot").forEach(d => d.classList.toggle("is-active", d.dataset.goto === id));
}

// IntersectionObserver → live-sync nav underline + rail dots
if ("IntersectionObserver" in window && scroller){
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) setActiveSection(entry.target.id); });
  }, { root: scroller, threshold: 0.55 });
  sections.forEach(s => s && io.observe(s));
}

// Scroll progress line at the very top
function updateProgress(){
  const max = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
  const p = max > 0 ? (scroller.scrollTop / max) * 100 : 0;
  $("#progressLine").style.width = p + "%";
}
scroller?.addEventListener("scroll", updateProgress, { passive: true });
updateProgress();

// Keyboard: ArrowUp / ArrowDown / PageUp / PageDown / Home / End
let lastKeyNav = 0;
window.addEventListener("keydown", e => {
  if (e.key === "Escape"){ closeCart(); closeMobileMenu(); return; }
  const t = e.target;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  if ($("#cartDrawer").classList.contains("open")) return; // arrows belong to the drawer
  const keys = { ArrowDown:+1, PageDown:+1, ArrowUp:-1, PageUp:-1 };
  let delta = keys[e.key];
  if (e.key === "Home"){ delta = null; e.preventDefault(); return goTo("home"); }
  if (e.key === "End"){ delta = null; e.preventDefault(); return goTo("contact"); }
  if (delta === undefined || delta === null) return;
  const now = Date.now();
  if (now - lastKeyNav < 420) return;   // let the smooth snap land first
  lastKeyNav = now;
  e.preventDefault();
  const currentIndex = SECTION_IDS.findIndex(id => {
    const el = document.getElementById(id);
    return el && Math.abs(el.offsetTop - scroller.scrollTop) < scroller.clientHeight / 2;
  });
  const base = currentIndex === -1 ? 0 : currentIndex;
  const next = Math.min(SECTION_IDS.length - 1, Math.max(0, base + delta));
  goTo(SECTION_IDS[next]);
});

/* ═════════ Mobile menu ══════════ */
const hamburger = $("#hamburger"), mobileMenu = $("#mobileMenu");
function closeMobileMenu(){ mobileMenu.hidden = true; hamburger.setAttribute("aria-expanded","false"); }
hamburger.addEventListener("click", () => {
  const willOpen = mobileMenu.hidden;
  mobileMenu.hidden = !willOpen;
  hamburger.setAttribute("aria-expanded", String(willOpen));
});

/* ══════════════════════════════════════════════════════════
   HORIZONTAL SNAP CAROUSELS (arrows + edge dimming)
   ══════════════════════════════════════════════════════════ */
function wireCarousel(trackId, prevId, nextId){
  const track = $(trackId), prev = $(prevId), next = $(nextId);
  if (!track || !prev || !next) return;
  const step = () => Math.max(260, Math.round(track.clientWidth * 0.72));
  prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => track.scrollBy({ left:  step(), behavior: "smooth" }));
  const refresh = () => {
    const maxScroll = track.scrollWidth - track.clientWidth - 4;
    prev.classList.toggle("is-dim", track.scrollLeft <= 4);
    next.classList.toggle("is-dim", track.scrollLeft >= maxScroll);
  };
  track.addEventListener("scroll", refresh, { passive: true });
  window.addEventListener("resize", refresh);
  refresh();
}
wireCarousel("#serviceTrack", "#servicesPrev", "#servicesNext");
wireCarousel("#productTrack", "#storePrev", "#storeNext");

/* ═════════ Cart (localStorage-persisted, private-mode safe) ═════════ */
const CART_KEY = "dd_cart_v1";
const storage = {
  get(){ try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; } },
  set(v){ try { localStorage.setItem(CART_KEY, JSON.stringify(v)); } catch { /* in-memory only */ } },
};
let cart = storage.get();
const saveCart = () => storage.set(cart);
const cartItems = () => cart.map(ci => ({ ...ci, product: PRODUCTS.find(p => p.id === ci.id) })).filter(x => x.product);
const cartQty   = () => cart.reduce((n, i) => n + i.qty, 0);
const cartTotal = () => cartItems().reduce((n, i) => n + i.qty * i.product.price, 0);

function renderCart(){
  const qty = cartQty(), total = cartTotal();
  $("#cartBadge").textContent = qty;
  $("#cartCountLabel").textContent = `${qty} item${qty === 1 ? "" : "s"}`;
  $("#cartSummaryText").textContent = `${qty} item${qty === 1 ? "" : "s"} · ${fmtINR(total)}`;

  const wrap = $("#cartItems"), empty = $("#cartEmpty"), foot = $("#cartFoot");
  const items = cartItems();
  empty.hidden = items.length !== 0;
  foot.hidden  = items.length === 0;

  wrap.innerHTML = items.map(({ product: p, qty }) => `
    <div class="cart-item">
      <img src="${esc(p.img)}" alt="${esc(p.name)}" width="74" height="74" />
      <div class="ci-body">
        <div class="ci-name">${esc(p.name)}</div>
        <div class="ci-price">${fmtINR(p.price)} × ${qty} = ${fmtINR(p.price * qty)}</div>
        <div class="ci-row">
          <span class="qty" aria-label="Quantity">
            <button data-dec="${p.id}" aria-label="Decrease quantity">−</button>
            <span>${qty}</span>
            <button data-inc="${p.id}" aria-label="Increase quantity">+</button>
          </span>
          <button class="ci-remove" data-remove="${p.id}">Remove</button>
        </div>
      </div>
    </div>`).join("");

  $("#cartTotal").textContent = fmtINR(total);
  $("#deliveryNote").textContent = total >= FREE_DELIVERY_AT ? "FREE — nice!" : `₹49 (free above ${fmtINR(FREE_DELIVERY_AT)})`;

  const pct = Math.min(100, (total / FREE_DELIVERY_AT) * 100);
  const fill = $("#shipFill"), text = $("#shipText");
  fill.style.width = pct + "%";
  fill.classList.toggle("done", total >= FREE_DELIVERY_AT);
  text.classList.toggle("done", total >= FREE_DELIVERY_AT);
  text.textContent = total >= FREE_DELIVERY_AT
    ? "You unlocked FREE delivery!"
    : `Add ${fmtINR(FREE_DELIVERY_AT - total)} more for FREE delivery`;
}

function addToCart(id){
  const found = cart.find(i => i.id === id);
  if (found) found.qty += 1; else cart.push({ id, qty: 1 });
  saveCart(); renderCart();
  const badge = $("#cartBadge");
  badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop");
  const p = PRODUCTS.find(x => x.id === id);
  showToast(`<b>${esc(p.name)}</b> added to your cart`);
}
function changeQty(id, delta){
  const item = cart.find(i => i.id === id); if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart(); renderCart();
}
function removeFromCart(id){ cart = cart.filter(i => i.id !== id); saveCart(); renderCart(); }

$("#productTrack").addEventListener("click", e => {
  const btn = e.target.closest("[data-add]"); if (!btn) return;
  addToCart(btn.dataset.add);
});
$("#cartItems").addEventListener("click", e => {
  const inc = e.target.closest("[data-inc]"); if (inc) return changeQty(inc.dataset.inc, +1);
  const dec = e.target.closest("[data-dec]"); if (dec) return changeQty(dec.dataset.dec, -1);
  const rem = e.target.closest("[data-remove]"); if (rem) return removeFromCart(rem.dataset.remove);
});

const cartDrawer = $("#cartDrawer");
function openCart(){ cartDrawer.classList.add("open"); cartDrawer.setAttribute("aria-hidden","false"); $("#cartClose").focus(); }
function closeCart(){ cartDrawer.classList.remove("open"); cartDrawer.setAttribute("aria-hidden","true"); }
$("#cartOpen").addEventListener("click", openCart);
$("#cartClose").addEventListener("click", closeCart);
$("#cartSummary").addEventListener("click", openCart);

/* ═════════ Checkout: details → POST /api/orders → WhatsApp ═════════ */
const checkoutForm = $("#checkoutForm");
const orderSuccess = $("#orderSuccess");

function showCheckout(){
  if (!cartItems().length) { showToast("Your cart is empty"); return; }
  orderSuccess.hidden = true;
  checkoutForm.hidden = false;
  $("#cartFoot").hidden = true;
  if (ME){
    if (!$("#co-name").value)  $("#co-name").value  = ME.name  || "";
    if (!$("#co-phone").value) $("#co-phone").value = ME.phone || "";
  }
  $("#co-name").focus();
}
function hideCheckout(){
  checkoutForm.hidden = true;
  $("#cartFoot").hidden = cartItems().length === 0;
}
$("#placeOrder").addEventListener("click", showCheckout);
$("#coBack").addEventListener("click", hideCheckout);

checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#co-name"), phone = $("#co-phone"), address = $("#co-address");
  if (!name.value.trim())  { name.focus();  showToast("Please tell me your name"); return; }
  if (!phone.value.trim()) { phone.focus(); showToast("Please share a contact phone"); return; }
  const btn = $("#coConfirm"); btn.disabled = true; btn.textContent = "Placing order…";
  try {
    const res = await fetch("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: name.value, phone: phone.value, address: address.value,
        items: cart.map(i => ({ id: i.id, qty: i.qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't place the order");
    const o = data.order;

    // clear cart & switch drawer to success state
    cart = []; saveCart(); renderCart();
    $("#cartItems").style.display = "none"; $("#shipMeter").style.display = "none";
    $("#cartEmpty").style.display = "none"; $("#cartFoot").hidden = true;
    checkoutForm.hidden = true;
    $("#osOrderId").textContent = "#" + o.id;
    $("#osTotal").textContent = fmtINR(o.total);
    $("#osTrack").href = ME ? "/dashboard.html" : "/login.html?next=/dashboard.html";
    $("#osTrack").textContent = ME ? "Track my orders →" : "Sign in to track orders →";
    orderSuccess.hidden = false;
    // refresh live products (stock changed)
    loadProducts();

    // open WhatsApp with the order reference
    const lines = o.items.map(i => `• ${i.qty} × ${i.name} — ${fmtINR(i.price * i.qty)}`);
    const msg = [
      `Hi ${SITE.brand}! I just placed order #${o.id} on your website:`,
      ...lines,
      ``,
      `Subtotal: ${fmtINR(o.subtotal)}`,
      `Delivery: ${o.delivery === 0 ? "FREE" : fmtINR(o.delivery)}`,
      `Total: ${fmtINR(o.total)}`,
      `Name: ${name.value.trim()} · Phone: ${phone.value.trim()}${address.value.trim() ? "\nAddress: " + address.value.trim() : ""}`,
      ``,
      `Please confirm stock & share payment / delivery details.`,
    ].join("\n");
    window.open(waLink(msg), "_blank", "noopener");
    showToast(`<b>Order #${o.id}</b> placed — confirm on WhatsApp`);
  } catch (err) {
    showToast(err.message || "Order failed — try again");
  } finally {
    btn.disabled = false; btn.textContent = "Confirm & Place Order";
  }
});
$("#osContinue").addEventListener("click", () => {
  orderSuccess.hidden = true;
  $("#cartItems").style.display = ""; $("#shipMeter").style.display = ""; $("#cartEmpty").style.display = ""; $("#cartFoot").hidden = cartItems().length === 0;
  closeCart();
});

/* ═════════ Booking form → saved as lead + WhatsApp ═════════ */
$("#callForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#f-name"), need = $("#f-need"), budget = $("#f-budget"), msg = $("#f-msg"), phone = $("#f-phone");
  if (!name.value.trim()) { name.focus(); showToast("Please tell me your name"); return; }
  if (!need.value)        { need.focus(); showToast("Please choose what you need"); return; }
  const payload = { name: name.value.trim(), phone: phone.value.trim(), need: need.value, budget: budget.value, message: msg.value.trim() };
  // save the lead for the admin dashboard (fire-and-forget, never blocks WhatsApp)
  fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
  const text = [
    `Hi ${SITE.brand}! I'm ${name.value.trim()}.`,
    `Need: ${need.value}`,
    `Budget: ${budget.value}`,
    phone.value.trim() ? `Phone: ${phone.value.trim()}` : null,
    msg.value.trim() ? `Details: ${msg.value.trim()}` : null,
    ``,
    `Sent from your website — let's book the free 15-min call.`,
  ].filter(Boolean).join("\n");
  window.open(waLink(text), "_blank", "noopener");
});

/* ═════════ Toast ═════════ */
const toast = $("#toast");
let toastTimer;
function showToast(html){
  toast.innerHTML = html;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

/* ════════════════ FULL-STACK BOOTSTRAP ════════════════
   /api/me → swap Login button for the account chip
   /api/products → live products from the admin dashboard */
let ME = null;

async function fetchMe(){
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch { return null; }
}
async function loadProducts(){
  try {
    const res = await fetch("/api/products");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.products) && data.products.length){
      PRODUCTS = data.products;
      renderStore();
      renderCart();
    }
  } catch { /* static hosting → keep fallback products */ }
}
function renderAuthUI(){
  const loginBtn = $("#navLogin"), account = $("#navAccount"), mobileLogin = $("#mobileLogin");
  if (ME){
    if (loginBtn) loginBtn.hidden = true;
    if (account){
      account.hidden = false;
      account.href = ME.role === "admin" ? "/admin.html" : "/dashboard.html";
      $("#navAccountInitial").textContent = (ME.name || "U").trim().charAt(0).toUpperCase();
      $("#navAccountName").textContent = (ME.name || "You").trim().split(/\s+/)[0];
    }
    if (mobileLogin){ mobileLogin.href = account ? account.href : "/dashboard.html"; mobileLogin.firstChild.textContent = ME.role === "admin" ? "Admin Dashboard " : "My Dashboard "; }
  } else {
    if (loginBtn) loginBtn.hidden = false;
    if (account) account.hidden = true;
    if (mobileLogin){ mobileLogin.href = "/login.html"; mobileLogin.firstChild.textContent = "Login / Sign up "; }
  }
}

/* ═════════ Init ═════════ */
(async function init(){
  ME = await fetchMe();
  renderAuthUI();
  loadProducts();
  renderCart();
})();
