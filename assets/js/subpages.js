/* Shared chrome for the dedicated pages (Services · Hosting · Store · Contact)
   · mobile menu toggle · live cart badge · auth-aware Login / account chip · year */
(function () {
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ── mobile menu ── */
  const burger = $("#hamburger"), menu = $("#pageMobileMenu");
  if (burger && menu) {
    const close = () => { menu.hidden = true; burger.setAttribute("aria-expanded", "false"); };
    burger.addEventListener("click", () => {
      const open = burger.getAttribute("aria-expanded") === "true";
      menu.hidden = open; burger.setAttribute("aria-expanded", String(!open));
    });
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  /* ── live cart badge (shared localStorage key with the rest of the site) ── */
  const badge = $("#cartBadge");
  if (badge) {
    let n = 0;
    try { const cart = JSON.parse(localStorage.getItem("dd_cart_v1") || "[]"); n = cart.reduce((s, i) => s + (Number(i.qty) || 0), 0); } catch {}
    badge.textContent = String(n);
  }

  /* ── auth-aware nav (mirrors the home page) ── */
  const loginBtn = $("#navLogin"), account = $("#navAccount"), mobileLogin = $("#mobileLogin");
  (async () => {
    let me = null;
    try { const res = await fetch("api/me"); const data = await res.json(); me = data.user || null; } catch {}
    const dest = me ? (me.role === "admin" ? "admin.html" : "dashboard.html") : null;
    if (me) {
      if (loginBtn) loginBtn.hidden = true;
      if (account) {
        account.hidden = false;
        account.href = dest;
        const first = (me.name || "U").trim().split(/\s+/)[0];
        const initial = $("#navAccountInitial"); if (initial) initial.textContent = first.charAt(0).toUpperCase();
        const name = $("#navAccountName"); if (name) name.textContent = first;
      }
      if (mobileLogin) { mobileLogin.href = dest; mobileLogin.firstChild.textContent = me.role === "admin" ? "Admin Dashboard " : "My Dashboard "; }
    } else {
      if (loginBtn) loginBtn.hidden = false;
      if (account) account.hidden = true;
      if (mobileLogin) { mobileLogin.href = "login.html"; mobileLogin.firstChild.textContent = "Login / Sign up "; }
    }
  })();

  /* ── footer year ── */
  const y = $("#yearNow"); if (y) y.textContent = String(new Date().getFullYear());
})();
