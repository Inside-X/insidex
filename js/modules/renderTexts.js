import { loadJson } from './dataLoader.js';

const DEFAULT_MAPPING = {
  brand: 'brand',
  baseline: 'baseline',
  heroText: 'heroText',
  ctaText: 'ctaText',
};

export async function renderTexts({ url = 'data/site.json', mapping = DEFAULT_MAPPING } = {}) {
  const content = await loadJson(url);

  Object.entries(mapping).forEach(([key, elementId]) => {
    const element = document.getElementById(elementId);
    if (!element || typeof content[key] !== 'string') {
      return;
    }
    element.textContent = content[key];
  });

  return content;
}
