let current = 0, N = 0;
let timer = null;
const INTERVAL_MS = 4000;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let carousel, track, items, dotsWrap, dots;

function renderCarousel() {
  const leftIdx = (current - 1 + N) % N;
  const rightIdx = (current + 1) % N;

  items.forEach((el, i) => {
    el.style.transitionTimingFunction = prefersReducedMotion ? "step-end" : "ease";
    if (i === current) {
      // centre : grand, net
      el.style.opacity = "1";
      el.style.zIndex = "3";
      el.style.filter = "none";
      el.style.transform = "translate(-50%,-50%) translateX(0%) scale(1) rotateY(0deg)";
    } else if (i === leftIdx) {
      // gauche : estompée
      el.style.opacity = ".85";
      el.style.zIndex = "2";
      el.style.filter = "blur(1px) saturate(.95)";
      el.style.transform = "translate(-50%,-50%) translateX(-40%) scale(.86) rotateY(12deg)";
    } else if (i === rightIdx) {
      // droite : estompée
      el.style.opacity = ".85";
      el.style.zIndex = "2";
      el.style.filter = "blur(1px) saturate(.95)";
      el.style.transform = "translate(-50%,-50%) translateX(40%) scale(.86) rotateY(-12deg)";
    } else {
      // autres : discrets, hors champ
      const dirRight = ((i - current + N) % N) < N / 2;
      const x = dirRight ? 80 : -80;
      el.style.opacity = "0";
      el.style.zIndex = "1";
      el.style.filter = "blur(2px) saturate(.9)";
      el.style.transform = `translate(-50%,-50%) translateX(${x}%) scale(.72) rotateY(${dirRight ? -20 : 20}deg)`;
    }
  });
  dots.forEach((d, i) => d.classList.toggle("active", i === current));
}

function goTo(i, reset=false) {
  current = (i + N) % N;
  renderCarousel();
  if (reset) restartAuto();
}
function next() { goTo(current + 1); }
function startAuto() {
  if (prefersReducedMotion) return;
  if (!timer) timer = setInterval(next, INTERVAL_MS);
}
function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
function restartAuto(){ stopAuto(); startAuto(); }

export function initCarousel() {
  carousel = document.getElementById("heroCarousel");
  track = document.getElementById("carouselTrack");
  dotsWrap = document.getElementById("carouselDots");
  items = Array.from(track.querySelectorAll(".carousel-item"));
  N = items.length;

  // Crée les dots
  dotsWrap.innerHTML = "";
  items.forEach((_, i) => {
    const b = document.createElement("button");
    b.addEventListener("click", () => goTo(i, true));
    dotsWrap.appendChild(b);
  });
  dots = Array.from(dotsWrap.children);

  renderCarousel();
  startAuto();

  // Pause au survol (desktop)
  carousel.addEventListener("mouseenter", stopAuto);
  carousel.addEventListener("mouseleave", startAuto);
}

// Expose pour un éventuel “reload” (quand on injectera des slides dynamiques)
export const carouselAPI = { goTo, restartAuto };
