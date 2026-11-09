/* /setup.html — first-run installer & post-install reconfigurator (admin-only) */
(function () {
  const { toast, fetchJSON, inr, esc } = window.UI;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  /* API base: default "api" next to this page. If your live server mounts the
     app under a subpath (or proxies /api elsewhere), open the wizard as
     /setup.html?api=/your/subpath/api */
  const API_BASE = (new URLSearchParams(location.search).get("api") || "api").replace(/\/+$/, "");
  const apiUrl = (p) => `${API_BASE}/${String(p).replace(/^\/+/, "")}`;
  let status = null;

  const bytes = (n) => n == null ? "—" : n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const num = (n) => Number(n || 0).toLocaleString("en-IN");
  const busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = label || "Working…"; }
    else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
  };
  const flashSaved = (id) => { const el = $(id); if (el) { el.hidden = false; setTimeout(() => (el.hidden = true), 1800); } };

  const backupBtn = $("#backupBtn"); if (backupBtn) backupBtn.setAttribute("href", apiUrl("admin/backup"));

  const statusUrl = () => new URL(apiUrl("setup/status"), location.href).href;
  function showSetupError(e) {
    $("#setupHeading").textContent = "Setup unavailable";
    const pill = $("#setupPill"); pill.textContent = e.status === 403 ? "Admins only" : "Not connected"; pill.classList.remove("is-done");
    $$(".setup-card, .setup-finish").forEach(el => (el.hidden = true));
    const box = $("#setupTrouble");
    box.hidden = false;
    const msg = $("#troubleMsg");
    const link = $("#troubleStatusUrl");
    link.textContent = statusUrl();
    link.href = statusUrl();
    if (e.status === 404) {
      msg.innerHTML = "The setup API answered <strong>404</strong> — this page is being served <strong>without the Node backend</strong>. Common causes: a static host (GitHub Pages / Netlify), an old build, or `setup.html` uploaded without the new `server/server.js`.";
    } else if (e.status === 403) {
      msg.innerHTML = "Setup is already complete. <a href='login.html?next=/setup.html'>Sign in as admin</a> to change these settings.";
    } else {
      msg.innerHTML = "Could not reach the server (" + esc(e.message || "network error") + "). Check that the Node app is running and that your proxy forwards <code>/api/*</code> to it.";
    }
  }

  async function loadStatus() {
    try { status = await fetchJSON(apiUrl("setup/status")); }
    catch (e) { showSetupError(e); return; }
    $("#setupTrouble").hidden = true;
    hydrate();
  }

  function hydrate() {
    const installed = !!status.installed;
    $("#setupPill").textContent = installed ? "Setup complete — admin mode" : "First-run installer";
    $("#setupPill").classList.toggle("is-done", installed);
    $("#setupAdminLink").hidden = !installed;
    $("#setupHeading").textContent = installed ? "Site setup — admin" : "Let's set up your site";
    $("#setupLede").innerHTML = installed
      ? "You're signed in as admin. Every change applies immediately — including the database path."
      : "Five short steps. When you press <strong>Complete setup</strong>, the site opens to the public and this wizard locks behind your admin login.";

    // finish block
    $("#completeBtn").hidden = installed;
    $("#finishPreview").hidden = !installed;
    $("#finishTitle").textContent = installed ? "Setup is complete ✓" : "Ready to go live?";
    $("#finishSub").textContent = installed
      ? "The public site is open. This page stays available to signed-in admins only."
      : "Completing setup opens the site to the public and locks this wizard behind your admin login.";

    // ── database ──
    $("#dbEngine").textContent = status.engine || "SQLite";
    $("#dbCurrent").textContent = status.path || "—";
    $("#dbSize").textContent = bytes(status.size);
    const c = status.counts || {};
    $("#dbCounts").textContent = `${num(c.products)} products · ${num(c.users)} users · ${num(c.orders)} orders · ${num(c.reviews)} reviews`;
    $("#dbPath").value = status.path || "";
    $("#dbPath").disabled = !!status.envLocked;
    $("#dbApplyBtn").disabled = !!status.envLocked;
    $("#dbEnvLock").hidden = !status.envLocked;
    $("#dbTestResult").textContent = "";
    syncResetVisibility();

    // ── identity ──
    const s = status.settings || {};
    $("#siteBrand").value = s.brand || "";
    $("#siteTagline").value = s.tagline || "";
    $("#siteAddress").value = s.address || "";
    $("#siteGstin").value = s.gstin || "";
    $("#siteEmail").value = s.email || "";
    $("#sitePhone").value = s.phone || "";
    $("#siteWhatsapp").value = s.whatsapp || "";

    // ── admin ──
    $("#admEmail").value = "";

    // ── storefront ──
    const st = status.store || {};
    $("#stAnnounce").value = st.announce || "";
    $("#stFreeAt").value = st.freeAt ?? 999;
    $("#stFee").value = st.deliveryFee ?? 49;
    $("#stMaxQty").value = st.maxQty ?? 99;
    $("#stCodMin").value = st.codMin ?? 0;
    $("#stCod").checked = !!st.codEnabled;
    $("#stLive").checked = st.storeLive !== false;
  }

  const selectedMode = () => (document.querySelector('input[name="dbMode"]:checked') || {}).value || "demo";
  const existingData = () => { const c = (status && status.counts) || {}; return Number(c.users || 0) + Number(c.products || 0) > 0; };
  function syncResetVisibility() {
    // "erase" only matters when the chosen target may hold data
    $("#dbResetWrap").hidden = !existingData() && selectedMode() !== "empty";
  }

  // ════════ STEP 1 · database ════════
  $$('input[name="dbMode"]').forEach(r => r.addEventListener("change", syncResetVisibility));
  $("#dbPath").addEventListener("input", () => { $("#dbResetWrap").hidden = true; $("#dbTestResult").textContent = ""; });

  $("#dbTestBtn").addEventListener("click", async () => {
    const btn = $("#dbTestBtn"); const out = $("#dbTestResult");
    busy(btn, true, "Testing…"); out.textContent = ""; out.className = "setup-testresult";
    try {
      const r = await fetchJSON(apiUrl("setup/test-db"), { method: "POST", body: JSON.stringify({ path: $("#dbPath").value }) });
      out.classList.add("ok");
      out.textContent = r.counts
        ? `✓ Reachable — holds ${num(r.counts.users)} users, ${num(r.counts.products)} products, ${num(r.counts.orders)} orders`
        : "✓ Reachable — new empty database will be created";
    } catch (e) { out.classList.add("bad"); out.textContent = "✗ " + e.message; }
    finally { busy(btn, false); }
  });

  $("#dbApplyBtn").addEventListener("click", async () => {
    const btn = $("#dbApplyBtn"); const mode = selectedMode();
    const payload = { path: $("#dbPath").value, mode, confirmReset: $("#dbReset").checked };
    busy(btn, true, "Applying…");
    try {
      const r = await fetchJSON(apiUrl("setup/database"), { method: "POST", body: JSON.stringify(payload) });
      toast(`<strong>Database ready</strong> — ${r.seeded === "empty" ? "clean install" : r.seeded === "demo" ? "demo catalogue loaded" : "existing data kept"}`);
      await loadStatus();
      $("#dbApplyHint").textContent = "Applied at " + new Date().toLocaleTimeString("en-IN");
    } catch (e) {
      if (e.status === 409) { $("#dbResetWrap").hidden = false; toast("<strong>Existing data found</strong> — tick the erase box to confirm a wipe"); }
      else toast("<strong>Database not changed</strong> — " + esc(e.message));
    } finally { busy(btn, false); }
  });

  // ════════ STEP 2 · identity ════════
  $("#siteSaveBtn").addEventListener("click", async () => {
    const btn = $("#siteSaveBtn"); busy(btn, true, "Saving…");
    try {
      await fetchJSON(apiUrl("setup/site"), { method: "POST", body: JSON.stringify({
        brand: $("#siteBrand").value, tagline: $("#siteTagline").value, address: $("#siteAddress").value,
        gstin: $("#siteGstin").value, email: $("#siteEmail").value, phone: $("#sitePhone").value, whatsapp: $("#siteWhatsapp").value,
      }) });
      flashSaved("#siteSaved"); toast("<strong>Identity saved</strong> — invoices &amp; contact links updated");
    } catch (e) { toast("<strong>Not saved</strong> — " + esc(e.message)); }
    finally { busy(btn, false); }
  });

  // ════════ STEP 3 · admin ════════
  const pwScore = (pw) => { let s = 0; if (pw.length >= 8) s++; if (/[A-Z]/.test(pw)) s++; if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++; if (pw.length >= 12) s++; return s; };
  const pwFill = $("#pwFill");
  $("#admPassword").addEventListener("input", (e) => {
    const s = pwScore(e.target.value);
    pwFill.style.width = (s / 5 * 100) + "%";
    pwFill.className = s <= 1 ? "weak" : s <= 3 ? "mid" : "strong";
  });

  $("#adminSaveBtn").addEventListener("click", async () => {
    const btn = $("#adminSaveBtn");
    const pw = $("#admPassword").value, confirm = $("#admConfirm").value;
    if (pw !== confirm) return toast("<strong>Passwords don't match</strong>");
    busy(btn, true, "Saving…");
    try {
      const r = await fetchJSON(apiUrl("setup/admin"), { method: "POST", body: JSON.stringify({
        name: $("#admName").value, phone: $("#admPhone").value, email: $("#admEmail").value, password: pw,
      }) });
      $("#admPassword").value = ""; $("#admConfirm").value = ""; pwFill.style.width = "0";
      flashSaved("#adminSaved");
      toast(r.updated ? "<strong>Admin updated</strong> — password changed" : "<strong>Admin created</strong> — sign in with these credentials");
    } catch (e) { toast("<strong>Not saved</strong> — " + esc(e.message)); }
    finally { busy(btn, false); }
  });

  // ════════ STEP 4 · storefront ════════
  $("#storeSaveBtn").addEventListener("click", async () => {
    const btn = $("#storeSaveBtn"); busy(btn, true, "Saving…");
    try {
      await fetchJSON(apiUrl("setup/store"), { method: "POST", body: JSON.stringify({
        announce: $("#stAnnounce").value, freeAt: $("#stFreeAt").value, deliveryFee: $("#stFee").value,
        codEnabled: $("#stCod").checked, codMin: $("#stCodMin").value, maxQty: $("#stMaxQty").value, storeLive: $("#stLive").checked,
      }) });
      flashSaved("#storeSaved"); toast("<strong>Storefront rules saved</strong>");
    } catch (e) { toast("<strong>Not saved</strong> — " + esc(e.message)); }
    finally { busy(btn, false); }
  });

  // ════════ STEP 5 · backup / restore ════════
  $("#restoreBtn").addEventListener("click", () => $("#restoreFile").click());
  $("#restoreFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirm(`Restore "${file.name}"? This REPLACES the entire database. A timestamped safety copy is kept. You will be signed out.`)) { e.target.value = ""; return; }
    const btn = $("#restoreBtn"); busy(btn, true, "Restoring…");
    try {
      const res = await fetch(apiUrl("admin/restore"), { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      toast("<strong>Database restored</strong> — signing you out…");
      setTimeout(() => { location.href = "login.html"; }, 1200);
    } catch (err) { toast("<strong>Restore failed</strong> — " + esc(err.message)); busy(btn, false); }
    e.target.value = "";
  });

  // ════════ Finish ════════
  $("#completeBtn").addEventListener("click", async () => {
    const btn = $("#completeBtn");
    if (!confirm("Complete setup? The public site will open and this wizard will lock behind your admin login.")) return;
    busy(btn, true, "Completing…");
    try {
      await fetchJSON(apiUrl("setup/complete"), { method: "POST", body: "{}" });
      toast("<strong>Setup complete</strong> 🎉 — the site is live");
      await loadStatus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { toast("<strong>Could not complete</strong> — " + esc(e.message)); busy(btn, false); }
  });

  const retry = $("#troubleRetry");
  if (retry) retry.addEventListener("click", async () => {
    retry.disabled = true; retry.textContent = "Retrying…";
    await loadStatus();
    retry.disabled = false; retry.textContent = "Retry connection";
  });

  loadStatus();
})();
