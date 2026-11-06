/* ============ PixelForge Studio — interactions ============ */

/* ---- nav scroll state ---- */
const nav = document.getElementById('nav');
const stage = document.getElementById('snapStage');
stage.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', stage.scrollTop > 40);
});

/* ---- mobile menu (locks body scroll) ---- */
const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');
burger.addEventListener('click', () => {
  burger.classList.toggle('open');
  navLinks.classList.toggle('open');
  document.body.classList.toggle('locked', navLinks.classList.contains('open'));
});
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  burger.classList.remove('open');
  navLinks.classList.remove('open');
  document.body.classList.remove('locked');
}));

/* ---- reveal on scroll ---- */
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { root: stage, threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ---- custom cursor ---- */
const dot = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');
let mx = -100, my = -100, rx = -100, ry = -100;
window.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  dot.style.left = mx + 'px'; dot.style.top = my + 'px';
});
(function loop() {
  rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
  ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
  requestAnimationFrame(loop);
})();
document.querySelectorAll('a, button, .product').forEach(el => {
  el.addEventListener('mouseenter', () => ring.classList.add('hover'));
  el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
});

/* ---- horizontal carousel: buttons + drag ---- */
const car = document.getElementById('carousel');
const step = () => (car.querySelector('.product')?.offsetWidth || 260) + 22;
document.getElementById('carPrev').addEventListener('click', () => car.scrollBy({ left: -step(), behavior: 'smooth' }));
document.getElementById('carNext').addEventListener('click', () => car.scrollBy({ left: step(), behavior: 'smooth' }));
let isDown = false, startX = 0, startScroll = 0;
car.addEventListener('pointerdown', e => {
  isDown = true; startX = e.clientX; startScroll = car.scrollLeft;
  car.classList.add('dragging'); car.setPointerCapture(e.pointerId);
});
car.addEventListener('pointermove', e => { if (isDown) car.scrollLeft = startScroll - (e.clientX - startX); });
['pointerup', 'pointercancel'].forEach(ev => car.addEventListener(ev, () => { isDown = false; car.classList.remove('dragging'); }));

/* ---- cart (localStorage persisted) ---- */
const CART_KEY = 'pixelforge-cart';
let cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');

const cartBtn = document.getElementById('cartBtn');
const drawer = document.getElementById('cartDrawer');
const scrim = document.getElementById('scrim');
const cartItems = document.getElementById('cartItems');
const cartCount = document.getElementById('cartCount');
const cartTotal = document.getElementById('cartTotal');

function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function renderCart() {
  cartCount.textContent = cart.reduce((s, i) => s + i.qty, 0);
  cartTotal.textContent = '₹' + cart.reduce((s, i) => s + i.qty * i.price, 0).toLocaleString('en-IN');
  if (!cart.length) {
    cartItems.innerHTML = '<p class="cart-empty">Your cart is empty — add something from the store 🛍️</p>';
    return;
  }
  cartItems.innerHTML = cart.map((i, idx) => `
    <div class="cart-item">
      <div><div class="ci-name">${i.name}</div><div class="ci-price">₹${(i.price * i.qty).toLocaleString('en-IN')}</div></div>
      <div class="ci-qty">
        <button data-act="dec" data-idx="${idx}">−</button><span>${i.qty}</span><button data-act="inc" data-idx="${idx}">+</button>
      </div>
      <button class="ci-remove" data-act="rm" data-idx="${idx}">✕</button>
    </div>`).join('');
}
cartItems.addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const idx = +btn.dataset.idx, act = btn.dataset.act;
  if (act === 'inc') cart[idx].qty++;
  if (act === 'dec') { cart[idx].qty--; if (cart[idx].qty <= 0) cart.splice(idx, 1); }
  if (act === 'rm') cart.splice(idx, 1);
  saveCart(); renderCart();
});
document.querySelectorAll('.add-cart').forEach(btn => btn.addEventListener('click', () => {
  const p = btn.closest('.product');
  const found = cart.find(i => i.id === p.dataset.id);
  if (found) found.qty++;
  else cart.push({ id: p.dataset.id, name: p.dataset.name, price: +p.dataset.price, qty: 1 });
  saveCart(); renderCart();
  cartBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 350 });
  openCart();
}));
function openCart() { drawer.classList.add('open'); scrim.classList.add('show'); document.body.classList.add('locked'); }
function closeCart() { drawer.classList.remove('open'); scrim.classList.remove('show'); document.body.classList.remove('locked'); }
cartBtn.addEventListener('click', openCart);
document.getElementById('cartClose').addEventListener('click', closeCart);
scrim.addEventListener('click', closeCart);
document.getElementById('checkoutBtn').addEventListener('click', () => {
  if (!cart.length) return;
  alert(`✅ Order placed! ${cart.reduce((s, i) => s + i.qty, 0)} item(s) — total ₹${cart.reduce((s, i) => s + i.qty * i.price, 0).toLocaleString('en-IN')}. Thank you!`);
  cart = []; saveCart(); renderCart(); closeCart();
});
renderCart();

/* ---- contact form ---- */
document.getElementById('contactForm').addEventListener('submit', e => {
  e.preventDefault();
  document.getElementById('formNote').textContent = '✔ Message sent! We will reply within 24 hours.';
  e.target.reset();
});
