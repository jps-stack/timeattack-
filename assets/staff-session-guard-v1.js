const nativeFetch = window.fetch.bind(window);
let redirecting = false;

function isStaffPanel() {
  return window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
}

function redirectToLogin() {
  if (!isStaffPanel() || redirecting) return;
  redirecting = true;
  window.location.replace("/admin?session=expired");
}

window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  const requestUrl = new URL(
    typeof args[0] === "string" || args[0] instanceof URL ? args[0] : args[0].url,
    window.location.href
  );

  if (
    isStaffPanel() &&
    requestUrl.origin === window.location.origin &&
    requestUrl.pathname.startsWith("/api/") &&
    response.status === 401
  ) {
    redirectToLogin();
  }
  return response;
};

async function verifyStaffSession() {
  if (!isStaffPanel() || redirecting) return;
  try {
    const response = await nativeFetch("/api/staff/session", { cache: "no-store" });
    if (!response.ok) return;
    const session = await response.json();
    if (!session.authenticated) redirectToLogin();
  } catch {
    // A temporary network failure should not close an otherwise valid session.
  }
}

window.addEventListener("focus", verifyStaffSession);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") verifyStaffSession();
});
window.setInterval(verifyStaffSession, 60_000);
