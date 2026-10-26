/* DevisNord — app mobile */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let user = null;
let currentDevis = null;
let recognition = null;
let recording = false;

async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    location.href = '/login.html';
    throw new Error('auth');
  }
  if (!r.ok) {
    const err = new Error(data.error || 'Erreur');
    err.data = data;
    err.status = r.status;
    throw err;
  }
  return data;
}

function money(n) {
  return (Number(n) || 0).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}

function showAlert(el, type, text) {
  el.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
}

function setPanel(name) {
  $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
}

async function boot() {
  const status = await fetch('/api/status').then((r) => r.json()).catch(() => ({}));
  const pill = $('#statusPill');
  if (pill) {
    pill.textContent = status.apiConfigured ? 'IA connectée' : 'Mode démo';
    pill.className = 'status-pill ' + (status.apiConfigured ? 'live' : 'demo');
  }

  const me = await api('/api/auth/me');
  user = me.user;
  $('#userEmail').textContent = user.email;
  fillProfileForm(user);
  await loadHistory();
}

function fillProfileForm(u) {
  const c = u.company || {};
  $('#coName').value = c.name || '';
  $('#coAddress').value = c.address || '';
  $('#coPhone').value = c.phone || '';
  $('#coEmail').value = c.email || u.email || '';
  $('#coNeq').value = c.neq || '';
  $('#coTps').value = c.tps || '';
  $('#coTvq').value = c.tvq || '';
  $('#planBadge').textContent = `Forfait ${u.plan || 'free'} · ${u.devisCountMonth || 0} devis ce mois`;
}

/* ——— Tabs ——— */
$$('.tabbar button').forEach((b) => {
  b.addEventListener('click', () => {
    setPanel(b.dataset.tab);
    if (b.dataset.tab === 'history') loadHistory();
  });
});

/* ——— Voice ——— */
function setupSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $('#micBtn').title = 'Reconnaissance vocale non supportée sur ce navigateur';
    return;
  }
  recognition = new SR();
  recognition.lang = 'fr-CA';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = (ev) => {
    let text = '';
    for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
    $('#notes').value = text;
  };
  recognition.onerror = () => stopMic();
  recognition.onend = () => {
    if (recording) {
      try { recognition.start(); } catch {}
    }
  };
}

function stopMic() {
  recording = false;
  try { recognition && recognition.stop(); } catch {}
  $('#micBtn').innerHTML = '🎤 Dicter';
  $('#micHint').classList.add('hidden');
}

$('#micBtn')?.addEventListener('click', () => {
  if (!recognition) {
    showAlert($('#createAlert'), 'warn', 'La dictée n’est pas disponible ici. Utilisez Safari iOS (récent) ou tapez vos notes.');
    return;
  }
  if (recording) {
    stopMic();
    return;
  }
  recording = true;
  $('#micBtn').innerHTML = '<span class="rec-dot"></span> Stop';
  $('#micHint').classList.remove('hidden');
  try { recognition.start(); } catch (e) {
    stopMic();
    showAlert($('#createAlert'), 'err', 'Micro refusé. Autorisez le micro dans Safari.');
  }
});

/* ——— Camera / photo ——— */
$('#photoBtn')?.addEventListener('click', () => $('#photoInput').click());
$('#photoInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = $('#photoPreview');
    img.src = reader.result;
    img.style.display = 'block';
    img.dataset.dataUrl = reader.result;
  };
  reader.readAsDataURL(file);
});

/* ——— Generate ——— */
$('#generateBtn')?.addEventListener('click', async () => {
  const notes = $('#notes').value.trim();
  const imageDescription = $('#imageDesc').value.trim();
  const photoDataUrl = $('#photoPreview').dataset.dataUrl || '';
  if (!notes && !imageDescription && !photoDataUrl) {
    showAlert($('#createAlert'), 'warn', 'Ajoutez des notes, une dictée ou une photo.');
    return;
  }
  const btn = $('#generateBtn');
  btn.disabled = true;
  btn.textContent = 'Génération…';
  showAlert($('#createAlert'), 'info', 'Création du devis en cours…');
  try {
    const data = await api('/api/devis/generate', {
      method: 'POST',
      body: JSON.stringify({
        notes,
        imageDescription,
        photoDataUrl: photoDataUrl ? 'attached' : '',
        clientName: $('#clientName').value.trim(),
        clientAddress: $('#clientAddress').value.trim(),
        clientPhone: $('#clientPhone').value.trim(),
      }),
    });
    currentDevis = data.devis;
    renderEditor(currentDevis);
    setPanel('edit');
    showAlert($('#editAlert'), 'ok', data.mode === 'demo'
      ? 'Devis démo généré (ajoutez une clé Groq pour l’IA réelle).'
      : 'Devis généré. Vérifiez les lignes puis téléchargez le PDF.');
    if (data.quota) {
      $('#planBadge').textContent = `Forfait ${user.plan} · ${data.quota.used}/${data.quota.limit} ce mois`;
    }
  } catch (e) {
    if (e.status === 402) {
      showAlert($('#createAlert'), 'warn', (e.data && e.data.error) || 'Limite atteinte. <a href="/pricing.html">Passer à Pro</a>');
    } else if (e.message !== 'auth') {
      showAlert($('#createAlert'), 'err', e.message || 'Erreur');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Générer le devis';
  }
});

function renderEditor(d) {
  $('#edTitle').value = d.title || '';
  $('#edClientName').value = d.clientName || '';
  $('#edClientAddress').value = d.clientAddress || '';
  $('#edClientPhone').value = d.clientPhone || '';
  $('#edNotes').value = d.notes || '';
  $('#edConditions').value = d.conditions || '';
  const box = $('#itemsBox');
  box.innerHTML = '';
  (d.items || []).forEach((it, idx) => box.appendChild(itemRow(it, idx)));
  updateTotals();
}

function itemRow(it, idx) {
  const div = document.createElement('div');
  div.className = 'item-row';
  div.dataset.idx = idx;
  div.innerHTML = `
    <div class="field" style="margin:0"><label>Description</label>
      <input class="it-desc" value="${escapeAttr(it.description || '')}" /></div>
    <div class="field" style="margin:0"><label>Qté</label>
      <input class="it-qty" type="number" step="0.01" value="${it.qty ?? 1}" /></div>
    <div class="field" style="margin:0"><label>Unité</label>
      <input class="it-unit" value="${escapeAttr(it.unit || 'forfait')}" /></div>
    <div class="field" style="margin:0"><label>Prix unit.</label>
      <input class="it-price" type="number" step="0.01" value="${it.unitPrice ?? 0}" /></div>
    <button type="button" class="btn btn-danger it-del" title="Supprimer">✕</button>`;
  div.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', updateTotals));
  div.querySelector('.it-del').onclick = () => { div.remove(); updateTotals(); };
  return div;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function collectItems() {
  return $$('#itemsBox .item-row').map((row) => ({
    description: row.querySelector('.it-desc').value,
    qty: Number(row.querySelector('.it-qty').value) || 0,
    unit: row.querySelector('.it-unit').value,
    unitPrice: Number(row.querySelector('.it-price').value) || 0,
  }));
}

function updateTotals() {
  const items = collectItems();
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const tps = Math.round((subtotal * 0.05 + Number.EPSILON) * 100) / 100;
  const tvq = Math.round((subtotal * 0.09975 + Number.EPSILON) * 100) / 100;
  const total = Math.round((subtotal + tps + tvq + Number.EPSILON) * 100) / 100;
  $('#totSub').textContent = money(subtotal);
  $('#totTps').textContent = money(tps);
  $('#totTvq').textContent = money(tvq);
  $('#totGrand').textContent = money(total);
}

$('#addItemBtn')?.addEventListener('click', () => {
  $('#itemsBox').appendChild(itemRow({ description: '', qty: 1, unit: 'forfait', unitPrice: 0 }, Date.now()));
  updateTotals();
});

$('#saveDevisBtn')?.addEventListener('click', async () => {
  if (!currentDevis) return;
  try {
    const body = {
      title: $('#edTitle').value,
      clientName: $('#edClientName').value,
      clientAddress: $('#edClientAddress').value,
      clientPhone: $('#edClientPhone').value,
      notes: $('#edNotes').value,
      conditions: $('#edConditions').value,
      items: collectItems(),
    };
    const data = await api('/api/devis/' + currentDevis.id, { method: 'PUT', body: JSON.stringify(body) });
    currentDevis = data.devis;
    showAlert($('#editAlert'), 'ok', 'Devis enregistré.');
    updateTotals();
  } catch (e) {
    if (e.message !== 'auth') showAlert($('#editAlert'), 'err', e.message);
  }
});

$('#pdfBtn')?.addEventListener('click', async () => {
  if (!currentDevis) return;
  // save first
  await $('#saveDevisBtn').click();
  window.open('/api/devis/' + currentDevis.id + '/pdf', '_blank');
});

$('#shareBtn')?.addEventListener('click', async () => {
  if (!currentDevis) return;
  const url = location.origin + '/api/devis/' + currentDevis.id + '/pdf';
  if (navigator.share) {
    try {
      await navigator.share({ title: currentDevis.title || 'Devis', text: 'Voici votre devis DevisNord', url });
    } catch {}
  } else {
    await navigator.clipboard?.writeText(url);
    showAlert($('#editAlert'), 'info', 'Lien PDF copié (connexion requise pour télécharger).');
  }
});

/* ——— History ——— */
async function loadHistory() {
  const data = await api('/api/devis');
  const box = $('#historyList');
  if (!data.devis.length) {
    box.innerHTML = '<div class="alert alert-info">Aucun devis pour l’instant. Créez-en un !</div>';
    return;
  }
  box.innerHTML = data.devis
    .map(
      (d) => `
    <div class="list-item" data-id="${d.id}">
      <div>
        <h4>${escapeAttr(d.title || 'Devis')}</h4>
        <p>${escapeAttr(d.clientName || '')} · ${d.number || ''} · ${new Date(d.createdAt).toLocaleDateString('fr-CA')}
          · <strong>${money(d.taxes?.total || 0)}</strong></p>
      </div>
      <div style="display:flex;gap:0.35rem;flex-shrink:0">
        <button class="btn btn-secondary" data-open="${d.id}">Ouvrir</button>
      </div>
    </div>`
    )
    .join('');
  box.querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = async () => {
      const data = await api('/api/devis/' + b.dataset.open);
      currentDevis = data.devis;
      renderEditor(currentDevis);
      setPanel('edit');
    };
  });
}

/* ——— Profile ——— */
$('#saveProfileBtn')?.addEventListener('click', async () => {
  try {
    const data = await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        company: {
          name: $('#coName').value,
          address: $('#coAddress').value,
          phone: $('#coPhone').value,
          email: $('#coEmail').value,
          neq: $('#coNeq').value,
          tps: $('#coTps').value,
          tvq: $('#coTvq').value,
        },
      }),
    });
    user = data.user;
    showAlert($('#profileAlert'), 'ok', 'Profil enregistré — apparaîtra sur vos PDF.');
  } catch (e) {
    if (e.message !== 'auth') showAlert($('#profileAlert'), 'err', e.message);
  }
});

$('#logoutBtn')?.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', body: '{}' });
  location.href = '/';
});

setupSpeech();
boot().catch(() => {});
