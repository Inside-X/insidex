export function initHeader() {
  // Menu mobile
  const menuBtn = document.getElementById("menuBtn");
  const mobileNav = document.getElementById("mobileNav");
  menuBtn.addEventListener("click", () => {
    mobileNav.classList.toggle("open");
    mobileNav.setAttribute("aria-hidden", mobileNav.classList.contains("open") ? "false" : "true");
  });

  // Placeholders recherche / compte
  document.getElementById("searchBtn").addEventListener("click", () => {
    alert("🔎 La recherche arrive bientôt !");
  });
  document.getElementById("accountBtn").addEventListener("click", () => {
    alert("👤 Espace compte bientôt disponible !");
  });
}
``