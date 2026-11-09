/* /dashboard.html — account tabs: Orders · Addresses · Wishlist · Profile & Security */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const { toast, fetchJSON, inr, dt, monthYear, bindLogout, statusLabel, esc } = window.UI;
  const DD = window.DD || null;
  const waDigits = "910000000000";   // TODO: keep in sync with SITE.whatsapp in assets/js/app.js
  $("#helpWa").href = `https://wa.me/${waDigits}?text=${encodeURIComponent("Hi Debasish! I need help with my order.")}`;

  const STATUS_STEPS = ["pending", "confirmed", "shipped", "delivered"];

  /* ═══════════ TABS ═══════════ */
  const tabs = [
    { btn: "#tabBtnOrders", panel: "#tabOrders" },
    { btn: "#tabBtnAddresses", panel: "#tabAddresses" },
    { btn: "#tabBtnWishlist", panel: "#tabWishlist" },
    { btn: "#tabBtnProfile", panel: "#tabProfile" },
  ];
  function activateTab(name) {
    for (const t of tabs) {
      const on = t.btn.toLowerCase().includes(name);
      $(t.btn).classList.toggle("is-active", on);
      $(t.btn).setAttribute("aria-selected", String(on));
      $(t.panel).hidden = !on;
    }
  }
  $("#tabBtnOrders").addEventListener("click", () => activateTab("orders"));
  $("#tabBtnAddresses").addEventListener("click", () => { activateTab("addresses"); loadAddresses(); });
  $("#tabBtnWishlist").addEventListener("click", () => { activateTab("wishlist"); renderWishlist(); });
  $("#tabBtnProfile").addEventListener("click", () => activateTab("profile"));

  /* ═══════════ ORDERS ═══════════ */
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
    const canCancel = ["pending", "confirmed"].includes(o.status);
    const deliveryBadge = o.delivery_method === "express"
      ? '<span class="delivery-badge express">Express</span>'
      : '<span class="delivery-badge">Standard</span>';
    const couponLine = o.coupon_code ? `<span class="muted" style="font-size:.74rem">Coupon ${esc(o.coupon_code)} · saved ${inr(o.discount || 0)}</span>` : "";
    return `
      <article class="order-card">
        <div class="order-top">
          <div><span class="order-id">Order #${o.id}</span>${deliveryBadge}<br /><span class="order-date">${dt(o.created_at)}</span></div>
          <span class="status-pill st-${o.status}">${statusLabel[o.status] || o.status}</span>
        </div>
        <div class="order-items">${items}</div>
        <div class="order-split">
          <span class="muted" style="font-size:.75rem">${(o.items || []).length} item(s) · incl. delivery &amp; GST${o.coupon_code ? " · " + esc(o.coupon_code) : ""}</span>
          <span class="order-total">${inr(o.total)}</span>
        </div>
        ${progressHTML(o.status)}
        <div class="order-foot">
          <a class="order-help" href="${help}" target="_blank" rel="noopener">Issue with this order? Chat →</a>
          <a class="reorder-btn invoice-link" href="invoice.html?id=${o.id}">⬇ Invoice</a>
          <button class="reorder-btn" data-reorder='${JSON.stringify((o.items || []).map(i => ({ id: i.id, qty: i.qty }))).replace(/'/g, "&apos;")}'>↺ Order again</button>
          ${canCancel ? `<button class="cancel-order-btn" data-cancel-order="${o.id}" type="button">Cancel order</button>` : ""}
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

  // reorder → merge into the cart, then go to checkout
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reorder]");
    if (!btn) return;
    let items = [];
    try { items = JSON.parse(btn.getAttribute("data-reorder")); } catch { return; }
    if (DD && DD.cart) {
      for (const { id, qty } of items) DD.cart.add(id, qty);
      location.href = "checkout.html";
      return;
    }
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem("dd_cart_v1") || "[]"); } catch { cart = []; }
    for (const { id, qty } of items) {
      const found = cart.find(i => i.id === id);
      if (found) found.qty += qty; else cart.push({ id, qty });
    }
    try { localStorage.setItem("dd_cart_v1", JSON.stringify(cart)); } catch {}
    location.href = "checkout.html";
  });

  // cancel order
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-cancel-order]");
    if (!btn) return;
    const id = Number(btn.getAttribute("data-cancel-order"));
    if (!Number.isFinite(id)) return;
    const ok = window.confirm(`Cancel order #${id}?\n\nYour items go back in stock immediately. This can’t be undone.`);
    if (!ok) return;
    btn.disabled = true; btn.textContent = "Cancelling…";
    try {
      await fetchJSON(`api/my/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "cancelled by customer" }) });
      toast(`Order #${id} cancelled — stock restored`);
      await loadOrders(false);
    } catch (err) {
      toast(err.message || "Couldn’t cancel — chat on WhatsApp instead");
      btn.disabled = false; btn.textContent = "Cancel order";
    }
  });

  /* ═══════════ ADDRESS BOOK ═══════════ */
  let editingId = null;
  const blankForm = () => {
    $("#addressFormTitle").textContent = "New address";
    ["#aLabel", "#aName", "#aPhone", "#aPin", "#aLine", "#aCity", "#aState"].forEach(s => { $(s).value = ""; });
    $("#aDefault").checked = false;
    editingId = null;
  };
  const showForm = (show) => { $("#addressForm").hidden = !show; if (show) $("#aName").focus(); };

  async function loadAddresses() {
    const err = $("#addrError");
    err.hidden = true;
    try {
      const data = await fetchJSON("api/addresses");
      const list = data.addresses || [];
      const grid = $("#addrGrid");
      $("#addrEmpty").hidden = list.length !== 0;
      grid.innerHTML = list.map(a => `
        <article class="addr-card${a.is_default ? " is-default" : ""}" data-id="${a.id}">
          <div class="addr-head">
            <span class="addr-tag">${esc(a.label || "Address")}</span>
            ${a.is_default ? '<span class="addr-default-badge">Default</span>' : ""}
          </div>
          <span class="addr-recipient">${esc(a.name)}</span>
          <span class="addr-phone">${esc(a.phone)}</span>
          <span class="addr-line">${esc(a.line)}, ${esc(a.city)}${a.state ? ", " + esc(a.state) : ""} — ${esc(a.pincode)}</span>
          <div class="addr-actions">
            ${a.is_default ? "" : `<button class="addr-btn" data-set-default="${a.id}" type="button">Make default</button>`}
            <button class="addr-btn" data-edit-addr="${a.id}" type="button">Edit</button>
            <button class="addr-btn danger" data-del-addr="${a.id}" type="button">Delete</button>
          </div>
        </article>`).join("");
    } catch (e) {
      err.textContent = e.message || "Couldn’t load addresses";
      err.hidden = false;
    }
  }

  document.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del-addr]");
    if (del) {
      const id = Number(del.getAttribute("data-del-addr"));
      if (!window.confirm("Delete this address?")) return;
      try { await fetchJSON(`api/addresses/${id}`, { method: "DELETE" }); toast("Address deleted"); await loadAddresses(); }
      catch (err) { toast(err.message); }
      return;
    }
    const def = e.target.closest("[data-set-default]");
    if (def) {
      const id = Number(def.getAttribute("data-set-default"));
      try { await fetchJSON(`api/addresses/${id}`, { method: "PUT", body: JSON.stringify({ is_default: true }) }); toast("Default address updated"); await loadAddresses(); }
      catch (err) { toast(err.message); }
      return;
    }
    const edit = e.target.closest("[data-edit-addr]");
    if (edit) {
      const id = Number(edit.getAttribute("data-edit-addr"));
      try {
        const data = await fetchJSON("api/addresses");
        const a = (data.addresses || []).find(x => x.id === id);
        if (!a) { toast("Address not found"); return; }
        editingId = id;
        $("#addressFormTitle").textContent = "Edit address";
        $("#aLabel").value = a.label || ""; $("#aName").value = a.name || ""; $("#aPhone").value = a.phone || "";
        $("#aPin").value = a.pincode || ""; $("#aLine").value = a.line || ""; $("#aCity").value = a.city || ""; $("#aState").value = a.state || "";
        $("#aDefault").checked = !!a.is_default;
        showForm(true);
      } catch (err) { toast(err.message); }
    }
  });

  $("#addrAddToggle").addEventListener("click", () => {
    if ($("#addressForm").hidden) { blankForm(); showForm(true); }
    else showForm(false);
  });
  $("#addrCancelEdit").addEventListener("click", () => { showForm(false); blankForm(); });

  $("#addressForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#addrError");
    err.hidden = true;
    const payload = {
      label: $("#aLabel").value.trim() || "Home",
      name: $("#aName").value.trim(),
      phone: $("#aPhone").value.trim(),
      line: $("#aLine").value.trim(),
      city: $("#aCity").value.trim(),
      state: $("#aState").value.trim(),
      pincode: $("#aPin").value.trim(),
      is_default: $("#aDefault").checked,
    };
    if (!/^[1-9]\d{5}$/.test(payload.pincode)) { err.textContent = "PIN code must be 6 digits and can’t start with 0."; err.hidden = false; return; }
    if (payload.phone.replace(/\D/g, "").length < 10) { err.textContent = "Phone must have at least 10 digits."; err.hidden = false; return; }
    if (payload.line.length < 6) { err.textContent = "Address line looks too short — add street + area."; err.hidden = false; return; }
    const btn = $("#addrSaveBtn");
    btn.disabled = true;
    try {
      if (editingId == null) {
        await fetchJSON("api/addresses", { method: "POST", body: JSON.stringify(payload) });
        toast("Address saved");
      } else {
        await fetchJSON(`api/addresses/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Address updated");
      }
      showForm(false); blankForm(); await loadAddresses();
    } catch (e2) {
      err.textContent = e2.message || "Couldn’t save the address";
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  /* ═══════════ WISHLIST ═══════════ */
  function renderWishlist() {
    const grid = $("#wishGrid"), empty = $("#wishEmpty");
    if (!DD) { grid.innerHTML = ""; empty.hidden = false; return; }
    const ids = DD.wish.list();
    const items = ids.map(id => DD.findProduct(id)).filter(Boolean);
    empty.hidden = items.length !== 0;
    grid.innerHTML = items.map(p => `
      <article class="wish-card">
        <a href="__BASE_PATH__/product/${esc(p.id)}" aria-label="View ${esc(p.name)}"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="300" height="300" /></a>
        <div class="wish-body">
          <a class="wish-name" href="__BASE_PATH__/product/${esc(p.id)}" style="text-decoration:none">${esc(p.name)}</a>
          <span class="wish-price">${inr(p.price)}</span>
          <div class="wish-actions">
            <button class="btn btn-ink btn-sm" data-wish-add="${esc(p.id)}" type="button">Add to cart</button>
            <button class="wish-remove" data-wish-remove="${esc(p.id)}" type="button" aria-label="Remove from wishlist">✕</button>
          </div>
        </div>
      </article>`).join("");
  }
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-wish-add]");
    if (add && DD) { DD.cart.add(add.getAttribute("data-wish-add"), 1); return; }
    const rm = e.target.closest("[data-wish-remove]");
    if (rm && DD) { DD.wish.toggle(rm.getAttribute("data-wish-remove")); renderWishlist(); }
  });

  /* ═══════════ PROFILE & SECURITY ═══════════ */
  bindLogout("logoutBtn");
  $("#refreshOrders").addEventListener("click", () => loadOrders(true));

  $("#profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await fetchJSON("api/me", {
        method: "PUT",
        body: JSON.stringify({ name: $("#p-name").value, phone: $("#p-phone").value }),
      });
      const first = (data.user.name || "friend").trim().split(/\s+/)[0];
      $("#firstName").textContent = first;
      $("#meName").textContent = first;
      $("#meInitial").textContent = first.charAt(0).toUpperCase();
      toast("Profile saved");
    } catch (err) {
      toast(err.message);
    }
  });

  $("#passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cur = $("#pwCurrent").value, nw = $("#pwNew").value, cf = $("#pwConfirm").value;
    if (nw.length < 6) { toast("New password must be at least 6 characters"); return; }
    if (nw !== cf) { toast("New passwords don’t match"); $("#pwConfirm").focus(); return; }
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await fetchJSON("api/me/password", { method: "POST", body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
      $("#passwordForm").reset();
      toast("Password changed — you stay signed in");
    } catch (err) {
      toast(err.message || "Couldn’t change password");
    } finally {
      btn.disabled = false;
    }
  });

  /* ═══════════ INIT ═══════════ */
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

    if (DD) { try { await DD.ready; } catch { /* catalog optional here */ } }
    await loadOrders(false);
    setInterval(() => loadOrders(false), 20000);   // live-ish status refresh
  })();
})();
