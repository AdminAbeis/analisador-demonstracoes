// Testes dos textos do trabalho (trabalho.js) e do gerador no estilo do grupo (textos.js).
// Usa a WEG gerada por pipeline/test_cvm.py (rodar antes) e confere que todo marcador {{...}} vira número.
'use strict';
const path = require('path');
const E = require('../engine.js');
const T = require('../textos.js');
global.window = {};
require('../trabalho.js');
const TR = global.window.TRABALHO;

const erros = [];
const checa = (c, m) => { if (!c) erros.push(m); };
const doc = require(path.join(__dirname, 'fixtures', 'saida', 'cia', '5410.json'));
const i0 = doc.periodos.findIndex(p => p.rotulo === TR.de), i1 = doc.periodos.findIndex(p => p.rotulo === TR.ate);
checa(i0 >= 0 && i1 > i0, 'anos do trabalho existem nos dados de teste');
const caso = E.casoDaBase(doc, i0, i1);
caso.extras.estoqueInicial = 7644361; // estoque de 2022 (a base completa traz o ano anterior)
const R = E.analisar(caso, E.PADRAO);

const textos = [
  ['resumo', TR.resumo], ...TR.introducao.map((t, k) => ['introdução ' + k, t]),
  ...TR.caracterizacao.secoes.flatMap(s => [...s.paragrafos, ...(s.itens || []), ...(s.depois || [])].map(t => ['caracterização: ' + s.titulo, t])),
  ...Object.entries(TR.grupo).map(([k, t]) => ['grupo ' + k, t]), ...Object.entries(TR.combinado).map(([k, t]) => ['combinado ' + k, t]),
  ...TR.interpretacao.flatMap(s => s.paragrafos.map(t => ['interpretação: ' + s.titulo, t])), ...TR.conclusao.map((t, k) => ['conclusão ' + k, t])
];
for (const [nome, t] of textos) {
  const o = T.preencher(t, caso, R);
  checa(!o.includes('[?]') && !o.includes('{{') && !/NaN|undefined|Infinity/.test(o), `${nome}: marcador sem valor → ${o.slice(0, 160)}`);
}
// versão entregue: um texto escolhido para cada um dos 17 índices
for (const i of R.indices) checa(['combinado', 'grupo'].includes((TR.textoFinal || {})[i.id]), `textoFinal sem escolha válida para ${i.id}`);
for (const t of (TR.destaques || []).map(d => d[0])) { const o = T.preencher(t, caso, R); checa(!o.includes('[?]'), `destaque da aba Empresa: ${o}`); }
// todos os 17 índices têm texto combinado
for (const i of R.indices) checa(TR.combinado[i.id], `combinado sem texto para ${i.id}`);
// os números do texto são os do site
checa(T.preencher('{{v:LC}}', caso, R) === '1,92; 1,76 e 1,55', 'série da liquidez corrente');
checa(T.preencher('{{v:PCT}}', caso, R) === '76,40%; 79,41% e 129,85%', 'série do PCT');
checa(T.preencher('{{d:PMRE@2024>2025}}', caso, R) === '−10 dias', 'variação do PMRE entre anos');
checa(T.preencher('{{drs:PC.EMP+PNC.EMP+N[Arrendamentos]@2023>2025}}', caso, R) === 'R$ 2,05 bilhões', 'dívida com juros');
checa(T.preencher('{{rs:DFC.OP@2024..2025}}', caso, R) === 'R$ 13,70 bilhões', 'soma da DFC');
checa(T.preencher('{{n2:100-IPL@2025}}', caso, R) === '22,58', 'expressão com constante');
checa(T.preencher('{{anos}}', caso, R) === '2023, 2024 e 2025', 'anos');
// gerador no estilo do grupo: texto para todos os índices, sem lixo
for (const i of R.indices) {
  const o = T.estiloGrupo(i, R, caso);
  checa(o.startsWith('De acordo com os dados calculados de') && !/NaN|undefined|\[\?\]/.test(o), `estilo do grupo ${i.id}: ${o.slice(0, 120)}`);
}
if (erros.length) { console.error('Falhas:\n- ' + erros.join('\n- ')); process.exit(1); }
console.log(`Textos do trabalho: ${textos.length} textos e 17 índices conferidos.`);
