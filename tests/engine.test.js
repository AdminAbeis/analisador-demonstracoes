// Testes do motor: gabarito da Cia Grega e coerência entre a base CVM e o caso digitado da WEG.
// Uso: node tests/engine.test.js   (rode antes: python pipeline/test_cvm.py)
const assert = require('assert');
const path = require('path');
const E = require('../engine.js');
const EX = { 'cia-grega': require('./cia-grega.json'), weg: require('./weg-digitada.json') };
let falhas = 0;
const t = (nome, fn) => { try { fn(); console.log('ok  ', nome); } catch (e) { falhas++; console.log('FALHOU', nome, '\n     ', e.message); } };

const ESPERADO = {
  LI: [[.30, .35, .39], 2], LC: [[3.31, 2.87, 2.85], 2], LS: [[2.63, 2.43, 2.38], 2], LG: [[1.51, 1.73, 1.92], 2],
  PCT: [[85, 71, 65], 0], CE: [[43, 57, 64], 0], IPL: [[57, 48, 40], 0], IRNC: [[38, 37, 33], 0],
  GA: [[.60, .98, 1.00], 2], ML: [[13.16, 11.55, 12.46], 2], RA: [[7.87, 11.28, 12.43], 2], RPL: [[14.54, 19.26, 20.45], 2],
  PMRE: [[135, 61, 70], 0], PMRV: [[168, 111, 97], 0], PMPC: [[null, 38, 35], 0], CO: [[303, 172, 167], 0], CF: [[null, 134, 132], 0]
};

t('Cia Grega reproduz os 51 valores do material', () => {
  const R = E.analisar(EX['cia-grega'], {});
  for (const [id, [esp, dec]] of Object.entries(ESPERADO)) esp.forEach((e, k) => {
    const v = R.by[id].vals[k];
    if (e == null) assert.strictEqual(v, null, `${id}[${k}]`);
    else assert.strictEqual(Math.round(v * 10 ** dec) / 10 ** dec, e, `${id}[${k}]`);
  });
});

t('Cia Grega: texto da liquidez corrente segue o modelo da professora', () => {
  const tx = E.analisar(EX['cia-grega'], {}).by.LC.texto;
  assert.ok(tx.includes('ambos aumentaram, só que o ativo circulante teve um aumento de 27,83% e o passivo circulante de 48,34%'), tx);
  assert.ok(tx.includes('Para cada R$ 1,00 de passivo circulante, a empresa possui 2,85'), tx);
});

t('WEG: base da CVM e caso digitado dão os mesmos índices', () => {
  const doc = require(path.join(__dirname, 'fixtures/saida/cia/5410.json'));
  const A = E.analisar(E.casoDaBase(doc, 0, doc.periodos.length - 1), {});
  const B = E.analisar(EX.weg, {});
  for (const i of A.indices) assert.deepStrictEqual(i.fmt, B.by[i.id].fmt, i.id);
});

t('Base da CVM: estoque do ano anterior vira estoque inicial', () => {
  const doc = require(path.join(__dirname, 'fixtures/saida/cia/5410.json'));
  const caso = E.casoDaBase(doc, 1, 2);
  assert.strictEqual(caso.extras.estoqueInicial, 7116286);
  const R = E.analisar(caso, {});
  assert.deepStrictEqual(R.by.PMPC.fmt, ['49', '37']);
});

t('Sinais: custos digitados negativos são tratados como positivos', () => {
  const c = JSON.parse(JSON.stringify(EX['cia-grega']));
  c.contas.find(x => x.cod === 'DRE.CMV').v = [-1846, -3214, -3664];
  assert.deepStrictEqual(E.analisar(c, {}).by.PMRE.fmt, ['135', '61', '70']);
});

t('Parâmetros alternativos (saldo médio, CT/AT) calculam sem erro', () => {
  const R = E.analisar(EX.weg, { saldos: 'medio', pctModo: 'ct_at', dias: 365, lsModo: 'est' });
  assert.strictEqual(R.by.GA.vals[0], null);
  assert.ok(R.by.PCT.vals[2] > 50 && R.by.PCT.vals[2] < 60);
});

t('Um único período não quebra o texto', () => {
  const doc = require(path.join(__dirname, 'fixtures/saida/cia/5410.json'));
  const R = E.analisar(E.casoDaBase(doc, 2, 2), {});
  assert.ok(R.by.LC.texto.includes('o valor em 2025 foi de 1,55'), R.by.LC.texto);
});

t('Base da CVM: resumo da DFC acompanha o intervalo de anos', () => {
  const doc = require(path.join(__dirname, 'fixtures/saida/cia/5410.json'));
  const caso = E.casoDaBase(doc, 1, 2);
  const fim = caso.dfc.find(l => l.cod === 'DFC.FIM').v;
  const caixa = caso.contas.filter(c => c.cod === 'AC.DISP').reduce((a, c) => a.map((x, i) => x + c.v[i]), [0, 0]);
  assert.deepStrictEqual(fim, caixa);
  assert.deepStrictEqual(caso.sel, { de: 1, ate: 2 });
});

t('Detalhe do cálculo: numerador e denominador somam o índice', () => {
  const doc = require(path.join(__dirname, 'fixtures/saida/cia/5410.json'));
  const R = E.analisar(E.casoDaBase(doc, 0, 2), {});
  const d = R.by.LC.detalhe[2];
  assert.strictEqual(d.num.contas.reduce((a, c) => a + c.k * c.v, 0), d.N);
  assert.strictEqual(Math.round(d.N / d.D * 100) / 100, 1.55);
  assert.strictEqual(R.by.PMPC.detalhe[1].den.compras.total, 27960761);
  assert.strictEqual(R.by.CF.detalhe[2].partes.length, 3);
});

if (falhas) { console.log(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nMotor: todos os testes passaram.');
