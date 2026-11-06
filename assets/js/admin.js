/* /admin.html — admin dashboard: overview · orders · products · customers · leads */
(function () {
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const { toast, fetchJSON, inr, dt, bindLogout, statusLabel, esc } = window.UI;

  const IMG_CHOICES = [
    "assets/img/product-mouse.jpg",
    "assets/img/product-lamp.jpg",
    "assets/img/product-hub.jpg",
    "assets/img/product-speaker.jpg",
    "assets/img/product-mug.jpg",
    "assets/img/product-organizer.jpg",
    "assets/img/product-keyboard.jpg",
    "assets/img/product-bottle.jpg",
  ];

  const PANE_META = {
    overview:  { title: "Good to see you, ", sub: "Snapshot of the business — orders, revenue, stock and leads." },
    orders:    { title: "Orders",            sub: "Confirm, ship and mark deliveries — customers see updates live." },
    products:  { title: "Products",          sub: "Add, restock, reprice or retire items from the live store." },
    customers: { title: "Customers",         sub: "Everyone who created an account, by revenue." },
    inquiries: { title: "Leads",             sub: "“Book a free call” submissions — reply in one tap." },
  };

  let me = null;
  let currentTab = "overview";
  let orderFilter = "all";
  let ordersCache = [];
  let productsCache = [];
  let editingId = null;

  /* ───────── tabs ───────── */
  function setTab(tab) {
    currentTab = tab;
    $$(".side-btn[data-tab]").forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));
    $$(".pane").forEach(p => p.dataset.hidden = String(p.id !== `pane-${tab}`));
    $("#paneTitle").textContent = tab === "overview" ? PANE_META[tab].title + (me ? me.name.split(" ")[0] : "Debasish") + "." : PANE_META[tab].title;
    $("#paneSub").textContent = PANE_META[tab].sub;
    loadPane(tab);
  }
  $$(".side-btn[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $$("[data-goto-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.gotoTab)));
  $("#refreshPane").addEventListener("click", () => loadPane(currentTab, true));
  $("#todayLine").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  async function loadPane(tab, announce) {
    try {
      if (tab === "overview")  await loadOverview();
      if (tab === "orders")    await loadOrders();
      if (tab === "products")  await loadProducts();
      if (tab === "customers") await loadCustomers();
      if (tab === "inquiries") await loadInquiries();
      if (announce) toast("Refreshed");
    } catch (err) {
      toast(err.message || "Couldn’t load — is the server running?");
    }
  }

  /* ───────── overview ───────── */
  async function loadOverview() {
    const [stats, ordersRes] = await Promise.all([
      fetchJSON("api/admin/stats"),
      fetchJSON("api/admin/orders"),
    ]);
    ordersCache = ordersRes.orders || [];

    $("#stRevenue").textContent   = inr(stats.revenue);
    $("#stToday").textContent     = `+${inr(stats.todayRev)} today`;
    $("#stOrders").textContent    = stats.orders;
    $("#stPending").textContent   = `${stats.pending} pending`;
    $("#stProducts").textContent  = stats.products;
    $("#stLowStock").textContent  = `${stats.lowStock} low stock`;
    $("#stCustomers").textContent = stats.customers;
    $("#stInquiries").textContent = `${stats.inquiries} leads received`;
    $("#pendingCount").textContent = stats.pending;
    $("#badgeOrders").textContent = stats.pending;
    $("#badgeProducts").textContent = stats.products;
    $("#badgeCustomers").textContent = stats.customers;
    $("#badgeInquiries").textContent = stats.inquiries;

    // recent 5 orders
    $("#recentOrdersBody").innerHTML = ordersCache.slice(0, 5).map(o => `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td>${esc(o.customer_name)}</td>
        <td>${inr(o.total)}</td>
        <td><span class="status-pill st-${esc(o.status)}">${esc(statusLabel[o.status] || o.status)}</span></td>
        <td class="muted">${esc(dt(o.created_at))}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted">No orders yet.</td></tr>`;

    // low stock list (from products endpoint for detail)
    try {
      const p = await fetchJSON("api/admin/products");
      const low = (p.products || []).filter(x => x.active && x.stock <= 5);
      $("#lowStockList").innerHTML = low.length
        ? low.map(x => `<span>${esc(x.name)} — ${x.stock} left</span>`).join("")
        : `<span class="ok">All stocked up ✓</span>`;
    } catch { $("#lowStockList").innerHTML = `<span class="muted">Couldn’t load stock.</span>`; }
  }

  /* ───────── orders ───────── */
  function orderRow(o) {
    const items = (o.items || []).map(i => `${esc(i.name)} ×${i.qty}`).join(", ");
    const waText = encodeURIComponent(`Hi ${o.customer_name}! Regarding your order #${o.id} — `);
    const waPhone = String(o.phone || "").replace(/[^\d]/g, "");
    const waLink = waPhone.length >= 10 ? `https://wa.me/${waPhone}?text=${waText}` : null;
    return `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td>
          ${esc(o.customer_name)}
          <br /><span class="muted" style="font-size:.72rem">${esc(o.phone || "no phone")}${o.user_email ? " · " + esc(o.user_email) : " · guest"}</span>
          ${o.address ? `<br /><span class="muted" style="font-size:.7rem">${esc(o.address)}</span>` : ""}
          ${o.note ? `<br /><span class="muted" style="font-size:.7rem">Note: ${esc(o.note)}</span>` : ""}
        </td>
        <td class="items-cell" title="${esc(items)}">${esc(items.length > 90 ? items.slice(0, 90) + "…" : items)}</td>
        <td>${inr(o.total)}</td>
        <td>
          <select class="status-select" data-status-id="${o.id}" aria-label="Status of order ${o.id}">
            ${Object.keys(statusLabel).map(s => `<option value="${s}" ${o.status === s ? "selected" : ""}>${statusLabel[s]}</option>`).join("")}
          </select>
        </td>
        <td class="muted">${esc(dt(o.created_at))}</td>
        <td>${waLink ? `<a class="mini-btn" href="${waLink}" target="_blank" rel="noopener" title="Message customer on WhatsApp">WA</a>` : ""}</td>
      </tr>`;
  }

  async function loadOrders() {
    if (!ordersCache.length) ordersCache = (await fetchJSON("api/admin/orders")).orders || [];
    else ordersCache = (await fetchJSON("api/admin/orders")).orders || [];
    const rows = ordersCache.filter(o => orderFilter === "all" || o.status === orderFilter);
    $("#ordersBody").innerHTML = rows.map(orderRow).join("");
    $("#ordersEmptyNote").hidden = rows.length !== 0;
  }

  $("#ordersBody").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-status-id]");
    if (!sel) return;
    try {
      await fetchJSON(`api/admin/orders/${sel.dataset.statusId}/status`, { method: "PUT", body: JSON.stringify({ status: sel.value }) });
      const o = ordersCache.find(x => x.id === Number(sel.dataset.statusId));
      if (o) o.status = sel.value;
      toast(`Order #${sel.dataset.statusId} → <b>${statusLabel[sel.value]}</b>`);
      // refresh badges quietly
      loadOverview().catch(() => {});
    } catch (err) {
      toast(err.message);
    }
  });

  $("#orderFilterChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    orderFilter = chip.dataset.filter;
    $$("#orderFilterChips .chip").forEach(c => c.classList.toggle("is-active", c === chip));
    loadOrders().catch(err => toast(err.message));
  });

  /* ───────── products ───────── */
  function stockBadge(p) {
    if (p.stock <= 0) return `<span class="pr-stock out">Sold out</span>`;
    if (p.stock <= 5) return `<span class="pr-stock low">${p.stock} left</span>`;
    return `<span class="pr-stock">${p.stock} in stock</span>`;
  }
  function productRow(p) {
    return `
      <div class="product-row" data-id="${esc(p.id)}">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" width="58" height="58" loading="lazy" />
        <div>
          <div class="pr-name">${esc(p.name)} ${p.active ? "" : `<span class="badge-inactive">Hidden</span>`}</div>
          <div class="pr-meta">${esc(p.meta)} · ${esc(p.tag)} · ★ ${esc(p.rating)}</div>
        </div>
        ${stockBadge(p)}
        <div class="pr-price">${inr(p.price)}${p.was ? `<br /><span class="muted" style="font-size:.66rem; text-decoration:line-through">${inr(p.was)}</span>` : ""}</div>
        <div class="row-actions">
          <button class="mini-btn" data-edit="${esc(p.id)}">Edit</button>
          <button class="mini-btn danger" data-delete="${esc(p.id)}">Delete</button>
        </div>
        <div></div>
      </div>`;
  }

  async function loadProducts() {
    productsCache = (await fetchJSON("api/admin/products")).products || [];
    $("#productsList").innerHTML = productsCache.map(productRow).join("") || `<p class="muted">No products yet — add your first one.</p>`;
  }

  // editor modal
  const editor = $("#productEditor");
  const imgSelect = $("#pf-img");
  imgSelect.innerHTML = IMG_CHOICES.map(src => `<option value="${src}">${src.split("/").pop()}</option>`).join("");

  function openEditor(product) {
    editingId = product ? product.id : null;
    $("#editorTitle").textContent = product ? "Edit product" : "Add product";
    $("#editorSave").textContent  = product ? "Save changes" : "Add product";
    $("#pf-name").value   = product?.name   ?? "";
    $("#pf-meta").value   = product?.meta   ?? "";
    $("#pf-tag").value    = product?.tag    ?? "Tech";
    $("#pf-img").value    = product?.img    ?? IMG_CHOICES[0];
    if (product && !IMG_CHOICES.includes(product.img)) {
      imgSelect.innerHTML += `<option value="${esc(product.img)}" selected>${esc(product.img.split("/").pop())}</option>`;
      $("#pf-img").value = product.img;
    }
    $("#pf-price").value  = product?.price  ?? "";
    $("#pf-was").value    = product?.was    ?? "";
    $("#pf-stock").value  = product?.stock  ?? "";
    $("#pf-rating").value = product?.rating ?? "4.8";
    $("#pf-active").checked = product ? !!product.active : true;
    editor.hidden = false;
    $("#pf-name").focus();
  }
  function closeEditor() { editor.hidden = true; editingId = null; }

  $("#addProductBtn").addEventListener("click", () => openEditor(null));
  $("#editorCancel").addEventListener("click", closeEditor);
  editor.addEventListener("click", e => { if (e.target === editor) closeEditor(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !editor.hidden) closeEditor(); });

  $("#productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name:   $("#pf-name").value,
      meta:   $("#pf-meta").value,
      tag:    $("#pf-tag").value,
      img:    $("#pf-img").value,
      price:  $("#pf-price").value,
      was:    $("#pf-was").value || 0,
      stock:  $("#pf-stock").value,
      rating: $("#pf-rating").value || 4.5,
      active: $("#pf-active").checked,
    };
    const btn = $("#editorSave"); btn.disabled = true;
    try {
      if (editingId) {
        await fetchJSON(`api/admin/products/${encodeURIComponent(editingId)}`, { method: "PUT", body: JSON.stringify(body) });
        toast("Product updated");
      } else {
        await fetchJSON("api/admin/products", { method: "POST", body: JSON.stringify(body) });
        toast("Product added to the store");
      }
      closeEditor();
      loadProducts();
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $("#productsList").addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      const p = productsCache.find(x => x.id === editBtn.dataset.edit);
      if (p) openEditor(p);
      return;
    }
    const delBtn = e.target.closest("[data-delete]");
    if (delBtn) {
      const p = productsCache.find(x => x.id === delBtn.dataset.delete);
      if (!p) return;
      if (!confirm(`Remove “${p.name}” from the store? (It stays in past orders.)`)) return;
      try {
        await fetchJSON(`api/admin/products/${encodeURIComponent(p.id)}`, { method: "DELETE" });
        toast("Removed from the store");
        loadProducts();
      } catch (err) { toast(err.message); }
    }
  });

  /* ───────── customers ───────── */
  async function loadCustomers() {
    const data = await fetchJSON("api/admin/customers");
    const rows = data.customers || [];
    $("#customersBody").innerHTML = rows.map(c => `
      <tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.phone || "—")}</td>
        <td>${c.orders}</td>
        <td>${inr(c.revenue)}</td>
        <td class="muted">${esc(dt(c.created_at))}</td>
      </tr>`).join("") || `<tr><td colspan="6" class="muted">No customers yet — share the site link!</td></tr>`;
  }

  /* ───────── inquiries / leads ───────── */
  function inquiryCard(q) {
    const phone = String(q.phone || "").replace(/[^\d]/g, "");
    const wa = phone.length >= 10
      ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${q.name}! Debasish here — you asked about “${q.need || "a website"}”. Let's talk!`)}`
      : null;
    return `
      <article class="inq-card">
        <div class="inq-head">
          <span class="inq-name">${esc(q.name)}</span>
          <span class="inq-date">${esc(dt(q.created_at))}</span>
        </div>
        <span class="inq-need">${esc(q.need || "General enquiry")}${q.budget ? " · " + esc(q.budget) : ""}</span>
        ${q.message ? `<p class="inq-msg">“${esc(q.message)}”</p>` : ""}
        <div style="display:flex; justify-content:space-between; align-items:center; gap:.6rem; margin-top:auto">
          <span class="muted" style="font-size:.76rem">${esc(q.phone || "no phone left")}</span>
          ${wa ? `<a class="mini-btn" href="${wa}" target="_blank" rel="noopener">WhatsApp reply →</a>` : ""}
        </div>
      </article>`;
  }

  async function loadInquiries() {
    const data = await fetchJSON("api/admin/inquiries");
    const rows = data.inquiries || [];
    $("#inquiriesList").innerHTML = rows.map(inquiryCard).join("") || `<p class="muted">No leads yet — they’ll appear here when someone books a call.</p>`;
  }

  /* ───────── boot ───────── */
  bindLogout("logoutBtn");
  setInterval(() => { if (!currentTab || $("#productEditor").hidden) loadPane(currentTab, false); }, 30000);

  (async function init() {
    try { me = (await fetchJSON("api/me")).user; } catch {}
    if (!me) { location.replace("login.html?next=admin.html"); return; }
    if (me.role !== "admin") { location.replace("dashboard.html"); return; }
    $("#adminFirst").textContent = me.name.split(" ")[0];
    setTab("overview");
  })();
})();
