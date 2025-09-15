// === BACKEND REMOTO (prefixo fixo) ===
const API_BASE = 'https://smart-leads-back-production.up.railway.app'.replace(/\/+$/, '');
const apiFetch = (path, opts = {}) => fetch(`${API_BASE}${path}`, opts);

async function fetchStatus() {
  const r = await apiFetch('/api/status')
  const s = await r.json()
  const el = document.getElementById('status')
  el.innerHTML = `
    <div><b>Validador:</b> ${s.validationProvider}</div>
    <div><b>Google Places:</b> ${s.hasPlaces ? 'configurado' : 'não configurado'}</div>
    <div class="hint" style="margin-top:8px">
      Dica: configure o arquivo <code>.env</code>. Sem <code>PLACES_API_KEY</code>, a busca por cidade não funciona.
    </div>
  `
}

function badge(status) {
  const cls = status === 'valid' ? 'ok' : status === 'invalid' ? 'invalid' : 'unknown'
  return `<span class="badge ${cls}">${status}</span>`
}

function renderTable(rows, targetId) {
  if (!rows.length) {
    document.getElementById(targetId).innerHTML = '<div class="hint">Nenhum resultado.</div>'
    return
  }
  const th = `<tr><th>Nome</th><th>Telefone</th><th>WhatsApp</th><th>Endereço</th><th>Fonte</th></tr>`
  const body = rows.map(r => `<tr>
    <td>${escapeHtml(r.name)}</td>
    <td>${escapeHtml(r.phone_e164 || r.phone)}</td>
    <td>${badge(r.wa_status || 'unknown')}</td>
    <td>${escapeHtml(r.address || '')}</td>
    <td>${escapeHtml(r.source || '')}</td>
  </tr>`).join('')
  document.getElementById(targetId).innerHTML = `<table>${th}${body}</table>`
}

function toCSV(rows) {
  const header = 'name,phone_e164,wa_status,address,source\n'
  const esc = v => {
    const s = (v ?? '').toString()
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const body = rows.map(r => [esc(r.name), esc(r.phone_e164||r.phone), esc(r.wa_status||'unknown'), esc(r.address||''), esc(r.source||'')].join(',')).join('\n')
  return header + body + '\n'
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeHtml(str) {
  return (str ?? '').toString().replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m])
}

// Aba/tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const tab = btn.dataset.tab
    document.getElementById('tab-cidade').classList.toggle('hidden', tab !== 'cidade')
    document.getElementById('tab-csv').classList.toggle('hidden', tab !== 'csv')
  })
})

document.getElementById('run').addEventListener('click', async () => {
  const city = document.getElementById('city').value.trim()
  const segment = document.getElementById('segment').value.trim()
  const total = parseInt(document.getElementById('total').value, 10) || 50
  const prog = document.getElementById('progress')
  const btn = document.getElementById('run')
  const dl = document.getElementById('download')
  document.getElementById('results').innerHTML = ''
  dl.disabled = true

  if (!city) { alert('Informe a cidade/região'); return }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rodando...'
  prog.textContent = 'Buscando lugares e validando... isso pode levar alguns segundos.'
  try {
    const r = await apiFetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, segment, total })
    })
    const data = await r.json()
    if (!data.ok) throw new Error(data.error || 'Falha')
    renderTable(data.rows, 'results')
    const csv = data.csv || toCSV(data.rows)
    dl.disabled = false
    dl.onclick = () => download(`leads_${Date.now()}.csv`, csv)
    prog.textContent = `Feito. ${data.total} contatos.`
  } catch (e) {
    console.error(e)
    prog.textContent = 'Erro: ' + e.message
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar + Validar'
  }
})

// CSV validate tab
let uploadedRows = []
document.getElementById('file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0]
  if (!file) return
  const text = await file.text()
  // parse super simples (CSV bem comportado)
  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines.shift().split(',').map(s => s.trim().toLowerCase())
  const idxName = header.indexOf('name')
  const idxPhone = header.indexOf('phone')
  const idxAddress = header.indexOf('address')
  uploadedRows = lines.map(line => {
    const cols = line.split(',')
    return {
      name: idxName >= 0 ? cols[idxName] : '',
      phone: idxPhone >= 0 ? cols[idxPhone] : '',
      address: idxAddress >= 0 ? cols[idxAddress] : ''
    }
  })
  document.getElementById('results-csv').innerHTML = `<div class="hint">${uploadedRows.length} linhas carregadas.</div>`
})

document.getElementById('validate-csv').addEventListener('click', async () => {
  const prog = document.getElementById('progress-csv')
  const btn = document.getElementById('validate-csv')
  const dl = document.getElementById('download-csv')
  if (!uploadedRows.length) { alert('Faça upload do CSV primeiro.'); return }
  prog.textContent = 'Validando...'
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Validando...'

  try {
    // (Opcional) quando seu backend tiver um /api/validate, é só trocar por:
    // const numbers = uploadedRows.map(r => r.phone).filter(Boolean)
    // const r = await apiFetch('/api/validate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ numbers }) })
    // const data = await r.json(); // montar a tabela com os resultados
  } catch (e) {}
  prog.textContent = 'No pacote base, a validação de CSV usa a mesma tela principal (aba Cidade). Para validar CSV aqui, crie um endpoint dedicado.'
  btn.disabled = false; btn.textContent = 'Validar WhatsApp'
})

document.getElementById('download-csv').addEventListener('click', () => {})

fetchStatus()