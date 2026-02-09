import { showToast } from './toast.js';

export function initLeadCapture() {
  const form = document.getElementById('leadForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = form.querySelector('input[name="email"]');
    if (!emailInput || !emailInput.value) {
      showToast('Merci de renseigner un email valide.', 'warning');
      return;
    }
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.value,
          source: window.location.pathname
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Erreur lors de l’envoi.');
      }
      showToast('Merci ! Un conseiller vous recontacte sous 24h.', 'success');
      form.reset();
      document.dispatchEvent(new CustomEvent('leads:updated'));
    } catch (error) {
      showToast(error.message || 'Une erreur est survenue.', 'warning');
    }
  });
}