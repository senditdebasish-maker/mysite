/* /store.html — The Shelf · storefront grid layer
   Filters · search · sort · deals rail + countdown · quick view · wishlist
   (cart/checkout/coupons live in store-core.js → window.DD) */
(function () {
  const { $, $$, fmtINR, esc, ETA, discountPct, stars, findProduct, toast, wish } = window.DD;
  const $n = (v) => Number(v) || 0;
  let filter = { cat: "all", price: "all", stockOnly: false, wishlistOnly: false, q: "", sort: "popular" };

  const priceOk = (p) => ({
    all: true,
    lt500: p.price < 500,
    "500-1000": p.price >= 500 && p.price <= 1000,
    "1000-2000": p.price > 1000 && p.price <= 2000,
    gt2000: p.price > 2000,
  }[filter.price]);

  function visibleProducts() {
    const list = window.DD.products().filter(p =>
      (filter.cat === "all" || p.tag === filter.cat) &&
      priceOk(p) &&
      (!filter.stockOnly || $n(p.stock) > 0) &&
      (!filter.wishlistOnly || wish.has(p.id)) &&
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

  const cardHTML = (p) => {
    const stock = $n(p.stock);
    const soldOut = stock <= 0;
    const disc = discountPct(p);
    const low = stock > 0 && stock <= 5;
    const live = window.DD.config().storeLive;
    const freeDel = p.price >= window.DD.config().freeAt;
    return `
    <article class="product-card v2" data-id="${esc(p.id)}">
      <div class="product-media">
        ${disc ? `<span class="disc-badge">−${disc}%</span>` : ""}
        <span class="product-tag">${esc(p.tag)}</span>
        <button class="wish-btn${wish.has(p.id) ? " is-on" : ""}" data-wish="${esc(p.id)}" aria-pressed="${wish.has(p.id)}" aria-label="${wish.has(p.id) ? "Remove from" : "Add to"} wishlist">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="${wish.has(p.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.7-9.3-9.6C1.7 7.4 4.4 4.5 7.7 4.5c1.9 0 3.3 1 4.3 2.4 1-1.4 2.4-2.4 4.3-2.4 3.3 0 6 2.9 5 5.9C19.5 15.3 12 20 12 20z"/></svg>
        </button>
        <a href="product/${esc(p.id)}" class="media-link" aria-label="View ${esc(p.name)}">
          <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="400" height="400" />
        </a>
        <button class="quick-btn" data-quick="${esc(p.id)}" type="button">Quick view</button>
      </div>
      <div class="product-body">
        <h3 class="product-name"><a href="product/${esc(p.id)}" class="name-link">${esc(p.name)}</a></h3>
        <p class="product-meta">${esc(p.meta)}</p>
        <p class="rating-line"><span class="stars" aria-hidden="true">${stars(p.rating)}</span> <strong>${esc(p.rating)}</strong><span class="muted"> · ${$n(p.reviews)} reviews</span></p>
        <p class="delivery-line">${soldOut ? "Currently sold out" : `<strong>${freeDel ? "Free delivery" : "Delivery ₹" + window.DD.config().deliveryFee}</strong> · by ${ETA}`}</p>
        <div class="product-foot">
          <div class="price-wrap">
            ${p.was ? `<span class="mrp">M.R.P. ${fmtINR(p.was)}</span>` : ""}
            <span class="price">${fmtINR(p.price)}</span>
          </div>
          <button class="add-btn" data-add="${esc(p.id)}" ${soldOut || !live ? "disabled" : ""} aria-label="Add ${esc(p.name)} to cart">
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
    const all = window.DD.products();
    $("#cntAll").textContent  = all.length;
    $("#cntTech").textContent = all.filter(p => p.tag === "Tech").length;
    $("#cntHome").textContent = all.filter(p => p.tag === "Home & Living").length;
    $("#wishlistCount").textContent = wish.count();
    $("#wishlistOnly").setAttribute("aria-pressed", String(filter.wishlistOnly));
    $("#wishlistOnly").classList.toggle("is-active", filter.wishlistOnly);
  }
  function renderDeals() {
    const deals = window.DD.products().filter(p => discountPct(p) > 0 && $n(p.stock) > 0)
      .sort((a, b) => discountPct(b) - discountPct(a)).slice(0, 8);
    $("#dealTrack").innerHTML = deals.map(p => `
      <article class="deal-card" data-id="${esc(p.id)}">
        <a class="deal-media" href="product/${esc(p.id)}" aria-label="View ${esc(p.name)}"><span class="disc-badge">−${discountPct(p)}%</span><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="300" height="300" /></a>
        <div class="deal-body">
          <a class="deal-name name-link" href="product/${esc(p.id)}">${esc(p.name)}</a>
          <div class="deal-price"><span class="price">${fmtINR(p.price)}</span>${p.was ? `<span class="mrp">${fmtINR(p.was)}</span>` : ""}</div>
          <button class="btn btn-ink btn-sm deal-add" data-add="${esc(p.id)}" ${window.DD.config().storeLive ? "" : "disabled"}>Add · ${fmtINR(p.price)}</button>
        </div>
      </article>`).join("");
    $(".deals").style.display = deals.length ? "" : "none";
  }

  function tickDealTimer() {
    const el = $("#dealTimer"); if (!el) return;
    const now = new Date(), end = new Date(now); end.setHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((end - now) / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, "0"), m = String(Math.floor((s % 3600) / 60)).padStart(2, "0"), sec = String(s % 60).padStart(2, "0");
    el.textContent = `${h}:${m}:${sec}`;
  }
  setInterval(tickDealTimer, 1000);

  /* deal + grid actions */
  const onActionClick = (e) => {
    if (e.target.closest("a")) return;   // let product links navigate
    const add = e.target.closest("[data-add]");
    if (add) { if (!add.disabled) window.DD.cart.add(add.dataset.add, 1); return; }
    const wl = e.target.closest("[data-wish]");
    if (wl) { const on = wish.toggle(wl.dataset.wish); renderCounts(); renderGrid(); toast(on ? "Saved to wishlist ♥" : "Removed from wishlist"); return; }
    const quick = e.target.closest("[data-quick]");
    if (quick) { openQuickView(quick.dataset.quick); return; }
  };
  $("#storeGrid").addEventListener("click", onActionClick);
  $("#dealTrack").addEventListener("click", onActionClick);

  /* filters / search / sort */
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

  /* coupon banner shortcut */
  $("#applyWelcome10").addEventListener("click", () => {
    const input = $("#couponInput");
    if (input) { input.value = "WELCOME10"; input.focus(); }
    toast("Code filled — press <b>Apply</b> in the cart");
  });

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
    $("#qvEta").textContent = ETA;
    $("#qvViewFull").href = "product/" + p.id;
    $("#qvQty").textContent = "1";
    $("#qvDec").disabled = true;
    $("#qvInc").disabled = stock <= 1;
    const live = window.DD.config().storeLive;
    $("#qvAdd").disabled = stock <= 0 || !live;
    $("#qvBuy").disabled = stock <= 0 || !live;
    qv.hidden = false;
    $("#qvClose").focus();
  }
  function closeQuickView() { qv.hidden = true; qvId = null; }
  $("#qvClose").addEventListener("click", closeQuickView);
  qv.addEventListener("click", (e) => { if (e.target === qv) closeQuickView(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeQuickView(); });
  const qvClamp = () => {
    const p = findProduct(qvId); if (!p) return;
    const maxQ = Math.min($n(p.stock) || 1, window.DD.config().maxQty);
    qvQty = Math.max(1, Math.min(maxQ, qvQty));
    $("#qvQty").textContent = qvQty;
    $("#qvDec").disabled = qvQty <= 1;
    $("#qvInc").disabled = qvQty >= maxQ;
  };
  $("#qvDec").addEventListener("click", () => { qvQty -= 1; qvClamp(); });
  $("#qvInc").addEventListener("click", () => { qvQty += 1; qvClamp(); });
  $("#qvAdd").addEventListener("click", () => { if (qvId) { window.DD.cart.add(qvId, qvQty); closeQuickView(); } });
  $("#qvBuy").addEventListener("click", () => { if (qvId) { if (window.DD.cart.add(qvId, qvQty)) { closeQuickView(); window.DD.cart.open(); } } });
  $("#qvShare").addEventListener("click", async () => {
    if (!qvId) return;
    const url = location.origin + "__BASE_PATH__" + "/product/" + qvId;
    try { await navigator.clipboard.writeText(url); toast("Product link copied ✓"); }
    catch { toast("Couldn't copy — long-press to share"); }
  });

  /* ═══════════ boot ═══════════ */
  window.DD.ready.then(() => {
    tickDealTimer();
    renderDeals(); renderCounts(); renderGrid();
    // deep link: store.html#p-<id> opens quick view
    const m = location.hash.match(/^#p-(.+)$/);
    if (m && findProduct(m[1])) openQuickView(m[1]);
  });
  window.addEventListener("dd:products-changed", () => { renderDeals(); renderGrid(); });
})();
