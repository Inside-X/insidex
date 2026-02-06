const fallbackSlides = [
  {
    image: "assets/images/amani.jpg",
    alt: "Canapé Amani en tissu bouclé dans un salon lumineux",
    active: true,
    order: 1,
    createdAt: "2024-02-01T09:00:00Z",
  },
  {
    image: "assets/images/neko.jpg",
    alt: "Fauteuil Neko avec piètement en métal noir",
    active: true,
    order: 2,
    createdAt: "2024-02-05T09:00:00Z",
  },
  {
    image: "assets/images/sora.jpg",
    alt: "Table basse Sora en bois clair",
    active: true,
    order: 3,
    createdAt: "2024-02-10T09:00:00Z",
  },
];

function createSlide(slide, index) {
  const img = document.createElement("img");
  img.className = "carousel-item";
  img.src = slide.image;
  img.alt = slide.alt || "";
  img.loading = index === 0 ? "eager" : "lazy";
  img.decoding = "async";
  if (slide.productId) {
    img.dataset.productId = slide.productId;
  }
  return img;
}

export async function renderCarousel() {
  const track = document.getElementById("carouselTrack");
  if (!track) return 0;

  let slides = [];
  try {
    const response = await fetch("data/carousel.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    slides = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Impossible de charger carousel.json, fallback local.", error);
    slides = fallbackSlides;
  }

  const orderedSlides = slides
    .filter((slide) => slide.active)
    .sort((a, b) => Number(a.order) - Number(b.order));

  track.innerHTML = "";
  orderedSlides.forEach((slide, index) => {
    track.appendChild(createSlide(slide, index));
  });

  return orderedSlides.length;
}
