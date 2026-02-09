import { showToast } from './toast.js';

export function initLeadCapture() {
  const form = document.getElementById('leadForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const emailInput = form.querySelector('input[name="email"]');
    if (!emailInput || !emailInput.value) {
      showToast('Merci de renseigner un email valide.', 'warning');
      return;
    }
    showToast('Merci ! Un conseiller vous recontacte sous 24h.', 'success');
    form.reset();
  });
}