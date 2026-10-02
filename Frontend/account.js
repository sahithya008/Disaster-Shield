document.addEventListener("DOMContentLoaded", async () => {
  const apiBase = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : window.location.origin;
  const loginUrl = () => `${apiBase}/login?return_to=${encodeURIComponent(window.location.origin + window.location.pathname)}`;
  try {
    const response = await fetch(`${apiBase}/api/auth/me`, { credentials: "include" });
    const result = await response.json();
    if (!result.authenticated || !result.user) {
      localStorage.removeItem("disasterShieldUserId");
      localStorage.removeItem("disasterShieldUserEmail");
      window.location.assign(loginUrl());
      return;
    }
    localStorage.setItem("disasterShieldUserId", result.user.id);
    localStorage.setItem("disasterShieldUserEmail", result.user.email);
    for (const id of ["home-alert-email", "subscribe-email"]) {
      const field = document.getElementById(id);
      if (field) {
        field.value = result.user.email;
        field.readOnly = true;
      }
    }
    const toolbar = document.createElement("div");
    toolbar.className = "account-toolbar";
    const label = document.createElement("span");
    label.textContent = result.user.email;
    const logout = document.createElement("button");
    logout.type = "button";
    logout.textContent = "Log out";
    logout.addEventListener("click", async () => {
      await fetch(`${apiBase}/api/auth/logout`, { method: "POST", credentials: "include" });
      localStorage.removeItem("disasterShieldUserId");
      localStorage.removeItem("disasterShieldUserEmail");
      window.location.assign(loginUrl());
    });
    toolbar.append(label, logout);
    document.body.appendChild(toolbar);
  } catch (_) {
    // Keep the static frontend visible when the account API is unavailable.
  }
});
