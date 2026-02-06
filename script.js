/* Année footer */
document.getElementById("year").textContent =
  new Date().getFullYear().toString();

/* ---------------------------
   Panier simple (localStorage)
---------------------------- */
const CART_KEY = "insidex_cart";
const countEl = document.getElementById("cartCount");

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { items: {} }; }
  catch { return { items: {} }; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function getCartCount(cart) { return Object.values(cart.items).reduce((s, it) => s + it.qty, 0); }
function updateBadge() { countEl.textContent = getCartCount(loadCart()).toString(); }
function addToCart(id, name, price) {
  const cart = loadCart();
  if (!cart.items[id]) cart.items[id] = { name, price: Number(price), qty: 0 };
  cart.items[id].qty += 1;
  saveCart(cart); updateBadge();
}
document.querySelectorAll(".add-to-cart").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.id, name = btn.dataset.product, price = btn.dataset.price;
    addToCart(id, name, price);
    alert(`✅ ${name} ajouté au panier (${price} €)`);
  });
});
updateBadge();

/* ---------------------------
   Menu mobile
---------------------------- */
const menuBtn = document.getElementById("menuBtn");
const mobileNav = document.getElementById("mobileNav");
menuBtn.addEventListener("click", () => {
  mobileNav.classList.toggle("open");
  mobileNav.setAttribute("aria-hidden", mobileNav.classList.contains("open") ? "false" : "true");
});

/* ---------------------------
   Carrousel perspective (C)
   - image centrale nette
   - gauche/droite estompées
   - défilement lent
---------------------------- */
const carousel     = document.getElementById("heroCarousel");
const track        = document.getElementById("carouselTrack");
const items        = Array.from(track.querySelectorAll(".carousel-item"));
const dotsWrap     = document.getElementById("carouselDots");

let current = 0;
const N = items.length;
const INTERVAL_MS = 4000;       // défilement lent
let timer = null;

/* Crée les dots */
items.forEach((_, i) => {
  const b = document.createElement("button");
  b.addEventListener("click", () => goTo(i, true));
  dotsWrap.appendChild(b);
});
const dots = Array.from(dotsWrap.children);

/* Positionnement visuel en 3 états : left / center / right */
function renderCarousel() {
  const leftIdx  = (current - 1 + N) % N;
  const rightIdx = (current + 1) % N;

  items.forEach((el, i) => {
    el.style.transitionTimingFunction = "ease";
    if (i === current) {
      // centre : grand, net
      el.style.opacity   = "1";
      el.style.zIndex    = "3";
      el.style.filter    = "none";
      el.style.transform = "translate(-50%,-50%) translateX(0%) scale(1) rotateY(0deg)";
    } else if (i === leftIdx) {
      // gauche : estompée
      el.style.opacity   = ".85";
      el.style.zIndex    = "2";
      el.style.filter    = "blur(1px) saturate(.95)";
      el.style.transform = "translate(-50%,-50%) translateX(-40%) scale(.86) rotateY(12deg)";
    } else if (i === rightIdx) {
      // droite : estompée
      el.style.opacity   = ".85";
      el.style.zIndex    = "2";
      el.style.filter    = "blur(1px) saturate(.95)";
      el.style.transform = "translate(-50%,-50%) translateX(40%) scale(.86) rotateY(-12deg)";
    } else {
      // autres : discrets, hors champ
      const dirRight = ((i - current + N) % N) < N / 2; // côté droit lointain
      const x = dirRight ? 80 : -80;
      el.style.opacity   = "0";
      el.style.zIndex    = "1";
      el.style.filter    = "blur(2px) saturate(.9)";
      el.style.transform = `translate(-50%,-50%) translateX(${x}%) scale(.72) rotateY(${dirRight ? -20 : 20}deg)`;
    }
  });

  // dots
  dots.forEach((d, i) => d.classList.toggle("active", i === current));
}

function goTo(i, reset=false) {
  current = (i + N) % N;
  renderCarousel();
  if (reset) restartAuto();
}

function next() { goTo(current + 1); }

function startAuto() {
  if (timer) return;
  timer = setInterval(next, INTERVAL_MS);
}
function stopAuto() {
  if (!timer) return;
  clearInterval(timer); timer = null;
}
function restartAuto(){ stopAuto(); startAuto(); }

/* Lancements */
renderCarousel();
startAuto();

/* Pause au survol (desktop) */
carousel.addEventListener("mouseenter", stopAuto);
carousel.addEventListener("mouseleave", startAuto);

/* Placeholders recherche / compte */
document.getElementById("searchBtn").addEventListener("click", () => {
  alert("🔎 La recherche arrive bientôt !");
});
document.getElementById("accountBtn").addEventListener("click", () => {
  alert("👤 Espace compte bientôt disponible !");
});
