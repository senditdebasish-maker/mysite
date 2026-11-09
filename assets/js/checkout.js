/* ══════════════════════════════════════════════════════════
   Checkout — dedicated page logic
   · contact prefill (if signed in) · saved-address book picker
   · standard/express delivery · COD/UPI on delivery
   · server-side coupon validation · COD minimum · store-live guard
   · WhatsApp hand-off fallback when the backend is unreachable
   ══════════════════════════════════════════════════════════ */
"use strict";
(function () {
  const DD = window.DD;
  if (!DD) return;
  const { $, fmtINR, esc, toast } = DD;
  const $1 = (sel, root = document) => root.querySelector(sel);
  const $$1 = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const n = (v) => Number(v) || 0;
  const fetchJSON = async (url, opts) => {
    const res = await fetch(url, opts);
    let data = null; try { data = await res.json(); } catch { data = null; }
    if (!res.ok) { const err = new Error((data && data.error) || res.statusText || "Request failed"); err.status = res.status; throw err; }
    return data;
  };

  let cfg = {};
  let me = null;              // signed-in user (or null)
  let savedAddresses = [];    // address book (signed-in only)
  let selectedAddressId = null; // null → using the new-address form

  const state = () => ({
    delivery_method: $1('input[name="delivery_method"]:checked')?.value === "express" ? "express" : "standard",
    payment: $1('input[name="payment"]:checked')?.value === "upi" ? "upi" : "cod",
  });

  const totals = () => {
    const sub = DD.cart.subtotal();
    const coupon = DD.coupon();
    const discount = !coupon || sub < n(coupon.min_order) ? 0 : (coupon.type === "percent" ? Math.round(sub * coupon.value / 100) : Math.min(coupon.value, sub));
    const method = state().delivery_method;
    const delivery = method === "express" ? n(cfg.expressFee) : (sub >= n(cfg.freeAt) ? 0 : (sub > 0 ? n(cfg.deliveryFee) : 0));
    const total = Math.max(0, sub - discount + delivery);
    return { sub, coupon, discount, delivery, total, gst: Math.round(total * 18 / 118), count: DD.cart.count() };
  };

  /* ═══════════ render ═══════════ */
  function renderItems() {
    const lines = DD.cart.lines();
    $1("#sumItems").innerHTML = lines.map(l => `
      <li class="co-line"><span class="co-line-qty">×${l.qty}</span><span class="co-line-name">${esc(l.name)}</span><span class="co-line-price">${fmtINR(l.price * l.qty)}</span></li>`).join("");
    $1("#sumCount").textContent = `${DD.cart.count()} item${DD.cart.count() === 1 ? "" : "s"}`;
  }

  function renderTotals() {
    const { sub, coupon, discount, delivery, total, gst, count } = totals();
    $1("#sumSub").textContent = fmtINR(sub);
    const dRow = $1("#sumDiscountRow");
    dRow.hidden = !(coupon && discount > 0);
    if (coupon) $1("#sumCouponCode").textContent = coupon.code;
    $1("#sumDiscount").textContent = fmtINR(discount);
    const method = state().delivery_method;
    $1("#sumMethodLabel").textContent = method === "express" ? "(express)" : delivery === 0 ? "(standard · free)" : "(standard)";
    $1("#sumDelivery").textContent = delivery === 0 ? "FREE" : fmtINR(delivery);
    $1("#sumTotal").textContent = fmtINR(total);
    $1("#sumGst").textContent = fmtINR(gst);
    $1("#placeOrderLabel").textContent = count ? `Place order · ${fmtINR(total)}` : "Your cart is empty";

    // standard-fee callouts
    const stdFee = $1("#stdFeeLabel"), expFee = $1("#expFeeLabel"), freeHint = $1("#stdFreeHint");
    if (stdFee) stdFee.textContent = sub >= n(cfg.freeAt) ? "FREE" : fmtINR(n(cfg.deliveryFee));
    if (expFee) expFee.textContent = fmtINR(n(cfg.expressFee));
    if (freeHint) freeHint.textContent = sub >= n(cfg.freeAt) ? "free delivery applied" : `free above ${fmtINR(n(cfg.freeAt))}`;

    // COD minimum guard
    const pay = state().payment;
    const codMin = n(cfg.codMin);
    const codLabel = $1('#paymentChoices .radio-card[data-pay="cod"]');
    const codSub = $1("#codSub");
    if (codLabel && codSub) {
      if (cfg.codEnabled === false) {
        codLabel.classList.add("is-disabled"); $1('input[value="cod"]').disabled = true;
        codSub.textContent = "Currently unavailable — please choose UPI on delivery";
      } else if (codMin > 0 && sub < codMin) {
        codSub.innerHTML = `Available on orders of <strong>${fmtINR(codMin)}+</strong> — add ${fmtINR(codMin - sub)} more or use UPI`;
      } else {
        codSub.textContent = "Pay the courier when your parcel arrives";
      }
    }
    return pay;
  }

  function syncRadioCards(groupSel) {
    $$1(`${groupSel} .radio-card`).forEach(card => {
      card.classList.toggle("is-active", $1("input", card).checked);
    });
  }

  const renderAll = () => { renderItems(); renderTotals(); syncRadioCards("#deliveryChoices"); syncRadioCards("#paymentChoices"); };

  /* ═══════════ offers (tap-to-apply chips) ═══════════ */
  async function loadOffers() {
    try {
      const data = await fetchJSON("api/coupons/offers");
      const offers = Array.isArray(data.offers) ? data.offers : [];
      const box = $1("#offerChips");
      box.innerHTML = offers.slice(0, 4).map(o => {
        const deal = o.type === "percent" ? `${o.value}% off` : `${fmtINR(o.value)} off`;
        const min = o.min_order > 0 ? `on ${fmtINR(o.min_order)}+` : "any order";
        return `<button type="button" class="offer-chip" data-code="${esc(o.code)}">${esc(o.code)}<small>${deal} · ${min}</small></button>`;
      }).join("");
      $$1(".offer-chip", box).forEach(chip => chip.addEventListener("click", async () => {
        $1("#couponInput").value = chip.dataset.code;
        $1("#applyCoupon").disabled = true;
        await DD.applyCouponCode(chip.dataset.code, { messageEl: $1("#couponMsg") });
        $1("#applyCoupon").disabled = false;
        renderAll();
      }));
    } catch { /* offers are a nicety — stay silent */ }
  }

  /* ═══════════ address book ═══════════ */
  const addressComposite = (a) => [a.line, a.city, a.state, a.pincode].filter(Boolean).join(", ");
  const addressIsValid = (a) => a.name && a.line.length >= 6 && /^\d{6}$/.test(a.pincode) && a.phone.replace(/\D/g, "").length >= 10;

  function renderAddressChoices() {
    const list = $1("#addrList");
    if (!savedAddresses.length) { list.hidden = true; return; }
    list.hidden = false;
    list.innerHTML = savedAddresses.map(a => `
      <label class="addr-choice${a.id === selectedAddressId ? " is-active" : ""}" data-id="${a.id}">
        <input type="radio" name="saved_address" value="${a.id}" ${a.id === selectedAddressId ? "checked" : ""} />
        <span>
          <span class="addr-label">${esc(a.label || "Address")}${a.is_default ? '<span class="addr-default-dot">Default</span>' : ""}</span>
          <span class="addr-body"><span class="addr-recipient">${esc(a.name)}</span> · ${esc(a.phone)}<br />${esc(a.line)}, ${esc(a.city)}${a.state ? ", " + esc(a.state) : ""} — ${esc(a.pincode)}</span>
        </span>
      </label>`).join("");
    $$1(".addr-choice", list).forEach(card => card.addEventListener("click", () => {
      selectedAddressId = Number(card.dataset.id);
      $1("#newAddressForm").hidden = true; $1("#addrNewToggle").classList.remove("is-open");
      $1("#saveToBookWrap").hidden = true;
      $1("#addrError").hidden = true;
      renderAddressChoices();
    }));
  }

  function collectNewAddress() {
    return {
      label: $1("#naLabel").value.trim().slice(0, 24) || "Home",
      name: $1("#naName").value.trim(),
      phone: $1("#naPhone").value.trim(),
      line: $1("#naLine").value.trim(),
      city: $1("#naCity").value.trim(),
      state: $1("#naState").value.trim(),
      pincode: $1("#naPin").value.trim(),
    };
  }

  /* ═══════════ boot ═══════════ */
  DD.ready.then(async () => {
    cfg = DD.config();
    if (DD.cart.count() === 0) {
      $1("#coEmpty").hidden = false;
      $1("#checkoutForm").hidden = true;
      $1("#coSummary").hidden = true;
      return;
    }
    $1("#checkoutForm").hidden = false;
    $1("#coSummary").hidden = false;

    // session?
    try { me = (await fetchJSON("api/me")).user || null; } catch { me = null; }
    if (me) {
      $1("#whoamiBar").hidden = false;
      $1("#whoamiName").textContent = me.name;
      $1("#guestNote").hidden = true;
      $1("#coName").value = me.name || "";
      $1("#coPhone").value = me.phone || "";
      $1("#naName").value = me.name || "";
      $1("#naPhone").value = me.phone || "";
      $1("#saveToBookWrap").hidden = false;
      try {
        const data = await fetchJSON("api/addresses");
        savedAddresses = Array.isArray(data.addresses) ? data.addresses : [];
        const def = savedAddresses.find(a => a.is_default) || savedAddresses[0];
        if (def) { selectedAddressId = def.id; $1("#newAddressForm").hidden = true; }
      } catch { savedAddresses = []; }
      $1("#addrNewToggle").hidden = savedAddresses.length === 0;
      renderAddressChoices();
    }

    loadOffers();
    renderAll();
  });

  /* contact + address interactions */
  $1("#addrNewToggle")?.addEventListener("click", () => {
    const form = $1("#newAddressForm");
    form.hidden = !form.hidden;
    if (!form.hidden) { selectedAddressId = null; renderAddressChoices(); $1("#naSave") && ($1("#saveToBookWrap").hidden = false); }
  });

  $$1('#deliveryChoices input, #paymentChoices input').forEach(input => input.addEventListener("change", renderAll));

  $1("#applyCoupon")?.addEventListener("click", async () => {
    $1("#applyCoupon").disabled = true;
    await DD.applyCouponCode($1("#couponInput").value, { messageEl: $1("#couponMsg") });
    $1("#applyCoupon").disabled = false;
    renderAll();
  });
  $1("#couponInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $1("#applyCoupon").click(); } });

  /* ═══════════ place order ═══════════ */
  const offlineOrder = (fields, t) => {
    const lines = DD.cart.lines();
    const msg = [`Hi! I'd like to order from your store:`,
      ...lines.map(l => `• ${l.qty} × ${l.name} — ${fmtINR(l.price * l.qty)}`),
      t.coupon && t.discount > 0 ? `Coupon: ${t.coupon.code} (−${fmtINR(t.discount)})` : null,
      `Delivery: ${t.delivery === 0 ? "FREE" : fmtINR(t.delivery)} (${fields.delivery_method})`,
      `Total: ${fmtINR(t.total)}`, `${fields.payment === "upi" ? "UPI" : "Cash on Delivery"} on delivery`,
      `Name: ${fields.customer_name} · ${fields.phone}`, fields.address ? `Address: ${fields.address}` : null,
      `Please confirm stock & delivery.`].filter(Boolean).join("\n");
    return DD.waLink(msg);
  };

  $1("#checkoutForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = totals();
    if (t.count === 0) { toast("Your cart is empty"); return; }

    const name = $1("#coName").value.trim();
    const phone = $1("#coPhone").value.trim();
    if (!name) { $1("#coName").focus(); toast("Please tell me your name"); return; }
    if (phone.replace(/\D/g, "").length < 10) { $1("#coPhone").focus(); toast("Please share a valid phone number"); return; }

    // resolve the address string
    let address = "", addressPayload = null;
    const usingSaved = me && selectedAddressId != null;
    if (usingSaved) {
      const a = savedAddresses.find(x => x.id === selectedAddressId);
      if (!a) { toast("That saved address vanished — pick another"); return; }
      address = addressComposite(a);
    } else {
      const a = collectNewAddress();
      const err = $1("#addrError");
      err.hidden = true;
      if (!addressIsValid(a)) {
        err.textContent = "Add a complete address — at least 6 characters for the street line, a 10-digit phone and a 6-digit PIN code.";
        err.hidden = false;
        $1("#naLine").focus();
        return;
      }
      address = addressComposite(a);
      if (me && $1("#naSave")?.checked) addressPayload = a;
    }

    const cfgNow = DD.config();
    const codMin = n(cfgNow.codMin);
    const pay = state().payment;
    if (pay === "cod" && cfgNow.codEnabled === false) { toast("Cash on Delivery is temporarily unavailable — please choose UPI"); return; }
    if (pay === "cod" && codMin > 0 && t.sub < codMin) { toast(`COD works on orders of ${fmtINR(codMin)} and above — use UPI on delivery instead`); return; }
    if (cfgNow.storeLive === false) { toast("The store is restocking right now — checkout is temporarily unavailable"); return; }

    const fields = {
      customer_name: name, phone, address,
      items: DD.cart.lines().map(l => ({ id: l.id, qty: l.qty })),
      coupon: (DD.coupon() && t.discount > 0) ? DD.coupon().code : undefined,
      payment: pay,
      note: $1("#coNote").value.trim() || undefined,
      delivery_method: state().delivery_method,
    };

    const btn = $1("#placeOrderBtn");
    btn.disabled = true;
    $1("#placeOrderLabel").textContent = "Placing your order…";

    // save the new address to the book first (best-effort, signed-in only)
    if (addressPayload) {
      try { await fetchJSON("api/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...addressPayload, is_default: savedAddresses.length === 0 }) }); }
      catch { /* don't block the order over the address book */ }
    }

    let placed = null, backendOk = true;
    try {
      const data = await fetchJSON("api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      placed = data && data.order;
    } catch (err) {
      if (err.status) { toast(err.message || "Couldn't place the order"); btn.disabled = false; renderAll(); return; }
      backendOk = false;   // no backend reachable → WhatsApp hand-off
    }
    if (backendOk && !placed) backendOk = false;   // unusable payload → same fallback

    const stash = (payload) => { try { sessionStorage.setItem("dd_last_order", JSON.stringify(payload)); } catch {} };

    if (!backendOk) {
      const offlineItems = DD.cart.lines().map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price }));
      const wa = offlineOrder(fields, t);
      DD.cart.clear();
      DD.clearCoupon();
      stash({ wa: true, total: t.total, payment: pay, delivery_method: fields.delivery_method, items: offlineItems, coupon: t.coupon && t.discount > 0 ? t.coupon.code : null, name, phone, address, signedIn: !!me });
      window.open(wa, "_blank", "noopener");
      location.href = "order-success.html?wa=1";
      return;
    }

    // success — clear the cart and hand over to the confirmation page
    DD.cart.clear();
    DD.clearCoupon();
    stash({ ...placed, payment: placed.payment || pay, delivery_method: placed.delivery_method || fields.delivery_method, name, phone, address, signedIn: !!me });
    location.href = `order-success.html?order=${placed.id}`;
  });
})();
