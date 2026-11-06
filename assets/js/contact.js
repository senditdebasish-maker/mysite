/* /contact.html — brief form → saves the lead + opens WhatsApp (same as the home contact section) */
(function () {
  const SITE = { whatsapp: "910000000000", brand: "Debasish Das", phoneDisplay: "+91 00000 00000", email: "hello@example.com", location: "Kolkata, West Bengal, India", hours: "Mon–Sat · 9 AM – 8 PM IST" };
  const $ = (s) => document.querySelector(s);
  const waLink = (t) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(t)}`;

  // wire the channels from the same SITE config
  $("#waChannel").href = waLink(`Hi ${SITE.brand}! I found your website and would like to talk.`);
  $("#waChannelSub").textContent = `${SITE.phoneDisplay} · usually replies in minutes`;
  $("#callChannel").href = `tel:+91${SITE.whatsapp.replace(/^91/, "")}`;
  $("#callChannelSub").textContent = SITE.phoneDisplay;
  $("#emailChannel").href = `mailto:${SITE.email}`;
  $("#emailChannelSub").textContent = SITE.email;
  $("#locationLine").textContent = `${SITE.location} · ${SITE.hours}`;

  const toast = (html) => { const t = $("#toast"); if (!t) return; t.innerHTML = html; t.classList.add("is-show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("is-show"), 2600); };

  $("#callForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#f-name"), need = $("#f-need"), phone = $("#f-phone"), msg = $("#f-msg"), budget = $("#f-budget");
    if (!name.value.trim()) { name.focus(); toast("Please tell me your name"); return; }
    if (!need.value)        { need.focus(); toast("Please choose what you need"); return; }
    const payload = { name: name.value.trim(), phone: phone.value.trim(), need: need.value, budget: budget.value, message: msg.value.trim() };
    // save the lead for the admin dashboard (fire-and-forget, never blocks WhatsApp)
    fetch("api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    const text = [
      `Hi ${SITE.brand}! I'm ${payload.name}.`,
      `Need: ${payload.need}`,
      `Budget: ${payload.budget}`,
      payload.phone ? `Phone: ${payload.phone}` : null,
      payload.message ? `Details: ${payload.message}` : null,
    ].filter(Boolean).join("\n");
    window.open(waLink(text), "_blank", "noopener");
    toast("<b>Opening WhatsApp…</b> also saved in my inbox");
    e.target.reset();
  });
})();
