import { showToast } from './toast.js';

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderLeadsTable(container, leads) {
  container.innerHTML = '';
  if (!leads.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'Aucun lead pour le moment.';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'admin-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Email</th>
        <th>Source</th>
        <th>Statut</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  leads.forEach((lead) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${lead.email}</td>
      <td>${lead.source || 'web'}</td>
      <td><span class="admin-pill">${lead.status || 'new'}</span></td>
      <td>${formatDate(lead.createdAt)}</td>
    `;
    tbody.appendChild(row);
  });
  container.appendChild(table);
}

async function fetchLeads() {
  const response = await fetch('/api/leads');
  if (!response.ok) {
    throw new Error('Impossible de charger les leads.');
  }
  return response.json();
}

export async function initAdminLeads() {
  const container = document.getElementById('adminLeadTable');
  const status = document.getElementById('adminLeadStatus');
  if (!container || !status) return;

  const load = async () => {
    status.textContent = 'Chargement des leads...';
    status.dataset.tone = 'info';
    try {
      const leads = await fetchLeads();
      renderLeadsTable(container, leads);
      status.textContent = `${leads.length} lead(s) enregistrés.`;
      status.dataset.tone = 'success';
    } catch (error) {
      status.textContent = 'Erreur de chargement.';
      status.dataset.tone = 'warning';
      showToast(error.message || 'Impossible de charger les leads.', 'warning');
    }
  };

  await load();
  document.addEventListener('leads:updated', load);
}