/* /invoice.html — printable order bill/receipt (server-authorized) */
(function () {
  const $ = (s) => document.querySelector(s);
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const token = params.get("token");

  const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function numToWords(n) {
    n = Math.round(Number(n) || 0);
    if (n === 0) return "Zero";
    const two = (x) => x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? " " + ONES[x % 10] : "");
    const three = (x) => Math.floor(x / 100) ? ONES[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + two(x % 100) : "") : two(x);
    const crore = Math.floor(n / 10000000), lakh = Math.floor((n % 10000000) / 100000), thousand = Math.floor((n % 100000) / 1000), rest = n % 1000;
    const parts = [];
    if (crore) parts.push(three(crore) + " Crore");
    if (lakh) parts.push(three(lakh) + " Lakh");
    if (thousand) parts.push(three(thousand) + " Thousand");
    if (rest) parts.push(three(rest));
    return parts.join(" ");
  }

  async function boot() {
    if (!id) return fail("No invoice specified.");
    try {
      const query = token ? "?token=" + encodeURIComponent(token) : "";
      const res = await fetch("api/invoices/" + encodeURIComponent(id) + query, { cache: "no-store", referrerPolicy: "no-referrer" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn’t load the invoice");
      const { invoice: inv, seller } = data;

      $("#invSellerName").textContent = seller.name || "Store";
      $("#invSellerLine").textContent = seller.line || "";
      $("#invSellerLine").hidden = !seller.line;
      $("#invSellerAddr").textContent = seller.addr || "";
      $("#invSellerAddr").hidden = !seller.addr;
      $("#invSellerEmail").textContent = seller.email || "";
      $("#invSellerPhone").textContent = seller.phone || "";
      $("#invSellerContact").hidden = !seller.email && !seller.phone;
      $("#invSellerContactDivider").hidden = !seller.email || !seller.phone;
      $("#invFooterSeller").textContent = seller.name || "Store";

      const gst = inv.gst || null;
      const taxInvoice = !!(gst && seller.gstin && seller.state);
      $("#invTitle").textContent = taxInvoice ? "Tax invoice" : "Order bill";
      $("#invToolbarTitle").textContent = taxInvoice ? "Tax invoice" : "Order bill";
      $("#invNumberLabel").textContent = taxInvoice ? "Invoice" : "Bill";
      $("#invTerms").textContent = taxInvoice
        ? "This is a computer-generated tax invoice (GST-inclusive pricing) and is proof of supply; payment is due as shown above. For returns or billing help, contact the store quoting the invoice number."
        : "This bill records the order total; it is not a GST tax invoice or proof of payment. Contact the store if you need help with this order.";
      if (seller.gstin) {
        $("#invSellerGstin").hidden = false;
        $("#invSellerGstin").textContent = "GSTIN " + seller.gstin + (seller.state ? " · State: " + seller.state : "");
      }

      document.title = `${taxInvoice ? "Tax invoice" : "Order bill"} ${inv.invoiceNumber} — ${seller.name || "Store"}`;
      $("#invId").textContent = inv.invoiceNumber;
      $("#invOrderId").textContent = "#" + inv.id;
      $("#invDate").textContent = new Date(String(inv.createdAt).replace(" ", "T"))
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const st = $("#invStatus");
      st.textContent = inv.status;
      st.className = "inv-status " + inv.status;

      $("#invCustName").textContent = inv.customer.name;
      $("#invCustEmail").textContent = inv.customer.email || "";
      $("#invCustEmail").hidden = !inv.customer.email;
      $("#invCustPhone").textContent = inv.customer.phone;
      $("#invCustAddr").textContent = inv.customer.address || "Address not provided (COD/UPI on delivery)";
      $("#invPayment").textContent = inv.payment === "upi" ? "UPI on Delivery" : "Cash on Delivery";
      $("#invCoupon").textContent = inv.coupon ? `(${inv.coupon})` : "";

      $("#invItems").innerHTML = inv.items.map((it, i) => `
        <tr><td>${i + 1}</td><td>${esc(it.name)}${it.sku ? `<br /><small>SKU ${esc(it.sku)}</small>` : ""}${it.category ? `${it.sku ? " · " : "<br />"}<small>${esc(it.category)}</small>` : ""}</td><td class="c">${it.qty}</td><td class="c">${inr(it.price)}</td><td>${inr(it.lineTotal)}</td></tr>`).join("");

      $("#invSub").textContent = inr(inv.subtotal);
      if (inv.discount > 0) {
        $("#invDiscountRow").hidden = false;
        $("#invDiscount2").textContent = inr(inv.discount);
      }
      $("#invDelivery").textContent = inv.delivery === 0 ? "FREE" : inr(inv.delivery);
      $("#invTotal").textContent = inr(inv.total);

      const gstBlock = $("#invGstBlock");
      if (taxInvoice && gst) {
        const pct = (bp) => {
          const p = bp / 100;
          return (Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")) + "%";
        };
        const intra = gst.intra === true, inter = gst.intra === false;
        $("#invCgstRow").hidden = !intra;
        $("#invSgstRow").hidden = !intra;
        $("#invIgstRow").hidden = !inter;
        $("#invUnknownRow").hidden = intra || inter;
        if (intra) {
          $("#invCgstRate").textContent = pct(gst.rateBp / 2);
          $("#invSgstRate").textContent = pct(gst.rateBp / 2);
          $("#invTaxableCgst").textContent = inr(gst.taxable);
          $("#invTaxableSgst").textContent = inr(gst.taxable);
          $("#invCgst").textContent = inr(gst.cgst);
          $("#invSgst").textContent = inr(gst.sgst);
        } else if (inter) {
          $("#invIgstRate").textContent = pct(gst.rateBp);
          $("#invTaxableIgst").textContent = inr(gst.taxable);
          $("#invIgst").textContent = inr(gst.igst);
        } else {
          $("#invUnknownRate").textContent = pct(gst.rateBp);
          $("#invTaxableUnknown").textContent = inr(gst.taxable);
          $("#invUnknown").textContent = inr(gst.unattributed);
        }
        $("#invPlace").textContent = gst.placeOfSupply || "not recorded";
        $("#invSellerState").textContent = gst.sellerState || "not configured";
        $("#invGstTotal").textContent = Number(gst.totalTax || 0).toLocaleString("en-IN");
        gstBlock.hidden = false;
      } else {
        gstBlock.hidden = true;
      }
      $("#invWords").textContent = "Amount in words: INR " + numToWords(inv.total) + " only";

      $("#invoiceRoot").hidden = false;
    } catch (err) {
      fail(err.message || "Couldn’t load the invoice");
    }
  }

  function fail(msg) {
    $("#invoiceError").hidden = false;
    $("#invoiceErrorMsg").textContent = msg;
    const link = document.querySelector("#invoiceError a");
    if (link) link.href = "login.html?next=" + encodeURIComponent("invoice.html?id=" + (id || ""));
  }

  $("#printInvoice").addEventListener("click", () => window.print());
  boot();
})();
