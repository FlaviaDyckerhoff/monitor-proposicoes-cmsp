// Referências explícitas a projetos-foco. Sem associação, tramitação ou notificação.
function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
function extrairReferencias(texto) {
  const text = plain(texto);
  const pattern = /\b(PROJETO[S]?\s+DE\s+LEI\s+COMPLEMENTAR|PROJETO[S]?\s+DE\s+DECRETO\s+LEGISLATIVO|PROJETO[S]?\s+DE\s+RESOLUCAO|PROJETO[S]?\s+DE\s+LEI|PLP|PLC|PDL|PL|PR|PEC|PELOM|PELO|PLO)\s*(?:(?:N[Oº°.]|NUMERO[S]?)\s*[.°º]?\s*)?(\d[\d.]*)\s*\/\s*(\d{4}|\d{2})\b/g;
  const aliases = value => value.includes('COMPLEMENTAR') ? 'PLC' : value.includes('DECRETO') ? 'PDL' : value.includes('RESOLUCAO') ? 'PR' : value.includes(' DE LEI') ? 'PL' : value;
  const found = [];
  const add = (tipo, numero, ano) => {
    const ref = { tipo, numero: String(Number(numero.replace(/\./g, ''))), ano };
    if (!found.some(x => x.tipo === ref.tipo && x.numero === ref.numero && x.ano === ref.ano)) found.push(ref);
  };
  for (const match of text.matchAll(pattern)) {
    const tipo = aliases(match[1]);
    add(tipo, match[2], match[3]);
    let tail = text.slice(match.index + match[0].length);
    const next = /^\s*(?:[,;]|\bE\b)\s*(?:N[Oº°.]\s*)?(\d[\d.]*)\s*\/\s*(\d{4}|\d{2})\b/;
    let m;
    while ((m = tail.match(next))) { add(tipo, m[1], m[2]); tail = tail.slice(m[0].length); }
  }
  return found;
}
function cruzarReferencias(proposicao, carteira, casa = 'CMSP') {
  if (carteira.casa !== casa) throw new Error('Carteira de outra Casa');
  const result = [];
  for (const ref of extrairReferencias(proposicao.ementa)) {
    const candidates = carteira.items.filter(item => item.casa === casa && item.uf === carteira.uf && item.municipio === carteira.municipio &&
      item.tipo === ref.tipo && String(Number(item.numero)) === ref.numero &&
      (ref.ano.length === 4 ? String(item.ano) === ref.ano : String(item.ano).slice(-2) === ref.ano));
    // Duas capas/anos possíveis não são um vínculo seguro.
    if (candidates.length !== 1) continue;
    if (!result.some(x => x.codigo === candidates[0].codigo)) result.push(candidates[0]);
  }
  return result;
}
async function carregarReferenciasFoco(novas, { url, headers, casa = 'CMSP', fetcher = fetch }) {
  if (!novas.some(p => extrairReferencias(p.ementa).length)) return { status: 'nao_necessario', referencias: 0 };
  try {
    const target = new URL('focus-references', url);
    target.searchParams.set('casa', casa);
    const response = await fetcher(target.toString(), { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Carteira sem confirmação');
    const carteira = await response.json();
    const age = Date.now() - Date.parse(carteira.generated_at);
    if (!carteira.ok || carteira.read_only !== true || carteira.casa !== casa || !Array.isArray(carteira.items) || !Number.isFinite(age) || age < -60000 || age > 600000) throw new Error('Carteira inválida ou antiga');
    for (const item of carteira.items) {
      if (!/^\d+$/.test(String(item.codigo)) || !Array.isArray(item.clientes) || item.casa !== casa || item.uf !== carteira.uf || item.municipio !== carteira.municipio) throw new Error('Identidade da carteira inválida');
    }
    let referencias = 0;
    for (const p of novas) { p.referenciasFoco = cruzarReferencias(p, carteira, casa); referencias += p.referenciasFoco.length; }
    return { status: 'ok', referencias, generated_at: carteira.generated_at, total_focos: carteira.items.length };
  } catch (_) {
    // A falta do cruzamento não cancela coleta/email nem certifica ausência de foco.
    for (const p of novas) delete p.referenciasFoco;
    return { status: 'incompleto', referencias: null };
  }
}
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function renderReferenciasFoco(p) {
  return (p.referenciasFoco || []).map(ref => '<div style="margin-top:6px;color:#5b21b6;font-size:11px">' +
    '<strong>🔗 Cita projeto-foco — ' + escapeHtml(ref.casa) + ' · <a href="https://monitorlegislativo.com.br/app/proposicoes2/estados-municipios/capa.php?codigo=' + encodeURIComponent(ref.codigo) + '" style="color:#5b21b6">' + escapeHtml(ref.tipo + ' ' + ref.numero + '/' + ref.ano) + '</a> · ' + escapeHtml(ref.clientes.map(c => c.nome).join(', ')) + '</strong></div>').join('');
}
module.exports = { extrairReferencias, cruzarReferencias, carregarReferenciasFoco, renderReferenciasFoco };
