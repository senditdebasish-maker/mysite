/* /track.html — public guest order tracking (server enforces anti-enumeration) */
(function () {
  const $ = (s) => document.querySelector(s);
  const { statusLabel, inr, esc } = window.UI;
  const STATUS_STEPS = ["pending", "confirmed", "shipped", "out_for_delivery", "delivered"];

  function renderProgress(status) {
    const el = $("#trkProgress");
    if (status === "cancelled" || status === "refunded") {
      el.innerHTML = "<span class='prog-seg cancel'></span>".repeat(STATUS_STEPS.length);
      return;
    }
    const idx = STATUS_STEPS.indexOf(status);
    el.innerHTML = STATUS_STEPS.map((_, i) => `<span class="prog-seg${i <= idx ? " done" : ""}"></span>`).join("");
  }

  $("#trackForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("#trackError");
    errEl.hidden = true;
    const orderId = $("#trkOrder").value.trim();
    const contact = $("#trkContact").value.trim();
    if (!/^\d{1,10}$/.test(orderId)) { errEl.textContent = "Enter your order number (numbers only)."; errEl.hidden = false; return; }
    if (contact.length < 3) { errEl.textContent = "Enter the phone number or email used at checkout."; errEl.hidden = false; return; }

    const btn = $("#trackSubmit");
    btn.disabled = true;
    btn.textContent = "Looking…";
    try {
      const res = await fetch("api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, contact }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn’t look up that order");

      const o = data.order || {};
      $("#trkResId").textContent = "#" + o.id;
      const pill = $("#trkResPill");
      pill.textContent = statusLabel[o.status] || o.status || "—";
      pill.className = "status-pill st-" + String(o.status || "pending");
      renderProgress(String(o.status || ""));
      $("#trkResDate").textContent = new Date(String(o.created_at || "").replace(" ", "T"))
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      $("#trkResCount").textContent = String(o.items_count ?? 0);
      $("#trkResTotal").textContent = inr(o.total || 0);
      $("#trkResMethod").textContent = o.delivery_method === "express" ? "Express delivery" : "Standard delivery";

      const hasParcel = o.courier || o.tracking_number || o.tracking_url || o.expected_delivery;
      $("#trkParcel").hidden = !hasParcel;
      $("#trkParcelCourier").textContent = o.courier ? `Courier: ${o.courier}` : "";
      $("#trkParcelTracking").textContent = o.tracking_number ? `${o.courier ? " · " : ""}Tracking # ${o.tracking_number}` : "";
      const eta = o.expected_delivery ? String(o.expected_delivery).slice(0, 10) : "";
      $("#trkParcelEta").hidden = !eta;
      $("#trkParcelEtaDate").textContent = eta;
      const link = $("#trkParcelLink");
      const safeUrl = /^https?:\/\//i.test(String(o.tracking_url || "")) ? o.tracking_url : "";
      link.hidden = !safeUrl;
      if (safeUrl) link.href = safeUrl;

      $("#trackResult").hidden = false;
      $("#trackResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      errEl.textContent = err.message || "Couldn’t look up that order — please try again.";
      errEl.hidden = false;
      $("#trackResult").hidden = true;
    } finally {
      btn.disabled = false;
      btn.textContent = "Find my order →";
    }
  });
})();
