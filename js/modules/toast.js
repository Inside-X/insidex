let toastEl;
let toastTimer;

function ensureToast() {
  if (!toastEl) {
    toastEl = document.getElementById('toast');
  }
  return toastEl;
}

export function showToast(message, type = 'info', duration = 2400) {
  const el = ensureToast();
  if (!el) return;

  el.textContent = message;
  el.classList.remove('toast--success', 'toast--info', 'toast--warning');
  el.classList.add('toast--' + type);
  el.hidden = false;

  requestAnimationFrame(() => {
    el.classList.add('show');
  });

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      el.hidden = true;
    }, 200);
  }, duration);
}
