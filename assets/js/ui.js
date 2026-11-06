/* Shared helpers for /login · /dashboard · /admin (plain JS, no deps) */
window.UI = (function () {
  function toast(html) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.innerHTML = html;
    el.classList.add("show");
    clearTimeout(el.__t);
    el.__t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

  const dt = (iso) => {
    try {
      const d = new Date(String(iso).replace(" ", "T") + (String(iso).includes("Z") ? "" : "Z"));
      return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return String(iso || ""); }
  };
  const monthYear = (iso) => {
    try {
      const d = new Date(String(iso).replace(" ", "T") + (String(iso).includes("Z") ? "" : "Z"));
      return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
    } catch { return ""; }
  };

  function bindLogout(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try { await fetch("api/auth/logout", { method: "POST" }); } catch {}
      location.href = "login.html";
    });
  }

  const statusLabel = { pending: "Pending", confirmed: "Confirmed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  return { toast, fetchJSON, inr, dt, monthYear, bindLogout, statusLabel, esc };
})();
