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
    "assets/img/product-clock.jpg",
    "assets/img/product-planter.jpg",
    "assets/img/product-cushion.jpg",
    "assets/img/product-candle.jpg",
    "assets/img/product-dock.jpg",
    "assets/img/product-charger.jpg",
  ];

  const PANE_META = {
    overview:  { title: "Good to see you, ", sub: "Snapshot of the business — orders, revenue, stock and leads." },
    orders:    { title: "Orders",            sub: "Confirm, ship and mark deliveries — customers see updates live." },
    products:  { title: "Products",          sub: "Add, restock, reprice or retire items from the live store." },
    customers: { title: "Customers",         sub: "Everyone who created an account, by revenue." },
    inquiries: { title: "Leads",             sub: "“Book a free call” submissions — reply in one tap." },
    storefront: { title: "Storefront",       sub: "Announcement, delivery rules, coupons, featured picks and live stock." },
    reports:   { title: "Reports",           sub: "Date-filtered sales, product and category performance, and CSV export." },
  };

  let lowStockThreshold = 5;

  const INDIAN_STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
    "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];

  const COUPON_TYPE_LABEL = { percent: "% off", fixed_cart: "₹ off cart", fixed_product: "₹ / item" };

  let me = null;
  let currentTab = "overview";
  let orderFilter = "all";
  let orderQuery = "";
  let orderFrom = "";
  let orderTo = "";
  let orderPage = 1;
  const orderPageSize = 50;
  let ordersCache = [];
  let productFilter = "all";
  let productCategoryFilter = "all";
  let productQuery = "";
  let productSort = "name";
  let productsCache = [];
  let categoriesCache = [];
  let customerQuery = "";
  let editingId = null;
  let editingCategoryId = null;

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
      if (tab === "storefront") await loadStorefront();
      if (tab === "reports") await loadReport();
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
    fetchJSON("api/admin/store-config").then(cfg => {
      $("#badgeStorefront").textContent = (cfg.outOfStock || 0) + (cfg.lowStock || 0);
      lowStockThreshold = Number(cfg.lowStockThreshold) || 5;
    }).catch(() => {});

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
      const cfgNow = await fetchJSON("api/admin/store-config").catch(() => null);
      if (cfgNow) lowStockThreshold = Number(cfgNow.lowStockThreshold) || 5;
      const p = await fetchJSON("api/admin/products");
      const low = (p.products || []).filter(x => x.active && x.stock <= lowStockThreshold);
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
    const deliveryBadge = o.delivery_method === "express"
      ? '<span class="pay-chip" style="color:#7C3AED">Express</span>'
      : "";
    return `
      <tr>
        <td class="bulk-cell"><input type="checkbox" class="bulk-row" data-bulk-id="${o.id}" aria-label="Select order #${o.id}" /></td>
        <td><strong>#${o.id}</strong>${deliveryBadge ? "<br>" + deliveryBadge : ""}</td>
        <td>
          ${esc(o.customer_name)}
          <br /><span class="muted" style="font-size:.72rem">${esc(o.phone || "no phone")}${o.user_email ? " · " + esc(o.user_email) : " · guest"}</span>
          <br /><span class="pay-chip">${o.payment === "upi" ? "UPI on delivery" : "COD"}${o.coupon_code ? ` · ${esc(o.coupon_code)}` : ""}${o.discount ? ` (−${inr(o.discount)})` : ""}</span>
          ${o.address ? `<br /><span class="muted" style="font-size:.7rem">${esc(o.address)}</span>` : ""}
          ${o.note ? `<br /><span class="muted" style="font-size:.7rem">Note: ${esc(o.note)}</span>` : ""}
        </td>
        <td class="items-cell" title="${esc(items)}">${esc(items.length > 90 ? items.slice(0, 90) + "…" : items)}</td>
        <td>${inr(o.total)}</td>
        <td>
          <select class="status-select" data-status-id="${o.id}" aria-label="Status of order ${o.id}">
            ${Object.keys(statusLabel).filter(s => s !== "refunded").map(s => `<option value="${s}" ${o.status === s ? "selected" : ""}>${statusLabel[s]}</option>`).join("")}
            ${o.status === "refunded" ? `<option value="refunded" selected disabled>Refunded</option>` : ""}
          </select>
        </td>
        <td class="muted">${esc(dt(o.created_at))}</td>
        <td>
          <a class="mini-btn" href="invoice.html?id=${encodeURIComponent(o.id)}" target="_blank" rel="noopener" title="Open order bill">Bill</a>
          ${waLink ? `<a class="mini-btn" href="${waLink}" target="_blank" rel="noopener" title="Message customer on WhatsApp">WA</a>` : ""}
          <button class="mini-btn" data-notes="${o.id}" type="button" title="Notes &amp; order history" aria-expanded="false">Notes</button>
          ${!["cancelled", "refunded", "pending"].includes(o.status) ? `<button class="mini-btn danger" data-refund="${o.id}" type="button" title="Refund: restock items and mark refunded">Refund</button>` : ""}
        </td>
      </tr>
      <tr class="order-detail-row" data-detail-row="${o.id}" hidden>
        <td colspan="8">
          <div class="order-detail">
            <div class="od-head"><strong>Order #${o.id}</strong><span class="muted" style="font-size:.7rem">Notes &amp; status history — the customer sees status changes and notes marked “visible to customer”.</span></div>
            <ul class="od-timeline" data-timeline="${o.id}"><li class="muted">Loading…</li></ul>
            <form class="od-note-form" data-note-form="${o.id}">
              <input type="text" name="body" maxlength="500" required placeholder="Add a note — e.g. “Called, customer wants phone confirmation”…" aria-label="Note for order ${o.id}" />
              <select name="visibility" aria-label="Who can see this note">
                <option value="admin">Admin only</option>
                <option value="customer">Visible to customer</option>
              </select>
              <button class="btn btn-ink btn-sm" type="submit">Add note</button>
            </form>
          </div>
        </td>
      </tr>`;
  }

  const orderHaystack = (o) => [o.id, o.customer_name, o.phone, o.user_email, o.coupon_code, o.address, o.note,
    ...(o.items || []).flatMap(item => [item.id, item.name])]
    .map(v => String(v ?? "").toLowerCase()).join(" ");
  const orderInRange = (o) => {
    const day = String(o.created_at || "").slice(0, 10);
    if (orderFrom && day < orderFrom) return false;
    if (orderTo && day > orderTo) return false;
    return true;
  };
  const visibleOrders = () => ordersCache.filter(o =>
    (orderFilter === "all" || o.status === orderFilter) &&
    (!orderQuery || orderHaystack(o).includes(orderQuery)) &&
    orderInRange(o)
  );

  function syncOrdersCsvLink() {
    const params = new URLSearchParams();
    if (orderFilter !== "all") params.set("status", orderFilter);
    if (orderFrom) params.set("from", orderFrom);
    if (orderTo) params.set("to", orderTo);
    if (orderQuery) params.set("q", orderQuery);
    $("#ordersCsvLink").href = "api/admin/orders.csv" + (params.toString() ? "?" + params.toString() : "");
    $("#ordersCsvClear").hidden = !(orderFrom || orderTo || orderQuery);
  }

  function syncBulkBar() {
    const checked = $$("#ordersBody .bulk-row:checked").length;
    $("#bulkCount").textContent = String(checked);
    $("#bulkApply").disabled = checked === 0;
    $("#bulkBar").hidden = visibleOrders().length === 0;
    const allShown = $$("#ordersBody .bulk-row");
    $("#headSelectAll").checked = allShown.length > 0 && allShown.every(c => c.checked);
    $("#bulkSelectAll").checked = $("#headSelectAll").checked;
  }

  async function loadOrders() {
    const params = new URLSearchParams({ page: String(orderPage), per_page: String(orderPageSize), status: orderFilter });
    if (orderQuery) params.set("q", orderQuery);
    if (orderFrom) params.set("from", orderFrom);
    if (orderTo) params.set("to", orderTo);
    const data = await fetchJSON("api/admin/orders?" + params.toString());
    ordersCache = data.orders || [];
    const total = Number(data.total || 0);
    const start = total ? (orderPage - 1) * orderPageSize + 1 : 0;
    const end = Math.min(orderPage * orderPageSize, total);
    $("#ordersPageSummary").textContent = total ? `Showing ${start}–${end} of ${total} matching orders` : "No matching orders";
    $("#ordersPrev").disabled = orderPage <= 1;
    $("#ordersNext").disabled = end >= total;
    syncOrdersCsvLink();
    const rows = visibleOrders();
    $("#ordersBody").innerHTML = rows.map(orderRow).join("");
    $("#ordersEmptyNote").hidden = rows.length !== 0;
    syncBulkBar();
  }

  $("#ordersBody").addEventListener("change", (e) => {
    if (e.target.closest(".bulk-row")) syncBulkBar();
  });

  const timelineText = (ev) => {
    if (ev.kind === "note") return esc(ev.body || "");
    if (ev.toStatus) {
      const from = ev.fromStatus ? (statusLabel[ev.fromStatus] || ev.fromStatus) : "created";
      return `Status: ${esc(from)} → ${esc(statusLabel[ev.toStatus] || ev.toStatus)}${ev.body ? " — " + esc(ev.body) : ""}`;
    }
    return esc(ev.body || "Updated");
  };
  async function renderTimeline(orderId) {
    const list = $(`#ordersBody [data-timeline="${orderId}"]`);
    if (!list) return;
    try {
      const data = await fetchJSON(`api/admin/orders/${orderId}/events`);
      const events = data.events || [];
      list.innerHTML = events.length
        ? events.map(ev => `<li class="${ev.kind === "note" ? "is-note" : ""}"><span class="tl-kind">${ev.kind === "note" ? (ev.visibility === "customer" ? "Note · customer" : "Note · admin") : "Status"}</span><span class="tl-body">${timelineText(ev)}<br /><span class="muted" style="font-size:.66rem">${esc(dt(ev.createdAt))}${ev.author ? " · " + esc(ev.author) : ""}</span></span></li>`).join("")
        : `<li class="muted">No history yet.</li>`;
    } catch (err) {
      list.innerHTML = `<li class="muted">Couldn’t load history: ${esc(err.message)}</li>`;
    }
  }
  $("#ordersBody").addEventListener("click", async (e) => {
    const notesBtn = e.target.closest("[data-notes]");
    if (notesBtn) {
      const id = notesBtn.dataset.notes;
      const row = $(`#ordersBody [data-detail-row="${id}"]`);
      if (!row) return;
      row.hidden = !row.hidden;
      notesBtn.setAttribute("aria-expanded", String(!row.hidden));
      if (!row.hidden) renderTimeline(id);
      return;
    }
    const refundBtn = e.target.closest("[data-refund]");
    if (refundBtn) {
      const id = refundBtn.dataset.refund;
      const reason = window.prompt(`Refund order #${id}?\n\nItems go back into stock and the coupon slot is released. This cannot be undone.\n\nReason (required):`);
      if (reason === null) return;
      const trimmed = reason.trim();
      if (!trimmed) { toast("A refund reason is required"); return; }
      refundBtn.disabled = true;
      try {
        await fetchJSON(`api/admin/orders/${id}/refund`, { method: "POST", body: JSON.stringify({ reason: trimmed }) });
        toast(`Order #${id} refunded — items restocked`);
        await loadOrders();
        loadOverview().catch(() => {});
      } catch (err) {
        toast(err.message);
        refundBtn.disabled = false;
      }
      return;
    }
  });
  $("#ordersBody").addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-note-form]");
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.noteForm;
    const body = form.elements.body.value.trim();
    if (!body) return;
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      await fetchJSON(`api/admin/orders/${id}/events`, { method: "POST", body: JSON.stringify({ body, visibility: form.elements.visibility.value }) });
      form.elements.body.value = "";
      await renderTimeline(id);
      toast("Note added");
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });
  $("#productSearch").addEventListener("input", (e) => {
    productQuery = e.target.value.trim().toLowerCase();
    renderProducts();
  });
  $("#productSort").addEventListener("change", (e) => {
    productSort = e.target.value;
    renderProducts();
  });
  $("#orderSearch").addEventListener("input", (e) => {
    orderQuery = e.target.value.trim().toLowerCase();
    orderPage = 1;
    syncOrdersCsvLink();
    clearTimeout(window.__orderSearchT);
    window.__orderSearchT = setTimeout(() => loadOrders().catch(err => toast(err.message)), 180);
  });
  $("#orderFrom").addEventListener("change", (e) => { orderFrom = e.target.value; orderPage = 1; loadOrders().catch(err => toast(err.message)); });
  $("#orderTo").addEventListener("change", (e) => { orderTo = e.target.value; orderPage = 1; loadOrders().catch(err => toast(err.message)); });
  $("#ordersPrev").addEventListener("click", () => { if (orderPage > 1) { orderPage--; loadOrders().catch(err => toast(err.message)); } });
  $("#ordersNext").addEventListener("click", () => { orderPage++; loadOrders().catch(err => toast(err.message)); });
  $("#ordersCsvClear").addEventListener("click", () => {
    orderFrom = orderTo = orderQuery = "";
    orderPage = 1;
    $("#orderSearch").value = ""; $("#orderFrom").value = ""; $("#orderTo").value = "";
    loadOrders().catch(err => toast(err.message));
  });
  const toggleAllShown = (checked) => { $$("#ordersBody .bulk-row").forEach(c => { c.checked = checked; }); syncBulkBar(); };
  $("#headSelectAll").addEventListener("change", (e) => toggleAllShown(e.target.checked));
  $("#bulkSelectAll").addEventListener("change", (e) => toggleAllShown(e.target.checked));
  $("#bulkApply").addEventListener("click", async () => {
    const ids = $$("#ordersBody .bulk-row:checked").map(c => Number(c.dataset.bulkId));
    if (!ids.length) return;
    const status = $("#bulkStatus").value;
    if (!window.confirm(`Set ${ids.length} order(s) to “${statusLabel[status] || status}”?`)) return;
    const btn = $("#bulkApply"); btn.disabled = true;
    let done = 0;
    const failed = [];
    for (const id of ids) {
      try {
        await fetchJSON(`api/admin/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
        const o = ordersCache.find(x => x.id === id); if (o) o.status = status;
        done++;
      } catch { failed.push(id); }
    }
    toast(`${done} order(s) → <b>${statusLabel[status] || status}</b>${failed.length ? ` · ${failed.length} failed (for example: #${failed.slice(0, 3).join(", #")})` : ""}`);
    btn.disabled = false;
    loadOrders().catch(() => {});
    loadOverview().catch(() => {});
  });

  $("#ordersBody").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-status-id]");
    if (!sel) return;
    const order = ordersCache.find(x => x.id === Number(sel.dataset.statusId));
    const previousStatus = order?.status || "pending";
    try {
      await fetchJSON(`api/admin/orders/${sel.dataset.statusId}/status`, { method: "PUT", body: JSON.stringify({ status: sel.value }) });
      toast(`Order #${sel.dataset.statusId} → <b>${statusLabel[sel.value]}</b>`);
      await loadOrders();
      loadOverview().catch(() => {});
    } catch (err) {
      sel.value = previousStatus;
      toast(err.message);
    }
  });

  $("#orderFilterChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    orderFilter = chip.dataset.filter;
    orderPage = 1;
    $$("#orderFilterChips .chip").forEach(c => c.classList.toggle("is-active", c === chip));
    loadOrders().catch(err => toast(err.message));
  });

  /* ───────── products ───────── */
  function stockBadge(p) {
    if (p.stock <= 0) return `<span class="pr-stock out">Sold out</span>`;
    if (p.stock <= lowStockThreshold) return `<span class="pr-stock low">${p.stock} left</span>`;
    return `<span class="pr-stock">${p.stock} in stock</span>`;
  }
  function productRow(p) {
    return `
      <div class="product-row" data-id="${esc(p.id)}">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" width="58" height="58" loading="lazy" />
        <div class="pr-details">
          <div class="pr-name">${esc(p.name)} ${p.active ? "" : `<span class="badge-inactive">Hidden</span>`}</div>
          <div class="pr-meta">${esc(p.meta)} · ${esc(p.tag)} · ★ ${esc(p.rating)}${p.sku ? " · SKU " + esc(p.sku) : ""}</div>
        </div>
        ${stockBadge(p)}
        <div class="pr-price">${inr(p.price)}${p.was ? `<br /><span class="muted" style="font-size:.66rem; text-decoration:line-through">${inr(p.was)}</span>` : ""}</div>
        <div class="row-actions">
          <button class="mini-btn" data-edit="${esc(p.id)}">Edit</button>
          <button class="mini-btn" data-duplicate="${esc(p.id)}">Copy</button>
          <button class="mini-btn danger" data-delete="${esc(p.id)}">Delete</button>
        </div>
      </div>`;
  }

  const productVisible = (p) => {
    const search = [p.id, p.name, p.meta, p.tag, p.sku].join(" ").toLowerCase();
    if (productQuery && !search.includes(productQuery)) return false;
    if (productCategoryFilter !== "all" && String(p.category_id ?? "") !== productCategoryFilter) return false;
    if (productFilter === "low") return p.stock > 0 && p.stock <= lowStockThreshold;
    if (productFilter === "out") return p.stock <= 0;
    if (productFilter === "hidden") return !p.active;
    return true;
  };
  function renderProducts() {
    const rows = productsCache.filter(productVisible);
    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name),
      "price-low": (a, b) => Number(a.price) - Number(b.price),
      "price-high": (a, b) => Number(b.price) - Number(a.price),
      "stock-low": (a, b) => Number(a.stock) - Number(b.stock),
      newest: (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")),
    };
    rows.sort(sorters[productSort] || sorters.name);
    $("#productResultCount").textContent = `${rows.length} of ${productsCache.length} products`;
    $("#productsList").innerHTML = rows.map(productRow).join("") ||
      (productQuery
        ? `<p class="muted">No products match your search and filters.</p>`
        : productFilter === "all"
        ? `<p class="muted">No products yet — add your first one.</p>`
        : `<p class="muted">No products in this bucket — nice.</p>`);
  }
  async function loadProducts() {
    const [products, categories] = await Promise.all([
      fetchJSON("api/admin/products"),
      fetchJSON("api/admin/categories"),
    ]);
    productsCache = products.products || [];
    categoriesCache = categories.categories || [];
    renderCategories();
    renderCategoryOptions();
    renderProducts();
  }
  function renderCategoryOptions() {
    $("#productCategoryFilter").innerHTML = `<option value="all">All categories</option>` +
      categoriesCache.map(c => `<option value="${c.id}">${esc(c.name)}${c.active ? "" : " (inactive)"}</option>`).join("");
    $("#productCategoryFilter").value = productCategoryFilter;
    const selectedProductCategory = $("#pf-category").value;
    $("#pf-category").innerHTML = categoriesCache.map(c =>
      `<option value="${c.id}">${esc(c.name)}${c.active ? "" : " (inactive)"}</option>`
    ).join("");
    if (categoriesCache.some(c => String(c.id) === selectedProductCategory)) $("#pf-category").value = selectedProductCategory;
  }
  function renderCategories() {
    $("#categoryList").innerHTML = categoriesCache.map(c => `
      <div class="category-row">
        <div class="category-info">
          <strong>${esc(c.name)}</strong>
          <span>${esc(c.description || "No description")} · ${c.product_count} product${c.product_count === 1 ? "" : "s"} · ${c.active ? "Active" : "Inactive"}</span>
        </div>
        <div class="category-actions">
          <button type="button" class="mini-btn" data-edit-category="${c.id}">Edit</button>
          <button type="button" class="mini-btn danger" data-delete-category="${c.id}" ${c.product_count ? "disabled title=\"Move or remove products first\"" : ""}>Delete</button>
        </div>
      </div>`).join("") || `<p class="muted">No categories yet. Add one before creating products.</p>`;
  }
  $("#productCategoryFilter").addEventListener("change", e => {
    productCategoryFilter = e.target.value;
    renderProducts();
  });
  $("#categoryCreateForm").addEventListener("submit", async e => {
    e.preventDefault();
    const button = $("#categoryCreateButton");
    button.disabled = true;
    try {
      await fetchJSON("api/admin/categories", { method: "POST", body: JSON.stringify({
        name: $("#categoryName").value,
        description: $("#categoryDescription").value,
      }) });
      e.target.reset();
      await loadProducts();
      toast("Category added");
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  });
  const categoryEditor = $("#categoryEditor");
  function openCategoryEditor(category) {
    editingCategoryId = category.id;
    $("#cf-name").value = category.name;
    $("#cf-description").value = category.description || "";
    $("#cf-sort").value = category.sort_order;
    $("#cf-active").checked = !!category.active;
    $("#categoryEditorHint").textContent = `${category.product_count} product${category.product_count === 1 ? "" : "s"} assigned.`;
    categoryEditor.hidden = false;
    $("#cf-name").focus();
  }
  function closeCategoryEditor() {
    categoryEditor.hidden = true;
    editingCategoryId = null;
  }
  $("#categoryEditorCancel").addEventListener("click", closeCategoryEditor);
  categoryEditor.addEventListener("click", e => { if (e.target === categoryEditor) closeCategoryEditor(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !categoryEditor.hidden) closeCategoryEditor(); });
  $("#categoryForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!editingCategoryId) return;
    const button = $("#categoryEditorSave");
    button.disabled = true;
    try {
      await fetchJSON(`api/admin/categories/${editingCategoryId}`, { method: "PUT", body: JSON.stringify({
        name: $("#cf-name").value,
        description: $("#cf-description").value,
        sort_order: $("#cf-sort").value,
        active: $("#cf-active").checked,
      }) });
      closeCategoryEditor();
      await loadProducts();
      toast("Category saved");
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  });
  $("#categoryList").addEventListener("click", async e => {
    const edit = e.target.closest("[data-edit-category]");
    if (edit) {
      const category = categoriesCache.find(c => c.id === Number(edit.dataset.editCategory));
      if (category) openCategoryEditor(category);
      return;
    }
    const remove = e.target.closest("[data-delete-category]");
    if (!remove || remove.disabled) return;
    const category = categoriesCache.find(c => c.id === Number(remove.dataset.deleteCategory));
    if (!category || !confirm(`Delete the “${category.name}” category?`)) return;
    try {
      await fetchJSON(`api/admin/categories/${category.id}`, { method: "DELETE" });
      if (productCategoryFilter === String(category.id)) productCategoryFilter = "all";
      await loadProducts();
      toast("Category deleted");
    } catch (err) {
      toast(err.message);
    }
  });
  $("#productFilterChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    productFilter = chip.dataset.pfilter;
    $$("#productFilterChips .chip").forEach(c => c.classList.toggle("is-active", c === chip));
    renderProducts();
  });

  // editor modal
  const editor = $("#productEditor");
  $("#productImageChoices").innerHTML = IMG_CHOICES.map(src => `<option value="${src}"></option>`).join("");

  function openEditor(product, duplicate = false) {
    editingId = product && !duplicate ? product.id : null;
    $("#editorTitle").textContent = product ? (duplicate ? "Duplicate product" : "Edit product") : "Add product";
    $("#editorSave").textContent  = product && !duplicate ? "Save changes" : "Add product";
    $("#pf-name").value   = product ? `${product.name}${duplicate ? " copy" : ""}` : "";
    $("#pf-meta").value   = product?.meta   ?? "";
    renderCategoryOptions();
    $("#pf-category").value = product?.category_id ? String(product.category_id) : String(categoriesCache.find(c => c.active)?.id ?? "");
    $("#pf-img").value    = product?.img   ?? IMG_CHOICES[0];
    $("#pf-price").value  = product?.price  ?? "";
    $("#pf-was").value    = product?.was    ?? "";
    $("#pf-sku").value    = product && !duplicate ? (product.sku || "") : "";
    $("#pf-stock").value  = product && !duplicate ? product.stock : (duplicate ? 0 : "");
    $("#pf-rating").value = product?.rating ?? "4.8";
    $("#pf-active").checked = product && !duplicate ? !!product.active : !duplicate;
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
      category_id: $("#pf-category").value,
      img:    $("#pf-img").value,
      price:  $("#pf-price").value,
      was:    $("#pf-was").value || 0,
      stock:  $("#pf-stock").value,
      rating: $("#pf-rating").value || 4.5,
      sku:    $("#pf-sku").value.trim(),
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
    const duplicateBtn = e.target.closest("[data-duplicate]");
    if (duplicateBtn) {
      const p = productsCache.find(x => x.id === duplicateBtn.dataset.duplicate);
      if (p) openEditor(p, true);
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
    const params = new URLSearchParams();
    if (customerQuery) params.set("q", customerQuery);
    const queryString = params.toString();
    const data = await fetchJSON("api/admin/customers" + (queryString ? "?" + queryString : ""));
    const rows = data.customers || [];
    $("#customerResultCount").textContent = `${rows.length} customer${rows.length === 1 ? "" : "s"}`;
    $("#customersBody").innerHTML = rows.map(c => `
      <tr>
        <td><strong>${esc(c.name)}</strong><br /><span class="muted">@${esc(c.username || "")} · #${esc(c.id)}</span></td>
        <td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
        <td>${esc(c.phone || "—")}</td>
        <td>${c.orders}</td>
        <td>${inr(c.revenue)}</td>
        <td class="muted">${c.last_order ? esc(dt(c.last_order)) : "—"}</td>
        <td class="muted">${esc(dt(c.created_at))}</td>
        <td><button class="mini-btn" type="button" data-customer-detail="${esc(c.id)}">History</button></td>
      </tr>`).join("") || `<tr><td colspan="8" class="muted">${customerQuery ? "No customers match your search." : "No customers yet — share the site link!"}</td></tr>`;
  }
  $("#customerSearch").addEventListener("input", (e) => {
    customerQuery = e.target.value.trim();
    clearTimeout(window.__customerSearchT);
    window.__customerSearchT = setTimeout(() => loadCustomers().catch(err => toast(err.message)), 180);
  });
  const customerDetail = $("#customerDetail");
  async function showCustomerDetail(id) {
    const data = await fetchJSON(`api/admin/customers/${encodeURIComponent(id)}`);
    const c = data.customer;
    $("#customerDetailTitle").textContent = c.name;
    $("#customerDetailMeta").innerHTML = `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""} · joined ${esc(dt(c.created_at))}`;
    $("#customerDetailOrders").textContent = c.orders;
    $("#customerDetailRevenue").textContent = inr(c.revenue);
    $("#customerDetailHistory").innerHTML = (data.orders || []).map(o => {
      const items = (o.items || []).map(i => `${esc(i.name)} ×${esc(i.qty)}`).join(", ");
      return `<tr><td><strong>#${esc(o.id)}</strong></td><td>${items || "—"}</td><td>${inr(o.total)}</td><td><span class="status-pill st-${esc(o.status)}">${esc(statusLabel[o.status] || o.status)}</span></td><td>${esc(dt(o.created_at))}</td></tr>`;
    }).join("") || `<tr><td colspan="5" class="muted">No orders yet.</td></tr>`;
    customerDetail.hidden = false;
    $("#customerDetailClose").focus();
  }
  $("#customersBody").addEventListener("click", (e) => {
    const button = e.target.closest("[data-customer-detail]");
    if (button) showCustomerDetail(button.dataset.customerDetail).catch(err => toast(err.message));
  });
  $("#customerDetailClose").addEventListener("click", () => { customerDetail.hidden = true; });
  customerDetail.addEventListener("click", e => { if (e.target === customerDetail) customerDetail.hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !customerDetail.hidden) customerDetail.hidden = true; });

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

  /* ───────── storefront ───────── */
  let sfProductsCache = [];

  async function loadStorefront() {
    const [cfg, couponsRes, productsRes, erpConfigRes] = await Promise.all([
      fetchJSON("api/admin/store-config"),
      fetchJSON("api/admin/coupons"),
      fetchJSON("api/admin/products"),
      fetchJSON("api/admin/erp-config").catch(() => null),
    ]);
    lowStockThreshold = Number(cfg.lowStockThreshold) || 5;
    sfProductsCache = productsRes.products || [];

    /* stats strip */
    $("#sfInventory").textContent = inr(cfg.inventoryValue || 0);
    $("#sfSkus").textContent = `${cfg.activeSkus || 0} active SKUs`;
    $("#sfUnits").textContent = String(cfg.unitsInStock || 0);
    $("#sfLow").textContent = `${cfg.lowStock || 0} low · ${cfg.outOfStock || 0} out`;
    $("#sfFreeAt").textContent = inr(cfg.freeAt || 0);
    $("#sfFee").textContent = `${inr(cfg.deliveryFee || 0)} below that · express ${inr(cfg.expressFee ?? 99)}`;
    $("#sfPayment").textContent = cfg.codEnabled ? "COD + UPI" : "UPI only";
    $("#sfLive").textContent = cfg.storeLive ? "Store is live" : "Store is CLOSED";
    $("#sfLive").className = "stat-foot " + (cfg.storeLive ? "good" : "bad");

    /* settings form */
    $("#sfAnnounce").value = cfg.announce || "";
    $("#sfFreeAtInput").value = cfg.freeAt ?? 999;
    $("#sfFeeInput").value = cfg.deliveryFee ?? 49;
    $("#sfExpressFeeInput").value = cfg.expressFee ?? 99;
    $("#sfMaxQty").value = cfg.maxQty ?? 99;
    $("#sfCodEnabled").checked = !!cfg.codEnabled;
    $("#sfCodMin").value = cfg.codMin ?? 0;
    $("#sfStoreLive").checked = !!cfg.storeLive;
    $("#sfLowStockInput").value = cfg.lowStockThreshold ?? 5;
    const erp = erpConfigRes || {};
    $("#erpGstin").value = erp.gstin || "";
    $("#erpSellerState").value = erp.sellerState || "";
    $("#erpGstRate").value = (erp.gstRate ?? 18);
    $("#erpEmailAdmin").checked = erp.emailAdminNewOrder !== false;
    $("#erpEmailCustomer").checked = erp.emailCustomerUpdates !== false;
    syncLiveToggle();

    /* featured picks */
    const featured = Array.isArray(cfg.featuredIds) ? cfg.featuredIds : [];
    $("#sfFeatured").innerHTML = sfProductsCache.map(p => `
      <label class="sf-feat-item${featured.includes(p.id) ? " is-on" : ""}">
        <input type="checkbox" value="${esc(p.id)}" ${featured.includes(p.id) ? "checked" : ""} />
        <img src="${esc(p.img)}" alt="${esc(p.name)}" width="44" height="44" loading="lazy" />
        <span class="sf-feat-name">${esc(p.name)}</span>
      </label>`).join("");

    renderCoupons(couponsRes.coupons || []);
    renderInventory();
  }

  function syncLiveToggle() {
    const on = $("#sfStoreLive").checked;
    $("#sfStoreLiveText").textContent = on ? "Live" : "Closed";
    $("#sfStoreLiveText").classList.toggle("sf-closed", !on);
    $(".sf-live-toggle")?.classList.toggle("is-closed", !on);
  }
  $("#sfStoreLive").addEventListener("change", syncLiveToggle);

  /* settings save */
  $("#storeSettingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#sfSaveSettings"); btn.disabled = true;
    try {
      await fetchJSON("api/admin/store-config", { method: "PUT", body: JSON.stringify({
        announce: $("#sfAnnounce").value,
        freeAt: $("#sfFreeAtInput").value,
        deliveryFee: $("#sfFeeInput").value,
        expressFee: $("#sfExpressFeeInput").value,
        maxQty: $("#sfMaxQty").value,
        codEnabled: $("#sfCodEnabled").checked,
        codMin: $("#sfCodMin").value,
        storeLive: $("#sfStoreLive").checked,
        lowStockThreshold: $("#sfLowStockInput").value,
      }) });
      toast("Store settings saved — live now");
      loadStorefront().catch(() => {});
    } catch (err) { toast(err.message); } finally { btn.disabled = false; }
  });

  /* GST & notifications save */
  $("#erpConfigForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#erpSave"); btn.disabled = true;
    try {
      await fetchJSON("api/admin/erp-config", { method: "PUT", body: JSON.stringify({
        gstin: $("#erpGstin").value.trim().toUpperCase(),
        sellerState: $("#erpSellerState").value,
        gstRate: $("#erpGstRate").value,
        emailAdminNewOrder: $("#erpEmailAdmin").checked,
        emailCustomerUpdates: $("#erpEmailCustomer").checked,
      }) });
      toast("GST & email settings saved");
    } catch (err) { toast(err.message); } finally { btn.disabled = false; }
  });

  /* featured save */
  $("#sfSaveFeatured").addEventListener("click", async () => {
    const ids = $$("#sfFeatured input[type=checkbox]:checked").map(i => i.value).slice(0, 6);
    try {
      await fetchJSON("api/admin/store-config", { method: "PUT", body: JSON.stringify({ featuredIds: ids }) });
      toast("Featured picks saved");
    } catch (err) { toast(err.message); }
  });
  $("#sfFeatured").addEventListener("change", (e) => {
    const label = e.target.closest(".sf-feat-item");
    if (label) label.classList.toggle("is-on", e.target.checked);
    const checked = $$("#sfFeatured input[type=checkbox]:checked").length;
    if (checked > 6) { e.target.checked = false; label?.classList.remove("is-on"); toast("Keep at most 6 featured picks"); }
  });

  /* coupons */
  function expiryCell(raw) {
    if (!raw) return "—";
    const day = String(raw).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return day < today
      ? `<span class="coupon-expired" title="Expired">${esc(day)}</span>`
      : esc(day);
  }
  function scopeCell(c) {
    const p = c.product_ids ? String(c.product_ids).split(",").filter(Boolean).length : 0;
    const k = c.category_ids ? String(c.category_ids).split(",").filter(Boolean).length : 0;
    if (!p && !k) return `<span class="muted">All</span>`;
    const title = [c.product_ids ? `Products: ${c.product_ids}` : null, c.category_ids ? `Categories: ${c.category_ids}` : null].filter(Boolean).join(" · ");
    return `<span class="coupon-scope" title="${esc(title)}">${[p ? `${p} P` : null, k ? `${k} C` : null].filter(Boolean).join(" · ")}</span>`;
  }
  function renderCoupons(coupons) {
    $("#couponsBody").innerHTML = coupons.map(c => `
      <tr data-code="${esc(c.code)}">
        <td><strong>${esc(c.code)}</strong></td>
        <td>${esc(COUPON_TYPE_LABEL[c.type] || c.type)}</td>
        <td>${c.type === "percent" ? c.value + "%" : inr(c.value)}</td>
        <td>${c.min_order > 0 ? inr(c.min_order) : "—"}</td>
        <td>${c.used}${c.max_uses ? " / " + c.max_uses : ""}${Number(c.usage_per_customer) > 0 ? `<br /><span class="muted" style="font-size:.66rem">≤ ${esc(c.usage_per_customer)}/cust</span>` : ""}</td>
        <td>${expiryCell(c.expires_at)}</td>
        <td><label class="sf-mini-toggle"><input type="checkbox" data-toggle-coupon="${esc(c.code)}" ${c.active ? "checked" : ""} /><span></span></label></td>
        <td>${scopeCell(c)}</td>
        <td><button class="mini-btn danger" data-delete-coupon="${esc(c.code)}">Delete</button></td>
      </tr>`).join("") || `<tr><td colspan="9" class="muted">No coupons yet — add the first one below.</td></tr>`;
  }

  $("#couponsBody").addEventListener("change", async (e) => {
    const t = e.target.closest("[data-toggle-coupon]"); if (!t) return;
    try {
      await fetchJSON(`api/admin/coupons/${encodeURIComponent(t.dataset.toggleCoupon)}`, { method: "PUT", body: JSON.stringify({ active: t.checked }) });
      toast(`Coupon ${t.dataset.toggleCoupon} ${t.checked ? "enabled" : "paused"}`);
    } catch (err) { toast(err.message); t.checked = !t.checked; }
  });
  $("#couponsBody").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-delete-coupon]"); if (!del) return;
    if (!confirm(`Delete coupon ${del.dataset.deleteCoupon}? Past orders keep their discount.`)) return;
    try {
      await fetchJSON(`api/admin/coupons/${encodeURIComponent(del.dataset.deleteCoupon)}`, { method: "DELETE" });
      toast("Coupon deleted");
      loadStorefront().catch(() => {});
    } catch (err) { toast(err.message); }
  });

  $("#couponAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      await fetchJSON("api/admin/coupons", { method: "POST", body: JSON.stringify({
        code: $("#cpCode").value.trim().toUpperCase(),
        type: $("#cpType").value,
        value: $("#cpValue").value,
        min_order: $("#cpMinOrder").value || 0,
        max_uses: $("#cpMaxUses").value || 0,
        usage_per_customer: $("#cpPerCustomer").value || 0,
        expires_at: $("#cpExpires").value || "",
        product_ids: $("#cpProductIds").value.trim(),
        category_ids: $("#cpCategoryIds").value.trim(),
      }) });
      e.target.reset();
      toast("Coupon created — share it on WhatsApp!");
      loadStorefront().catch(() => {});
    } catch (err) { toast(err.message); } finally { btn.disabled = false; }
  });

  /* inventory quick adjust */
  function renderInventory() {
    $("#sfInventoryList").innerHTML = sfProductsCache.map(p => {
      const out = p.stock <= 0, low = p.stock > 0 && p.stock <= lowStockThreshold;
      return `
        <div class="sf-inv-row${out ? " is-out" : low ? " is-low" : ""}" data-id="${esc(p.id)}">
          <img src="${esc(p.img)}" alt="${esc(p.name)}" width="46" height="46" loading="lazy" />
          <div class="sf-inv-meta">
            <span class="sf-inv-name">${esc(p.name)}</span>
            <span class="sf-inv-sub">${inr(p.price)} · ${esc(p.tag)}</span>
          </div>
          <input class="sf-stock-input" type="number" min="0" max="2147483647" step="1" value="${p.stock}" aria-label="Stock for ${esc(p.name)}" data-stock-id="${esc(p.id)}" />
          <button class="mini-btn sf-restock" data-restock="${esc(p.id)}" title="Add 10 units">+10</button>
        </div>`;
    }).join("");
  }

  async function setStock(id, stock) {
    await fetchJSON(`api/admin/products/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ stock }) });
  }
  $("#sfInventoryList").addEventListener("change", async (e) => {
    const input = e.target.closest("[data-stock-id]"); if (!input) return;
    const stock = Math.max(0, Math.round(Number(input.value) || 0));
    input.value = stock;
    try {
      await setStock(input.dataset.stockId, stock);
      const p = sfProductsCache.find(x => x.id === input.dataset.stockId);
      if (p) p.stock = stock;
      renderInventory();
      toast(`Stock updated — ${stock} left`);
    } catch (err) { toast(err.message); }
  });
  $("#sfInventoryList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-restock]"); if (!btn) return;
    const p = sfProductsCache.find(x => x.id === btn.dataset.restock); if (!p) return;
    try {
      const stock = (p.stock || 0) + 10;
      await setStock(p.id, stock);
      p.stock = stock;
      renderInventory();
      toast(`+10 restocked — ${stock} in stock`);
    } catch (err) { toast(err.message); }
  });

  /* ───────── reports ───────── */
  function reportQuery() {
    const params = new URLSearchParams();
    if ($("#rpFrom").value) params.set("from", $("#rpFrom").value);
    if ($("#rpTo").value) params.set("to", $("#rpTo").value);
    return params;
  }
  function syncReportCsvLink() {
    const params = reportQuery();
    const q = params.toString();
    $("#rpCsvLink").href = "api/admin/report.csv" + (q ? "?" + q : "");
    $("#gstCsvLink").href = "api/admin/gst-report.csv" + (q ? "?" + q : "");
  }
  async function loadReport() {
    const params = reportQuery();
    const r = await fetchJSON("api/admin/report" + (params.toString() ? "?" + params.toString() : ""));
    $("#rpFrom").value = r.from;
    $("#rpTo").value = r.to;
    $("#rpPeriodLabel").textContent = `${r.from} – ${r.to}`;
    syncReportCsvLink();
    $("#rpAov").textContent = inr(r.aov || 0);
    $("#rpOrdersAll").textContent = `Selected period · ${r.orders || 0} non-cancelled orders`;
    $("#rpRevenue").textContent = inr(r.grossSales || 0);
    $("#rpPeriodOrders").textContent = `${r.orders || 0} non-cancelled order${r.orders === 1 ? "" : "s"} · ${r.cancelled || 0} cancelled · ${r.refunded || 0} refunded`;
    const gst = r.gst || {};
    $("#rpGstTaxable").textContent = inr(gst.taxable || 0);
    $("#rpGstCgst").textContent = inr(gst.cgst || 0);
    $("#rpGstSgst").textContent = inr(gst.sgst || 0);
    $("#rpGstIgst").textContent = inr(gst.igst || 0);
    $("#rpGstTotal").textContent = inr(gst.totalTax || 0);
    $("#rpGstNote").textContent = `intra ${gst.intra || 0} · inter ${gst.inter || 0} · unknown ${gst.unknown || 0}${Number(gst.unattributed) > 0 ? " · ₹" + Number(gst.unattributed).toLocaleString("en-IN") + " GST on unknown-place orders" : ""}`;
    $("#rpUnits").textContent = String(r.units || 0);
    $("#rpPipeline").textContent = `${r.open || 0} / ${r.cancelled || 0}`;
    $("#rpCouponSaved").textContent = `${inr(r.coupons?.saved || 0)} coupon savings`;

    const days = r.days || [];
    const chartRows = days.length > 31
      ? Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => {
        const group = days.slice(index * 7, index * 7 + 7);
        return {
          date: group[0].date, endDate: group[group.length - 1].date,
          orders: group.reduce((sum, day) => sum + day.orders, 0),
          revenue: group.reduce((sum, day) => sum + day.revenue, 0),
        };
      })
      : days;
    const max = Math.max(1, ...chartRows.map(d => d.revenue));
    const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
    $("#rpChart").innerHTML = chartRows.map((d, index) => `
      <div class="rp-col" title="${fmtDay(d.date)}${d.endDate ? ` – ${fmtDay(d.endDate)}` : ""} — ${inr(d.revenue)} · ${d.orders} order${d.orders === 1 ? "" : "s"}">
        <span class="rp-col-val">${d.revenue ? "₹" + (d.revenue >= 1000 ? (d.revenue / 1000).toFixed(1) + "k" : d.revenue) : ""}</span>
        <div class="rp-bar${d.revenue === 0 ? " is-zero" : ""}" style="height:${Math.max(3, Math.round(d.revenue / max * 130))}px"></div>
        <span class="rp-col-label">${chartRows.length <= 31 || index % 2 === 0 ? fmtDay(d.date).split(" ")[0] : ""}</span>
      </div>`).join("");
    const total = days.reduce((s, d) => s + d.revenue, 0);
    $("#rpTotal14").textContent = `${inr(total)} in selected period`;
    $("#rpChartStart").textContent = days.length ? fmtDay(days[0].date) : "—";
    $("#rpChartEnd").textContent = days.length ? fmtDay(days[days.length - 1].date) : "—";

    const top = r.topProducts || [];
    $("#rpTopBody").innerHTML = top.map(x => `
      <tr><td><strong>${esc(x.name)}</strong></td><td>${x.units}</td><td>${inr(x.revenue)}</td></tr>`).join("")
      || `<tr><td colspan="3" class="muted">No sales in this period.</td></tr>`;
    const categories = r.categories || [];
    $("#rpCategoryBody").innerHTML = categories.map(x => `
      <tr><td><strong>${esc(x.name)}</strong></td><td>${x.units}</td><td>${inr(x.revenue)}</td><td>${r.itemSales ? Math.round(x.revenue / r.itemSales * 100) : 0}%</td></tr>`).join("")
      || `<tr><td colspan="4" class="muted">No category sales in this period.</td></tr>`;

    const cod = r.payment?.cod || 0, upi = r.payment?.upi || 0, t = Math.max(1, cod + upi);
    $("#rpBarCod").style.width = Math.round(cod / t * 100) + "%";
    $("#rpBarUpi").style.width = Math.round(upi / t * 100) + "%";
    $("#rpValCod").textContent = `${cod} orders · ${inr(r.payment?.codRevenue || 0)}`;
    $("#rpValUpi").textContent = `${upi} orders · ${inr(r.payment?.upiRevenue || 0)}`;
    $("#rpPayNote").textContent = `${cod + upi} non-cancelled orders in this period.`;
  }
  $("#rpApply").addEventListener("click", () => {
    const from = $("#rpFrom").value, to = $("#rpTo").value;
    if ((from && to && from > to) || (!from && !to)) {
      if (!from && !to) { loadReport().catch(err => toast(err.message)); return; }
      toast("Start date must be on or before end date");
      return;
    }
    loadReport().catch(err => toast(err.message));
  });

  /* ───────── boot ───────── */
  (function populateStates() {
    const sel = $("#erpSellerState");
    if (sel && sel.options.length <= 1) {
      for (const s of INDIAN_STATES) {
        const o = document.createElement("option");
        o.value = s; o.textContent = s;
        sel.appendChild(o);
      }
    }
  })();
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
