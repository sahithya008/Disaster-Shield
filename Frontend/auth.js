document.addEventListener("DOMContentLoaded", () => {
  const registerMode = window.location.pathname.endsWith("/register");
  const form = document.getElementById("auth-form");
  const password = document.getElementById("auth-password");
  const status = document.getElementById("auth-status");
  const button = document.getElementById("auth-submit");
  const switchLink = document.getElementById("auth-switch-link");
  const apiBase = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : window.location.origin;
  const returnTo = new URLSearchParams(window.location.search).get("return_to") || "";
  const safeReturnTo = () => {
    if (!returnTo) return `${apiBase}/`;
    try {
      const target = new URL(returnTo);
      const sameOrigin = target.origin === window.location.origin;
      const localFrontend = ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && target.hostname === window.location.hostname
        && ["5500", "8000", "8080"].includes(target.port)
        && target.protocol === window.location.protocol;
      return sameOrigin || localFrontend ? target.href : `${apiBase}/`;
    } catch (_) {
      return `${apiBase}/`;
    }
  };
  document.getElementById("auth-title").textContent = registerMode ? "Create your account" : "Welcome back";
  document.getElementById("auth-description").textContent = registerMode
    ? "Sign up to analyze locations and manage your alert subscriptions."
    : "Log in to view your dashboard and manage your alert subscriptions.";
  document.getElementById("auth-switch-copy").textContent = registerMode ? "Already have an account?" : "New to Disaster Shield?";
  switchLink.textContent = registerMode ? "Log in" : "Create an account";
  const next = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";
  switchLink.href = `${apiBase}/${registerMode ? "login" : "register"}${next}`;
  password.autocomplete = registerMode ? "new-password" : "current-password";
  if (!registerMode) document.getElementById("password-hint").classList.add("hidden");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = "";
    try {
      const response = await fetch(`${apiBase}/api/auth/${registerMode ? "register" : "login"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("auth-email").value.trim(),
          password: password.value,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Could not sign in.");
      localStorage.setItem("disasterShieldUserId", result.user.id);
      localStorage.setItem("disasterShieldUserEmail", result.user.email);
      window.location.assign(safeReturnTo());
    } catch (error) {
      status.textContent = error.message || "Account service is unavailable.";
    } finally {
      button.disabled = false;
    }
  });
});
