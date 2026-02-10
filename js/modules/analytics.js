const SESSION_KEY = 'insidex_analytics_session_id';

const state = {
  initialized: false,
  ga4Id: '',
  metaPixelId: ''
};

function getSessionId() {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

function loadConfigFromMeta() {
  const ga4Meta = document.querySelector('meta[name="ga4-id"]')?.getAttribute('content')?.trim() ?? '';
  const pixelMeta = document.querySelector('meta[name="meta-pixel-id"]')?.getAttribute('content')?.trim() ?? '';
  return {
    ga4Id: ga4Meta,
    metaPixelId: pixelMeta
  };
}

function initGa4(ga4Id) {
  if (!ga4Id || window.gtag) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`;
  document.head.appendChild(script);

  window.gtag('js', new Date());
  window.gtag('config', ga4Id);
}

function initMetaPixel(pixelId) {
  if (!pixelId || window.fbq) {
    return;
  }

  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}

function mapEventForVendors(name) {
  if (name === 'add_to_cart') {
    return { ga4: 'add_to_cart', pixel: 'AddToCart' };
  }
  if (name === 'begin_checkout') {
    return { ga4: 'begin_checkout', pixel: 'InitiateCheckout' };
  }
  if (name === 'purchase') {
    return { ga4: 'purchase', pixel: 'Purchase' };
  }
  return { ga4: name, pixel: name };
}

function trackVendorEvents(name, payload) {
  const mapped = mapEventForVendors(name);

  if (window.gtag && state.ga4Id) {
    window.gtag('event', mapped.ga4, payload);
  }

  if (window.fbq && state.metaPixelId) {
    window.fbq('track', mapped.pixel, payload);
  }
}

export function initAnalytics() {
  if (state.initialized) {
    return;
  }

  const config = loadConfigFromMeta();
  state.ga4Id = config.ga4Id;
  state.metaPixelId = config.metaPixelId;

  initGa4(state.ga4Id);
  initMetaPixel(state.metaPixelId);
  state.initialized = true;
}

export async function trackAnalyticsEvent(name, payload = {}) {
  initAnalytics();
  trackVendorEvents(name, payload);

  try {
    await fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event: name,
        payload,
        path: window.location.pathname,
        source: 'web',
        sessionId: getSessionId()
      })
    });
  } catch (error) {
    console.warn('Tracking analytics indisponible:', error);
  }
}