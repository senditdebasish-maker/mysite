/* /dashboard.html — user account: orders, profile, help */
(function () {
  const $ = (s) => document.querySelector(s);
  const { toast, fetchJSON, inr, dt, monthYear, bindLogout, statusLabel, esc } = window.UI;
  const waDigits = "910000000000";   // TODO: keep in sync with SITE.whatsapp in assets/js/app.js
  $("#helpWa").href = `https://wa.me/${waDigits}?text=${encodeURIComponent("Hi Debasish! I need help with my order.")}`;

  const STATUS_STEPS = ["pending", "confirmed", "shipped", "delivered"];

  function progressHTML(status) {
    if (status === "cancelled") {
      return `<div class="progress" aria-hidden="true">${"<span class='prog-seg cancel'></span>".repeat(4)}</div>`;
    }
    const idx = STATUS_STEPS.indexOf(status);
    return `<div class="progress" aria-hidden="true">${
      STATUS_STEPS.map((s, i) => `<span class="prog-seg${i <= idx ? " done" : ""}"></span>`).join("")
    }</div>`;
  }

  function orderCard(o) {
    const items = (o.items || []).map(i => `<span><span>${i.qty} × ${esc(i.name)}</span><span>${inr(i.price * i.qty)}</span></span>`).join("");
    const help = `https://wa.me/${waDigits}?text=${encodeURIComponent(`Hi Debasish! Order #${o.id} — I need help with it.`)}`;
    return `
      <article class="order-card">
        <div class="order-top">
          <div><span class="order-id">Order #${o.id}</span><br /><span class="order-date">${dt(o.created_at)}</span></div>
          <span class="status-pill st-${o.status}">${statusLabel[o.status] || o.status}</span>
        </div>
        <div class="order-items">${items}</div>
        <div class="order-split">
          <span class="muted" style="font-size:.75rem">${(o.items || []).length} item(s) · incl. delivery &amp; GST</span>
          <span class="order-total">${inr(o.total)}</span>
        </div>
        ${progressHTML(o.status)}
        <div class="order-foot">
          <a class="order-help" href="${help}" target="_blank" rel="noopener">Issue with this order? Chat →</a>
          <a class="reorder-btn invoice-link" href="invoice.html?id=${o.id}">⬇ Invoice</a>
          <button class="reorder-btn" data-reorder='${JSON.stringify((o.items || []).map(i => ({ id: i.id, qty: i.qty }))).replace(/'/g, "&apos;")}'>↺ Order again</button>
        </div>
      </article>`;
  }

  async function loadOrders(announce) {
    try {
      const data = await fetchJSON("api/my/orders");
      const wrap = $("#ordersWrap");
      const orders = data.orders || [];
      $("#ordersEmpty").hidden = orders.length !== 0;
      wrap.innerHTML = orders.map(orderCard).join("");
      wrap.style.display = orders.length ? "" : "none";
      if (announce) toast("Orders updated");
      return orders;
    } catch (err) {
      $("#ordersWrap").innerHTML = `<p class="muted" style="padding:.6rem .2rem">Couldn’t load orders: ${err.message}</p>`;
      return [];
    }
  }

  // reorder → merge into the cart used by the home page, then go there
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reorder]");
    if (!btn) return;
    let items = [];
    try { items = JSON.parse(btn.getAttribute("data-reorder")); } catch { return; }
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem("dd_cart_v1") || "[]"); } catch { cart = []; }
    for (const { id, qty } of items) {
      const found = cart.find(i => i.id === id);
      if (found) found.qty += qty; else cart.push({ id, qty });
    }
    try { localStorage.setItem("dd_cart_v1", JSON.stringify(cart)); } catch {}
    location.href = "index.html";
  });

  bindLogout("logoutBtn");
  $("#refreshOrders").addEventListener("click", () => loadOrders(true));
  $("#profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await fetchJSON("api/me", {
        method: "PUT",
        body: JSON.stringify({ name: $("#p-name").value, phone: $("#p-phone").value }),
      });
      $("#firstName").textContent = (data.user.name || "friend").trim().split(/\s+/)[0];
      $("#meName").textContent = $("#firstName").textContent;
      $("#meInitial").textContent = $("#firstName").textContent.charAt(0).toUpperCase();
      toast("Profile saved");
    } catch (err) {
      toast(err.message);
    }
  });

  (async function init() {
    let me = null;
    try { me = (await fetchJSON("api/me")).user; } catch {}
    if (!me) { location.replace("login.html?next=dashboard.html"); return; }
    if (me.role === "admin") { location.replace("admin.html"); return; }

    const first = (me.name || "friend").trim().split(/\s+/)[0];
    $("#firstName").textContent = first;
    $("#meName").textContent = first;
    $("#meInitial").textContent = first.charAt(0).toUpperCase();
    $("#meEmail").textContent = me.email;
    $("#memberSince").textContent = monthYear(me.created_at);
    $("#p-name").value = me.name || "";
    $("#p-phone").value = me.phone || "";
    $("#p-email").value = me.email || "";

    await loadOrders(false);
    setInterval(() => loadOrders(false), 20000);   // live-ish status refresh
  })();
})();
