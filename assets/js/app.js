/* ══════════════════════════════════════════════════════════
   Debasish Das — Web Studio & Store
   ────────────────────────────────────────────────────────
   ✏️  EDIT ME — your real details (nothing else to change):
   ══════════════════════════════════════════════════════════ */
const SITE = {
  brand:        "Debasish Das",
  // WhatsApp number: country code + number, NO +, spaces or dashes.
  // ⚠️ Placeholder below (starts with 0 = not a real subscriber). Replace it!
  whatsapp:     "910000000000",
  phoneDisplay: "+91 00000 00000",     // shown on the page — replace with your real number
  email:        "hello@example.com",   // shown on the page — replace with your real email
  location:     "Kolkata, West Bengal, India",
  hours:        "Mon–Sat · 9 AM – 8 PM IST",
};
/* ══════════════════════════════════════════════════════════ */

const waLink = (text) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
const fmtINR = (n) => "₹" + n.toLocaleString("en-IN");
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

/* ───────── Store products (sample items — edit freely) ───────── */
const PRODUCTS = [
  { id:"p1", name:"Ergo Wireless Mouse",     meta:"2.4GHz + Bluetooth · 3 modes",  price:499,  was:799,  img:"assets/img/product-mouse.jpg",     tag:"Tech",        rating:"4.6" },
  { id:"p2", name:"Luma LED Desk Lamp",      meta:"3 light tones · USB charge port", price:899,  was:1299, img:"assets/img/product-lamp.jpg",      tag:"Home & Living", rating:"4.8" },
  { id:"p3", name:"USB-C 6-in-1 Hub 100W",   meta:"4K HDMI · PD 100W · SD reader", price:1299, was:1799, img:"assets/img/product-hub.jpg",       tag:"Tech",        rating:"4.5" },
  { id:"p4", name:"Terra Bluetooth Speaker", meta:"12h playtime · TWS pairing",    price:1499, was:2199, img:"assets/img/product-speaker.jpg",   tag:"Tech",        rating:"4.7" },
  { id:"p5", name:"Speckled Ceramic Mug",    meta:"350 ml · handmade · microwave safe", price:349, was:499, img:"assets/img/product-mug.jpg",      tag:"Home & Living", rating:"4.9" },
  { id:"p6", name:"Walnut Desk Organiser",   meta:"Solid walnut · phone + pen slots", price:749, was:1099, img:"assets/img/product-organizer.jpg", tag:"Home & Living", rating:"4.8" },
];

/* ───────── Services ───────── */
const SERVICES = [
  { name:"Business Website",      price:"from ₹7,999",  tag:"7-day delivery", desc:"Fast, mobile-first website for your shop/clinic/salon/agency — design, code, basic SEO and launch handled end-to-end.", wa:"Hi Debasish! I want a Business Website. Please share details & a quote." },
  { name:"E-commerce / Store",    price:"from ₹12,999", tag:"Sell online",    desc:"Product catalogue, cart, WhatsApp or Razorpay checkout, order notifications — your own online shop, managed by me.", wa:"Hi Debasish! I want an online store for my business. Please share details & a quote." },
  { name:"Hosting & Domains",     price:"from ₹199/yr", tag:"Free SSL",       desc:".in / .com domains, NVMe hosting, free SSL, professional email (you@yourbrand.com) and free migration from your old host.", wa:"Hi Debasish! I need hosting / a domain. Please share plans & pricing." },
  { name:"Care Plan",             price:"₹999 / mo",    tag:"Peace of mind",  desc:"Monthly updates, daily backups, security checks, small content edits and priority WhatsApp support for your site.", wa:"Hi Debasish! I'm interested in the monthly Care Plan. Please share details." },
];

/* ───────── Hosting plans ───────── */
const PLANS = [
  { name:"Starter",  price:"₹199", per:"/year", desc:"For your first website or a simple brochure site.", features:["1 website","5 GB NVMe storage","Free SSL certificate","Weekly backups","Free .in domain — 1st year","Email support"], popular:false, wa:"Hi Debasish! I want the Starter hosting plan (₹199/yr). Please set it up for me." },
  { name:"Business", price:"₹499", per:"/year", desc:"For growing businesses that need speed & reliability.", features:["3 websites","15 GB NVMe storage","Free SSL + daily backups","Free .in domain — 1st year","Business email included","Priority WhatsApp support"], popular:true,  wa:"Hi Debasish! I want the Business hosting plan (₹499/yr). Please set it up for me." },
  { name:"Pro",      price:"₹999", per:"/year", desc:"For agencies, stores and high-traffic sites.", features:["10 websites","40 GB NVMe storage","Free SSL + daily backups","Free domain — 1st year","Staging site + free migration","Same-day WhatsApp support"], popular:false, wa:"Hi Debasish! I want the Pro hosting plan (₹999/yr). Please set it up for me." },
];

const FREE_DELIVERY_AT = 999;

/* ═════════ Render store ═════════ */
const storeGrid = $("#storeGrid");
storeGrid.innerHTML = PRODUCTS.map(p => `
  <article class="product-card">
    <div class="product-media">
      <span class="product-tag">${p.tag}</span>
      <span class="stock">In stock · ★ ${p.rating}</span>
      <img src="${p.img}" alt="${p.name}" loading="lazy" width="400" height="400" />
    </div>
    <div class="product-body">
      <h3 class="product-name">${p.name}</h3>
      <p class="product-meta">${p.meta}</p>
      <div class="product-foot">
        <div class="price"><small>M.R.P. ${fmtINR(p.was)}</small>${fmtINR(p.price)}</div>
        <button class="add-btn" data-add="${p.id}" aria-label="Add ${p.name} to cart">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>
    </div>
  </article>`).join("");

/* ═════════ Render services ═════════ */
$("#serviceList").innerHTML = SERVICES.map(s => `
  <article class="service-card">
    <span class="service-tag">${s.tag}</span>
    <div class="service-top">
      <h3 class="service-name">${s.name}</h3>
      <div class="service-price">${s.price}<small>all-inclusive quote</small></div>
    </div>
    <p class="service-desc">${s.desc}</p>
    <a class="service-cta" href="${waLink(s.wa)}" target="_blank" rel="noopener">Get this on WhatsApp
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>
    </a>
  </article>`).join("");

/* ═════════ Render hosting plans ═════════ */
const check = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#1f9d55" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.2 5L20 6.5"/></svg>`;
$("#planGrid").innerHTML = PLANS.map(p => `
  <article class="plan ${p.popular ? "plan-popular" : ""}">
    ${p.popular ? '<span class="plan-badge">Most Popular</span>' : ''}
    <p class="plan-name">${p.name}</p>
    <div class="plan-price">${p.price}<span> ${p.per} + GST</span></div>
    <p class="plan-desc">${p.desc}</p>
    <ul>${p.features.map(f => `<li>${check}<span>${f}</span></li>`).join("")}</ul>
    <a class="plan-cta" href="${waLink(p.wa)}" target="_blank" rel="noopener">Choose ${p.name} — order on WhatsApp</a>
  </article>`).join("");

/* ═════════ Contact channel links (from SITE config) ═════════ */
$("#waChannel").href = waLink(`Hi ${SITE.brand}! I found your website and would like to talk.`);
$("#callChannel").href = `tel:${SITE.whatsapp.replace(/^91(?=\d{10}$)/, "+91")}`;
$("#callChannelSub").textContent = SITE.phoneDisplay;
$("#waChannelSub").textContent = `${SITE.phoneDisplay} · usually replies in minutes`;
$("#emailChannelSub").textContent = SITE.email;
$("#emailChannel").href = `mailto:${SITE.email}`;
$("#locationLine").textContent = `${SITE.location} · ${SITE.hours}`;

/* ═════════ Overlay open/close ═════════ */
let lastFocus = null;
function openOverlay(name){
  const ov = $(`#overlay-${name}`);
  if (!ov) return;
  lastFocus = document.activeElement;
  ov.classList.add("open");
  ov.setAttribute("aria-hidden", "false");
  $(".mobile-menu").hidden = true; $("#hamburger").setAttribute("aria-expanded","false");
  const focusable = ov.querySelector("button, a[href], input, select, textarea");
  (focusable || ov).focus?.();
}
function closeOverlay(ov){
  ov.classList.remove("open");
  ov.setAttribute("aria-hidden", "true");
  if (lastFocus) lastFocus.focus();
}
$$("[data-open]").forEach(btn => btn.addEventListener("click", () => { closeCart(); openOverlay(btn.dataset.open); }));
$$(".overlay").forEach(ov => {
  ov.addEventListener("click", e => { if (e.target === ov) closeOverlay(ov); });
  ov.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeOverlay(ov)));
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const openOv = $(".overlay.open");
  if (openOv) closeOverlay(openOv);
  if ($("#cartDrawer").classList.contains("open")) closeCart();
  const mm = $("#mobileMenu"); if (!mm.hidden) { mm.hidden = true; $("#hamburger").setAttribute("aria-expanded","false"); }
});

/* ═════════ Mobile menu ═════════ */
const hamburger = $("#hamburger"), mobileMenu = $("#mobileMenu");
hamburger.addEventListener("click", () => {
  const willOpen = mobileMenu.hidden;
  mobileMenu.hidden = !willOpen;
  hamburger.setAttribute("aria-expanded", String(willOpen));
});

/* ═════════ Cart (localStorage-persisted, resilient to private mode / file://) ═════════ */
const CART_KEY = "dd_cart_v1";
const storage = {
  get(){ try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; } },
  set(v){ try { localStorage.setItem(CART_KEY, JSON.stringify(v)); } catch { /* storage unavailable — cart still works in memory */ } },
};
let cart = storage.get();
const saveCart = () => storage.set(cart);
const cartItems = () => cart.map(ci => ({ ...ci, product: PRODUCTS.find(p => p.id === ci.id) })).filter(x => x.product);
const cartQty   = () => cart.reduce((n, i) => n + i.qty, 0);
const cartTotal = () => cartItems().reduce((n, i) => n + i.qty * i.product.price, 0);

function renderCart(){
  const badge = $("#cartBadge");
  badge.textContent = cartQty();
  $("#cartCountLabel").textContent = `${cartQty()} item${cartQty() === 1 ? "" : "s"}`;

  const wrap = $("#cartItems"), empty = $("#cartEmpty"), foot = $("#cartFoot");
  const items = cartItems();
  empty.hidden = items.length !== 0;
  foot.hidden  = items.length === 0;

  wrap.innerHTML = items.map(({ product: p, qty }) => `
    <div class="cart-item">
      <img src="${p.img}" alt="${p.name}" width="78" height="78" />
      <div class="ci-body">
        <div class="ci-name">${p.name}</div>
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

  const total = cartTotal();
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
  showToast(`<b>${p.name}</b> added to your cart`);
}
function changeQty(id, delta){
  const item = cart.find(i => i.id === id); if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart(); renderCart();
}
function removeFromCart(id){ cart = cart.filter(i => i.id !== id); saveCart(); renderCart(); }

storeGrid.addEventListener("click", e => {
  const btn = e.target.closest("[data-add]"); if (!btn) return;
  addToCart(btn.dataset.add);
});
$("#cartItems").addEventListener("click", e => {
  const inc = e.target.closest("[data-inc]"); if (inc) return changeQty(inc.dataset.inc, +1);
  const dec = e.target.closest("[data-dec]"); if (dec) return changeQty(dec.dataset.dec, -1);
  const rem = e.target.closest("[data-remove]"); if (rem) return removeFromCart(rem.dataset.remove);
});

/* cart drawer open/close */
const cartDrawer = $("#cartDrawer");
function openCart(){ cartDrawer.classList.add("open"); cartDrawer.setAttribute("aria-hidden","false"); $("#cartClose").focus(); }
function closeCart(){ cartDrawer.classList.remove("open"); cartDrawer.setAttribute("aria-hidden","true"); }
$("#cartOpen").addEventListener("click", openCart);
$("#cartClose").addEventListener("click", closeCart);

/* place order → WhatsApp with prefilled message */
$("#placeOrder").addEventListener("click", () => {
  const items = cartItems(); if (!items.length) return;
  const total = cartTotal();
  const lines = items.map(({ product: p, qty }) => `• ${qty} × ${p.name} — ${fmtINR(p.price * qty)}`);
  const delivery = total >= FREE_DELIVERY_AT ? "FREE" : "₹49";
  const msg = [
    `Hi ${SITE.brand}! I'd like to order:`,
    ...lines,
    ``,
    `Subtotal: ${fmtINR(total)}`,
    `Delivery: ${delivery}`,
    `Total: ${total >= FREE_DELIVERY_AT ? fmtINR(total) : fmtINR(total + 49)}`,
    ``,
    `Please confirm availability & share payment / delivery details.`,
  ].join("\n");
  window.open(waLink(msg), "_blank", "noopener");
});

/* ═════════ Booking form → WhatsApp ═════════ */
$("#callForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#f-name"), need = $("#f-need"), budget = $("#f-budget"), msg = $("#f-msg");
  if (!name.value.trim()) { name.focus(); showToast("Please tell me your name 🙂"); return; }
  if (!need.value)        { need.focus(); showToast("Please choose what you need"); return; }
  const text = [
    `Hi ${SITE.brand}! I'm ${name.value.trim()}.`,
    `Need: ${need.value}`,
    `Budget: ${budget.value}`,
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

/* ═════════ Init ═════════ */
renderCart();
