/* Interface do Analisador de Demonstrações. Depende de engine.js (window.Engine) e exemplos.js (window.EXEMPLOS). */
(() => {
const E = window.Engine;
const EX = window.EXEMPLOS || {};
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = E.fmtN;
const clone = o => JSON.parse(JSON.stringify(o));
const CHAVE = 'analisador-dc-v2';
const BASE_URL = 'data/';
// Fora do Claude (GitHub Pages, servidor local ou arquivo aberto no computador) os downloads funcionam.
const PODE_EXPORTAR = /(^|\.)github\.io$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === 'file:';

const ESPERADO = {
  LI: [[.30, .35, .39], 2], LC: [[3.31, 2.87, 2.85], 2], LS: [[2.63, 2.43, 2.38], 2], LG: [[1.51, 1.73, 1.92], 2],
  PCT: [[85, 71, 65], 0], CE: [[43, 57, 64], 0], IPL: [[57, 48, 40], 0], IRNC: [[38, 37, 33], 0],
  GA: [[.60, .98, 1.00], 2], ML: [[13.16, 11.55, 12.46], 2], RA: [[7.87, 11.28, 12.43], 2], RPL: [[14.54, 19.26, 20.45], 2],
  PMRE: [[135, 61, 70], 0], PMRV: [[168, 111, 97], 0], PMPC: [[null, 38, 35], 0], CO: [[303, 172, 167], 0], CF: [[null, 134, 132], 0]
};
const NOMES_GRUPO = Object.fromEntries(E.GRUPOS_BP);

function casoBranco() {
  return {
    preset: 'branco', empresa: '', fonte: '', periodos: ['Ano 1', 'Ano 2', 'Ano 3'], extras: { estoqueInicial: '', compras: [] },
    contas: E.CODIGOS.filter(([c]) => !['AC.APLIC', 'AC.DESPANT', 'ANC.INV', 'ANC.INT', 'PL.RES', 'DRE.LB', 'DRE.RO', 'DRE.OUT'].includes(c))
      .map(([cod, nome]) => ({ nome, cod, v: [null, null, null] }))
  };
}

let state = { caso: clone(EX['cia-grega']), params: { ...E.PADRAO }, aba: 'analise', editado: false, cvm: null };
let R = null;
let BASE = null;          // empresas.json
let DOC = null;           // arquivo da empresa escolhida na base CVM

function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify({ caso: state.caso, params: state.params, editado: state.editado, aba: state.aba, cvm: state.cvm })); } catch (e) { }
}
function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (s && s.caso && Array.isArray(s.caso.contas)) {
      state.caso = s.caso; state.params = { ...E.PADRAO, ...(s.params || {}) }; state.editado = !!s.editado;
      state.cvm = s.cvm || null; if (s.aba) state.aba = s.aba;
    }
  } catch (e) { }
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2600);
}
function copiar(texto, rotulo) {
  const fallback = () => {
    irAba('analise');
    const box = $('#copia-fallback');
    if (box) { box.hidden = false; const ta = box.querySelector('textarea'); ta.value = texto; ta.focus(); ta.select(); }
    toast('Selecione o texto e copie manualmente');
  };
  try { navigator.clipboard.writeText(texto).then(() => toast(rotulo + ' copiado'), fallback); } catch (e) { fallback(); }
}
function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const slug = s => (s || 'empresa').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ---------- números pt-BR ----------
function parseBR(s) {
  if (s == null) return null;
  s = String(s).trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s);
  if (!isFinite(v)) return null;
  return neg ? -v : v;
}
const fmtInput = v => (v == null || v === '') ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtMoeda = v => fmtN(v, Number.isInteger(v) ? 0 : 2);

// ---------- base da CVM ----------
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
async function carregarBase() {
  const st = $('#status-base');
  try {
    const r = await fetch(BASE_URL + 'empresas.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    BASE = await r.json();
    BASE.empresas.forEach(e => { e._b = norm([e.n, e.nc, (e.t || []).join(' '), e.cnpj, (e.cnpj || '').replace(/\D/g, ''), e.c].join(' ')); });
    const n = BASE.empresas.filter(e => !e.fin).length;
    const data = BASE.atualizado ? BASE.atualizado.split('-').reverse().join('/') : '';
    st.textContent = BASE.demo
      ? `Base de demonstração com ${n} companhia. A base completa, com todas as companhias abertas, é gerada pela atualização semanal no GitHub.`
      : `${n.toLocaleString('pt-BR')} companhias abertas com balanço e DRE na CVM (${faixaAnos()}), atualizado em ${data}.`;
    $('#rodape').innerHTML = `Dados: <a href="https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp" target="_blank" rel="noopener">CVM, Portal de Dados Abertos</a> (licença ODbL). Os textos são gerados por regras e devem ser revisados antes de entregar.`;
    if (state.cvm && state.caso.preset === 'cvm') abrirEmpresa(state.cvm.c, state.cvm.de, state.cvm.ate, true);
  } catch (e) {
    BASE = null;
    $('#busca').disabled = true;
    st.textContent = 'A lista de companhias da CVM não está disponível nesta página. Use os exemplos, importe um arquivo ou digite os dados na aba Dados.';
  }
}
function faixaAnos() {
  const anos = BASE.empresas.flatMap(e => e.a || []).map(a => parseInt(a, 10)).filter(Boolean);
  return anos.length ? `${Math.min(...anos)}–${Math.max(...anos)}` : '';
}
function buscar(q) {
  const ul = $('#resultados');
  if (!BASE || q.trim().length < 2) { ul.hidden = true; ul.innerHTML = ''; return; }
  const termos = norm(q).split(/\s+/).filter(Boolean);
  const qDig = q.replace(/\D/g, '');
  let res = BASE.empresas.filter(e => termos.every(t => e._b.includes(t)) || (qDig.length >= 6 && e._b.includes(qDig)));
  res.sort((a, b) => (!!a.fin - !!b.fin) || ((a.sit === 'CANCELADA') - (b.sit === 'CANCELADA')) || (b.a.length - a.a.length) || a.n.localeCompare(b.n));
  res = res.slice(0, 30);
  if (!res.length) { ul.innerHTML = `<li><span class="res-info" style="display:block;padding:10px 12px">Nenhuma companhia encontrada para “${esc(q)}”.</span></li>`; ul.hidden = false; return; }
  ul.innerHTML = res.map(e => {
    const anos = e.a.length ? `${e.a[0]}–${e.a[e.a.length - 1]}` : '';
    const info = e.fin ? 'Instituição financeira: o plano de contas de bancos e seguradoras ainda não é suportado.'
      : [e.s, anos && `balanços de ${anos}`, e.sit && e.sit !== 'ATIVO' ? `registro ${e.sit.toLowerCase()}` : ''].filter(Boolean).join(' · ');
    return `<li><button type="button" data-cd="${esc(e.c)}"${e.fin ? ' aria-disabled="true"' : ''}><span class="res-nome">${esc(e.n)}</span><span class="res-tick">${esc((e.t || []).join(' '))}</span><span class="res-info">${esc(info)}</span></button></li>`;
  }).join('');
  ul.hidden = false;
}
$('#busca').addEventListener('input', e => buscar(e.target.value));
$('#busca').addEventListener('keydown', e => {
  if (e.key === 'Enter') { const b = $('#resultados button:not([aria-disabled="true"])'); if (b) b.click(); }
  if (e.key === 'Escape') { $('#resultados').hidden = true; }
});
$('#resultados').addEventListener('click', e => {
  const b = e.target.closest('button[data-cd]'); if (!b || b.getAttribute('aria-disabled') === 'true') return;
  $('#resultados').hidden = true; $('#busca').value = '';
  abrirEmpresa(b.dataset.cd);
});
async function abrirEmpresa(cd, de, ate, silencioso) {
  const st = $('#status-base');
  try {
    if (!DOC || DOC.cd_cvm !== cd) {
      st.textContent = 'Carregando as demonstrações…';
      const r = await fetch(`${BASE_URL}cia/${encodeURIComponent(cd)}.json`);
      if (!r.ok) throw new Error(r.status);
      DOC = await r.json();
    }
    const n = DOC.periodos.length;
    if (ate == null || ate >= n) ate = n - 1;
    if (de == null || de > ate) de = Math.max(0, ate - 2);
    montarPeriodos(de, ate);
    aplicarEmpresa(de, ate);
    const e = BASE && BASE.empresas.find(x => x.c === cd);
    st.textContent = `${DOC.empresa}${e && e.t && e.t.length ? ' (' + e.t.join(', ') + ')' : ''}: ${n} exercícios disponíveis na CVM.`;
    if (!silencioso) { irAba('analise'); toast('Demonstrações carregadas'); }
  } catch (err) {
    st.textContent = 'Não foi possível carregar as demonstrações desta companhia. Tente novamente.';
  }
}
function montarPeriodos(de, ate) {
  const ops = DOC.periodos.map((p, i) => `<option value="${i}">${esc(p.rotulo)}</option>`).join('');
  $('#per-de').innerHTML = ops; $('#per-ate').innerHTML = ops;
  $('#per-de').value = String(de); $('#per-ate').value = String(ate);
  $('#periodos').hidden = false;
}
function aplicarEmpresa(de, ate) {
  state.caso = E.casoDaBase(DOC, de, ate);
  state.cvm = { c: DOC.cd_cvm, de, ate };
  state.editado = false;
  const qtd = ate - de + 1;
  $('#info-periodos').textContent = `${qtd} ${qtd === 1 ? 'exercício' : 'exercícios'}` + (state.caso.extras.estoqueInicial !== '' ? ` · estoque de ${DOC.periodos[de - 1].rotulo} usado para o PMPC do primeiro ano` : '');
  recalcular(); renderDados();
}
['#per-de', '#per-ate'].forEach(id => $(id).addEventListener('change', () => {
  let de = +$('#per-de').value, ate = +$('#per-ate').value;
  if (de > ate) { if (document.activeElement && document.activeElement.id === 'per-de') ate = de; else de = ate; }
  $('#per-de').value = String(de); $('#per-ate').value = String(ate);
  aplicarEmpresa(de, ate);
}));

// ---------- recálculo ----------
function recalcular() {
  R = E.analisar(state.caso, state.params);
  $('#titulo-empresa').textContent = state.caso.empresa || 'Empresa sem nome';
  const p = state.caso.periodos;
  const padrao = JSON.stringify(state.params) === JSON.stringify(E.PADRAO);
  const origem = state.caso.preset === 'cvm' ? 'dados da CVM, R$ mil' : state.caso.preset === 'cia-grega' ? 'exemplo da Profa. Isabel' : state.caso.preset === 'weg' ? 'digitado do PDF, R$ mil' : 'dados próprios';
  $('#meta-caso').textContent = `${p.length} ${p.length === 1 ? 'período' : 'períodos'} (${p[0]}${p.length > 1 ? ' a ' + p[p.length - 1] : ''}) · ${origem} · ${state.caso.contas.length} contas · parâmetros ${padrao ? 'no padrão da Profa. Isabel' : 'personalizados'}${state.editado ? ' · dados editados' : ''}`;
  if (state.caso.preset !== 'cvm') $('#periodos').hidden = true;
  renderAnalise(); renderEstrutura(); renderTeste();
  salvar();
}

// ---------- Análise ----------
function chip(i) {
  if (!i.t) return '<span class="chip neutro">sem comparação</span>';
  if (i.t.est) return `<span class="chip neutro">→ estável</span>`;
  const seta = i.t.d > 0 ? '↑' : '↓';
  return `<span class="chip ${i.t.melhora ? 'bom' : 'ruim'}">${seta} ${esc(i.delta.replace(/^[+−]/, ''))} · ${i.t.melhora ? 'melhora' : 'piora'}</span>`;
}
const nomeIndice = i => { const n = i.nome.replace(/^(o|a) /, ''); return n[0].toUpperCase() + n.slice(1); };
function renderAnalise() {
  const el = $('#p-analise'); const per = state.caso.periodos;
  let h = '';
  if (R.avisos.length) h += `<div class="aviso" role="status"><strong>Confira os dados antes de usar a análise</strong><ul>${R.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  if (per.length < 2) h += `<div class="aviso"><strong>Só um período selecionado.</strong> Os índices são calculados, mas a análise de evolução precisa de pelo menos dois períodos.</div>`;
  h += `<div class="barra-acoes"><button class="btn primario" type="button" data-copiar="tudo">Copiar análise completa</button><span class="nota">Texto gerado por regras a partir dos números. Revise antes de entregar.</span></div>`;
  h += `<div class="copia-fallback" id="copia-fallback" hidden><label for="ta-fallback" class="nota">A cópia automática foi bloqueada. Selecione e copie:</label><textarea id="ta-fallback" readonly></textarea></div>`;
  if (state.caso.fonte) h += `<p class="nota">Fonte: ${esc(state.caso.fonte)}</p>`;
  for (const g of R.grupos) {
    const its = g.ids.map(id => R.by[id]);
    h += `<section class="grupo" id="g-${g.id}"><div class="grupo-cab"><h2>${esc(g.titulo)}</h2><span class="regra">${its.length} índices</span></div>`;
    h += `<p class="sintese">${esc(g.sintese)}</p>`;
    h += `<div class="rolagem"><table><thead><tr><th>Índice</th>${per.map(p => `<th class="n">${esc(p)}</th>`).join('')}<th>Evolução</th></tr></thead><tbody>`;
    for (const i of its) h += `<tr><td class="sigla"><a href="#ind-${i.id}">${i.id}</a></td>${i.fmt.map(v => `<td class="n">${esc(v)}</td>`).join('')}<td>${chip(i)}</td></tr>`;
    h += `</tbody></table></div>`;
    for (const i of its) {
      h += `<article class="indice" id="ind-${i.id}"><div class="ind-cab"><span class="sigla">${i.id}</span><h3>${esc(nomeIndice(i))}</h3>${chip(i)}</div>`;
      h += `<div class="formula">${esc(i.formula)} · ${i.dir > 0 ? 'quanto maior, melhor' : 'quanto menor, melhor'}</div>`;
      h += `<div class="calculos">${i.calc.map((c, k) => `<span><b>${esc(per[k])}</b> ${c ? esc(c) : 'não calculável'}</span>`).join('')}</div>`;
      h += `<p class="leitura">${esc(i.texto)}</p>`;
      h += `<div class="ind-acoes"><button class="btn mini" type="button" data-copiar="${i.id}">Copiar parágrafo</button></div></article>`;
    }
    h += `</section>`;
  }
  h += `<section class="conclusao"><h2>Conclusão integrada</h2><ul>${R.conclusao.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>`;
  el.innerHTML = h;
}
function textoCompleto() {
  const L = [`Análise das demonstrações contábeis: ${state.caso.empresa || 'Empresa'}`, ''];
  if (state.caso.fonte) L.push('Fonte: ' + state.caso.fonte, '');
  for (const g of R.grupos) {
    L.push(g.titulo.toUpperCase(), g.sintese, '');
    for (const id of g.ids) { const i = R.by[id]; L.push(`${i.id}: ${nomeIndice(i)}`, i.texto, ''); }
  }
  L.push('CONCLUSÃO INTEGRADA', ...R.conclusao);
  return L.join('\n');
}
function documentoWord() {
  const per = state.caso.periodos;
  const css = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}h1{font-size:18pt}h2{font-size:14pt;margin-top:18pt}h3{font-size:12pt;margin-bottom:2pt}table{border-collapse:collapse;margin:6pt 0}td,th{border:1px solid #999;padding:3pt 6pt;font-size:10pt}th{background:#e8ece9}.n{text-align:right}.f{color:#555;font-size:9.5pt}p{text-align:justify}`;
  let h = `<html><head><meta charset="utf-8"><title>Análise ${esc(state.caso.empresa)}</title><style>${css}</style></head><body>`;
  h += `<h1>Análise das demonstrações contábeis: ${esc(state.caso.empresa || 'Empresa')}</h1>`;
  if (state.caso.fonte) h += `<p class="f">Fonte: ${esc(state.caso.fonte)}</p>`;
  for (const g of R.grupos) {
    const its = g.ids.map(id => R.by[id]);
    h += `<h2>${esc(g.titulo)}</h2><table><tr><th>Índice</th><th>Fórmula</th>${per.map(p => `<th>${esc(p)}</th>`).join('')}</tr>`;
    h += its.map(i => `<tr><td>${esc(nomeIndice(i))} (${i.id})</td><td>${esc(i.formula)}</td>${i.fmt.map(v => `<td class="n">${esc(v)}</td>`).join('')}</tr>`).join('') + '</table>';
    h += `<p>${esc(g.sintese)}</p>`;
    for (const i of its) h += `<h3>${esc(nomeIndice(i))} (${i.id})</h3><p>${esc(i.texto)}</p>`;
  }
  h += `<h2>Conclusão integrada</h2>${R.conclusao.map(c => `<p>${esc(c)}</p>`).join('')}</body></html>`;
  return h;
}

// ---------- AV e AH ----------
function renderEstrutura() {
  const el = $('#p-estrutura'); const per = state.caso.periodos;
  let h = `<p class="nota">Análise vertical: contas do balanço sobre o ativo total; contas da DRE sobre a receita líquida. Análise horizontal: base 100 em ${esc(per[0])}, e variação em relação ao período anterior.</p>`;
  for (const g of R.estrutura.grupos) {
    h += `<section class="grupo"><div class="grupo-cab"><h2>${esc(g.titulo)}</h2></div>`;
    if (g.rep) h += `<p class="leitura">${esc(g.rep)}</p>`;
    const linhas = [...g.linhas, ...(g.total ? [g.total] : [])];
    h += `<div class="rolagem"><table><thead><tr><th>Conta</th>${per.map(p => `<th class="n">${esc(p)}</th>`).join('')}${per.map(p => `<th class="n">AV ${esc(p)}</th>`).join('')}${per.slice(1).map(p => `<th class="n">AH ${esc(p)}</th>`).join('')}${per.slice(1).map(p => `<th class="n">Var. ${esc(p)}</th>`).join('')}</tr></thead><tbody>`;
    linhas.forEach((l, k) => {
      const tot = g.total && k === linhas.length - 1;
      h += `<tr class="${tot ? 'total' : ''} ${l.detalhe ? 'detalhe' : ''}"><td>${esc(l.nome)}</td>${l.v.map(v => `<td class="n">${v == null ? '—' : fmtMoeda(v)}</td>`).join('')}${l.av.map(v => `<td class="n">${v == null ? '—' : fmtN(v, 2) + '%'}</td>`).join('')}${l.ah.slice(1).map(v => `<td class="n">${v == null ? '—' : fmtN(v, 2)}</td>`).join('')}${l.var.slice(1).map(v => `<td class="n">${v == null ? '—' : (v >= 0 ? '+' : '−') + fmtN(Math.abs(v), 2) + '%'}</td>`).join('')}</tr>`;
    });
    h += `</tbody></table></div></section>`;
  }
  const T = R.estrutura.totais;
  h += `<div class="rolagem"><table><thead><tr><th>Conferência</th>${per.map(p => `<th class="n">${esc(p)}</th>`).join('')}</tr></thead><tbody>
    <tr><td>${T.AT.nome}</td>${T.AT.v.map(v => `<td class="n">${v == null ? '—' : fmtMoeda(v)}</td>`).join('')}</tr>
    <tr><td>${T.PT.nome}</td>${T.PT.v.map(v => `<td class="n">${v == null ? '—' : fmtMoeda(v)}</td>`).join('')}</tr></tbody></table></div>`;
  el.innerHTML = h;
}

// ---------- Dados ----------
function opcoesCodigo(sel) {
  let h = ''; let gAtual = '';
  for (const [cod, nome] of E.CODIGOS) {
    const g = cod.split('.')[0];
    if (g !== gAtual) { if (gAtual) h += '</optgroup>'; h += `<optgroup label="${esc(NOMES_GRUPO[g])}">`; gAtual = g; }
    h += `<option value="${cod}"${cod === sel ? ' selected' : ''}>${esc(nome)}</option>`;
  }
  return h + '</optgroup>';
}
function renderDados() {
  const el = $('#p-dados'); const c = state.caso; const per = c.periodos;
  let h = `<div class="form-params"><fieldset><legend>Caso</legend>
    <div class="campo"><label for="d-empresa">Nome da empresa (usado no texto: “No caso da …”)</label><input type="text" id="d-empresa" value="${esc(c.empresa)}"></div>
    <div class="campo"><label for="d-ei">Estoque do período anterior ao primeiro (opcional)</label><input type="text" id="d-ei" inputmode="decimal" value="${esc(fmtInput(parseBR(c.extras && c.extras.estoqueInicial)))}"><small>Sem ele, o PMPC e o ciclo financeiro do primeiro período não são calculados. Na base da CVM ele é preenchido automaticamente quando o ano anterior existe.</small></div>
    ${c.fonte ? `<p class="nota">${esc(c.fonte)}</p>` : ''}
  </fieldset></div>`;
  h += `<div class="barra-acoes"><button class="btn" type="button" id="btn-add-periodo">+ Período</button><button class="btn" type="button" id="btn-rem-periodo"${per.length <= 1 ? ' disabled' : ''}>Remover último período</button><span class="nota">Aceita formato brasileiro (1.026,00) e negativos entre parênteses. Custos e despesas podem ser digitados com ou sem sinal.</span></div>`;
  h += `<div class="rolagem dados"><table><thead><tr><th>Conta</th><th>Classificação</th>${per.map((p, i) => `<th class="n"><input class="periodo" type="text" id="per-${i}" data-per="${i}" value="${esc(p)}" aria-label="Nome do período ${i + 1}"></th>`).join('')}<th>Detalhe</th><th><span hidden>Ações</span></th></tr></thead><tbody>`;
  for (const [g, titulo] of E.GRUPOS_BP) {
    h += `<tr class="cab-grupo"><td colspan="${per.length + 4}">${esc(titulo)}<button class="btn mini" type="button" data-add="${g}">+ conta</button></td></tr>`;
    c.contas.forEach((ct, k) => {
      if (ct.cod.split('.')[0] !== g) return;
      h += `<tr><td><input class="nome" type="text" id="cn-${k}" data-k="${k}" data-campo="nome" value="${esc(ct.nome)}" aria-label="Nome da conta"></td>
        <td><select id="cc-${k}" data-k="${k}" data-campo="cod" aria-label="Classificação">${opcoesCodigo(ct.cod)}</select></td>
        ${per.map((p, i) => `<td><input class="valor" type="text" inputmode="decimal" id="cv-${k}-${i}" data-k="${k}" data-i="${i}" value="${esc(fmtInput(ct.v[i]))}" aria-label="${esc(ct.nome)} em ${esc(p)}"></td>`).join('')}
        <td><label class="check" title="Conta já incluída em outra (não entra na soma do grupo)"><input type="checkbox" id="cd-${k}" data-k="${k}" data-campo="detalhe"${ct.detalhe ? ' checked' : ''}> já incluída</label></td>
        <td><button class="btn fantasma mini" type="button" data-rem="${k}" aria-label="Remover ${esc(ct.nome)}">Remover</button></td></tr>`;
    });
  }
  h += `</tbody></table></div>`;
  h += `<p class="nota">“Já incluída” marca uma conta de detalhe que já está somada em outra (como fornecedores dentro de um passivo circulante não detalhado): ela entra nas fórmulas que a usam, mas não na soma do grupo.</p>`;
  h += `<details><summary class="btn mini" style="display:inline-flex">Colar dados em CSV</summary><div class="copia-fallback" style="margin-top:10px"><label for="ta-colar" class="nota">Uma linha por conta: <code>conta;classificação;valor1;valor2;…</code>. A linha de cabeçalho traz os períodos: <code>conta;classificacao;2023;2024;2025</code>. Classificações: ${E.CODIGOS.map(([c]) => c).join(', ')}. Use “*” no fim da classificação para conta já incluída (ex.: PC.FORN*). Uma linha <code>#empresa;Nome</code> define o nome.</label><textarea id="ta-colar" placeholder="conta;classificacao;2023;2024;2025"></textarea><div><button class="btn primario" type="button" id="btn-colar">Usar estes dados</button></div></div></details>`;
  el.innerHTML = h;
}
function editado() { state.editado = true; if (state.caso.preset === 'cvm') state.caso.preset = 'cvm-editado'; }
$('#p-dados').addEventListener('change', e => {
  const t = e.target; const c = state.caso;
  if (t.id === 'd-empresa') c.empresa = t.value.trim();
  else if (t.id === 'd-ei') { c.extras = c.extras || {}; const v = parseBR(t.value); c.extras.estoqueInicial = v == null ? '' : v; t.value = fmtInput(v); }
  else if (t.dataset.per != null) c.periodos[+t.dataset.per] = t.value.trim() || `Período ${+t.dataset.per + 1}`;
  else if (t.dataset.i != null) { const v = parseBR(t.value); c.contas[+t.dataset.k].v[+t.dataset.i] = v; t.value = fmtInput(v); }
  else if (t.dataset.campo === 'nome') c.contas[+t.dataset.k].nome = t.value.trim() || 'Conta sem nome';
  else if (t.dataset.campo === 'cod') { c.contas[+t.dataset.k].cod = t.value; editado(); recalcular(); renderDados(); return; }
  else if (t.dataset.campo === 'detalhe') c.contas[+t.dataset.k].detalhe = t.checked;
  else return;
  editado(); recalcular();
});
$('#p-dados').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const c = state.caso;
  if (b.dataset.add) {
    const cod = E.CODIGOS.find(([k]) => k.startsWith(b.dataset.add + '.') && /OUT$|LL$/.test(k)) || E.CODIGOS.find(([k]) => k.startsWith(b.dataset.add + '.'));
    c.contas.push({ nome: 'Nova conta', cod: cod[0], v: c.periodos.map(() => null) });
  } else if (b.dataset.rem != null) c.contas.splice(+b.dataset.rem, 1);
  else if (b.id === 'btn-add-periodo') {
    const ult = c.periodos[c.periodos.length - 1]; const m = ult.match(/^(.*?)(\d+)$/);
    c.periodos.push(m ? m[1] + (Number(m[2]) + 1) : `Período ${c.periodos.length + 1}`);
    c.contas.forEach(ct => ct.v.push(null));
  } else if (b.id === 'btn-rem-periodo') { if (c.periodos.length <= 1) return; c.periodos.pop(); c.contas.forEach(ct => ct.v.pop()); }
  else if (b.id === 'btn-colar') {
    const novo = lerArquivo($('#ta-colar').value);
    if (!novo) { toast('Formato não reconhecido. Confira o cabeçalho e o separador.'); return; }
    usarCaso(novo, true); toast('Dados importados'); return;
  } else return;
  editado(); recalcular(); renderDados();
});

// ---------- importação e exportação ----------
function paraCSV() {
  const c = state.caso;
  const L = [`#empresa;${c.empresa || ''}`];
  if (c.extras && c.extras.estoqueInicial !== '' && c.extras.estoqueInicial != null) L.push(`#estoque_inicial;${fmtInput(c.extras.estoqueInicial).replace(/\./g, '')}`);
  if (c.sinais) L.push(`#sinais;${c.sinais}`);
  L.push(['conta', 'classificacao', ...c.periodos].join(';'));
  for (const ct of c.contas) L.push([ct.nome.replace(/;/g, ','), ct.cod + (ct.detalhe ? '*' : ''), ...ct.v.map(v => v == null ? '' : fmtInput(v).replace(/\./g, ''))].join(';'));
  return L.join('\n');
}
function lerArquivo(txt) {
  txt = (txt || '').replace(/^﻿/, '').trim();
  if (!txt) return null;
  if (txt[0] === '{') {
    try {
      const o = JSON.parse(txt); const c = o.caso || o;
      if (Array.isArray(c.contas) && Array.isArray(c.periodos)) {
        if (o.params) state.params = { ...E.PADRAO, ...o.params };
        if (c.cd_cvm && c.periodos[0] && typeof c.periodos[0] === 'object') return E.casoDaBase(c, 0, c.periodos.length - 1);
        return { extras: { estoqueInicial: '', compras: [] }, ...c, preset: 'importado' };
      }
    } catch (e) { }
    return null;
  }
  const linhas = txt.split(/\r?\n/).filter(l => l.trim());
  const sep = linhas.some(l => l.includes(';')) ? ';' : (linhas.some(l => l.includes('\t')) ? '\t' : ',');
  let empresa = '', ei = '', sinais = '', periodos = null; const contas = [];
  const validos = new Set(E.CODIGOS.map(([c]) => c));
  for (const l of linhas) {
    const cel = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
    if (/^#empresa$/i.test(cel[0])) { empresa = cel[1] || ''; continue; }
    if (/^#estoque_inicial$/i.test(cel[0])) { ei = parseBR(cel[1]); continue; }
    if (/^#sinais$/i.test(cel[0])) { sinais = cel[1] || ''; continue; }
    if (!periodos && /^conta$/i.test(cel[0])) { periodos = cel.slice(2).filter(Boolean); continue; }
    if (!periodos) continue;
    let cod = (cel[1] || '').toUpperCase(); const det = cod.endsWith('*'); cod = cod.replace('*', '');
    if (!validos.has(cod)) continue;
    contas.push({ nome: cel[0] || 'Conta', cod, detalhe: det, v: periodos.map((_, i) => parseBR(cel[2 + i])) });
  }
  if (!periodos || !periodos.length || !contas.length) return null;
  return { preset: 'importado', empresa, fonte: '', sinais: sinais || undefined, periodos, extras: { estoqueInicial: ei == null ? '' : ei, compras: [] }, contas };
}
function usarCaso(caso, editadoFlag) {
  state.caso = caso; state.editado = !!editadoFlag; state.cvm = null; DOC = null;
  $('#periodos').hidden = true; $('#sel-exemplo').value = '';
  recalcular(); renderDados(); renderParams();
}
$('#arq-importar').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const novo = lerArquivo(String(rd.result)); e.target.value = '';
    if (!novo) { toast('Arquivo não reconhecido. Use o modelo CSV ou um .json salvo pelo sistema.'); return; }
    usarCaso(novo, false); toast('Dados importados');
  };
  rd.readAsText(f, 'utf-8');
});
$('#btn-copiar-csv').addEventListener('click', () => copiar(paraCSV(), 'CSV'));
$('#btn-word').addEventListener('click', () => baixar(`analise-${slug(state.caso.empresa)}.doc`, '﻿' + documentoWord(), 'application/msword'));
$('#btn-pdf').addEventListener('click', () => { irAba('analise'); setTimeout(() => window.print(), 50); });
$('#btn-json').addEventListener('click', () => baixar(`caso-${slug(state.caso.empresa)}.json`, JSON.stringify({ caso: state.caso, params: state.params }, null, 1), 'application/json'));
$('#exportar').hidden = !PODE_EXPORTAR;
$('#sel-exemplo').addEventListener('change', e => {
  const v = e.target.value; if (!v) return;
  usarCaso(v === 'branco' ? casoBranco() : clone(EX[v]), false);
  e.target.value = v;
  if (v === 'branco') irAba('dados');
});

// ---------- Parâmetros ----------
const CAMPOS = [
  ['Cálculo dos índices', [
    ['saldos', 'Base de saldos em giro, rentabilidades e prazos', [['final', 'Saldo final do período (Isabel)'], ['medio', 'Saldo médio: (inicial + final) ÷ 2']]],
    ['dias', 'Dias no ano dos prazos médios', [['360', '360 (Isabel)'], ['365', '365']]],
    ['lsModo', 'Numerador da liquidez seca', [['est_da', 'AC − Estoques − Desp. antecipadas (Isabel)'], ['est', 'AC − Estoques']]],
    ['liModo', 'Disponível na liquidez imediata', [['disp_aplic', 'Caixa, equivalentes e aplicações (Isabel)'], ['disp', 'Só caixa e equivalentes']]],
    ['pctModo', 'Participação de capitais de terceiros', [['ct_pl', 'CT ÷ PL × 100 (Isabel)'], ['ct_at', 'CT ÷ Ativo total × 100 (Gustavo)']]],
    ['taxaRef', 'Taxa de referência para o ROE (% ao ano)', 'num', 'Opcional. Representa o custo de oportunidade dos sócios (Selic, CDI ou outra).']
  ]],
  ['Comparação no tempo', [
    ['varPct', 'Variação de índices em %', [['pp', 'Pontos percentuais (p.p.)'], ['pct', 'Como no exemplo (“redução de 20%”)']]],
    ['deltaArred', 'Calcular variações sobre', [['true', 'Valores arredondados, como na mão (Isabel)'], ['false', 'Valores exatos']]],
    ['decPct', 'Casas decimais dos índices em %', 'num'],
    ['estX', 'Faixa de estabilidade, índices em vezes (% de variação)', 'num', 'Abaixo disso, o índice é descrito como “praticamente estável”.'],
    ['estPP', 'Faixa de estabilidade, índices em % (p.p.)', 'num'],
    ['estDias', 'Faixa de estabilidade, prazos (dias)', 'num', 'A Cia Grega chama de “praticamente estável” um PMPC que foi de 38 para 35 dias.'],
    ['estGrupo', 'Faixa de estabilidade de numerador e denominador (%)', 'num']
  ]],
  ['Seleção de contas', [
    ['repAcum', 'Representatividade: limite acumulado (%)', 'num', 'Soma as maiores contas do grupo até atingir este percentual.'],
    ['repMin', 'Representatividade: peso mínimo (%)', 'num'],
    ['repMax', 'Representatividade: máximo de contas', 'num', 'Acima disso, o grupo é descrito como pulverizado.'],
    ['varAcum', 'Variação: limite acumulado (%)', 'num', 'Inclui contas até explicar este percentual da variação do grupo.'],
    ['varMin', 'Variação: contribuição mínima (%)', 'num'],
    ['atenuante', 'Atenuante: contribuição contrária mínima (%)', 'num', 'Contas que andaram no sentido oposto e são citadas como compensação.']
  ]]
];
function renderParams() {
  const P = state.params;
  let h = `<div class="barra-acoes"><button class="btn" type="button" id="btn-padrao">Voltar ao padrão da Profa. Isabel</button><span class="nota">Os valores de estabilidade e seleção ainda serão calibrados com mais textos da professora.</span></div><div class="form-params">`;
  for (const [leg, campos] of CAMPOS) {
    h += `<fieldset><legend>${esc(leg)}</legend>`;
    for (const [k, rot, tipo, ajuda] of campos) {
      h += `<div class="campo"><label for="p-${k}">${esc(rot)}</label>`;
      if (tipo === 'num') h += `<input type="text" inputmode="decimal" id="p-${k}" data-p="${k}" value="${esc(P[k] === '' ? '' : fmtInput(P[k]))}">`;
      else h += `<select id="p-${k}" data-p="${k}">${tipo.map(([v, l]) => `<option value="${v}"${String(P[k]) === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      if (ajuda) h += `<small>${esc(ajuda)}</small>`;
      h += `</div>`;
    }
    h += `</fieldset>`;
  }
  $('#p-params').innerHTML = h + '</div>';
}
$('#p-params').addEventListener('change', e => {
  const k = e.target.dataset.p; if (!k) return;
  let v = e.target.value;
  if (k === 'dias') v = Number(v);
  else if (k === 'deltaArred') v = v === 'true';
  else if (e.target.tagName === 'INPUT') { const n = parseBR(v); v = n == null ? (k === 'taxaRef' ? '' : E.PADRAO[k]) : n; e.target.value = v === '' ? '' : fmtInput(v); }
  state.params[k] = v; recalcular();
});
$('#p-params').addEventListener('click', e => {
  if (e.target.id === 'btn-padrao') { state.params = { ...E.PADRAO }; renderParams(); recalcular(); toast('Parâmetros restaurados'); }
});

// ---------- Teste ----------
function renderTeste() {
  const el = $('#p-teste');
  const ehCia = state.caso.preset === 'cia-grega' && !state.editado;
  const padrao = JSON.stringify(state.params) === JSON.stringify(E.PADRAO);
  let h = `<div class="grupo-cab"><h2>Gabarito: Cia Grega</h2></div><p class="leitura">Compara os índices calculados com os valores do material da Profa. Isabel (quadros 13 a 16). Cada valor é arredondado com as mesmas casas do material antes da comparação.</p>`;
  if (!ehCia) h += `<div class="aviso"><strong>O teste vale só para o exemplo da Cia Grega sem edições.</strong> Escolha “Cia Grega” em Exemplos e dados próprios.</div>`;
  else if (!padrao) h += `<div class="aviso"><strong>Os parâmetros não estão no padrão.</strong> Diferenças são esperadas; use “Voltar ao padrão” na aba Parâmetros.</div>`;
  if (ehCia) {
    let ok = 0, tot = 0, linhas = '';
    for (const [id, [esp, dec]] of Object.entries(ESPERADO)) {
      const i = R.by[id];
      const cel = esp.map((e, k) => {
        const v = i.vals[k]; const vr = v == null ? null : Math.round(v * 10 ** dec) / 10 ** dec;
        const bate = (e == null && v == null) || (e != null && vr != null && Math.abs(vr - e) < 1e-9);
        tot++; if (bate) ok++;
        return `<td class="n">${e == null ? 'n/c' : fmtN(e, dec)}</td><td class="n">${v == null ? 'n/c' : fmtN(vr, dec)} <span class="${bate ? 'ok' : 'falha'}">${bate ? '✓' : '✗'}</span></td>`;
      }).join('');
      linhas += `<tr><td class="sigla">${id}</td>${cel}</tr>`;
    }
    h += `<p class="leitura"><span class="${ok === tot ? 'ok' : 'falha'}">${ok} de ${tot}</span> valores conferem com o material.</p>`;
    h += `<div class="rolagem"><table><thead><tr><th>Índice</th>${state.caso.periodos.map(p => `<th class="n">${esc(p)} material</th><th class="n">${esc(p)} sistema</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
    h += `<p class="nota">n/c = não calculável (falta o estoque do ano 0 para apurar as compras). O IPL do ano 1 usa o numerador 1.591, que reproduz o 0,57 do material; o quadro impresso mostra 1.519.</p>`;
  }
  el.innerHTML = h;
}

// ---------- abas e cópia ----------
function irAba(nome) {
  state.aba = nome;
  for (const a of ['analise', 'estrutura', 'dados', 'params', 'teste']) {
    $('#t-' + a).setAttribute('aria-selected', String(a === nome));
    $('#p-' + a).hidden = a !== nome;
  }
  salvar();
}
document.querySelector('nav.abas').addEventListener('click', e => { const b = e.target.closest('.aba'); if (b) irAba(b.id.slice(2)); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copiar]'); if (!b) return;
  const k = b.dataset.copiar;
  copiar(k === 'tudo' ? textoCompleto() : R.by[k].texto, k === 'tudo' ? 'Análise' : 'Parágrafo');
});

carregar();
recalcular(); renderDados(); renderParams(); irAba(state.aba);
carregarBase();
})();
