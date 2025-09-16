// === BACKEND REMOTO (prefixo fixo) ===
const API_BASE = 'https://smart-leads-back-production.up.railway.app'.replace(/\/+$/, '');
const apiFetch = (path, opts = {}) => fetch(`${API_BASE}${path}`, { mode: 'cors', ...opts });

let currentRows = []; // guarda a última lista buscada (sem validação)

async function fetchStatus() {
  const el = document.getElementById('status');
  try {
    const r = await apiFetch('/api/status');
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) throw new Error(`Status HTTP ${r.status}`);
    const s = await r.json();
    el.innerHTML = `
      <div><b>Validador:</b> ${s.validationProvider}</div>
      <div><b>Busca:</b> ${s.searchMode}</div>
      <div class="hint" style="margin-top:8px">
        A busca <b>não valida automaticamente</b>. Clique em <b>Validar WhatsApp</b> se quiser validar os números retornados.
      </div>
    `;
  } catch (err) {
    el.textContent = 'Não foi possível carregar o status do servidor.';
  }
}

function badge(status) {
  const s = status || 'unvalidated';
  const cls = s === 'valid' ? 'ok' : s === 'invalid' ? 'invalid' : 'unknown';
  return `<span class="badge ${cls}">${s}</span>`;
}

function renderTable(rows, targetId) {
  if (!rows.length) {
    document.getElementById(targetId).innerHTML = '<div class="hint">Nenhum resultado.</div>';
    return;
  }
  const th = `<tr><th>Nome</th><th>Telefone</th><th>WhatsApp</th><th>Endereço</th><th>Fonte</th></tr>`;
  const body = rows.map(r => `<tr>
    <td>${escapeHtml(r.name || '')}</td>
    <td>${escapeHtml(r.phone_e164 || r.phone || '')}</td>
    <td>${badge(r.wa_status)}</td>
    <td>${escapeHtml(r.address || '')}</td>
    <td>${escapeHtml(r.source || '')}</td>
  </tr>`).join('');
  document.getElementById(targetId).innerHTML = `<table>${th}${body}</table>`;
}

function toCSV(rows) {
  const header = 'name,phone_e164,wa_status,address,source\n';
  const esc = v => {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = rows.map(r => [
    esc(r.name),
    esc(r.phone_e164 || r.phone),
    esc(r.wa_status || 'unvalidated'),
    esc(r.address || ''),
    esc(r.source || '')
  ].join(',')).join('\n');
  return header + body + '\n';
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return (str ?? '').toString().replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);
}

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-cidade').classList.toggle('hidden', tab !== 'cidade');
    document.getElementById('tab-csv').classList.toggle('hidden', tab !== 'csv');
  });
});

// Buscar (sem validar)
document.getElementById('run').addEventListener('click', async () => {
  const city = document.getElementById('city').value.trim();
  const segment = document.getElementById('segment').value.trim();
  const total = parseInt(document.getElementById('total').value, 10) || 50;
  const prog = document.getElementById('progress');
  const btn  = document.getElementById('run');
  const btnVal = document.getElementById('validate');
  const dl   = document.getElementById('download');
  document.getElementById('results').innerHTML = '';
  currentRows = [];
  dl.disabled = true; btnVal.disabled = true;

  if (!city) { alert('Informe a cidade/região'); return; }
  btn.disabled = true; btn.textContent = 'Buscando...';
  prog.textContent = 'Abrindo buscadores, entrando nos sites e raspando telefones...';

  try {
    const r = await apiFetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, segment, total })
    });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) throw new Error(`Resposta não é JSON (status ${r.status}).`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Falha');

    currentRows = (data.rows || []).map(row => ({ ...row, wa_status: row.wa_status || 'unvalidated' }));
    renderTable(currentRows, 'results');

    const csv = data.csv || toCSV(currentRows);
    dl.disabled = false;
    dl.onclick = () => download(`leads_${Date.now()}.csv`, csv);
    btnVal.disabled = currentRows.length === 0;
    prog.textContent = `Feito. ${currentRows.length} contatos (sem validação).`;
  } catch (e) {
    console.error(e);
    prog.textContent = 'Erro: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar';
  }
});

// Validar a lista carregada
document.getElementById('validate').addEventListener('click', async () => {
  if (!currentRows.length) { alert('Faça uma busca primeiro.'); return; }
  const prog = document.getElementById('progress');
  const btnVal = document.getElementById('validate');
  const dl   = document.getElementById('download');

  btnVal.disabled = true; btnVal.textContent = 'Validando...';
  prog.textContent = 'Verificando WhatsApp via Click‑to‑Chat...';

  try {
    const numbers = currentRows.map(r => r.phone_e164 || r.phone).filter(Boolean);
    const r = await apiFetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers })
    });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) throw new Error(`Resposta não é JSON (status ${r.status}).`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Falha na validação');

    const byE164 = new Map((data.results || []).map(x => [x.e164, x.status]));
    currentRows = currentRows.map(row => ({
      ...row,
      wa_status: byE164.get(row.phone_e164 || row.phone) || row.wa_status || 'unknown'
    }));

    renderTable(currentRows, 'results');
    const csv = toCSV(currentRows);
    dl.disabled = false;
    dl.onclick = () => download(`leads_validados_${Date.now()}.csv`, csv);
    prog.textContent = 'Validação concluída.';
  } catch (e) {
    console.error(e);
    prog.textContent = 'Erro na validação: ' + e.message;
  } finally {
    btnVal.disabled = false; btnVal.textContent = 'Validar WhatsApp';
  }
});

// CSV tab
let uploadedRows = [];
document.getElementById('file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',').map(s => s.trim().toLowerCase());
  const idxName = header.indexOf('name');
  const idxPhone = header.indexOf('phone');
  const idxAddress = header.indexOf('address');
  uploadedRows = lines.map(line => {
    const cols = line.split(',');
    return {
      name: idxName >= 0 ? cols[idxName] : '',
      phone: idxPhone >= 0 ? cols[idxPhone] : '',
      address: idxAddress >= 0 ? cols[idxAddress] : ''
    };
  });
  document.getElementById('results-csv').innerHTML = `<div class="hint">${uploadedRows.length} linhas carregadas.</div>`;
});

document.getElementById('validate-csv').addEventListener('click', async () => {
  const prog = document.getElementById('progress-csv');
  const btn  = document.getElementById('validate-csv');
  const dl   = document.getElementById('download-csv');
  if (!uploadedRows.length) { alert('Faça upload do CSV primeiro.'); return; }
  prog.textContent = 'Validando...';
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Validando...';

  try {
    const numbers = uploadedRows.map(r => r.phone).filter(Boolean);
    const r = await apiFetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers })
    });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) throw new Error(`Resposta não é JSON (status ${r.status}).`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Falha na validação');

    const byRaw = new Map(data.results.map(x => [x.raw, x]));
    const rows = uploadedRows.map(r => {
      const hit = byRaw.get(r.phone) || {};
      return {
        name: r.name || '',
        phone_e164: hit.e164 || '',
        phone: r.phone || '',
        wa_status: hit.status || 'unknown',
        address: r.address || '',
        source: 'CSV'
      };
    });
    renderTable(rows, 'results-csv');
    dl.disabled = false;
    dl.onclick = () => download(`meu_csv_validado_${Date.now()}.csv`, toCSV(rows));
    prog.textContent = `Feito. ${rows.length} contatos validados.`;
  } catch (e) {
    console.error(e);
    prog.textContent = 'Erro: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Validar WhatsApp';
  }
});

document.getElementById('download-csv').addEventListener('click', () => {});
fetchStatus();
