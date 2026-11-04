const assert = require('node:assert/strict');
const { carregarReferenciasFoco, renderReferenciasFoco } = require('../project-focus-references');
(async () => {
  const user = process.env.CONTROLE03_API_USER;
  const pass = process.env.CONTROLE03_API_PASS;
  assert(user && pass, 'Credenciais da consulta ausentes');
  const url = process.env.CONTROLE03_STATE_URL || 'https://doe.monitorlegislativo.com.br/controle03/api/state';
  const items = [{ementa: 'Requer a retirada da coautoria no Projeto de Lei nº 669/2013.'}];
  const result = await carregarReferenciasFoco(items, {url, casa: 'CMSP', headers: {Authorization: 'Basic ' + Buffer.from(user + ':' + pass).toString('base64')}});
  assert.equal(result.status, 'ok', 'Consulta viva incompleta');
  assert(items[0].referenciasFoco.some(p => Number(p.codigo) === 903 && p.clientes.some(c => /sindicerv/i.test(c.nome))), 'Foco de referência não confirmado');
  assert(renderReferenciasFoco(items[0]).includes('codigo=903'));
  console.log('Consulta viva e destaque validados. Focos: ' + result.total_focos + '. Sem envio de email ou alteração de estado.');
})().catch(() => { console.error('Validação viva não confirmada; verificar consulta autenticada e identidade do foco.'); process.exitCode = 1; });
