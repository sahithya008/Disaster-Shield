document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("home-notification-form");
  if (!form) return;

  const status = document.getElementById("home-alert-status");
  const chatIdInput = document.getElementById("home-alert-telegram-chat-id");
  const telegramOption = form.querySelector('input[name="home-alert-channel"][value="telegram"]');
  const backendBase = window.__BACKEND_URL__
    ? window.__BACKEND_URL__.replace(/\/+$/, "")
    : (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? `${window.location.protocol}//${window.location.hostname}:5000`
      : window.location.origin;

  const syncTelegramRequirement = () => { chatIdInput.required = telegramOption.checked; };
  telegramOption.addEventListener("change", syncTelegramRequirement);
  syncTelegramRequirement();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const channels = [...form.querySelectorAll('input[name="home-alert-channel"]:checked')].map((input) => input.value);
    if (!channels.length) {
      status.dataset.state = "error";
      status.textContent = "Choose at least one delivery method.";
      return;
    }

    const payload = {
      email: document.getElementById("home-alert-email").value.trim(),
      telegram_chat_id: chatIdInput.value.trim(),
      district: document.getElementById("home-alert-district").value.trim(),
      state: document.getElementById("home-alert-state").value.trim(),
      categories: [document.getElementById("home-alert-type").value],
      channels,
      consent: document.getElementById("home-alert-consent").checked,
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.dataset.state = "";
    status.textContent = "Saving your alert signup...";
    try {
      const response = await fetch(`${backendBase}/api/notifications/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Could not save your alert signup.");
      status.dataset.state = "success";
      status.textContent = result.message;
      form.reset();
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = error.message || "Notification service is unavailable. Check that the backend is running.";
    } finally {
      button.disabled = false;
    }
  });
});
