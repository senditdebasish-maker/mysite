/* /packing-slip.html — admin-only printable warehouse slip (no prices) */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  async function boot() {
    if (!id || !/^\d+$/.test(id)) return fail("No order specified.");
    try {
      const res = await fetch("api/admin/orders/" + encodeURIComponent(id) + "/packing-slip", {
        cache: "no-store", referrerPolicy: "no-referrer", credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn’t load the packing slip");
      const { slip, seller } = data;

      document.title = `Packing slip #${slip.id} — ${seller.name || "Store"}`;
      $("#slipBrand").textContent = seller.name || "Store";
      $("#slipFooterBrand").textContent = seller.name || "Store";
      $("#slipSellerLine").textContent = seller.addr || "";
      $("#slipSellerLine").hidden = !seller.addr;
      $("#slipSellerPhone").textContent = seller.phone || "";
      $("#slipSellerContact").hidden = !seller.phone;

      $("#slipOrderId").textContent = "#" + slip.id;
      $("#slipDate").textContent = new Date(String(slip.createdAt).replace(" ", "T"))
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      $("#slipStatus").textContent = String(slip.status || "").replace(/_/g, " ");
      $("#slipMethod").textContent = slip.deliveryMethod;
      $("#slipPayment").textContent = slip.payment;
      $("#slipExpressPill").hidden = slip.deliveryMethod !== "Express";

      const courier = [slip.courier, slip.trackingNumber && "#" + slip.trackingNumber].filter(Boolean).join(" ");
      $("#slipCourierRow").hidden = !slip.courier;
      $("#slipTrackRow").hidden = !slip.trackingNumber;
      $("#slipEtaRow").hidden = !slip.expectedDelivery;
      $("#slipCourier").textContent = slip.courier || "—";
      $("#slipTracking").textContent = slip.trackingNumber || "—";
      $("#slipEta").textContent = slip.expectedDelivery ? String(slip.expectedDelivery).slice(0, 10) : "—";
      void courier;

      $("#slipCustName").textContent = slip.customer.name || "—";
      $("#slipCustPhone").textContent = slip.customer.phone || "";
      const addrParts = [slip.customer.address, slip.customer.pincode && "PIN " + slip.customer.pincode, slip.customer.state].filter(Boolean);
      $("#slipCustAddr").textContent = addrParts.join(" · ") || "Address not provided";

      $("#slipItems").innerHTML = slip.items.map((it) => `
        <tr><td><span class="inv-check" aria-hidden="true"></span></td><td>${esc(it.name)}${it.sku ? `<br /><small>SKU ${esc(it.sku)}</small>` : ""}${it.category ? `<br /><small>${esc(it.category)}</small>` : ""}</td><td>${it.qty}</td></tr>`).join("");
      $("#slipLines").textContent = String(slip.items.length);
      $("#slipQty").textContent = String(slip.totalQty);

      const note = (slip.customer.note || "").trim();
      $("#slipNoteWrap").hidden = !note;
      $("#slipNote").textContent = note;

      $("#slipRoot").hidden = false;
    } catch (err) {
      fail(err.message || "Couldn’t load the packing slip");
    }
  }

  function fail(msg) {
    $("#slipError").hidden = false;
    $("#slipErrorMsg").textContent = msg;
  }

  $("#printSlip").addEventListener("click", () => window.print());
  boot();
})();
