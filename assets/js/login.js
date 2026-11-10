/* /login.html — email OTP sign-in and account registration */
(function () {
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const rawNext = params.get("next") || "";
  const next = /^[\w./-]+\.html(\?.*)?$/.test(rawNext) && !rawNext.includes("..") ? rawNext : null;

  const heading = $("#authHeading");
  const kicker = $("#authKicker");
  const cardSub = $("#authCardSub");
  const errEl = $("#authError");
  const statusEl = $("#authStatus");
  const tabLogin = $("#tabLogin");
  const tabRegister = $("#tabRegister");
  const otpForm = $("#formOtp");
  const formRegister = $("#formRegister");
  const emailInput = $("#otp-identifier");
  const codeInput = $("#otp-code");
  const codeStep = $("#otpCodeStep");
  const sendButton = $("#otp-send");
  const verifyButton = $("#otp-submit");
  const resendButton = $("#otp-resend");
  const changeEmailButton = $("#otpChangeEmail");
  const showError = (msg) => { errEl.textContent = msg || ""; };
  const showStatus = (msg) => { statusEl.textContent = msg || ""; };
  let mode = "login";
  let resendTimer = null;
  let requestPending = false;

  const clearResendTimer = () => {
    if (resendTimer !== null) window.clearInterval(resendTimer);
    resendTimer = null;
  };

  const resetOtp = (clearEmail = false) => {
    clearResendTimer();
    codeStep.hidden = true;
    $("#otpCodeHelp").textContent = "Enter the code from your email. It expires in 10 minutes.";
    emailInput.closest(".field").hidden = false;
    emailInput.readOnly = false;
    codeInput.required = false;
    codeInput.value = "";
    sendButton.hidden = false;
    sendButton.disabled = false;
    sendButton.innerHTML = 'Email me a sign-in code <span aria-hidden="true">→</span>';
    verifyButton.hidden = true;
    verifyButton.disabled = false;
    verifyButton.innerHTML = 'Verify code &amp; sign in <span aria-hidden="true">→</span>';
    resendButton.hidden = true;
    resendButton.disabled = false;
    resendButton.textContent = "Send a new code";
    if (clearEmail) emailInput.value = "";
  };

  const setMode = (value) => {
    mode = value;
    const login = mode === "login";
    tabLogin.classList.toggle("is-active", login);
    tabRegister.classList.toggle("is-active", !login);
    tabLogin.setAttribute("aria-selected", String(login));
    tabRegister.setAttribute("aria-selected", String(!login));
    otpForm.dataset.hidden = String(!login);
    formRegister.dataset.hidden = String(login);
    kicker.textContent = login ? "YOUR ACCOUNT" : "JOIN THE STORE";
    heading.textContent = login ? "Welcome back" : "Create your account";
    cardSub.textContent = login
      ? "Enter your email and we’ll send you a secure sign-in code."
      : "Set up an account to keep your orders and details together.";
    resetOtp();
    showError("");
    showStatus("");
  };

  const destFor = (user) => next || (user.role === "admin" ? "admin.html" : "dashboard.html");
  const signIn = (user) => { location.href = destFor(user); };
  const otpIdentifier = () => emailInput.value.trim();

  const startResendCountdown = () => {
    clearResendTimer();
    let remaining = 30;
    resendButton.disabled = true;
    resendButton.textContent = `Send a new code in ${remaining}s`;
    resendTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearResendTimer();
        resendButton.disabled = false;
        resendButton.textContent = "Send a new code";
        return;
      }
      resendButton.textContent = `Send a new code in ${remaining}s`;
    }, 1000);
  };

  const requestCode = async (resend = false) => {
    showError("");
    showStatus("");
    if (!resend && !emailInput.reportValidity()) return;

    const button = resend ? resendButton : sendButton;
    requestPending = true;
    tabLogin.disabled = true;
    tabRegister.disabled = true;
    changeEmailButton.disabled = true;
    button.disabled = true;
    if (!resend) {
      codeStep.hidden = false;
      codeInput.required = true;
      codeInput.value = "";
      emailInput.readOnly = true;
      sendButton.hidden = true;
      verifyButton.hidden = false;
      verifyButton.disabled = true;
      resendButton.hidden = false;
      resendButton.textContent = "Sending code…";
      resendButton.disabled = true;
      codeInput.focus();
    } else {
      resendButton.textContent = "Sending a new code…";
    }
    showStatus("Sending your sign-in code. You can enter it as soon as it arrives.");
    try {
      await window.UI.fetchJSON("api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ identifier: otpIdentifier() }),
      });
      requestPending = false;
      tabLogin.disabled = false;
      tabRegister.disabled = false;
      changeEmailButton.disabled = false;
      verifyButton.disabled = false;
      showStatus(`If an account exists for ${otpIdentifier()}, a sign-in code has been sent. Check your inbox and spam folder.`);
      startResendCountdown();
    } catch (error) {
      requestPending = false;
      tabLogin.disabled = false;
      tabRegister.disabled = false;
      changeEmailButton.disabled = false;
      showError(error.message);
      showStatus("");
      verifyButton.disabled = true;
      resendButton.disabled = false;
      resendButton.textContent = "Try sending the code again";
      if (!resend) codeInput.focus();
    }
  };

  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));
  changeEmailButton.addEventListener("click", () => {
    if (requestPending) return;
    resetOtp();
    showError("");
    showStatus("");
    emailInput.focus();
  });
  sendButton.addEventListener("click", () => requestCode());
  resendButton.addEventListener("click", () => requestCode(true));

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  });

  otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    if (!codeInput.reportValidity()) return;
    verifyButton.disabled = true;
    verifyButton.textContent = "Verifying code…";
    try {
      const data = await window.UI.fetchJSON("api/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ identifier: otpIdentifier(), code: codeInput.value }),
      });
      clearResendTimer();
      signIn(data.user);
    } catch (error) {
      showError(error.message);
      verifyButton.disabled = false;
      verifyButton.innerHTML = 'Verify code &amp; sign in <span aria-hidden="true">→</span>';
      codeInput.focus();
    }
  });

  formRegister.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    showStatus("");
    if (!formRegister.reportValidity()) return;
    const button = $("#re-submit");
    button.disabled = true;
    button.textContent = "Creating your account…";
    try {
      const data = await window.UI.fetchJSON("api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: $("#re-name").value,
          username: $("#re-username").value,
          email: $("#re-email").value,
          phone: $("#re-phone").value,
          password: $("#re-password").value,
        }),
      });
      signIn(data.user);
    } catch (error) {
      showError(error.message);
      button.disabled = false;
      button.innerHTML = 'Create account <span aria-hidden="true">→</span>';
    }
  });

  if (location.hash === "#create") setMode("register");

  (async () => {
    try {
      const response = await fetch("api/me");
      const data = await response.json();
      if (data.user) location.replace(destFor(data.user));
    } catch {
      // Keep the sign-in form available when the status endpoint is unavailable.
    }
  })();
})();
