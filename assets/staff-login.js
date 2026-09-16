const form = document.querySelector("[data-staff-login-form]");
const passwordInput = form?.elements.namedItem("password");
const submitButton = form?.querySelector('button[type="submit"]');
const errorMessage = document.querySelector("[data-staff-login-error]");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(passwordInput instanceof HTMLInputElement) || !submitButton || !errorMessage) return;

  submitButton.disabled = true;
  submitButton.textContent = "Verificando…";
  errorMessage.textContent = "";

  try {
    const response = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo iniciar sesión");
    window.location.replace("/admin");
  } catch (error) {
    passwordInput.value = "";
    passwordInput.focus();
    errorMessage.textContent = error?.message || "No se pudo iniciar sesión";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Entrar al panel";
  }
});
