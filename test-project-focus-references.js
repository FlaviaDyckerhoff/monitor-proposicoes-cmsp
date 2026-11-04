const test = require('node:test');
const assert = require('node:assert/strict');
const { extrairReferencias, cruzarReferencias, carregarReferenciasFoco, renderReferenciasFoco } = require('./project-focus-references');
const item = { casa:'CMSP',uf:'SP',municipio:'São Paulo',codigo:'903',tipo:'PL',numero:'669',ano:'2013',clientes:[{nome:'Sindicerv'}] };
const carteira = () => ({ok:true,read_only:true,casa:'CMSP',uf:'SP',municipio:'São Paulo',generated_at:new Date().toISOString(),items:[{...item}]});
test('RDS com pedido de retirada de coautoria cita PL669 sem alterar sua ementa', () => {
 const p={ementa:'Requer a retirada da coautoria no Projeto de Lei nº 669/2013.'};
 const original=p.ementa;const refs=cruzarReferencias(p,carteira());assert.equal(refs[0].codigo,'903');assert.equal(p.ementa,original);
 assert.match(renderReferenciasFoco({...p,referenciasFoco:refs}),/Cita projeto-foco/);
});
test('ano abreviado, zeros e variantes de número', () => {
 for(const s of ['PL 669/13','Projeto de Lei n. 00669/2013','PL nº669/2013']) assert.equal(cruzarReferencias({ementa:s},carteira()).length,1);
});
test('múltiplas referências, listas e repetições', () => {
 assert.deepEqual(extrairReferencias('Projetos de Lei 502/2026, 448/2026 e 442/2026; PL 669/2013 e PL 669/2013').map(x=>x.numero),['502','448','442','669']);
});
test('outra Casa ou município nunca cruza homônimo', () => {
 assert.throws(()=>cruzarReferencias({ementa:'PL669/2013'},{...carteira(),casa:'ALESP'}));
 assert.equal(cruzarReferencias({ementa:'PL669/2013'},{...carteira(),items:[{...item,casa:'ALESP'}]}).length,0);
 assert.equal(cruzarReferencias({ementa:'PL669/2013'},{...carteira(),items:[{...item,municipio:'Santos'}]}).length,0);
});
test('tipo/ano diferentes, lei sem PL e sem referência não cruzam', () => {
 for(const ementa of ['PLC669/2013','PL669/2023','Lei669/2013','artigo 669/2013','Declara utilidade pública']) assert.equal(cruzarReferencias({ementa},carteira()).length,0);
});
test('duas capas ou séculos possíveis não escolhem uma no chute', () => {
 for(const second of [{...item,codigo:'904'},{...item,codigo:'904',ano:'1913'}]) assert.equal(cruzarReferencias({ementa:'PL669/13'},{...carteira(),items:[item,second]}).length,0);
});
test('consulta viva feita uma única vez para lote inteiro', async () => {
 const lote=[{ementa:'PL669/2013'},{ementa:'PL1471/2025'}];let calls=0;
 const r=await carregarReferenciasFoco(lote,{url:'https://example.test/controle03/api/state',headers:{},fetcher:async url=>{calls++;assert.match(url,/focus-references\?casa=CMSP/);return {ok:true,json:async()=>carteira()};}});
 assert.equal(calls,1);assert.equal(r.status,'ok');assert.equal(lote[0].referenciasFoco[0].codigo,'903');assert.equal(lote.length,2);
});
test('falha ou carteira antiga não impede email nem certifica ausência', async () => {
 for(const fetcher of [async()=>{throw Error('timeout');},async()=>({ok:true,json:async()=>({...carteira(),generated_at:'2020-01-01'})})]) {
  const lote=[{ementa:'PL669/2013'}];const r=await carregarReferenciasFoco(lote,{url:'https://example.test/api/state',headers:{},fetcher});assert.equal(r.status,'incompleto');assert.equal(lote.length,1);assert.equal(lote[0].ementa,'PL669/2013');
 }
});
