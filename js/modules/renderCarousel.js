const fallbackSlides = [
  {
    image: "assets/images/amani.jpg",
    alt: "Canapé Amani en tissu bouclé dans un salon lumineux",
  },
  {
    image: "assets/images/neko.jpg",
    alt: "Fauteuil Neko avec piètement en métal noir",
  },
  {
    image: "assets/images/sora.jpg",
    alt: "Table basse Sora en bois clair",
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

  track.innerHTML = "";
  slides.forEach((slide, index) => {
    track.appendChild(createSlide(slide, index));
  });

  return slides.length;
}
