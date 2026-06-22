const fs = require('fs');
const nodemailer = require('nodemailer');

const EMAIL_DESTINO = process.env.EMAIL_DESTINO;
const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE;
const EMAIL_SENHA = process.env.EMAIL_SENHA;
const ARQUIVO_ESTADO = 'estado.json';
const API_BASE = 'https://splegisws.saopaulo.sp.leg.br/ws/ws2.asmx';

// Tipos monitorados — excluindo DSP e documentos internos
const TIPOS_MONITORADOS = new Set([
  'PL', 'PDL', 'PR', 'PLO', 'MOC', 'IND',
  'REQ', 'RPL', 'AUD', 'RDS',
  'RPP', 'RPS', 'RDP',
  'REQCOM', 'RSC'
]);

const NOMES_TIPOS = {
  PL:     'PROJETO DE LEI',
  PDL:    'PROJETO DE DECRETO LEGISLATIVO',
  PR:     'PROJETO DE RESOLUÇÃO',
  PLO:    'PROJETO DE EMENDA À LEI ORGÂNICA',
  MOC:    'MOÇÃO',
  IND:    'INDICAÇÃO',
  REQ:    'REQUERIMENTO PLENÁRIO / PRESIDÊNCIA',
  RPL:    'REQUERIMENTO DE PLENÁRIO',
  AUD:    'AUDIÊNCIA PÚBLICA',
  RDS:    'REQUERIMENTO D SEM PROCESSO',
  RPP:    'REQUERIMENTO P COM PROCESSO',
  RPS:    'REQUERIMENTO P SEM PROCESSO',
  RDP:    'REQUERIMENTO D COM PROCESSO',
  REQCOM: 'REQUERIMENTO DE COMISSÃO',
  RSC:    'REQUERIMENTO SUBCOMISSÃO',
};

function carregarEstado() {
  if (fs.existsSync(ARQUIVO_ESTADO)) {
    return JSON.parse(fs.readFileSync(ARQUIVO_ESTADO, 'utf8'));
  }
  return { proposicoes_vistas: [], ultima_execucao: '' };
}

function salvarEstado(estado) {
  fs.writeFileSync(ARQUIVO_ESTADO, JSON.stringify(estado, null, 2));
}

function montarLinkConsulta(p) {
  const params = new URLSearchParams({
    tipo: p.tipo || '',
    numero: String(p.numero || ''),
    ano: String(p.ano || ''),
  });
  return `https://splegisconsulta.saopaulo.sp.leg.br/Pesquisa/IndexProjeto?${params.toString()}`;
}

async function buscarProposicoes() {
  const ano = new Date().getFullYear();
  console.log(`🔍 Buscando proposições de ${ano}...`);

  const response = await fetch(`${API_BASE}/ProjetosPorAnoJSON?Ano=${ano}`);

  if (!response.ok) {
    console.error(`❌ Erro na API: ${response.status} ${response.statusText}`);
    return [];
  }

  const lista = await response.json();
  console.log(`📦 Total recebido da API: ${lista.length} itens`);

  const filtradas = lista.filter(p => TIPOS_MONITORADOS.has(p.tipo));
  console.log(`🔎 Após filtro de tipos: ${filtradas.length} itens`);

  return filtradas;
}


const CLIENTES_NOMES_PROPRIOS = [
  'FIRJAN', 'Red Bull', 'Sindicerv', 'Boticario', 'Boticário', 'Abrasel', 'ANBRASEL',
  'Energisa', 'EnergisaLuz', 'SABESP', 'COMGAS', 'COMGÁS', 'Eletromidia', 'Eletromídia',
  'BRT', 'Regenera', 'Nova Infra', 'Seta', 'SETA', 'AkzoNobel', 'Expedia', 'RTSC',
  'Huawei', 'Carrefour', 'JBS', 'Ajinomoto', 'Vibra', 'Mindlab', 'ABVTEX', 'Neoenergia', 'ENEL',
  'Equatorial', 'Equatorial Goiás', 'Equatorial Goias', 'Equatorial Goiás Distribuidora de Energia', 'Equatorial Goias Distribuidora de Energia', 'Equtorial'
];

function clientesCitadosNaProposicao(p) {
  const texto = [p.cliente, p.clientes, p.autor, p.autores, p.tipo, p.rotulo, p.titulo, p.identificacao, p.ementa]
    .filter(Boolean)
    .join(' ');
  const achados = [];
  for (const nome of CLIENTES_NOMES_PROPRIOS) {
    const escaped = nome.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|[^A-Za-zÀ-ÿ0-9])' + escaped + '([^A-Za-zÀ-ÿ0-9]|$)', 'i');
    if (re.test(texto) && !achados.some(a => a.toLowerCase() === nome.toLowerCase())) achados.push(nome);
  }
  return achados;
}

function anotarClientesCitados(proposicoes) {
  for (const p of proposicoes || []) {
    const clientes = clientesCitadosNaProposicao(p);
    p.clientesCitados = clientes;
    if (clientes.length && p.ementa && !String(p.ementa).includes('Cliente citado:')) {
      p.ementa = String(p.ementa).trim() + ' | Cliente citado: ' + clientes.join(', ');
    }
  }
}

function mlEscapeHtmlClienteDestaque(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mlEscapeRegExpClienteDestaque(valor) {
  return String(valor).replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

function mlDestacarTermosClienteEmail(texto, clientes) {
  const nomes = Array.from(new Set([...(clientes || []), ...CLIENTES_NOMES_PROPRIOS]))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!nomes.length) return mlEscapeHtmlClienteDestaque(texto);

  const regex = new RegExp('(^|[^A-Za-zÀ-ÿ0-9])(' + nomes.map(mlEscapeRegExpClienteDestaque).join('|') + ')(?=[^A-Za-zÀ-ÿ0-9]|$)', 'gi');
  return mlEscapeHtmlClienteDestaque(texto).replace(regex, (match, prefixo, termo) => {
    return prefixo + '<span style="background:#dbeafe;color:#1e3a8a;font-weight:700;border-radius:3px;padding:1px 3px">' + termo + '</span>';
  });
}

function renderizarEmentaCliente(p, renderBase) {
  const texto = String((p && p.ementa) || '-');
  const partes = texto.split(/\s+\|\s+Cliente citado:\s+/i);
  const ementa = renderBase
    ? renderBase(partes[0])
    : mlDestacarTermosClienteEmail(partes[0], p && p.clientesCitados);
  const clientes = partes.length > 1
    ? partes.slice(1).join(' | Cliente citado: ')
    : ((p && p.clientesCitados) || []).join(', ');

  if (!clientes) return ementa;
  return ementa + '<div style="margin-top:6px">' +
    '<span style="display:inline-block;background:#eef6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700">' +
    'Cliente citado: ' + mlDestacarTermosClienteEmail(clientes, p && p.clientesCitados) +
    '</span></div>';
}

async function enviarEmail(novas) {
  anotarClientesCitados(novas);
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_REMETENTE, pass: EMAIL_SENHA },
  });

  // Agrupa por tipo
  const porTipo = {};
  novas.forEach(p => {
    const tipo = p.tipo || 'OUTROS';
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(p);
  });

  const avisoVolume = novas.length > 50
    ? `<div style="background:#fff3cd;border:1px solid #ffc107;padding:12px 16px;border-radius:4px;margin-bottom:16px;color:#856404;font-size:13px">
        ⚠️ <strong>Volume alto:</strong> ${novas.length} proposições novas nesta execução.
        Pode ser o primeiro run ou um acúmulo de período sem execução.
      </div>`
    : '';

  const ordemTipos = ['PL','PDL','PR','PLO','MOC','IND','REQ','RPL','AUD','RPP','RPS','RDP','RDS','REQCOM','RSC'];

  const tiposPresentes = [
    ...ordemTipos.filter(t => porTipo[t]),
    ...Object.keys(porTipo).filter(t => !ordemTipos.includes(t)).sort()
  ];

  const linhas = tiposPresentes.map(tipo => {
    const nomeCompleto = NOMES_TIPOS[tipo] || tipo;
    const itens = porTipo[tipo];
    // Ordena por número decrescente dentro de cada tipo
    itens.sort((a, b) => (parseInt(b.numero) || 0) - (parseInt(a.numero) || 0));

    const header = `<tr>
      <td colspan="4" style="padding:10px 8px 4px;background:#f0f4f8;font-weight:bold;color:#1a3a5c;font-size:13px;border-top:2px solid #1a3a5c">
        ${nomeCompleto} — ${itens.length} proposição(ões)
      </td>
    </tr>`;

    const rows = itens.map(p => {
      const dataFormatada = p.data
        ? new Date(p.data).toLocaleDateString('pt-BR')
        : '-';
      const ementa = (p.ementa || '-').trim();
      const linkConsulta = montarLinkConsulta(p);
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;white-space:nowrap;font-size:12px;color:#555">${p.tipo}/${p.numero}/${p.ano}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap;color:#555">${dataFormatada}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${ementa}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap">
          <a href="${linkConsulta}" style="color:#1a3a5c;font-weight:bold;text-decoration:none" target="_blank">Abrir consulta</a>
        </td>
      </tr>`;
    }).join('');

    return header + rows;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:960px;margin:0 auto">
      <h2 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:8px">
        🏛️ Câmara Municipal de São Paulo — ${novas.length} nova(s) proposição(ões)
      </h2>
      <p style="color:#666;font-size:13px">Monitoramento automático — ${new Date().toLocaleString('pt-BR')}</p>
      ${avisoVolume}
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#1a3a5c;color:white">
            <th style="padding:10px;text-align:left">Identificação</th>
            <th style="padding:10px;text-align:left">Data</th>
            <th style="padding:10px;text-align:left">Ementa</th>
            <th style="padding:10px;text-align:left">Link</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999">
        Acesse: <a href="https://splegisconsulta.saopaulo.sp.leg.br/Pesquisa/IndexProjeto">SP Legis Consulta — Câmara Municipal de São Paulo</a>
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Monitor São Paulo" <${EMAIL_REMETENTE}>`,
    to: EMAIL_DESTINO,
    subject: `🏛️ São Paulo: ${novas.length} nova(s) proposição(ões) — ${new Date().toLocaleDateString('pt-BR')}`,
    html,
  });

  console.log(`✅ Email enviado com ${novas.length} proposições novas.`);
}

(async () => {
  console.log('🚀 Iniciando monitor CMSP...');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);

  const estado = carregarEstado();
  const idsVistos = new Set(estado.proposicoes_vistas.map(String));

  const proposicoes = await buscarProposicoes();

  if (proposicoes.length === 0) {
    console.log('⚠️ Nenhuma proposição encontrada após filtro.');
    process.exit(0);
  }

  const novas = proposicoes.filter(p => !idsVistos.has(String(p.chave)));
  console.log(`🆕 Proposições novas: ${novas.length}`);

  if (novas.length > 0) {
    await enviarEmail(novas);
    novas.forEach(p => idsVistos.add(String(p.chave)));
    estado.proposicoes_vistas = Array.from(idsVistos);
    estado.ultima_execucao = new Date().toISOString();
    salvarEstado(estado);
  } else {
    console.log('✅ Sem novidades. Nada a enviar.');
    estado.ultima_execucao = new Date().toISOString();
    salvarEstado(estado);
  }
})();
