/* /setup.html — XAMPP/MySQL first-run installer */
(function () {
  const { toast, fetchJSON, esc } = window.UI;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const apiUrl = (path) => `api/${String(path).replace(/^\/+/, "")}`;
  let status = null;

  const busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = label || "Working…"; }
    else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
  };
  const flashSaved = (id) => {
    const el = $(id);
    if (el) { el.hidden = false; setTimeout(() => { el.hidden = true; }, 2500); }
  };
  const num = (n) => Number(n || 0).toLocaleString("en-IN");
  const dbConnectionMode = () => $('input[name="dbConnectionMode"]:checked')?.value || "create";
  function updateDbConnectionMode() {
    const create = dbConnectionMode() === "create";
    $("#dbNameLabel").textContent = create ? "New database name" : "Existing database name";
    $("#dbName").placeholder = create ? "For example, mysite_store" : "The database created for this site";
    $("#dbConnectionHint").innerHTML = create
      ? 'Creates a new database, then creates the app tables. Existing databases are never overwritten or deleted. Credentials are stored in the protected <code>data/install.json</code> file.'
      : 'Connects to the database you enter and keeps its existing app data. The MySQL user needs permission to create tables inside it. Credentials are stored in the protected <code>data/install.json</code> file.';
    $("#dbTestBtn").textContent = create ? "Test server connection" : "Test database connection";
    $("#dbApplyBtn").textContent = create ? "Create database & prepare tables" : "Connect & prepare tables";
  }
  const dbPayload = () => {
    const payload = {
      host: $("#dbHost").value.trim(),
      port: $("#dbPort").value,
      database: $("#dbName").value.trim(),
      username: $("#dbUser").value.trim(),
      databaseMode: dbConnectionMode(),
    };
    const password = $("#dbPassword").value;
    if (password !== "" || !status?.configured) payload.password = password;
    return payload;
  };

  function showSetupError(error) {
    $("#setupHeading").textContent = "Setup unavailable";
    const pill = $("#setupPill");
    pill.textContent = error.status === 403 ? "Admins only" : "Not connected";
    pill.classList.remove("is-done");
    $$(".setup-card, .setup-finish").forEach((el) => { el.hidden = true; });
    $("#setupTrouble").hidden = false;
    $("#troubleStatusUrl").textContent = new URL(apiUrl("setup/status"), location.href).href;
    $("#troubleStatusUrl").href = new URL(apiUrl("setup/status"), location.href).href;
    if (error.status === 403) {
      $("#troubleMsg").innerHTML = "Setup is complete. <a href='login.html?next=/setup.html'>Sign in as admin</a> to change these settings.";
    } else {
      $("#troubleMsg").textContent = `Could not connect to the XAMPP PHP API: ${error.message || "server unavailable"}. Start Apache in the XAMPP Control Panel and check that the project is in htdocs.`;
    }
  }

  async function loadStatus() {
    try {
      status = await fetchJSON(apiUrl("setup/status"));
      $("#setupTrouble").hidden = true;
      $$(".setup-card, .setup-finish").forEach((el) => { el.hidden = false; });
      hydrate();
    } catch (error) {
      showSetupError(error);
    }
  }

  function hydrate() {
    const installed = !!status.installed;
    $("#setupPill").textContent = installed ? "Setup complete — admin mode" : "First-run installer";
    $("#setupPill").classList.toggle("is-done", installed);
    $("#setupAdminLink").hidden = !installed;
    $("#setupHeading").textContent = installed ? "Site setup — admin" : "Let's set up your site";
    $("#setupLede").innerHTML = installed
      ? "You're signed in as admin. Settings apply to this XAMPP/MySQL installation."
      : "Create a database or connect to an existing one, enter your Gmail details, create your admin account, then complete setup.";
    $("#completeBtn").hidden = installed;
    $("#finishPreview").hidden = !installed;
    $("#finishTitle").textContent = installed ? "Setup is complete ✓" : "Ready to go live?";
    $("#finishSub").textContent = installed
      ? "The public site is open. This page stays available to signed-in admins only."
      : "Complete setup to open the public site and lock this wizard behind your admin login.";

    $("#dbEngine").textContent = status.engine || "MySQL / MariaDB";
    $("#dbCurrent").textContent = status.host || "Not connected";
    $("#dbSize").textContent = status.database || "—";
    const counts = status.counts || {};
    $("#dbCounts").textContent = `${num(counts.products)} products · ${num(counts.users)} users · ${num(counts.orders)} orders · ${num(counts.reviews)} reviews`;
    if (status.configured) {
      $('input[name="dbConnectionMode"][value="existing"]').checked = true;
      $("#dbHost").value = status.host || "";
      $("#dbPort").value = status.port || 3306;
      $("#dbName").value = status.database || "";
      $("#dbUser").value = status.username || "";
      $("#dbPassword").value = "";
      $("#dbApplyHint").textContent = "Connected. Password is not displayed.";
    }
    updateDbConnectionMode();

    const settings = status.settings || {};
    $("#siteBrand").value = settings.brand || "";
    $("#siteTagline").value = settings.tagline || "";
    $("#siteAddress").value = settings.address || "";
    $("#siteGstin").value = settings.gstin || "";
    $("#siteEmail").value = settings.email || "";
    $("#sitePhone").value = settings.phone || "";
    $("#siteWhatsapp").value = settings.whatsapp || "";

    const smtp = status.smtp || {};
    $("#smtpEmail").value = smtp.email || "";
    $("#smtpPassword").value = "";
    $("#smtpStatus").textContent = smtp.configured ? "SMTP configured; password is not displayed." : "SMTP not tested yet.";

    $("#admUsername").value = "";
    $("#admEmail").value = "";
    const store = status.store || {};
    $("#stAnnounce").value = store.announce || "";
    $("#stFreeAt").value = store.freeAt ?? 999;
    $("#stFee").value = store.deliveryFee ?? 49;
    $("#stMaxQty").value = store.maxQty ?? 99;
    $("#stCodMin").value = store.codMin ?? 0;
    $("#stCod").checked = !!store.codEnabled;
    $("#stLive").checked = store.storeLive !== false;
  }

  $("#dbTestBtn").addEventListener("click", async () => {
    const button = $("#dbTestBtn"), result = $("#dbTestResult");
    busy(button, true, "Testing…");
    result.textContent = "";
    result.className = "setup-testresult";
    try {
      const response = await fetchJSON(apiUrl("setup/test-db"), {
        method: "POST", body: JSON.stringify(dbPayload()),
      });
      result.classList.add("ok");
      result.textContent = response.databaseExists === false
        ? `MySQL server connected — “${response.database}” is not in use. CREATE DATABASE permission is checked when you continue.`
        : response.counts
        ? `Connected — ${num(response.counts.users)} users, ${num(response.counts.products)} products, ${num(response.counts.orders)} orders`
        : "Connected — app tables are not present yet.";
    } catch (error) {
      result.classList.add("bad");
      result.textContent = `Connection failed: ${error.message}`;
    } finally { busy(button, false); }
  });

  $("#dbApplyBtn").addEventListener("click", async () => {
    const button = $("#dbApplyBtn");
    busy(button, true, dbConnectionMode() === "create" ? "Creating database…" : "Connecting…");
    try {
      const response = await fetchJSON(apiUrl("setup/database"), {
        method: "POST",
        body: JSON.stringify({ ...dbPayload(), mode: (document.querySelector('input[name="dbMode"]:checked') || {}).value || "demo" }),
      });
      toast(`<strong>${response.created ? "Database created" : "MySQL connected"}</strong> — ${response.seeded === "demo" ? "demo catalogue loaded" : response.seeded === "empty" ? "empty store prepared" : "existing data retained"}`);
      $("#dbPassword").value = "";
      await loadStatus();
    } catch (error) {
      toast(`<strong>Database not changed</strong> — ${esc(error.message)}`);
    } finally { busy(button, false); }
  });

  $("#smtpSaveBtn").addEventListener("click", async () => {
    const button = $("#smtpSaveBtn");
    busy(button, true, "Testing Gmail…");
    try {
      const response = await fetchJSON(apiUrl("setup/smtp"), {
        method: "POST",
        body: JSON.stringify({ email: $("#smtpEmail").value, password: $("#smtpPassword").value }),
      });
      $("#smtpPassword").value = "";
      $("#smtpStatus").textContent = `Test email sent to ${response.email}.`;
      flashSaved("#smtpSaved");
      toast("<strong>Gmail SMTP works</strong> — test email sent");
      await loadStatus();
    } catch (error) {
      $("#smtpStatus").textContent = error.message;
      toast(`<strong>Gmail test failed</strong> — ${esc(error.message)}`);
    } finally { busy(button, false); }
  });

  $("#siteSaveBtn").addEventListener("click", async () => {
    const button = $("#siteSaveBtn"); busy(button, true, "Saving…");
    try {
      await fetchJSON(apiUrl("setup/site"), {
        method: "POST",
        body: JSON.stringify({
          brand: $("#siteBrand").value, tagline: $("#siteTagline").value,
          address: $("#siteAddress").value, gstin: $("#siteGstin").value,
          email: $("#siteEmail").value, phone: $("#sitePhone").value,
          whatsapp: $("#siteWhatsapp").value,
        }),
      });
      flashSaved("#siteSaved");
      toast("<strong>Identity saved</strong>");
    } catch (error) { toast(`<strong>Not saved</strong> — ${esc(error.message)}`); }
    finally { busy(button, false); }
  });

  const pwFill = $("#pwFill");
  $("#admPassword").addEventListener("input", (event) => {
    const password = event.target.value;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length >= 12) score++;
    pwFill.style.width = `${score / 5 * 100}%`;
    pwFill.className = score <= 1 ? "weak" : score <= 3 ? "mid" : "strong";
  });

  $("#adminSaveBtn").addEventListener("click", async () => {
    const button = $("#adminSaveBtn");
    const password = $("#admPassword").value;
    if (password !== $("#admConfirm").value) return toast("<strong>Passwords don't match</strong>");
    busy(button, true, "Saving…");
    try {
      const response = await fetchJSON(apiUrl("setup/admin"), {
        method: "POST",
        body: JSON.stringify({
          name: $("#admName").value, username: $("#admUsername").value,
          phone: $("#admPhone").value, email: $("#admEmail").value, password,
        }),
      });
      $("#admPassword").value = "";
      $("#admConfirm").value = "";
      pwFill.style.width = "0";
      flashSaved("#adminSaved");
      toast(response.updated ? "<strong>Admin updated</strong>" : "<strong>Admin created</strong>");
    } catch (error) { toast(`<strong>Not saved</strong> — ${esc(error.message)}`); }
    finally { busy(button, false); }
  });

  $("#storeSaveBtn").addEventListener("click", async () => {
    const button = $("#storeSaveBtn"); busy(button, true, "Saving…");
    try {
      await fetchJSON(apiUrl("setup/store"), {
        method: "POST",
        body: JSON.stringify({
          announce: $("#stAnnounce").value, freeAt: $("#stFreeAt").value,
          deliveryFee: $("#stFee").value, codEnabled: $("#stCod").checked,
          codMin: $("#stCodMin").value, maxQty: $("#stMaxQty").value,
          storeLive: $("#stLive").checked,
        }),
      });
      flashSaved("#storeSaved");
      toast("<strong>Storefront rules saved</strong>");
    } catch (error) { toast(`<strong>Not saved</strong> — ${esc(error.message)}`); }
    finally { busy(button, false); }
  });

  $("#completeBtn").addEventListener("click", async () => {
    const button = $("#completeBtn");
    if (!confirm("Complete setup? The public site will open and this wizard will lock behind your admin login.")) return;
    busy(button, true, "Completing…");
    try {
      await fetchJSON(apiUrl("setup/complete"), { method: "POST", body: "{}" });
      toast("<strong>Setup complete</strong>");
      await loadStatus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast(`<strong>Could not complete</strong> — ${esc(error.message)}`);
      busy(button, false);
    }
  });

  $("#troubleRetry")?.addEventListener("click", loadStatus);
  $$('input[name="dbConnectionMode"]').forEach((input) => input.addEventListener("change", updateDbConnectionMode));
  updateDbConnectionMode();
  loadStatus();
})();
