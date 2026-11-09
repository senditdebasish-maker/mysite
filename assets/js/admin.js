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
    reports:   { title: "Reports",           sub: "Revenue pulse, best-sellers, payment mix and coupon performance." },
  };

  let me = null;
  let currentTab = "overview";
  let orderFilter = "all";
  let orderQuery = "";
  let orderFrom = "";
  let orderTo = "";
  let ordersCache = [];
  let productFilter = "all";
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
            ${Object.keys(statusLabel).map(s => `<option value="${s}" ${o.status === s ? "selected" : ""}>${statusLabel[s]}</option>`).join("")}
          </select>
        </td>
        <td class="muted">${esc(dt(o.created_at))}</td>
        <td>${waLink ? `<a class="mini-btn" href="${waLink}" target="_blank" rel="noopener" title="Message customer on WhatsApp">WA</a>` : ""}</td>
      </tr>`;
  }

  const orderHaystack = (o) => [o.id, o.customer_name, o.phone, o.user_email, o.coupon_code, o.address, o.note]
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
    ordersCache = (await fetchJSON("api/admin/orders")).orders || [];
    syncOrdersCsvLink();
    const rows = visibleOrders();
    $("#ordersBody").innerHTML = rows.map(orderRow).join("");
    $("#ordersEmptyNote").hidden = rows.length !== 0;
    syncBulkBar();
  }

  $("#ordersBody").addEventListener("change", (e) => {
    if (e.target.closest(".bulk-row")) syncBulkBar();
  });
  $("#orderSearch").addEventListener("input", (e) => {
    orderQuery = e.target.value.trim().toLowerCase();
    syncOrdersCsvLink();
    clearTimeout(window.__orderSearchT);
    window.__orderSearchT = setTimeout(() => loadOrders().catch(err => toast(err.message)), 180);
  });
  $("#orderFrom").addEventListener("change", (e) => { orderFrom = e.target.value; loadOrders().catch(err => toast(err.message)); });
  $("#orderTo").addEventListener("change", (e) => { orderTo = e.target.value; loadOrders().catch(err => toast(err.message)); });
  $("#ordersCsvClear").addEventListener("click", () => {
    orderFrom = orderTo = orderQuery = "";
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
    let done = 0, failed = 0;
    for (const id of ids) {
      try {
        await fetchJSON(`api/admin/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
        const o = ordersCache.find(x => x.id === id); if (o) o.status = status;
        done++;
      } catch { failed++; }
    }
    toast(`${done} order(s) → <b>${statusLabel[status] || status}</b>${failed ? ` · ${failed} failed` : ""}`);
    btn.disabled = false;
    loadOrders().catch(() => {});
    loadOverview().catch(() => {});
  });

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

  const productVisible = (p) => {
    if (productFilter === "low") return p.stock > 0 && p.stock <= 5;
    if (productFilter === "out") return p.stock <= 0;
    if (productFilter === "hidden") return !p.active;
    return true;
  };
  async function loadProducts() {
    productsCache = (await fetchJSON("api/admin/products")).products || [];
    const rows = productsCache.filter(productVisible);
    $("#productsList").innerHTML = rows.map(productRow).join("") ||
      (productFilter === "all"
        ? `<p class="muted">No products yet — add your first one.</p>`
        : `<p class="muted">No products in this bucket — nice.</p>`);
  }
  $("#productFilterChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    productFilter = chip.dataset.pfilter;
    $$("#productFilterChips .chip").forEach(c => c.classList.toggle("is-active", c === chip));
    loadProducts().catch(err => toast(err.message));
  });

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

  /* ───────── storefront ───────── */
  let sfProductsCache = [];

  async function loadStorefront() {
    const [cfg, couponsRes, productsRes] = await Promise.all([
      fetchJSON("api/admin/store-config"),
      fetchJSON("api/admin/coupons"),
      fetchJSON("api/admin/products"),
    ]);
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
      }) });
      toast("Store settings saved — live now");
      loadStorefront().catch(() => {});
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
  function renderCoupons(coupons) {
    $("#couponsBody").innerHTML = coupons.map(c => `
      <tr data-code="${esc(c.code)}">
        <td><strong>${esc(c.code)}</strong></td>
        <td>${c.type === "percent" ? "% off" : "₹ off"}</td>
        <td>${c.type === "percent" ? c.value + "%" : inr(c.value)}</td>
        <td>${c.min_order > 0 ? inr(c.min_order) : "—"}</td>
        <td>${c.used}${c.max_uses ? " / " + c.max_uses : ""}</td>
        <td><label class="sf-mini-toggle"><input type="checkbox" data-toggle-coupon="${esc(c.code)}" ${c.active ? "checked" : ""} /><span></span></label></td>
        <td><button class="mini-btn danger" data-delete-coupon="${esc(c.code)}">Delete</button></td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted">No coupons yet — add the first one below.</td></tr>`;
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
      }) });
      e.target.reset();
      toast("Coupon created — share it on WhatsApp!");
      loadStorefront().catch(() => {});
    } catch (err) { toast(err.message); } finally { btn.disabled = false; }
  });

  /* inventory quick adjust */
  function renderInventory() {
    $("#sfInventoryList").innerHTML = sfProductsCache.map(p => {
      const out = p.stock <= 0, low = p.stock > 0 && p.stock <= 5;
      return `
        <div class="sf-inv-row${out ? " is-out" : low ? " is-low" : ""}" data-id="${esc(p.id)}">
          <img src="${esc(p.img)}" alt="${esc(p.name)}" width="46" height="46" loading="lazy" />
          <div class="sf-inv-meta">
            <span class="sf-inv-name">${esc(p.name)}</span>
            <span class="sf-inv-sub">${inr(p.price)} · ${esc(p.tag)}</span>
          </div>
          <input class="sf-stock-input" type="number" min="0" step="1" value="${p.stock}" aria-label="Stock for ${esc(p.name)}" data-stock-id="${esc(p.id)}" />
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
  async function loadReport() {
    const r = await fetchJSON("api/admin/report");
    $("#rpAov").textContent = inr(r.aov || 0);
    $("#rpOrdersAll").textContent = `${r.ordersAllTime || 0} orders all time`;
    $("#rpUnits").textContent = String(r.units30d || 0);
    $("#rpCouponOrders").textContent = String(r.coupons?.orders || 0);
    $("#rpCouponSaved").textContent = `${inr(r.coupons?.saved || 0)} saved by customers`;
    $("#rpPaySplit").textContent = `${r.payment?.cod || 0} / ${r.payment?.upi || 0}`;

    const days = r.days || [];
    const max = Math.max(1, ...days.map(d => d.revenue));
    const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
    $("#rpChart").innerHTML = days.map(d => `
      <div class="rp-col" title="${fmtDay(d.date)} — ${inr(d.revenue)} · ${d.orders} order${d.orders === 1 ? "" : "s"}">
        <span class="rp-col-val">${d.revenue ? "₹" + (d.revenue >= 1000 ? (d.revenue / 1000).toFixed(1) + "k" : d.revenue) : ""}</span>
        <div class="rp-bar${d.revenue === 0 ? " is-zero" : ""}" style="height:${Math.max(3, Math.round(d.revenue / max * 130))}px"></div>
        <span class="rp-col-label">${fmtDay(d.date).split(" ")[0]}</span>
      </div>`).join("");
    const total14 = days.reduce((s, d) => s + d.revenue, 0);
    $("#rpTotal14").textContent = `${inr(total14)} in 14 days`;
    $("#rpChartStart").textContent = days.length ? fmtDay(days[0].date) : "—";
    $("#rpChartEnd").textContent = days.length ? fmtDay(days[days.length - 1].date) : "—";

    const top = r.topProducts || [];
    $("#rpTopBody").innerHTML = top.map(x => `
      <tr><td><strong>${esc(x.name)}</strong></td><td>${x.units}</td><td>${inr(x.revenue)}</td></tr>`).join("")
      || `<tr><td colspan="3" class="muted">No sales in the last 30 days.</td></tr>`;

    const cod = r.payment?.cod || 0, upi = r.payment?.upi || 0, t = Math.max(1, cod + upi);
    $("#rpBarCod").style.width = Math.round(cod / t * 100) + "%";
    $("#rpBarUpi").style.width = Math.round(upi / t * 100) + "%";
    $("#rpValCod").textContent = `${cod} orders · ${inr(r.payment?.codRevenue || 0)}`;
    $("#rpValUpi").textContent = `${upi} orders · ${inr(r.payment?.upiRevenue || 0)}`;
    $("#rpPayNote").textContent = upi >= cod ? "UPI is healthy — keep both options on." : "COD still dominates — consider a small prepaid discount to shift mix.";
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
