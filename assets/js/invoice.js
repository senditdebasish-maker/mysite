/* /invoice.html — printable GST invoice (owner/admin only, server-authorized) */
(function () {
  const $ = (s) => document.querySelector(s);
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const id = new URLSearchParams(location.search).get("id");

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
      const res = await fetch("api/invoices/" + encodeURIComponent(id));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn’t load the invoice");
      const { invoice: inv, seller } = data;

      $("#invSellerLine").textContent = seller.line;
      $("#invSellerAddr").textContent = seller.addr;
      $("#invGstin").textContent = seller.gstin;
      $("#invSellerEmail").textContent = seller.email;
      $("#invSellerPhone").textContent = seller.phone;

      document.title = `Invoice #${inv.id} — debasish.`;
      $("#invId").textContent = "#" + inv.id;
      $("#invDate").textContent = new Date(String(inv.createdAt).replace(" ", "T") + "Z")
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const st = $("#invStatus");
      st.textContent = inv.status;
      st.className = "inv-status " + inv.status;

      $("#invCustName").textContent = inv.customer.name;
      $("#invCustPhone").textContent = inv.customer.phone;
      $("#invCustAddr").textContent = inv.customer.address || "Address not provided (COD/UPI on delivery)";
      $("#invPayment").textContent = inv.payment === "upi" ? "UPI on Delivery" : "Cash on Delivery";
      if (inv.coupon) {
        $("#invCouponRow").hidden = false;
        $("#invCoupon").textContent = inv.coupon;
        $("#invDiscount").textContent = inr(inv.discount);
      }

      $("#invItems").innerHTML = inv.items.map((it, i) => `
        <tr><td>${i + 1}</td><td>${esc(it.name)}</td><td class="c">${it.qty}</td><td class="c">${inr(it.price)}</td><td>${inr(it.lineTotal)}</td></tr>`).join("");

      $("#invSub").textContent = inr(inv.subtotal);
      if (inv.discount > 0) {
        $("#invDiscountRow").hidden = false;
        $("#invDiscount2").textContent = inr(inv.discount);
      }
      $("#invDelivery").textContent = inv.delivery === 0 ? "FREE" : inr(inv.delivery);
      $("#invGst").textContent = inr(inv.gstIncluded);
      $("#invTotal").textContent = inr(inv.total);
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
