/* /login.html — sign in & create account */
(function () {
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || null;

  const heading = $("#authHeading"), cardSub = $("#authCardSub"), errEl = $("#authError");
  const tabLogin = $("#tabLogin"), tabRegister = $("#tabRegister");
  const formLogin = $("#formLogin"), formRegister = $("#formRegister");

  const showError = (msg) => { errEl.textContent = msg || ""; };
  const setMode = (mode) => {
    const login = mode === "login";
    tabLogin.classList.toggle("is-active", login);
    tabRegister.classList.toggle("is-active", !login);
    tabLogin.setAttribute("aria-selected", String(login));
    tabRegister.setAttribute("aria-selected", String(!login));
    formLogin.dataset.hidden = String(!login);
    formRegister.dataset.hidden = String(login);
    heading.textContent = login ? "Welcome back" : "Create your account";
    cardSub.textContent = login ? "Sign in to your account to see orders & more." : "It takes 30 seconds — then track every order.";
    showError("");
  };
  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));

  // deep-link: /login.html#create → open the register tab
  if (location.hash === "#create") setMode("register");

  // demo quick-fill
  $("#fillAdmin").addEventListener("click", () => {
    setMode("login");
    $("#li-email").value = "admin@debasishdas.in";
    $("#li-password").value = "admin123";
  });
  $("#fillCustomer").addEventListener("click", () => {
    setMode("login");
    $("#li-email").value = "rohit@demo.in";
    $("#li-password").value = "customer123";
  });

  const destFor = (user) => next || (user.role === "admin" ? "/admin.html" : "/dashboard.html");

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const btn = $("#li-submit"); btn.disabled = true; btn.textContent = "Signing in…";
    try {
      const data = await window.UI.fetchJSON("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: $("#li-email").value, password: $("#li-password").value }),
      });
      location.href = destFor(data.user);
    } catch (err) {
      showError(err.message);
      btn.disabled = false; btn.textContent = "Sign in →";
    }
  });

  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const btn = $("#re-submit"); btn.disabled = true; btn.textContent = "Creating…";
    try {
      const data = await window.UI.fetchJSON("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: $("#re-name").value, email: $("#re-email").value,
          phone: $("#re-phone").value, password: $("#re-password").value,
        }),
      });
      location.href = destFor(data.user);
    } catch (err) {
      showError(err.message);
      btn.disabled = false; btn.textContent = "Create account →";
    }
  });

  // already signed in? bounce to the right place
  (async () => {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (data.user) location.replace(destFor(data.user));
    } catch { /* stay on login */ }
  })();
})();
