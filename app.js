const API_BASE = "https://smart-leads-back-production.up.railway.app";

async function fetchStatus() {
  const el = document.getElementById('status');
  try {
    const r = await fetch(`${API_BASE}/api/status`);
    const s = await r.json();
    el.innerHTML = `
      <div><b>Validador:</b> ${s.validationProvider}</div>
      <div><b>Busca:</b> ${s.searchMode}</div>
      <div class="hint" style="margin-top:6px">
        A validação é automática. Use "Baixar CSV" para salvar o resultado.
      </div>`;
  } catch {
    el.textContent = 'Não foi possível carregar o status do servidor.';
  }
}

function badge(status) {
  const s = status || 'unknown';
  const cls = s === 'valid' ? 'ok' : s === 'invalid' ? 'invalid' : 'unknown';
  return `<span class="badge ${cls}">${s}</span>`;
}

function escapeHtml(str) {
  return (str ?? '').toString().replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);
}

function renderTable(rows, targetId) {
  const el = document.getElementById(targetId);
  if (!rows.length) { el.innerHTML = '<div class="hint">Nenhum resultado.</div>'; return; }
  const th = `<tr><th>Nome</th><th>Telefone</th><th>WhatsApp</th><th>Fonte</th></tr>`;
  const body = rows.map(r => `<tr>
    <td>${escapeHtml(r.name||'')}</td>
    <td>${escapeHtml(r.phone_e164||'')}</td>
    <td>${badge(r.wa_status||'unknown')}</td>
    <td>${escapeHtml(r.source||'')}</td>
  </tr>`).join('');
  el.innerHTML = `<table>${th}${body}</table>`;
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

document.getElementById('run').addEventListener('click', async () => {
  const city = document.getElementById('city').value.trim();
  const segment = document.getElementById('segment').value.trim();
  const total = parseInt(document.getElementById('total').value, 10) || 50;
  const prog = document.getElementById('progress');
  const btn = document.getElementById('run');
  const dl = document.getElementById('download');
  document.getElementById('results').innerHTML = '';
  dl.disabled = true;

  if (!city) { alert('Informe a cidade/região'); return; }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Buscando + validando...';
  prog.textContent = 'Abrindo buscador, visitando sites e validando no WhatsApp (UAZ/Click2Chat)...';

  try {
    const r = await fetch(`${API_BASE}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ city, segment, total })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.detail || data.error || 'Falha no backend');
    renderTable(data.rows, 'results');

    dl.disabled = false;
    dl.onclick = () => download(`leads_validados_${Date.now()}.csv`, data.csv || '');
    prog.textContent = `Feito. ${data.total} contatos.`;
  } catch (e) {
    console.error(e);
    prog.textContent = 'Erro: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar (validação automática)';
  }
});

fetchStatus();
