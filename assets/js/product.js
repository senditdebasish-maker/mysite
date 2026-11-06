/* /product.html — full product page
   Requires: store-core.js (window.DD) */
(function () {
  const { $, $$, fmtINR, esc, ETA, discountPct, stars, findProduct, toast, wish } = window.DD;
  const $n = (v) => Number(v) || 0;

  // server injects window.__PID__ for /product/:id · static fallbacks: ?id=
  let pid = String(window.__PID__ || "").trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(pid)) pid = new URLSearchParams(location.search).get("id") || "";
  pid = pid.trim();
  let current = null;
  let qty = 1;

  const money = fmtINR;
  const shareUrl = () => location.origin + "/product/" + pid;

  function wireShare() {
    const url = shareUrl();
    const text = current ? `${current.name} — ${money(current.price)} on The Shelf` : "Check this out on The Shelf";
    $("#shareWa").href = "https://wa.me/?text=" + encodeURIComponent(`${text}\n${url}`);
    $("#shareX").href  = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url);
    $("#shareFb").href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
    $("#shareCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); toast("Link copied ✓"); }
      catch { toast("Couldn't copy") }
    });
  }

  function renderBuyBox(p) {
    const stock = $n(p.stock);
    const live = window.DD.config().storeLive;
    const disc = discountPct(p);
    $("#pdDiscount").hidden = !disc;
    $("#pdDiscount").textContent = disc ? `−${disc}%` : "";
    $("#pdImg").src = p.img; $("#pdImg").alt = p.name;
    $("#pdSku").textContent = p.id.toUpperCase();
    $("#pdTag").textContent = p.tag;
    $("#pdName").textContent = p.name;
    $("#crumbName").textContent = p.name;
    document.title = `${p.name} — ${money(p.price)} | The Shelf · debasish.`;
    $("#pdStars").textContent = stars(p.rating);
    $("#pdRating").textContent = p.rating;
    $("#pdReviewCount").textContent = $n(p.reviews);
    $("#pdPrice").textContent = money(p.price);
    $("#pdMrp").textContent = p.was ? money(p.was) : "";
    $("#pdMrp").style.display = p.was ? "" : "none";
    $("#pdSave").textContent = p.was ? `Save ${money(Math.max(0, p.was - p.price))}` : "";
    $("#pdSave").style.display = p.was ? "" : "none";
    const stockEl = $("#pdStock");
    stockEl.textContent = stock > 0 ? (stock <= 5 ? `Only ${stock} left in stock` : "In stock") : "Sold out";
    stockEl.className = stock > 0 ? (stock <= 5 ? "qv-stock-low" : "qv-stock-ok") : "qv-stock-out";
    $("#pdCodNote").textContent = window.DD.config().codEnabled ? "COD & UPI on delivery" : "UPI on delivery";
    $("#pdEta").textContent = ETA;
    $("#pdDelNote").innerHTML = p.price >= window.DD.config().freeAt ? "Free delivery unlocked" : `Free above ${money(window.DD.config().freeAt)}`;

    $("#pdAdd").disabled = stock <= 0 || !live;
    $("#pdBuy").disabled = stock <= 0 || !live;
    updateQty(true);

    const on = wish.has(p.id);
    const wbtn = $("#pdWish");
    wbtn.classList.toggle("is-on", on);
    wbtn.setAttribute("aria-pressed", String(on));
    wbtn.querySelector("svg").setAttribute("fill", on ? "currentColor" : "none");
  }

  function updateQty(reset) {
    const stock = current ? $n(current.stock) : 1;
    const maxQ = Math.min(stock || 1, window.DD.config().maxQty);
    if (reset) qty = 1;
    qty = Math.max(1, Math.min(maxQ, qty));
    $("#pdQty").textContent = qty;
    $("#pdDec").disabled = qty <= 1;
    $("#pdInc").disabled = qty >= maxQ;
  }

  function renderHighlights(p) {
    const bits = String(p.meta || "").split("·").map(s => s.trim()).filter(Boolean);
    const extras = {
      "Tech": ["Backed by a 7-day replacement promise", "Compatible with Indian plug standards"],
      "Home & Living": ["Hand-checked before dispatch", "Lovingly packed to arrive gift-ready"],
    }[p.tag] || [];
    $("#pdHighlights").innerHTML = [...bits.map(b => `<li>${esc(b)}</li>`), ...extras.map(b => `<li>${esc(b)}</li>`)].join("");
    $("#pdSpecs").innerHTML = `
      <dt>Category</dt><dd>${esc(p.tag)}</dd>
      <dt>Model</dt><dd>${esc(p.name)}</dd>
      <dt>Country of origin</dt><dd>India / Imported (as labelled)</dd>
      <dt>Seller</dt><dd>debasish. — The Shelf, Kolkata</dd>
      <dt>In the box</dt><dd>1 × ${esc(p.name)}${/[Cc]able|[Hh]ub|[Cc]harger/.test(p.name) ? " + included accessories" : ""}</dd>
      <dt>Warranty</dt><dd>Manufacturer warranty where applicable</dd>`;
  }

  /* ═══════════ frequently bought together ═══════════ */
  function renderFBT(p) {
    const all = window.DD.products().filter(x => x.id !== p.id && $n(x.stock) > 0);
    const same = all.filter(x => x.tag === p.tag);
    const picks = [...same, ...all].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).slice(0, 2);
    if (picks.length < 2) { $("#fbtWrap").hidden = true; return; }
    const bundle = [p, ...picks];
    $("#fbtItems").innerHTML = bundle.map((x, i) => `
      ${i ? '<span class="fbt-plus" aria-hidden="true">+</span>' : ""}
      <a class="fbt-item" href="product/${esc(x.id)}" title="${esc(x.name)}">
        <img src="${esc(x.img)}" alt="${esc(x.name)}" width="120" height="120" loading="lazy" />
        <span class="fbt-item-name">${esc(x.name)}</span>
        <span class="fbt-item-price">${money(x.price)}</span>
      </a>`).join("");
    $("#fbtTotal").textContent = money(bundle.reduce((s, x) => s + x.price, 0));
    $("#fbtAdd").addEventListener("click", () => {
      let ok = 0;
      bundle.forEach(x => { if (window.DD.cart.add(x.id, 1)) ok++; });
      toast(`<b>${ok} items</b> added — coupon applies at checkout`);
    });
    $("#fbtWrap").hidden = false;
  }

  /* ═══════════ recommendations ═══════════ */
  function renderReco(p) {
    const reco = window.DD.products()
      .filter(x => x.id !== p.id)
      .sort((a, b) => (b.tag === p.tag ? 1 : 0) - (a.tag === p.tag ? 1 : 0) || $n(b.reviews) - $n(a.reviews))
      .slice(0, 8);
    $("#recoTrack").innerHTML = reco.map(x => `
      <article class="deal-card reco-card">
        <a class="deal-media" href="product/${esc(x.id)}" aria-label="View ${esc(x.name)}">${discountPct(x) ? `<span class="disc-badge">−${discountPct(x)}%</span>` : ""}<img src="${esc(x.img)}" alt="${esc(x.name)}" loading="lazy" width="300" height="300" /></a>
        <div class="deal-body">
          <a class="deal-name name-link" href="product/${esc(x.id)}">${esc(x.name)}</a>
          <div class="deal-price"><span class="price">${money(x.price)}</span>${x.was ? `<span class="mrp">${money(x.was)}</span>` : ""}</div>
          <button class="btn btn-ink btn-sm deal-add" data-add="${esc(x.id)}">Add · ${money(x.price)}</button>
        </div>
      </article>`).join("");
    $("#recoWrap").hidden = reco.length === 0;
    $("#recoTrack").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add]");
      if (btn) window.DD.cart.add(btn.dataset.add, 1);
    });
  }

  /* ═══════════ reviews ═══════════ */
  const RE = [5, 4, 3, 2, 1];
  function renderDist(avg) {
    // derive a plausible distribution around the product rating for visual weight
    const w = { 5: Math.pow(avg / 5, 3), 4: avg / 5, 3: Math.pow(1 - avg / 5, 1.2) * 0.9, 2: Math.pow(1 - avg / 5, 2) * 0.5, 1: Math.pow(1 - avg / 5, 3) * 0.35 };
    const max = Math.max(...Object.values(w));
    $("#rvDist").innerHTML = RE.map(s => `
      <div class="rd-row"><span class="rd-label">${s}★</span><div class="rd-bar"><div class="rd-fill" style="width:${Math.max(4, Math.round(w[s] / max * 100))}%"></div></div></div>`).join("");
  }

  async function loadReviews(productId) {
    try {
      const res = await fetch(`api/products/${encodeURIComponent(productId)}/reviews`);
      if (!res.ok) return;
      const { reviews } = await res.json();
      $("#rvList").innerHTML = (reviews || []).map(r => `
        <article class="review-card">
          <div class="review-head">
            <span class="review-avatar">${esc(String(r.name || "C").trim().charAt(0).toUpperCase())}</span>
            <div>
              <p class="review-name">${esc(r.name)}</p>
              <p class="review-meta"><span class="stars">${stars(r.rating)}</span> · ${new Date(String(r.created_at).replace(" ", "T") + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
          </div>
          ${r.title ? `<p class="review-title">${esc(r.title)}</p>` : ""}
          <p class="review-body">${esc(r.body)}</p>
        </article>`).join("") || `<p class="muted">No reviews yet — write the first one.</p>`;
    } catch { $("#rvList").innerHTML = `<p class="muted">Reviews didn’t load.</p>`; }
  }

  function wireReviewForm(productId) {
    // show form only for signed-in users
    fetch("api/me").then(r => r.json()).then(d => {
      const signedIn = !!d.user;
      $("#reviewForm").hidden = !signedIn;
      $("#reviewLoginPrompt").hidden = signedIn;
      if (signedIn) $("#reviewLoginPrompt").href = "login.html?next=" + encodeURIComponent("product/" + pid);
    }).catch(() => { $("#reviewLoginPrompt").hidden = false; });

    let picked = 0;
    const starBtns = $$("#starPick button");
    const paint = (n) => starBtns.forEach(b => b.classList.toggle("is-lit", Number(b.dataset.star) <= n));
    starBtns.forEach(b => {
      b.addEventListener("mouseenter", () => paint(Number(b.dataset.star)));
      b.addEventListener("mouseleave", () => paint(picked));
      b.addEventListener("click", () => { picked = Number(b.dataset.star); paint(picked); });
    });

    $("#reviewForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = $("#rvBody").value.trim();
      if (!picked) { toast("Pick a star rating first"); return; }
      if (body.length < 4) { toast("Please write a few words"); return; }
      const btn = $("#rvSubmit"); btn.disabled = true; btn.textContent = "Posting…";
      try {
        const res = await fetch(`api/products/${encodeURIComponent(productId)}/reviews`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: picked, title: $("#rvTitleInput").value, body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't post the review");
        toast("Thank you — your review is live");
        $("#rvBody").value = ""; $("#rvTitleInput").value = ""; picked = 0; paint(0);
        $("#reviewForm").hidden = true;
        // refresh counts + list
        const p = findProduct(productId);
        if (p) { p.reviews = (p.reviews || 0) + 1; }
        $("#pdReviewCount").textContent = p ? $n(p.reviews) : "";
        $("#rvCount").textContent = p ? $n(p.reviews) : "";
        loadReviews(productId);
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false; btn.textContent = "Post review";
      }
    });
  }

  /* ═══════════ boot ═══════════ */
  window.DD.ready.then(() => {
    current = pid ? findProduct(pid) : null;
    if (!current) {
      $("#pdWrap").style.display = "none";
      $("#pdMissing").hidden = false;
      return;
    }
    renderBuyBox(current);
    renderHighlights(current);
    renderDist($n(current.rating) || 4.5);
    $("#rvAvg").textContent = $n(current.rating).toFixed(1);
    $("#rvStars").textContent = stars(current.rating);
    $("#rvCount").textContent = $n(current.reviews);
    renderFBT(current);
    renderReco(current);
    loadReviews(current.id);
    wireReviewForm(current.id);
    wireShare();

    $("#pdDec").addEventListener("click", () => { qty -= 1; updateQty(); });
    $("#pdInc").addEventListener("click", () => { qty += 1; updateQty(); });
    $("#pdAdd").addEventListener("click", () => window.DD.cart.add(current.id, qty));
    $("#pdBuy").addEventListener("click", () => { if (window.DD.cart.add(current.id, qty)) window.DD.cart.open(); });
    $("#pdWish").addEventListener("click", () => {
      const on = wish.toggle(current.id);
      const wbtn = $("#pdWish");
      wbtn.classList.toggle("is-on", on);
      wbtn.setAttribute("aria-pressed", String(on));
      wbtn.querySelector("svg").setAttribute("fill", on ? "currentColor" : "none");
      toast(on ? "Saved to wishlist ♥" : "Removed from wishlist");
    });
    $("#pdMediaBox").addEventListener("click", () => $("#pdMediaBox").classList.toggle("is-zoomed"));
    $("#pdMediaBox").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#pdMediaBox").classList.toggle("is-zoomed"); } });
  });

  window.addEventListener("dd:products-changed", () => {
    if (!current) return;
    const fresh = findProduct(current.id);
    if (fresh) { current = fresh; renderBuyBox(current); }
  });
})();
