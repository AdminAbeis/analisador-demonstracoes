/* Interface do Analisador de Demonstrações. Depende de engine.js (window.Engine). */
(() => {
const E = window.Engine;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = E.fmtN;
const clone = o => JSON.parse(JSON.stringify(o));
// Acesso: sem senha (site aberto), administrador ou leitura. window.ACESSO é definido por porta.js
// quando o site é publicado com senha (pipeline/proteger.js).
const ACESSO = window.ACESSO || null;
const LEITURA = !!ACESSO && ACESSO.modo === 'leitura';
const ADMIN = !!ACESSO && ACESSO.modo === 'admin';
const CHAVE = LEITURA ? 'analisador-dc-leitura' : 'analisador-dc-v3';
const CHAVE_LINK = 'analisador-dc-link';
let LINK = null;          // análise fixada pelo link de leitura: { c, de, ate, p }
let LINK_TOK = null;
const CD_INICIAL = '5410'; // WEG: empresa aberta na primeira visita
const BASE_URL = 'data/';
// Fora do Claude (GitHub Pages, servidor local ou arquivo aberto no computador) os downloads funcionam.
const PODE_EXPORTAR = /(^|\.)github\.io$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === 'file:';

const NOMES_GRUPO = Object.fromEntries(E.GRUPOS_BP);

function casoBrancoInicial() { return casoBranco(); }
function casoBranco() {
  return {
    preset: 'branco', empresa: '', fonte: '', periodos: ['Ano 1', 'Ano 2', 'Ano 3'], extras: { estoqueInicial: '', compras: [] },
    contas: E.CODIGOS.filter(([c]) => !['AC.APLIC', 'AC.DESPANT', 'ANC.INV', 'ANC.INT', 'PL.RES', 'DRE.LB', 'DRE.RO', 'DRE.OUT'].includes(c))
      .map(([cod, nome]) => ({ nome, cod, v: [null, null, null] }))
  };
}

let state = { caso: { ...casoBrancoInicial(), empresa: 'Carregando…' }, params: { ...E.PADRAO }, aba: 'analise', editado: false, cvm: null };
let restaurado = false;
let R = null;
let BASE = null;          // empresas.json
let DOC = null;           // arquivo da empresa escolhida na base CVM

function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify({ caso: state.caso, params: state.params, editado: state.editado, aba: state.aba, cvm: state.cvm, evDoc: state.evDoc, link: LINK_TOK })); } catch (e) { }
}
let SALVO_LEITURA = null; // no modo leitura, as edições valem para o link em que foram feitas
function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (LEITURA) {
      if (s && ['analise', 'mapa', 'demo', 'estrutura', 'dados', 'params'].includes(s.aba)) state.aba = s.aba;
      if (s && s.evDoc === false) state.evDoc = false;
      SALVO_LEITURA = s;
      return;
    }
    if (s && s.caso && Array.isArray(s.caso.contas)) {
      state.caso = s.caso; state.params = { ...E.PADRAO, ...(s.params || {}) }; state.editado = !!s.editado;
      state.cvm = s.cvm || null; if (s.aba && ['analise', 'mapa', 'demo', 'estrutura', 'dados', 'params'].includes(s.aba)) state.aba = s.aba;
      if (s.evDoc === false) state.evDoc = false;
      restaurado = true;
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
    if (LEITURA) {
      const c = LINK || { c: CD_INICIAL };
      await abrirEmpresa(c.c, c.de, c.ate, true);
      const sv = SALVO_LEITURA;
      if (sv && sv.link === LINK_TOK && sv.editado && sv.caso && Array.isArray(sv.caso.contas) && sv.caso.cd_cvm === state.caso.cd_cvm) {
        state.caso = sv.caso; state.editado = true; recalcular(); renderDados();
      }
    }
    else if (state.cvm && state.caso.preset === 'cvm') abrirEmpresa(state.cvm.c, state.cvm.de, state.cvm.ate, true);
    else if (!restaurado) {
      const ini = BASE.empresas.find(e => e.c === CD_INICIAL && !e.fin) || BASE.empresas.find(e => !e.fin && e.a.length);
      if (ini) abrirEmpresa(ini.c, null, null, true);
    }
  } catch (e) {
    BASE = null;
    $('#busca').disabled = true;
    st.textContent = 'A lista de companhias da CVM não está disponível nesta página. Importe um arquivo ou digite os dados na aba Dados.';
    if (!restaurado) { state.caso = casoBranco(); recalcular(); renderDados(); }
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
  painelBusca(false);
  abrirEmpresa(b.dataset.cd);
});
// painel de troca de empresa
function painelBusca(abrir) {
  const p = $('#painel-busca'), b = $('#btn-trocar');
  p.hidden = !abrir; b.setAttribute('aria-expanded', String(!!abrir));
  if (abrir) { fecharMenus(); $('#busca').focus(); }
}
$('#btn-trocar').addEventListener('click', () => painelBusca($('#painel-busca').hidden));
$('#painel-busca').addEventListener('keydown', e => { if (e.key === 'Escape' && $('#resultados').hidden) { painelBusca(false); $('#btn-trocar').focus(); } });
// menus Exportar e Mais
function fecharMenus(exceto) {
  document.querySelectorAll('.menu').forEach(m => {
    if (m === exceto) return;
    m.querySelector('.menu-lista').hidden = true; m.querySelector(':scope > .btn').setAttribute('aria-expanded', 'false');
  });
}
document.querySelectorAll('.menu').forEach(m => {
  const b = m.querySelector(':scope > .btn'), l = m.querySelector('.menu-lista');
  b.addEventListener('click', () => { const abrir = l.hidden; fecharMenus(m); l.hidden = !abrir; b.setAttribute('aria-expanded', String(abrir)); });
  l.addEventListener('click', e => { if (e.target.closest('button')) fecharMenus(); });
  l.addEventListener('change', () => fecharMenus());
});
document.addEventListener('click', e => { if (!e.target.closest('.menu')) fecharMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharMenus(); });
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
    // o link de leitura guarda os anos (rótulos), que não mudam quando a base ganha um ano novo
    const pos = r => { const i = DOC.periodos.findIndex(p => p.rotulo === r); return i < 0 ? null : i; };
    if (typeof de === 'string') de = pos(de);
    if (typeof ate === 'string') ate = pos(ate);
    if (ate == null || ate >= n) ate = n - 1;
    if (de == null || de > ate) de = Math.max(0, ate - 2);
    montarPeriodos(de, ate);
    aplicarEmpresa(de, ate);
    const e = BASE && BASE.empresas.find(x => x.c === cd);
    st.textContent = `${DOC.empresa}${e && e.t && e.t.length ? ' (' + e.t.join(', ') + ')' : ''}: ${n} exercícios disponíveis na CVM.`;
    if (!silencioso) { irAba('analise'); toast('Demonstrações carregadas'); }
  } catch (err) {
    st.textContent = 'Não foi possível carregar as demonstrações desta companhia. Tente novamente.';
    toast('Não foi possível carregar as demonstrações');
  }
}
function montarPeriodos(de, ate) {
  const ops = DOC.periodos.map((p, i) => `<option value="${i}">${esc(p.rotulo)}</option>`).join('');
  $('#per-de').innerHTML = ops; $('#per-ate').innerHTML = ops;
  $('#per-de').value = String(de); $('#per-ate').value = String(ate);
  $('#periodos').hidden = LEITURA;
}
function aplicarEmpresa(de, ate) {
  state.caso = E.casoDaBase(DOC, de, ate);
  state.cvm = { c: DOC.cd_cvm, de, ate };
  state.editado = false;
  recalcular(); renderDados();
}
['#per-de', '#per-ate'].forEach(id => $(id).addEventListener('change', () => {
  let de = +$('#per-de').value, ate = +$('#per-ate').value;
  if (de > ate) { if (document.activeElement && document.activeElement.id === 'per-de') ate = de; else de = ate; }
  $('#per-de').value = String(de); $('#per-ate').value = String(ate);
  aplicarEmpresa(de, ate);
}));

// ---------- dicas de cálculo (mouse no computador, toque no celular) ----------
const TIPS = new Map(); let tipN = 0;
function tip(o) { const id = 'd' + (++tipN); TIPS.set(id, o); return ` data-tip="${id}" tabindex="0"`; }
const fmtR = v => v == null ? '—' : fmtN(v, Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2);
const fmtSin = v => v == null ? '—' : v < 0 ? `(${fmtR(-v)})` : fmtR(v);
const semArt = s => s.replace(/^(o|a) /, '');
const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// Ao passar o mouse a dica mostra um resumo (subtotais por grupo do balanço ou as maiores contas);
// ao clicar ou tocar ela mostra a lista completa, com rolagem quando for longa.
const LIMITE_RESUMO = 8;
function resumirItens(itens) {
  const num = itens.every(x => typeof x[2] === 'number');
  const grupos = [...new Set(itens.map(x => x[3]).filter(Boolean))];
  if (num && grupos.length >= 2 && itens.every(x => x[3])) {
    return grupos.map(g => { const its = itens.filter(x => x[3] === g); return [`${g} (${its.length} ${its.length > 1 ? 'contas' : 'conta'})`, fmtSin(its.reduce((a, x) => a + x[2], 0))]; });
  }
  if (num) {
    const ord = [...itens].sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
    const resto = ord.slice(6);
    return [...ord.slice(0, 6), [`Demais ${resto.length} contas`, fmtSin(resto.reduce((a, x) => a + x[2], 0))]];
  }
  return [...itens.slice(0, LIMITE_RESUMO), [`e mais ${itens.length - LIMITE_RESUMO} itens`, '']];
}
function tipHTML(o, completo) {
  let h = `<div class="tip-tit">${esc(o.titulo)}</div>`;
  if (o.formula) h += `<div class="tip-f">${esc(o.formula)}</div>`;
  if (o.conta) h += `<div class="tip-c">${esc(o.conta)}</div>`;
  let resumido = 0;
  for (const b of (o.blocos || [])) {
    if (!b) continue;
    let itens = b.itens;
    if (!completo && itens.length > LIMITE_RESUMO) { resumido = Math.max(resumido, itens.length); itens = resumirItens(itens); }
    h += `<div class="tip-b">${b.titulo ? `<div class="tip-bt">${esc(b.titulo)}</div>` : ''}<table>`;
    const grupos = [...new Set(itens.map(x => x[3]).filter(Boolean))];
    let gAtual = null;
    h += itens.map(([n, v, , g]) => {
      let cab = '';
      if (completo && grupos.length >= 2 && g && g !== gAtual) { gAtual = g; cab = `<tr class="tip-grp"><td colspan="2">${esc(g)}</td></tr>`; }
      return cab + `<tr><td${v === '' ? ' class="tip-mais"' : ''}>${esc(n)}</td><td class="n">${esc(v)}</td></tr>`;
    }).join('');
    if (b.total) h += `<tr class="tip-tot"><td>${esc(b.total[0])}</td><td class="n">${esc(b.total[1])}</td></tr>`;
    h += `</table></div>`;
  }
  if (o.nota) h += `<div class="tip-n">${esc(o.nota)}</div>`;
  if (resumido) h += `<div class="tip-mais-dica">Resumo. Clique no valor para ver a lista completa (${resumido} contas).</div>`;
  return h;
}
const dica = $('#dica'); let dicaAlvo = null, dicaFixa = false;
const estreito = () => window.matchMedia('(max-width: 700px)').matches;
function mostrarDica(el, fixa, folha) {
  const o = TIPS.get(el.dataset.tip); if (!o) return;
  if (dicaAlvo && dicaAlvo !== el) dicaAlvo.removeAttribute('aria-describedby');
  dica.innerHTML = (fixa ? '<button class="dica-fechar" type="button" aria-label="Fechar">×</button>' : '') + tipHTML(o, fixa);
  dica.classList.toggle('folha', !!folha);
  dica.classList.toggle('fixa', !!fixa);
  dica.scrollTop = 0;
  dica.style.left = '0px'; dica.style.top = '0px';
  dica.hidden = false; dicaAlvo = el; dicaFixa = fixa;
  el.setAttribute('aria-describedby', 'dica');
  if (!folha) {
    const r = el.getBoundingClientRect(), w = dica.offsetWidth, hh = dica.offsetHeight, H = window.innerHeight;
    let x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    let y = r.bottom + 8;
    if (y + hh > H - 8) y = r.top - hh - 8 >= 8 ? r.top - hh - 8 : Math.max(8, H - hh - 8);
    dica.style.left = x + 'px'; dica.style.top = y + 'px';
  }
}
function esconderDica() { dica.hidden = true; if (dicaAlvo) dicaAlvo.removeAttribute('aria-describedby'); dicaAlvo = null; dicaFixa = false; }
let ultimoToque = 0;
document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') ultimoToque = Date.now(); }, true);
const tocouAgora = () => Date.now() - ultimoToque < 800;
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse' || dicaFixa || tocouAgora()) return;
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el && el !== dicaAlvo) mostrarDica(el, false, false);
});
document.addEventListener('pointerout', e => {
  if (e.pointerType !== 'mouse' || dicaFixa || !dicaAlvo) return;
  const para = e.relatedTarget;
  if (para && (dicaAlvo.contains(para) || (para.closest && para.closest('#dica')))) return;
  esconderDica();
});
document.addEventListener('click', e => {
  if (e.target.closest('.dica-fechar')) { esconderDica(); return; }
  const el = e.target.closest('[data-tip]');
  if (el) {
    if (dicaFixa && dicaAlvo === el) { esconderDica(); return; }
    mostrarDica(el, true, estreito() || tocouAgora());
    return;
  }
  if (dicaFixa && !e.target.closest('#dica')) esconderDica();
});
document.addEventListener('focusin', e => { if (tocouAgora()) return; const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !dicaFixa) mostrarDica(el, false, false); });
document.addEventListener('focusout', e => { if (!dicaFixa && dicaAlvo && e.target === dicaAlvo) esconderDica(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !dica.hidden) { esconderDica(); return; }
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); mostrarDica(el, true, estreito()); }
});
window.addEventListener('scroll', e => { if (e.target === dica || dica.contains(e.target)) return; if (!dica.hidden && !dica.classList.contains('folha')) esconderDica(); }, { passive: true, capture: true });

const GRUPO_ROT = { AC: 'Ativo circulante', ANC: 'Ativo não circulante', PC: 'Passivo circulante', PNC: 'Passivo não circulante', PL: 'Patrimônio líquido', DRE: 'DRE' };
function blocoLado(titulo, lado, total) {
  if (!lado || !lado.contas) return null;
  const itens = lado.contas.filter(c => c.v !== 0).map(c => [(c.k < 0 ? '(−) ' : '') + c.nome, c.media ? `(${fmtR(c.v0)} + ${fmtR(c.v1)}) ÷ 2 = ${fmtR(c.v)}` : fmtR(c.v), c.k * c.v, GRUPO_ROT[(c.cod || '').split('.')[0]]]);
  return { titulo, itens, total: lado.contas.length > 1 ? ['Total', fmtR(total)] : null };
}
function tipIndice(i, k) {
  const per = state.caso.periodos[k];
  const t = { titulo: `${nomeIndice(i)} (${i.id}) · ${per}`, formula: i.formula };
  const det = i.detalhe[k];
  if (i.vals[k] == null || !det) {
    const semEI = (i.id === 'PMPC' || i.id === 'CF') && k === 0;
    t.nota = 'Não calculável neste período: ' + (semEI ? 'falta o estoque do período anterior para apurar as compras (CMV = EI + C − EF).'
      : state.params.saldos === 'medio' && k === 0 ? 'o saldo médio exige o saldo do período anterior.' : 'faltam dados para o numerador ou o denominador.');
    return t;
  }
  if (det.partes) {
    t.conta = det.partes.map((p, j) => `${j ? (p.k > 0 ? ' + ' : ' − ') : ''}${fmtN(p.v, 0)}`).join('') + ` = ${i.fmt[k]} dias`;
    t.blocos = [{ itens: det.partes.map(p => [`${p.k < 0 ? '(−) ' : ''}${cap1(semArt(p.nome))} (${p.id})`, fmtN(p.v, 1) + ' dias']) }];
    t.nota = 'Os prazos são arredondados na tabela; a soma usa os valores exatos.';
    return t;
  }
  t.conta = `${fmtR(det.N)} ÷ ${fmtR(det.D)}${det.mult !== 1 ? ' × ' + det.mult : ''} = ${i.fmt[k]}`;
  const c = det.den.compras;
  t.blocos = [
    blocoLado('Numerador: ' + semArt(det.rotN), det.num, det.N),
    c ? (c.informado != null ? { titulo: 'Denominador: compras (informadas)', itens: [['Compras', fmtR(c.informado)]] }
      : { titulo: 'Denominador: compras = CMV − estoque inicial + estoque final', itens: [['CMV', fmtR(c.cmv)], ['(−) Estoque inicial', fmtR(c.ei)], ['(+) Estoque final', fmtR(c.ef)]], total: ['Compras', fmtR(c.total)] })
      : blocoLado('Denominador: ' + semArt(det.rotD), det.den, det.D)
  ];
  return t;
}
function tipEvolucao(i) {
  const per = state.caso.periodos, t = i.t;
  const fv = v => E.fmtVal(i.unid, v, state.params);
  return {
    titulo: `Evolução de ${nomeIndice(i).toLowerCase()} no período`,
    formula: `valor de ${per[t.i1]} − valor de ${per[t.i0]}`,
    conta: `${fv(t.v1)} − ${fv(t.v0)} = ${i.delta}`,
    nota: `${i.dir > 0 ? 'Quanto maior, melhor' : 'Quanto menor, melhor'}: por isso a ${t.d > 0 ? 'alta' : 'queda'} é ${t.est ? 'tratada como estabilidade (dentro da faixa definida em Parâmetros)' : t.melhora ? 'uma melhora' : 'uma piora'}.`
  };
}

// ---------- Estruturas: BP, DRE e DFC conectados ----------
const NOME_COD = Object.fromEntries(E.CODIGOS);
const NOME_CURTO = {
  'AC.DISP': 'Caixa e equivalentes', 'AC.APLIC': 'Aplicações financeiras', 'AC.CLI': 'Clientes', 'AC.EST': 'Estoques',
  'AC.DESPANT': 'Despesas antecipadas', 'AC.OUT': 'Outros AC', 'ANC.RLP': 'Realizável a longo prazo', 'ANC.INV': 'Investimentos',
  'ANC.IMOB': 'Imobilizado', 'ANC.INT': 'Intangível', 'PC.FORN': 'Fornecedores', 'PC.EMP': 'Empréstimos', 'PC.OUT': 'Outros PC',
  'PNC.EMP': 'Empréstimos', 'PNC.OUT': 'Outros PNC', 'PL.CAP': 'Capital social', 'PL.RES': 'Reservas de lucros', 'PL.OUT': 'Outras contas do PL'
};
function somaCod(cod, k, soDetalheFora = true) {
  const cs = state.caso.contas.filter(c => c.cod === cod && !(soDetalheFora && c.detalhe));
  const vals = cs.map(c => E.num(c.v[k])).filter(v => v != null);
  return vals.length ? { v: vals.reduce((a, b) => a + b, 0), contas: cs.filter(c => E.num(c.v[k]) != null).map(c => [c.nome, E.num(c.v[k])]) } : null;
}
function somaGrupo(g, k) {
  const cs = state.caso.contas.filter(c => c.cod.startsWith(g + '.') && !c.detalhe && E.num(c.v[k]) != null);
  return cs.length ? cs.reduce((a, c) => a + E.num(c.v[k]), 0) : null;
}
function custoPos(cod, k) { // custos e despesas como valor positivo (mesma regra do motor)
  const r = somaCod(cod, k); if (!r) return null;
  if (state.caso.sinais === 'despesa_positiva') return r;
  const todos = state.caso.contas.filter(c => c.cod === cod).flatMap(c => c.v.map(E.num)).filter(v => v != null && v !== 0);
  return todos.length && todos.every(v => v < 0) ? { v: -r.v, contas: r.contas.map(([n, v]) => [n, -v]) } : r;
}
function linhaEst(nome, v, opts = {}) {
  const cls = ['lin', opts.cls || ''].join(' ');
  const badge = (opts.lig || []).map(n => `<span class="lig l${n}" aria-label="ligação ${n}">${n}</span>`).join('');
  return `<div class="${cls}"${opts.ancora ? ` data-ancora="${opts.ancora}"` : ''}><span class="nm">${badge}<span>${esc(nome)}${opts.calc ? ' <span class="calc">(calculado)</span>' : ''}</span></span><span class="v"${opts.tip ? tip(opts.tip) : ''}>${opts.sinal ? fmtSin(v) : fmtR(v)}</span></div>`;
}
function tipComp(titulo, itens, total, nota) {
  return { titulo, blocos: [{ itens: itens.map(([n, v]) => [n, fmtSin(v), v]), total: itens.length > 1 ? ['Total', fmtSin(total)] : null }], nota };
}
function estruturaDados(k) {
  const per = state.caso.periodos[k];
  // Balanço
  const lado = grupos => grupos.map(([g, titulo, ancora, lig]) => {
    const tot = somaGrupo(g, k);
    if (tot == null) return null;
    const cods = E.CODIGOS.map(([c]) => c).filter(c => c.startsWith(g + '.'));
    const linhas = cods.map(c => ({ c, r: somaCod(c, k) })).filter(x => x.r);
    const itensGrupo = state.caso.contas.filter(c => c.cod.startsWith(g + '.') && !c.detalhe && E.num(c.v[k]) != null).map(c => [c.nome, E.num(c.v[k])]);
    return { g, titulo, tot, ancora, lig, tipTot: tipComp(`${titulo} · ${per}`, itensGrupo, tot, 'Soma das contas do grupo.'),
      linhas: linhas.map(({ c, r }) => ({ c, nome: NOME_CURTO[c] || NOME_COD[c], v: r.v, tip: tipComp(`${NOME_CURTO[c] || NOME_COD[c]} · ${per}`, r.contas, r.v, r.contas.length > 1 ? 'Contas da empresa somadas nesta linha.' : 'Conta da empresa.') })) };
  }).filter(Boolean);
  const ativo = lado([['AC', 'Ativo circulante'], ['ANC', 'Ativo não circulante']]);
  const passivo = lado([['PC', 'Passivo circulante'], ['PNC', 'Passivo não circulante'], ['PL', 'Patrimônio líquido', 'pl', [1]]]);
  const AT = (somaGrupo('AC', k) || 0) + (somaGrupo('ANC', k) || 0);
  const PT = (somaGrupo('PC', k) || 0) + (somaGrupo('PNC', k) || 0) + (somaGrupo('PL', k) || 0);
  // DRE
  const g = cod => somaCod(cod, k);
  const RL = g('DRE.RL'), CMV = custoPos('DRE.CMV', k), DOP = custoPos('DRE.DOP', k), IR = custoPos('DRE.IR', k);
  const LB0 = g('DRE.LB'), RO0 = g('DRE.RO'), RF = g('DRE.RFIN'), LAIR0 = g('DRE.OUT'), LL = g('DRE.LL');
  const dre = [];
  const pushL = (nome, v, o) => { if (v != null) dre.push({ nome, v, ...o }); };
  pushL('Receita líquida', RL && RL.v, { tip: RL && tipComp(`Receita líquida · ${per}`, RL.contas, RL.v) });
  pushL('(−) Custos', CMV && -CMV.v, { tip: CMV && tipComp(`Custos · ${per}`, CMV.contas.map(([n, v]) => [n, -v]), -CMV.v) });
  let LB = LB0 ? LB0.v : (RL && CMV ? RL.v - CMV.v : null);
  if (LB != null) pushL('Resultado bruto', LB, { cls: 'res', calc: !LB0, tip: { titulo: `Resultado bruto · ${per}`, formula: 'Receita líquida − custos', conta: RL && CMV ? `${fmtR(RL.v)} − ${fmtR(CMV.v)} = ${fmtSin(LB)}` : '', nota: LB0 ? 'Valor informado pela empresa.' : 'Calculado pelo sistema.' } });
  pushL('(−) Despesas operacionais', DOP && -DOP.v, { tip: DOP && tipComp(`Despesas operacionais · ${per}`, DOP.contas.map(([n, v]) => [n, -v]), -DOP.v, 'Despesas com vendas, administrativas e outras receitas e despesas operacionais (líquidas).') });
  const RO = RO0 ? RO0.v : (LB != null && DOP ? LB - DOP.v : null);
  if (RO != null) pushL('Resultado operacional', RO, { cls: 'res', calc: !RO0, tip: { titulo: `Resultado operacional · ${per}`, formula: 'Resultado bruto − despesas operacionais', conta: LB != null && DOP ? `${fmtSin(LB)} − ${fmtR(DOP.v)} = ${fmtSin(RO)}` : '' } });
  pushL('Resultado financeiro', RF && RF.v, { sinal: true, tip: RF && tipComp(`Resultado financeiro · ${per}`, RF.contas, RF.v, 'Receitas financeiras menos despesas financeiras.') });
  const LAIR = LAIR0 ? LAIR0.v : (RO != null && RF ? RO + RF.v : null);
  if (LAIR != null) pushL('Resultado antes dos impostos', LAIR, { cls: 'res', calc: !LAIR0, cod: 'LAIR', tip: { titulo: `Resultado antes dos impostos · ${per}`, formula: 'Resultado operacional ± resultado financeiro', conta: RO != null && RF ? `${fmtSin(RO)} + ${fmtSin(RF.v)} = ${fmtSin(LAIR)}` : '' } });
  pushL('(−) IRPJ e CSLL', IR && -IR.v, { tip: IR && tipComp(`Impostos sobre o lucro · ${per}`, IR.contas.map(([n, v]) => [n, -v]), -IR.v) });
  if (LL) pushL('Lucro líquido', LL.v, { cls: 'tot', cod: 'LL', tip: { titulo: `Lucro líquido · ${per}`, formula: LAIR != null && IR ? 'Resultado antes dos impostos − IRPJ e CSLL' : 'Valor informado', conta: LAIR != null && IR ? `${fmtSin(LAIR)} − ${fmtR(IR.v)} = ${fmtSin(LAIR - IR.v)}` : fmtSin(LL.v), nota: LAIR != null && IR && Math.abs(LAIR - IR.v - LL.v) > 1 ? `O lucro informado (${fmtSin(LL.v)}) inclui outras linhas, como operações descontinuadas.` : '' } });
  // DFC
  const dfc = state.caso.dfc && state.caso.dfc.length ? Object.fromEntries(state.caso.dfc.map(l => [l.cod, { ...l, val: l.v[k] }])) : null;
  return { per, ativo, passivo, AT, PT, dre, LL: LL && LL.v, LAIR, RO, dfc };
}
const ROT_DFC = [
  ['DFC.LUC', null, ''], ['DFC.DEP', 'Depreciação e amortização', ''], ['DFC.VCG', 'Variação do capital de giro e outros', ''],
  ['DFC.OP', 'Caixa das atividades operacionais', 'res'], ['DFC.CAPEX', 'CAPEX (imobilizado e intangível)', ''], ['DFC.INV', 'Caixa das atividades de investimento', 'res'],
  ['DFC.EMP', 'Empréstimos (captações − pagamentos)', ''], ['DFC.DIV', 'Dividendos e JCP pagos', ''], ['DFC.FIN', 'Caixa das atividades de financiamento', 'res'],
  ['DFC.CAMB', 'Variação cambial', ''], ['DFC.VAR', 'Resultado de caixa (aumento ou redução)', 'res'], ['DFC.INI', 'Saldo inicial', ''], ['DFC.FIM', 'Saldo final', 'tot']
];
function renderMapa() {
  const el = $('#p-mapa'); const per = state.caso.periodos;
  if (state.mapaK == null || state.mapaK >= per.length) state.mapaK = per.length - 1;
  const k = state.mapaK; const d = estruturaDados(k);
  let h = `<div class="barra-acoes"><div class="seletor" role="group" aria-label="Exercício">${per.map((p, i) => `<button type="button" data-mapa-k="${i}" aria-pressed="${i === k}">${esc(p)}</button>`).join('')}</div><span class="nota">Valores ${state.caso.preset && state.caso.preset.startsWith('cvm') ? 'em R$ mil' : 'como informados'}. Os números coloridos mostram onde as demonstrações se conectam.</span></div>`;
  // ligações
  const caixa = somaCod('AC.DISP', k);
  const dfcLuc = d.dfc && d.dfc['DFC.LUC'] && d.dfc['DFC.LUC'].val;
  const igual = (a, b) => a != null && b != null && Math.abs(a - b) <= 1;
  let inicioDFC = null;
  if (dfcLuc != null) inicioDFC = igual(dfcLuc, d.LL) ? 'LL' : igual(dfcLuc, d.LAIR) ? 'LAIR' : igual(dfcLuc, d.RO) ? 'RO' : null;
  // BP
  const ladoHTML = (titulo, grupos, total, rotTotal) => `<div><div class="col-cab">${titulo}</div>${grupos.map(gr =>
    linhaEst(gr.titulo, gr.tot, { cls: 'grupo', ancora: gr.ancora, lig: gr.lig, tip: gr.tipTot }) +
    gr.linhas.map(l => linhaEst(l.nome, l.v, { ancora: l.c === 'AC.DISP' ? 'caixa' : '', lig: l.c === 'AC.DISP' && d.dfc ? [3] : [], tip: l.tip })).join('')).join('')}
    ${linhaEst(rotTotal, total, { cls: 'tot', tip: tipComp(`${rotTotal} · ${d.per}`, grupos.map(gr => [gr.titulo, gr.tot]), total) })}</div>`;
  const bp = `<div class="cartao" id="c-bp"><div class="cartao-cab"><span>Balanço patrimonial</span><span>${esc(d.per)}</span></div><div class="bp-colunas">${ladoHTML('Ativo', d.ativo, d.AT, 'Total do ativo')}${ladoHTML('Passivo + PL', d.passivo, d.PT, 'Total do passivo + PL')}</div></div>`;
  const dre = `<div class="cartao" id="c-dre"><div class="cartao-cab"><span>DRE</span><span>${esc(d.per)}</span></div>${d.dre.length ? d.dre.map(l =>
    linhaEst(l.nome, l.v, { cls: l.cls, calc: l.calc, sinal: true, tip: l.tip, ancora: [l.cod === 'LL' ? 'll' : '', l.cod === inicioDFC || (l.cod === 'LL' && !inicioDFC && d.dfc) ? 'ini-dfc' : ''].filter(Boolean).join(' '),
      lig: [l.cod === 'LL' ? 1 : 0, d.dfc && (l.cod === inicioDFC || (l.cod === 'LL' && !inicioDFC)) ? 2 : 0].filter(Boolean) })).join('') : '<div class="vazio">A DRE não foi informada.</div>'}</div>`;
  let dfcH;
  if (d.dfc) {
    dfcH = ROT_DFC.filter(([c]) => d.dfc[c] && d.dfc[c].val != null).map(([c, nome, cls]) => {
      const l = d.dfc[c];
      const nm = nome || `${l.nome} (ponto de partida)`;
      return linhaEst(nm, l.val, { cls, sinal: true, ancora: c === 'DFC.LUC' ? 'dfc-luc' : c === 'DFC.FIM' ? 'dfc-fim' : '', lig: c === 'DFC.LUC' ? [2] : c === 'DFC.FIM' ? [3] : [],
        tip: { titulo: `${nm} · ${d.per}`, formula: l.cd ? `Conta${l.cd.includes(',') ? 's' : ''} da CVM: ${l.cd.replace(/,/g, ' + ')}` : '', conta: fmtSin(l.val),
          nota: c === 'DFC.VAR' ? 'Operacional + investimento + financiamento + variação cambial.' : c === 'DFC.FIM' ? 'Saldo inicial + resultado de caixa.' : c === 'DFC.VCG' ? 'Variações em clientes, estoques, fornecedores e outras contas, além de impostos e juros pagos.' : c === 'DFC.CAPEX' ? 'Soma das aquisições de imobilizado e intangível.' : '' } });
    }).join('');
  } else dfcH = `<div class="vazio">A demonstração dos fluxos de caixa não está disponível neste caso. Nas companhias da base da CVM ela vem junto com o balanço e a DRE.</div>`;
  const dfc = `<div class="cartao" id="c-dfc"><div class="cartao-cab"><span>Fluxo de caixa</span><span>${esc(d.per)}</span></div>${dfcH}</div>`;
  h += `<div class="est-grid" id="est-grid"><svg class="est-svg" id="est-svg" aria-hidden="true"></svg>${bp}${dre}${dfc}</div>`;
  // explicações das ligações, com conferência
  const lig = [];
  const plAtual = somaGrupo('PL', k), plAnt = k > 0 ? somaGrupo('PL', k - 1) : null;
  let t1 = `O lucro líquido da DRE (${fmtSin(d.LL)}) pertence aos sócios e vai para o patrimônio líquido: fica retido em reservas ou é distribuído como dividendos e JCP.`;
  let c1 = '';
  if (plAnt != null && d.LL != null) {
    const dPL = plAtual - plAnt;
    t1 += ` De ${per[k - 1]} para ${d.per}, o PL variou ${fmtSin(dPL)}; a diferença de ${fmtSin(dPL - d.LL)} em relação ao lucro vem de dividendos, aumentos de capital, ajustes de avaliação e outros movimentos do PL.`;
    c1 = `<span class="chip neutro"${tip({ titulo: `Lucro × variação do PL · ${d.per}`, formula: 'Variação do PL = PL final − PL inicial', conta: `${fmtR(plAtual)} − ${fmtR(plAnt)} = ${fmtSin(dPL)}`, blocos: [{ itens: [['Lucro líquido do período', fmtSin(d.LL)], ['Outros movimentos do PL', fmtSin(dPL - d.LL)]], total: ['Variação do PL', fmtSin(dPL)] }], nota: d.dfc && d.dfc['DFC.DIV'] ? `Dividendos e JCP pagos no ano (DFC): ${fmtSin(d.dfc['DFC.DIV'].val)}.` : '' })}>lucro ${fmtSin(d.LL)} · ΔPL ${fmtSin(dPL)}</span>`;
  }
  lig.push([1, 'DRE e balanço: lucro líquido e patrimônio líquido', t1, c1]);
  if (d.dfc) {
    const nomeIni = d.dfc['DFC.LUC'] ? d.dfc['DFC.LUC'].nome : '';
    const ondeDRE = { LL: 'ao lucro líquido', LAIR: 'ao resultado antes dos impostos', RO: 'ao resultado operacional' }[inicioDFC];
    const t2 = dfcLuc == null ? 'A DFC desta empresa não informa o ponto de partida do método indireto.'
      : ondeDRE ? `A DFC (método indireto) parte de “${nomeIni}”, igual ${ondeDRE} da DRE (${fmtSin(dfcLuc)}). Em seguida soma as despesas que não saem do caixa, como a depreciação, e ajusta as variações do capital de giro.`
        : `A DFC parte de “${nomeIni}” (${fmtSin(dfcLuc)}), valor que não coincide com o lucro líquido nem com o resultado antes dos impostos da DRE.`;
    lig.push([2, 'DRE e fluxo de caixa: o ponto de partida', t2, dfcLuc == null ? '' : `<span class="chip ${ondeDRE ? 'bom' : 'ruim'}">${ondeDRE ? '✓ confere' : 'não confere'}</span>`]);
    const fim = d.dfc['DFC.FIM'] && d.dfc['DFC.FIM'].val;
    const ok3 = igual(fim, caixa && caixa.v);
    const t3 = fim == null ? 'A DFC não informa o saldo final de caixa.' : `O saldo final da DFC (${fmtSin(fim)}) é o caixa e equivalentes de caixa do balanço (${fmtSin(caixa && caixa.v)}).${ok3 ? '' : ' A diferença costuma vir de caixa classificado em outra conta, como ativos mantidos para venda.'}`;
    lig.push([3, 'Fluxo de caixa e balanço: saldo final e caixa', t3, fim == null ? '' : `<span class="chip ${ok3 ? 'bom' : 'ruim'}"${tip({ titulo: `Conferência · ${d.per}`, formula: 'Saldo final da DFC = caixa e equivalentes do BP', blocos: [{ itens: [['Saldo final (DFC)', fmtSin(fim)], ['Caixa e equivalentes (BP)', fmtSin(caixa && caixa.v)]], total: ['Diferença', fmtSin(fim - (caixa ? caixa.v : 0))] }] })}>${ok3 ? '✓ confere' : 'diferença de ' + fmtSin(fim - (caixa ? caixa.v : 0))}</span>`]);
  } else {
    lig.push([2, 'DRE e fluxo de caixa', 'A DFC pelo método indireto começa pelo lucro da DRE e ajusta o que não passou pelo caixa. Este caso não tem DFC para conferir.', '']);
    lig.push([3, 'Fluxo de caixa e balanço', 'O saldo final da DFC é sempre o caixa e equivalentes de caixa do balanço. Este caso não tem DFC para conferir.', '']);
  }
  const conf = Math.abs(d.AT - d.PT) <= 1;
  h += `<section class="ligacoes"><div class="grupo-cab"><h2>Como as demonstrações se conectam</h2></div>${lig.map(([n, tit, txt, ch]) => `<div class="ligacao"><span class="lig l${n}">${n}</span><h3>${esc(tit)}</h3><p>${esc(txt)}</p>${ch}</div>`).join('')}
    <p class="nota">Conferência do balanço em ${esc(d.per)}: ativo ${fmtR(d.AT)} e passivo + PL ${fmtR(d.PT)} ${conf ? '(fecham).' : `(diferença de ${fmtSin(d.AT - d.PT)}).`}</p></section>`;
  el.innerHTML = h;
  if (roMapa) { roMapa.disconnect(); roMapa.observe($('#est-grid')); $('#est-grid').querySelectorAll('.cartao').forEach(c => roMapa.observe(c)); }
  if (!el.hidden) requestAnimationFrame(desenharLigacoes);
}
function desenharLigacoes() {
  const grid = $('#est-grid'), svg = $('#est-svg');
  if (!grid || !svg) return;
  svg.innerHTML = '';
  if (!window.matchMedia('(min-width: 900px)').matches || !grid.offsetWidth) return;
  const G = grid.getBoundingClientRect();
  const rel = r => ({ l: r.left - G.left, r: r.right - G.left, t: r.top - G.top, b: r.bottom - G.top, y: (r.top + r.bottom) / 2 - G.top });
  const anc = nome => { const e = grid.querySelector(`[data-ancora~="${nome}"]`); return e ? rel(e.getBoundingClientRect()) : null; };
  const card = id => { const e = $('#' + id); return e ? rel(e.getBoundingClientRect()) : null; };
  const bp = card('c-bp'), dre = card('c-dre'), dfc = card('c-dfc');
  svg.setAttribute('viewBox', `0 0 ${G.width} ${G.height}`);
  svg.setAttribute('width', G.width); svg.setAttribute('height', G.height);
  const cores = { 1: 'var(--lig1)', 2: 'var(--lig2)', 3: 'var(--lig3)' };
  let h = '<defs>' + [1, 2, 3].map(n => `<marker id="seta${n}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${cores[n]}"/></marker>`).join('') + '</defs>';
  const caminho = (n, d) => { h += `<path d="${d}" fill="none" stroke="${cores[n]}" stroke-width="2.25" stroke-linejoin="round" marker-end="url(#seta${n})" marker-start="url(#seta${n})"/>`; };
  const ll = anc('ll'), pl = anc('pl'), ini = anc('ini-dfc'), luc = anc('dfc-luc'), fim = anc('dfc-fim'), cx = anc('caixa');
  if (ll && pl && bp && dre) { const xm = (bp.r + dre.l) / 2; caminho(1, `M${dre.l - 2} ${ll.y} H${xm} V${pl.y} H${bp.r + 2}`); }
  if (ini && luc && dre && dfc) { const xr = Math.max(dre.r, dfc.r) + 18; caminho(2, `M${dre.r + 2} ${ini.y} H${xr} V${luc.y} H${dfc.r + 2}`); }
  if (fim && cx && bp && dfc) {
    const xm = (bp.r + dfc.l) / 2 - 10, yb = Math.max(bp.b, fim.y) + 18, xl = bp.l - 18;
    caminho(3, `M${dfc.l - 2} ${fim.y} H${xm} V${yb} H${xl} V${cx.y} H${bp.l - 2}`);
  }
  svg.innerHTML = h;
}
let rTimer; const redesenhar = () => { clearTimeout(rTimer); rTimer = setTimeout(desenharLigacoes, 60); };
window.addEventListener('resize', redesenhar);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(redesenhar);
const roMapa = window.ResizeObserver ? new ResizeObserver(redesenhar) : null;
document.addEventListener('change', e => { if (e.target.id === 'chk-evidencias') { state.evDoc = e.target.checked; salvar(); } });
$('#p-mapa').addEventListener('click', e => { const b = e.target.closest('[data-mapa-k]'); if (!b) return; state.mapaK = +b.dataset.mapaK; renderMapa(); });

// ---------- Demonstrações no formato da CVM ----------
const DFP_CACHE = {};
const DEMOS = [['BPA', 'Balanço Patrimonial Ativo'], ['BPP', 'Balanço Patrimonial Passivo'], ['DRE', 'Demonstração do Resultado'], ['DFC', 'Demonstração dos Fluxos de Caixa']];
const FORMULAS_DRE = { '3.03': ['3.01', '3.02'], '3.05': ['3.03', '3.04'], '3.07': ['3.05', '3.06'], '3.09': ['3.07', '3.08'], '3.11': ['3.09', '3.10'], '6.05': ['6.01', '6.02', '6.03', '6.04'], '6.05.02': ['6.05.01', '6.05'] };
function linhasManuais(demo) {
  const c = state.caso, n = c.periodos.length;
  const soma = cs => Array.from({ length: n }, (_, i) => { const vs = cs.map(x => E.num(x.v[i])).filter(v => v != null); return vs.length ? vs.reduce((a, b) => a + b, 0) : null; });
  const doGrupo = g => c.contas.filter(x => x.cod.startsWith(g + '.') && !x.detalhe);
  if (demo === 'BPA' || demo === 'BPP') {
    const raiz = demo === 'BPA' ? '1' : '2';
    const grupos = demo === 'BPA' ? [['AC', 'Ativo Circulante'], ['ANC', 'Ativo Não Circulante']] : [['PC', 'Passivo Circulante'], ['PNC', 'Passivo Não Circulante'], ['PL', 'Patrimônio Líquido']];
    const todas = grupos.flatMap(([g]) => doGrupo(g));
    const L = [{ c: raiz, d: demo === 'BPA' ? 'Ativo Total' : 'Passivo Total', v: soma(todas) }];
    grupos.forEach(([g, nome], gi) => {
      const cg = `${raiz}.0${gi + 1}`;
      L.push({ c: cg, d: nome, v: soma(doGrupo(g)) });
      doGrupo(g).forEach((x, j) => L.push({ c: `${cg}.${String(j + 1).padStart(2, '0')}`, d: x.nome, v: x.v.map(E.num) }));
    });
    return L;
  }
  if (demo === 'DRE') {
    return c.contas.filter(x => x.cod.startsWith('DRE.')).map((x, j) => {
      const vs = x.v.map(E.num);
      const jaNeg = vs.filter(v => v != null && v !== 0).every(v => v < 0);
      return { c: `3.${String(j + 1).padStart(2, '0')}`, d: x.nome, v: ['DRE.CMV', 'DRE.DOP', 'DRE.IR'].includes(x.cod) && !jaNeg ? vs.map(v => v == null ? v : -v) : vs };
    });
  }
  return null;
}
async function dadosDemo(demo, aoCarregar) {
  const c = state.caso; const ehCVM = !!(c.cd_cvm && c.sel);
  let periodos = c.periodos.map((p, i) => ({ rot: p, i })), linhas = null, aviso = '';
  if (ehCVM) {
    try {
      if (!DFP_CACHE[c.cd_cvm]) {
        if (aoCarregar) aoCarregar();
        const r = await fetch(`${BASE_URL}dfp/${encodeURIComponent(c.cd_cvm)}.json`);
        if (!r.ok) throw new Error(r.status);
        DFP_CACHE[c.cd_cvm] = await r.json();
      }
      const comp = DFP_CACHE[c.cd_cvm];
      const sel = []; for (let i = c.sel.de; i <= c.sel.ate; i++) sel.push(i);
      linhas = (comp[demo] || []).map(l => ({ c: l.c, d: l.d, v: sel.map(i => l.v[i] == null ? null : l.v[i]) })).filter(l => l.v.some(v => v != null));
      const datas = DOC && DOC.cd_cvm === c.cd_cvm ? sel.map(i => DOC.periodos[i]) : null;
      periodos = sel.map((i, j) => ({ rot: c.periodos[j], i: j, data: datas && datas[j] && datas[j].data }));
      if (c.preset === 'cvm-editado') aviso = 'Estes são os valores originais da CVM; as edições feitas na aba Dados não aparecem aqui.';
    } catch (e) {
      linhas = null; aviso = 'Não foi possível carregar as demonstrações completas desta companhia.';
    }
  } else {
    linhas = linhasManuais(demo);
    aviso = 'Caso digitado ou importado: os códigos das contas são gerados pelo sistema, na mesma estrutura da CVM.';
  }
  const ehFluxo = demo === 'DRE' || demo === 'DFC';
  const fmtData = (d) => { if (!d) return null; const [a, m, dd] = d.split('-'); return ehFluxo ? `01/01/${a} a ${dd}/${m}/${a}` : `${dd}/${m}/${a}`; };
  const cols = [...periodos].reverse().map(p => ({ ...p, cab: fmtData(p.data) || p.rot })); // como no RAD: o exercício mais recente primeiro
  const titulo = `${ehCVM ? (c.fonte && c.fonte.includes('individuais') ? 'DFs Consolidadas / Individuais' : 'DFs Consolidadas') + ' / ' : ''}${DEMOS.find(x => x[0] === demo)[1]}${ehCVM ? ' (Reais Mil)' : ''}`;
  return { linhas, cols, aviso, titulo, ehCVM };
}
async function renderDemo() {
  const el = $('#p-demo');
  const demo = state.demo || 'BPA';
  const { linhas, cols, aviso, titulo } = await dadosDemo(demo, () => { el.innerHTML = '<p class="nota">Carregando as demonstrações completas…</p>'; });
  let h = `<div class="barra-acoes"><div class="seletor" role="group" aria-label="Demonstração">${DEMOS.map(([k, n]) => `<button type="button" data-demo="${k}" aria-pressed="${k === demo}">${k === 'BPA' ? 'BP Ativo' : k === 'BPP' ? 'BP Passivo' : k}</button>`).join('')}</div></div>`;
  h += `<div class="demo-tit">${esc(titulo)}</div>`;
  if (aviso) h += `<p class="nota">${esc(aviso)}</p>`;
  if (!linhas || !linhas.length) {
    h += `<p class="vazio">${demo === 'DFC' ? 'A demonstração dos fluxos de caixa não está disponível neste caso.' : 'Não há contas para mostrar.'}</p>`;
    el.innerHTML = h; return;
  }
  const porCod = Object.fromEntries(linhas.map(l => [l.c, l]));
  const filhos = cod => linhas.filter(l => l.c.startsWith(cod + '.') && l.c.split('.').length === cod.split('.').length + 1);
  h += `<div class="rolagem"><table class="demo-tab"><thead><tr><th>Conta</th><th>Descrição</th>${cols.map(p => `<th class="n">${esc(p.cab)}</th>`).join('')}</tr></thead><tbody>`;
  for (const l of linhas) {
    const nivel = l.c.split('.').length;
    const fs = filhos(l.c);
    const form = FORMULAS_DRE[l.c];
    h += `<tr class="n${Math.min(nivel, 3)}"><td class="cod">${esc(l.c)}</td><td class="ds" style="padding-left:${12 + (nivel - 1) * 14}px">${esc(l.d)}</td>`;
    h += cols.map(p => {
      const v = l.v[p.i];
      if (v == null) return '<td class="n"></td>';
      let t = null;
      if (fs.length) {
        const itens = fs.filter(f => f.v[p.i] != null).map(f => [`${f.c} ${f.d}`, fmtN(f.v[p.i], Number.isInteger(f.v[p.i]) ? 0 : 2), f.v[p.i]]);
        const s = fs.reduce((a, f) => a + (f.v[p.i] || 0), 0);
        const ok = Math.abs(s - v) <= 1;
        t = { titulo: `${l.c} ${l.d} · ${p.rot}`, formula: 'Soma das subcontas', blocos: [{ itens, total: ['Soma', fmtN(s, Number.isInteger(s) ? 0 : 2)] }], nota: ok ? 'Confere com o valor informado.' : `Diferença de ${fmtN(v - s, 0)} para o valor informado: a empresa não detalhou toda a conta.` };
      } else if (form && form.every(f => porCod[f])) {
        const partes = form.map(f => porCod[f]).map(f => [f.c + ' ' + f.d, f.v[p.i] || 0]);
        const s = partes.reduce((a, x) => a + x[1], 0);
        t = { titulo: `${l.c} ${l.d} · ${p.rot}`, formula: form.join(' + '), blocos: [{ itens: partes.map(([n, x]) => [n, fmtN(x, 0)]), total: ['Resultado', fmtN(s, 0)] }], nota: Math.abs(s - v) <= 1 ? 'Confere com o valor informado.' : `Diferença de ${fmtN(v - s, 0)} para o valor informado.` };
      }
      return `<td class="n"><span${t ? tip(t) : ''}>${fmtN(v, Number.isInteger(v) ? 0 : 2)}</span></td>`;
    }).join('') + '</tr>';
  }
  h += '</tbody></table></div>';
  el.innerHTML = h;
}
$('#p-demo').addEventListener('click', e => { const b = e.target.closest('[data-demo]'); if (!b) return; state.demo = b.dataset.demo; renderDemo(); });

// ---------- recálculo ----------
function recalcular() {
  R = E.analisar(state.caso, state.params);
  $('#titulo-empresa').textContent = state.caso.empresa || 'Empresa sem nome';
  const p = state.caso.periodos;
  const padrao = JSON.stringify(state.params) === JSON.stringify(E.PADRAO);
  const origem = state.caso.preset === 'cvm' ? 'dados da CVM, R$ mil' : 'dados próprios';
  const cvm = state.caso.preset === 'cvm';
  if (!cvm) $('#periodos').hidden = true;
  const faixa = `${p[0]}${p.length > 1 ? ' a ' + p[p.length - 1] : ''}`;
  const per = cvm && LEITURA ? `${esc(faixa)} · ` : cvm ? `<span class="so-impressao">${esc(faixa)} · </span>` : `${esc(`${p.length} ${p.length === 1 ? 'período' : 'períodos'} (${faixa})`)} · `;
  $('#meta-caso').innerHTML = per + esc(`${origem} · parâmetros ${padrao ? 'padrão' : 'personalizados'}${state.editado ? ' · dados editados' : ''}`);
  TIPS.clear(); esconderDica();
  renderAnalise(); renderMapa(); renderEstrutura(); renderDemo();
  salvar();
}

// ---------- Análise ----------
function chip(i) {
  if (!i.t) return '<span class="chip neutro">sem comparação</span>';
  if (i.t.est) return `<span class="chip neutro"${tip(tipEvolucao(i))}>→ estável</span>`;
  const seta = i.t.d > 0 ? '↑' : '↓';
  return `<span class="chip ${i.t.melhora ? 'bom' : 'ruim'}"${tip(tipEvolucao(i))}>${seta} ${esc(i.delta.replace(/^[+−]/, ''))} · ${i.t.melhora ? 'melhora' : 'piora'}</span>`;
}
const nomeIndice = i => { const n = i.nome.replace(/^(o|a) /, ''); return n[0].toUpperCase() + n.slice(1); };
// Ficha da empresa com os dados cadastrais da CVM (só os campos que existem).
const dataBR = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : (d || '');
const capitaliza = t => t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : '';
function fichaEmpresa() {
  const pf = state.caso.perfil; if (!pf) return [];
  const L = [];
  if (pf.razao) L.push(['Razão social', pf.razao]);
  if (pf.setor || state.caso.setor) L.push(['Setor (CVM)', pf.setor || state.caso.setor]);
  if (pf.fundacao) L.push(['Constituição', dataBR(pf.fundacao)]);
  if (pf.sede) L.push(['Sede', pf.sede.replace(/,\s*([A-Z]{2})$/, ' ($1)')]);
  const ctrl = E.controleTxt(pf.controle); if (ctrl) L.push(['Controle acionário', capitaliza(ctrl)]);
  const tk = (pf.tickers || []).join(', ');
  if (pf.segmento || tk) L.push(['Ações na B3', [pf.segmento, tk].filter(Boolean).join(' · ')]);
  if (pf.registro) L.push(['Registro na CVM', 'desde ' + dataBR(pf.registro)]);
  if (pf.auditor) L.push(['Auditor independente', pf.auditor]);
  if (pf.site) L.push(['Site', pf.site]);
  return L;
}
const urlSite = s => /^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
function renderAnalise() {
  const el = $('#p-analise'); const per = state.caso.periodos;
  let h = '';
  if (R.avisos.length) h += `<div class="aviso" role="status"><strong>Confira os dados antes de usar a análise</strong><ul>${R.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  if (per.length < 2) h += `<div class="aviso"><strong>Só um período selecionado.</strong> Os índices são calculados, mas a análise de evolução precisa de pelo menos dois períodos.</div>`;
  h += `<div class="barra-acoes"><button class="btn primario" type="button" data-copiar="tudo">Copiar análise completa</button><span class="nota">Texto gerado por regras a partir dos números; revise antes de entregar. Os valores <span class="sublinhado">sublinhados</span> mostram a fórmula e o cálculo.</span></div>`;
  h += `<div class="copia-fallback" id="copia-fallback" hidden><label for="ta-fallback" class="nota">A cópia automática foi bloqueada. Selecione e copie:</label><textarea id="ta-fallback" readonly></textarea></div>`;
  if (state.caso.fonte) h += `<p class="nota">Fonte: ${esc(state.caso.fonte)}</p>`;
  if (R.abertura) {
    const ficha = fichaEmpresa();
    h += `<section class="abertura"><h2>Apresentação</h2>`;
    if (ficha.length) h += `<dl class="ficha">${ficha.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${k === 'Site' ? `<a href="${esc(urlSite(v))}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</dd></div>`).join('')}</dl>`;
    h += `<p class="leitura">${esc(R.abertura)}</p>`;
    if (ficha.length) h += `<p class="nota">Ficha: cadastro e formulário cadastral da CVM. Missão, visão, valores e histórico não fazem parte dos dados abertos da CVM; ficam no site de relações com investidores da empresa.</p>`;
    h += `<div class="ind-acoes"><button class="btn mini" type="button" data-copiar="abertura">Copiar parágrafo</button></div></section>`;
  }
  h += `<label class="check incluir-ev"><input type="checkbox" id="chk-evidencias"${state.evDoc !== false ? ' checked' : ''}> Incluir os quadros de conferência no PDF e no Word</label>`;
  for (const g of R.grupos) {
    const its = g.ids.map(id => R.by[id]);
    h += `<section class="grupo" id="g-${g.id}"><div class="grupo-cab"><h2>${esc(g.titulo)}</h2><span class="regra">${its.length} índices</span></div>`;
    h += `<p class="sintese">${esc(g.sintese)}</p>`;
    h += `<div class="rolagem"><table><thead><tr><th>Índice</th>${per.map(p => `<th class="n">${esc(p)}</th>`).join('')}<th>Evolução</th></tr></thead><tbody>`;
    for (const i of its) h += `<tr><td class="sigla"><a href="#ind-${i.id}">${i.id}</a></td>${i.fmt.map((v, k) => `<td class="n"><span${tip(tipIndice(i, k))}>${esc(v)}</span></td>`).join('')}<td>${chip(i)}</td></tr>`;
    h += `</tbody></table></div>`;
    for (const i of its) {
      h += `<article class="indice" id="ind-${i.id}"><div class="ind-cab"><span class="sigla">${i.id}</span><h3>${esc(nomeIndice(i))}</h3>${chip(i)}</div>`;
      h += `<div class="formula">${esc(i.formula)} · ${i.dir > 0 ? 'quanto maior, melhor' : 'quanto menor, melhor'}</div>`;
      h += `<div class="calculos">${i.calc.map((c, k) => `<span><b>${esc(per[k])}</b> <span${tip(tipIndice(i, k))}>${c ? esc(c) : 'não calculável'}</span></span>`).join('')}</div>`;
      h += `<p class="leitura">${esc(i.texto)}</p>`;
      h += quadroEvidencia(i);
      h += `<div class="ind-acoes"><button class="btn mini" type="button" data-copiar="${i.id}">Copiar parágrafo</button></div></article>`;
    }
    h += `</section>`;
  }
  h += `<section class="conclusao"><h2>Conclusão integrada</h2><ul>${R.conclusao.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>`;
  el.innerHTML = h;
}
// quadro de conferência: contas e séries citadas no texto, com a variação no período
function linhasEvidencia(i) {
  const per = state.caso.periodos;
  const ids = per.map((_, k) => k);
  return i.evidencias.map(e => {
    const vs = e.v.map(v => v == null ? null : Number(v));
    const k0 = ids.find(k => vs[k] != null), k1 = [...ids].reverse().find(k => vs[k] != null);
    const ehIndice = e.fonte === 'Índice';
    const fmt = v => v == null ? '' : ehIndice ? fmtN(v, e.nome.includes('dias') ? 0 : 2) : fmtR(v);
    let variacao = '';
    if (k0 != null && k1 != null && k1 > k0) {
      const a = vs[k0], b = vs[k1];
      if (ehIndice) variacao = (b - a >= 0 ? '+' : '−') + fmtN(Math.abs(b - a), 2);
      else if (e.fonte === 'DFC') { let soma = 0; for (let k = k0 + 1; k <= k1; k++) soma += vs[k] || 0; variacao = `soma ${per[k0 + 1]}–${per[k1]}: ${fmtSin(soma)}`; }
      else if (a && Math.sign(a) === Math.sign(b)) variacao = (b / a - 1 >= 0 ? '+' : '−') + fmtN(Math.abs(b / a - 1) * 100, 2) + '%';
      else if (!a && b) variacao = 'nova';
    }
    return { fonte: e.fonte, nome: e.nome, vals: vs.map(fmt), variacao, k0, k1, vs };
  });
}
function quadroEvidencia(i) {
  if (!i.evidencias || !i.evidencias.length) return '';
  const per = state.caso.periodos;
  const ls = linhasEvidencia(i);
  const mil = state.caso.escala === 'mil' ? ' Valores em R$ mil.' : '';
  return `<details class="conferir"><summary>Conferir no balanço: ${ls.length} ${ls.length === 1 ? 'item citado' : 'itens citados'} no texto</summary>
    <p class="nota">Contas e séries usadas no parágrafo, para conferir com as demonstrações.${mil}</p>
    <div class="rolagem"><table><thead><tr><th>Fonte</th><th>Conta</th>${per.map(p => `<th class="n">${esc(p)}</th>`).join('')}<th class="n">Variação</th></tr></thead><tbody>
    ${ls.map(l => `<tr><td class="fonte">${esc(l.fonte)}</td><td>${esc(l.nome)}</td>${l.vals.map(v => `<td class="n">${esc(v)}</td>`).join('')}<td class="n">${l.variacao && l.k0 != null && l.fonte !== 'DFC' && l.variacao !== 'nova' ? `<span${tip({ titulo: `${l.nome}: variação`, formula: l.fonte === 'Índice' ? `valor de ${per[l.k1]} − valor de ${per[l.k0]}` : `(valor de ${per[l.k1]} ÷ valor de ${per[l.k0]} − 1) × 100`, conta: `${l.vals[l.k1]} ${l.fonte === 'Índice' ? '−' : '÷'} ${l.vals[l.k0]}${l.fonte === 'Índice' ? '' : ' − 1'} → ${l.variacao}` })}>${esc(l.variacao)}</span>` : esc(l.variacao)}</td></tr>`).join('')}
    </tbody></table></div></details>`;
}
function textoCompleto() {
  const L = [`Análise das demonstrações contábeis: ${state.caso.empresa || 'Empresa'}`, ''];
  if (state.caso.fonte) L.push('Fonte: ' + state.caso.fonte, '');
  if (R.abertura) L.push(R.abertura, '');
  for (const g of R.grupos) {
    L.push(g.titulo.toUpperCase(), g.sintese, '');
    for (const id of g.ids) { const i = R.by[id]; L.push(`${i.id}: ${nomeIndice(i)}`, i.texto, ''); }
  }
  L.push('CONCLUSÃO INTEGRADA', ...R.conclusao);
  return L.join('\n');
}
// ---------- AV e AH ----------
function renderEstrutura() {
  const el = $('#p-estrutura'); const per = state.caso.periodos;
  const AT = R.estrutura.totais.AT.v;
  const RL = per.map((_, k) => { const r = somaCod('DRE.RL', k); return r ? r.v : null; });
  const pct = v => v == null ? '—' : fmtN(v, 2) + '%';
  let h = `<p class="nota">Análise vertical: contas do balanço sobre o ativo total; contas da DRE sobre a receita líquida. Análise horizontal: base 100 em ${esc(per[0])}, e variação em relação ao período anterior.</p>`;
  for (const g of R.estrutura.grupos) {
    const ehDRE = g.g === 'DRE';
    const base = ehDRE ? RL : AT, nomeBase = ehDRE ? 'receita líquida' : 'ativo total';
    h += `<section class="grupo"><div class="grupo-cab"><h2>${esc(g.titulo)}</h2></div>`;
    if (g.rep) h += `<p class="leitura">${esc(g.rep)}</p>`;
    const linhas = [...g.linhas, ...(g.total ? [g.total] : [])];
    h += `<div class="rolagem"><table><thead><tr><th>Conta</th>${per.map(p => `<th class="n">${esc(p)}</th>`).join('')}${per.map(p => `<th class="n">AV ${esc(p)}</th>`).join('')}${per.slice(1).map(p => `<th class="n">AH ${esc(p)}</th>`).join('')}${per.slice(1).map(p => `<th class="n">Var. ${esc(p)}</th>`).join('')}</tr></thead><tbody>`;
    linhas.forEach((l, j) => {
      const tot = g.total && j === linhas.length - 1;
      const cel = (txt, t) => `<td class="n">${txt === '—' || !t ? txt : `<span${tip(t)}>${txt}</span>`}</td>`;
      const vals = l.v.map((v, k) => {
        if (v == null) return cel('—');
        if (!tot) return cel(fmtMoeda(v));
        const itens = g.linhas.filter(x => !x.detalhe && x.v[k] != null).map(x => [x.nome, fmtMoeda(x.v[k]), x.v[k]]);
        return cel(fmtMoeda(v), { titulo: `${l.nome} · ${per[k]}`, formula: 'Soma das contas do grupo', blocos: [{ itens, total: ['Total', fmtMoeda(v)] }] });
      }).join('');
      const av = l.av.map((v, k) => cel(pct(v), v == null ? null : { titulo: `Análise vertical · ${l.nome} · ${per[k]}`, formula: `AV = conta ÷ ${nomeBase} × 100`, conta: `${fmtMoeda(l.v[k])} ÷ ${fmtMoeda(base[k])} × 100 = ${pct(v)}`, nota: `Mostra quanto ${l.nome.toLowerCase()} representa ${ehDRE ? 'da receita líquida' : 'do ativo total'} em ${per[k]}.` })).join('');
      const ah = l.ah.slice(1).map((v, j2) => { const k = j2 + 1; return cel(v == null ? '—' : fmtN(v, 2), v == null ? null : { titulo: `Análise horizontal · ${l.nome} · ${per[k]}`, formula: `AH = valor de ${per[k]} ÷ valor de ${per[0]} × 100`, conta: `${fmtMoeda(l.v[k])} ÷ ${fmtMoeda(l.v[0])} × 100 = ${fmtN(v, 2)}`, nota: `Acima de 100, a conta cresceu em relação a ${per[0]}; abaixo de 100, diminuiu.` }); }).join('');
      const vr = l.var.slice(1).map((v, j2) => { const k = j2 + 1; const txt = v == null ? '—' : (v >= 0 ? '+' : '−') + fmtN(Math.abs(v), 2) + '%'; return cel(txt, v == null ? null : { titulo: `Variação · ${l.nome} · ${per[k - 1]} → ${per[k]}`, formula: '(valor atual ÷ valor anterior − 1) × 100', conta: `(${fmtMoeda(l.v[k])} ÷ ${fmtMoeda(l.v[k - 1])} − 1) × 100 = ${txt}` }); }).join('');
      h += `<tr class="${tot ? 'total' : ''} ${l.detalhe ? 'detalhe' : ''}"><td>${esc(l.nome)}</td>${vals}${av}${ah}${vr}</tr>`;
    });
    h += `</tbody></table></div></section>`;
  }
  const T = R.estrutura.totais;
  h += `<div class="rolagem"><table><thead><tr><th>Conferência</th>${per.map(p => `<th class="n">${esc(p)}</th>`).join('')}</tr></thead><tbody>
    <tr><td>${T.AT.nome}</td>${T.AT.v.map((v, k) => `<td class="n">${v == null ? '—' : `<span${tip({ titulo: `Ativo total · ${per[k]}`, formula: 'Ativo circulante + ativo não circulante', conta: `${fmtMoeda(somaGrupo('AC', k) || 0)} + ${fmtMoeda(somaGrupo('ANC', k) || 0)} = ${fmtMoeda(v)}` })}>${fmtMoeda(v)}</span>`}</td>`).join('')}</tr>
    <tr><td>${T.PT.nome}</td>${T.PT.v.map((v, k) => `<td class="n">${v == null ? '—' : `<span${tip({ titulo: `Passivo + PL · ${per[k]}`, formula: 'Passivo circulante + passivo não circulante + patrimônio líquido', conta: `${fmtMoeda(somaGrupo('PC', k) || 0)} + ${fmtMoeda(somaGrupo('PNC', k) || 0)} + ${fmtMoeda(somaGrupo('PL', k) || 0)} = ${fmtMoeda(v)}` })}>${fmtMoeda(v)}</span>`}</td>`).join('')}</tr></tbody></table></div>`;
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
  el.innerHTML = h; travar(el);
}
// Modo leitura: Dados e Parâmetros podem ser editados para testar, mas a empresa e os anos
// são os do link (sem importar, colar, caso em branco, renomear a empresa ou mudar os períodos).
function travar(el) {
  if (!LEITURA) return;
  if (el.id === 'p-dados') {
    el.querySelectorAll('#d-empresa, input.periodo').forEach(i => { i.readOnly = true; i.title = 'Definido pelo link de leitura'; });
    el.querySelectorAll('#btn-add-periodo, #btn-rem-periodo, details').forEach(x => { x.hidden = true; });
    el.insertAdjacentHTML('afterbegin', `<div class="aviso">Você pode alterar valores e classificações para testar. As mudanças ficam só neste navegador; a empresa e os anos são os do link de leitura. <button class="btn mini" type="button" id="btn-restaurar-link">Restaurar os dados originais</button></div>`);
  } else {
    const b = el.querySelector('#btn-padrao');
    if (b && LINK && LINK.p && Object.keys(LINK.p).length) b.textContent = 'Voltar aos parâmetros do link';
    el.insertAdjacentHTML('afterbegin', `<p class="aviso">As mudanças nos parâmetros ficam só neste navegador e não mudam o que o restante do grupo vê.</p>`);
  }
}
function editado() { state.editado = true; if (state.caso.preset === 'cvm') state.caso.preset = 'cvm-editado'; }
$('#p-dados').addEventListener('change', e => {
  const t = e.target; const c = state.caso;
  if (LEITURA && (t.id === 'd-empresa' || t.dataset.per != null || t.id === 'ta-colar')) return;
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
  if (LEITURA && b.id === 'btn-restaurar-link') {
    const l = LINK || { c: CD_INICIAL };
    abrirEmpresa(l.c, l.de, l.ate, true).then(() => toast('Dados originais restaurados')); return;
  }
  if (LEITURA && ['btn-add-periodo', 'btn-rem-periodo', 'btn-colar'].includes(b.id)) return;
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
  txt = (txt || '').replace(/^\ufeff/, '').trim();
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
  $('#periodos').hidden = true;
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
// ---------- exportação da aba aberta (PDF, Word, CSV) ----------
const NOME_ABA = { analise: 'Análise', mapa: 'Estruturas', demo: 'Demonstrações', estrutura: 'AV e AH', dados: 'Dados', params: 'Parâmetros' };
const numCSV = v => v == null || v === '' ? '' : String(Math.round(Number(v) * 100) / 100).replace('.', ',');
const linhaCSV = arr => arr.map(x => { const t = String(x == null ? '' : x); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(';');
async function csvDaAba() {
  const per = state.caso.periodos, L = [];
  const aba = state.aba;
  if (aba === 'analise') {
    L.push(linhaCSV(['Grupo', 'Sigla', 'Índice', 'Fórmula', ...per, 'Evolução']));
    for (const g of R.grupos) for (const id of g.ids) { const i = R.by[id]; L.push(linhaCSV([g.titulo, i.id, nomeIndice(i), i.formula, ...i.vals.map(numCSV), i.t ? (i.t.est ? 'estável' : i.t.melhora ? 'melhora' : 'piora') : ''])); }
  } else if (aba === 'mapa') {
    const ds = per.map((_, k) => estruturaDados(k));
    const ult = ds[ds.length - 1];
    L.push(linhaCSV(['Demonstração', 'Grupo', 'Linha', ...per]));
    const valorBP = (d, gr, nome) => { const lado = [...d.ativo, ...d.passivo].find(x => x.titulo === gr); if (!lado) return null; if (!nome) return lado.tot; const l = lado.linhas.find(x => x.nome === nome); return l ? l.v : null; };
    for (const gr of [...ult.ativo, ...ult.passivo]) {
      L.push(linhaCSV(['Balanço patrimonial', gr.titulo, gr.titulo + ' (total)', ...ds.map(d => numCSV(valorBP(d, gr.titulo)))]));
      for (const l of gr.linhas) L.push(linhaCSV(['Balanço patrimonial', gr.titulo, l.nome, ...ds.map(d => numCSV(valorBP(d, gr.titulo, l.nome)))]));
    }
    L.push(linhaCSV(['Balanço patrimonial', '', 'Total do ativo', ...ds.map(d => numCSV(d.AT))]));
    L.push(linhaCSV(['Balanço patrimonial', '', 'Total do passivo + PL', ...ds.map(d => numCSV(d.PT))]));
    for (const l of ult.dre) L.push(linhaCSV(['DRE', '', l.nome, ...ds.map(d => { const x = d.dre.find(y => y.nome === l.nome); return numCSV(x ? x.v : null); })]));
    for (const [c, nome] of ROT_DFC) { if (!ult.dfc || !ult.dfc[c]) continue; L.push(linhaCSV(['Fluxo de caixa', '', nome || ult.dfc[c].nome, ...ds.map(d => numCSV(d.dfc && d.dfc[c] ? d.dfc[c].val : null))])); }
  } else if (aba === 'demo') {
    let cab = false;
    for (const [k, nome] of DEMOS) {
      const d = await dadosDemo(k);
      if (!d.linhas || !d.linhas.length) continue;
      if (!cab) { L.push(linhaCSV(['Demonstração', 'Conta', 'Descrição', ...d.cols.map(p => p.cab)])); cab = true; }
      for (const l of d.linhas) L.push(linhaCSV([nome, l.c, l.d, ...d.cols.map(p => numCSV(l.v[p.i]))]));
    }
  } else if (aba === 'estrutura') {
    L.push(linhaCSV(['Grupo', 'Conta', ...per, ...per.map(p => 'AV ' + p), ...per.slice(1).map(p => 'AH ' + p), ...per.slice(1).map(p => 'Var. % ' + p)]));
    for (const g of R.estrutura.grupos) for (const l of [...g.linhas, ...(g.total ? [g.total] : [])])
      L.push(linhaCSV([g.titulo, l.nome, ...l.v.map(numCSV), ...l.av.map(numCSV), ...l.ah.slice(1).map(numCSV), ...l.var.slice(1).map(numCSV)]));
  } else return { texto: paraCSV(), nome: `dados-${slug(state.caso.empresa)}.csv`, rotulo: 'Dados do caso' };
  return { texto: L.join('\n'), nome: `${slug(NOME_ABA[aba])}-${slug(state.caso.empresa)}.csv`, rotulo: 'Tabela' };
}
// Documento da aba aberta em blocos (título, subtítulo, parágrafo, tabela). O mesmo conteúdo vira
// Word (HTML que o Word abre) ou PDF (arquivo gerado no navegador com jsPDF + AutoTable).
const PDF_LIBS = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
];
const TITULO_ABA = { analise: 'Análise das demonstrações contábeis', mapa: 'Estruturas: balanço, DRE e fluxo de caixa', demo: 'Demonstrações contábeis', estrutura: 'Análise vertical e horizontal', dados: 'Dados do caso', params: 'Parâmetros da análise' };
const fmtCel = v => v == null ? '' : fmtN(v, Number.isInteger(v) ? 0 : 2);
async function documentoDaAba() {
  const aba = state.aba, per = state.caso.periodos;
  const B = [];
  const sub = t => B.push({ t: 'h2', texto: t });
  const h3 = t => B.push({ t: 'h3', texto: t });
  const par = (t, nota) => B.push({ t: 'p', texto: t, nota });
  const tab = (cab, linhas, o = {}) => B.push({ t: 'tab', cab, linhas, dir: o.dir || [], neg: o.neg || [], recuo: o.recuo || [], larga: o.larga });
  if (aba === 'analise') {
    if (R.abertura) { sub('Apresentação'); const f = fichaEmpresa(); if (f.length) tab(['Item', 'Informação'], f); par(R.abertura); }
    for (const g of R.grupos) {
      const its = g.ids.map(id => R.by[id]);
      sub(g.titulo);
      tab(['Índice', 'Fórmula', ...per, 'Evolução'], its.map(i => [`${nomeIndice(i)} (${i.id})`, i.formula, ...i.fmt, i.t ? (i.t.est ? 'estável' : `${i.delta} (${i.t.melhora ? 'melhora' : 'piora'})`) : '']),
        { dir: per.map((_, k) => k + 2) });
      par(g.sintese, true);
      for (const i of its) {
        h3(`${nomeIndice(i)} (${i.id})`); par(i.texto);
        if (state.evDoc !== false && i.evidencias.length) {
          const ls = linhasEvidencia(i);
          tab(['Fonte', 'Conta', ...per, 'Variação'], ls.map(l => [l.fonte, l.nome, ...l.vals, l.variacao]), { dir: per.map((_, k) => k + 2).concat(per.length + 2) });
        }
      }
    }
    sub('Conclusão integrada');
    R.conclusao.forEach(c => par('• ' + c));
  } else if (aba === 'mapa') {
    const k = state.mapaK != null ? state.mapaK : per.length - 1;
    const d = estruturaDados(k);
    par(`Exercício de ${d.per}${state.caso.preset && state.caso.preset.startsWith('cvm') ? ', valores em R$ mil' : ''}.`, true);
    const bp = (lado, rot, total) => {
      const L = [], neg = [];
      lado.forEach(gr => { neg.push(L.length); L.push([gr.titulo, fmtSin(gr.tot)]); gr.linhas.forEach(l => L.push(['   ' + l.nome, fmtSin(l.v)])); });
      neg.push(L.length); L.push([rot, fmtSin(total)]);
      return { L, neg };
    };
    const a = bp(d.ativo, 'Total do ativo', d.AT), p = bp(d.passivo, 'Total do passivo + PL', d.PT);
    sub('Balanço patrimonial: ativo'); tab(['Conta', d.per], a.L, { dir: [1], neg: a.neg });
    sub('Balanço patrimonial: passivo e patrimônio líquido'); tab(['Conta', d.per], p.L, { dir: [1], neg: p.neg });
    sub('Demonstração do resultado');
    tab(['Linha', d.per], d.dre.map(l => [l.nome, fmtSin(l.v)]), { dir: [1], neg: d.dre.map((l, j) => l.cls ? j : -1).filter(j => j >= 0) });
    if (d.dfc) {
      const ls = ROT_DFC.filter(([c]) => d.dfc[c] && d.dfc[c].val != null);
      sub('Demonstração dos fluxos de caixa');
      tab(['Linha', d.per], ls.map(([c, nome]) => [nome || `${d.dfc[c].nome} (ponto de partida)`, fmtSin(d.dfc[c].val)]), { dir: [1], neg: ls.map(([, , cls], j) => cls ? j : -1).filter(j => j >= 0) });
    }
    sub('Como as demonstrações se conectam');
    document.querySelectorAll('#p-mapa .ligacao').forEach(x => { h3(x.querySelector('h3').textContent); par(x.querySelector('p').textContent); });
  } else if (aba === 'demo') {
    for (const [k] of DEMOS) {
      const d = await dadosDemo(k);
      if (!d.linhas || !d.linhas.length) continue;
      sub(d.titulo);
      tab(['Conta', 'Descrição', ...d.cols.map(p => p.cab)], d.linhas.map(l => [l.c, l.d, ...d.cols.map(p => fmtCel(l.v[p.i]))]),
        { dir: d.cols.map((_, j) => j + 2), neg: d.linhas.map((l, j) => l.c.split('.').length <= 2 ? j : -1).filter(j => j >= 0), recuo: d.linhas.map(l => l.c.split('.').length - 1) });
    }
  } else if (aba === 'estrutura') {
    par(`Análise vertical: contas do balanço sobre o ativo total e contas da DRE sobre a receita líquida. Análise horizontal: base 100 em ${per[0]}.`, true);
    for (const g of R.estrutura.grupos) {
      sub(g.titulo);
      if (g.rep) par(g.rep);
      const ls = [...g.linhas, ...(g.total ? [g.total] : [])];
      tab(['Conta', ...per, ...per.map(p => 'AV ' + p), ...per.slice(1).map(p => 'AH ' + p), ...per.slice(1).map(p => 'Var. ' + p)],
        ls.map(l => [l.nome, ...l.v.map(v => v == null ? '' : fmtMoeda(v)), ...l.av.map(v => v == null ? '' : fmtN(v, 2) + '%'), ...l.ah.slice(1).map(v => v == null ? '' : fmtN(v, 2)), ...l.var.slice(1).map(v => v == null ? '' : (v >= 0 ? '+' : '−') + fmtN(Math.abs(v), 2) + '%')]),
        { dir: Array.from({ length: per.length * 4 - 2 }, (_, j) => j + 1), neg: g.total ? [ls.length - 1] : [], larga: true });
    }
  } else if (aba === 'dados') {
    if (state.caso.fonte) par(state.caso.fonte, true);
    for (const [g, titulo] of E.GRUPOS_BP) {
      const cs = state.caso.contas.filter(c => c.cod.split('.')[0] === g);
      if (!cs.length) continue;
      sub(titulo);
      tab(['Conta', 'Classificação', ...per], cs.map(c => [c.nome + (c.detalhe ? ' (já incluída)' : ''), NOME_COD[c.cod] || c.cod, ...c.v.map(v => fmtCel(E.num(v)))]), { dir: per.map((_, k) => k + 2) });
    }
  } else if (aba === 'params') {
    for (const [leg, campos] of CAMPOS) {
      sub(leg);
      tab(['Parâmetro', 'Valor'], campos.map(([k, rot, tipo]) => {
        const v = state.params[k];
        const txt = tipo === 'num' ? (v === '' ? 'não informado' : fmtInput(v)) : ((tipo.find(([x]) => x === String(v)) || [, String(v)])[1]);
        return [rot, txt];
      }));
    }
  }
  return { titulo: `${TITULO_ABA[aba]}: ${state.caso.empresa || 'Empresa'}`, blocos: B };
}

const CSS_WORD = 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}h1{font-size:18pt}h2{font-size:14pt;margin-top:18pt}h3{font-size:12pt;margin-bottom:2pt}table{border-collapse:collapse;margin:6pt 0}td,th{border:1px solid #999;padding:3pt 6pt;font-size:9.5pt}th{background:#e8ece9}.n{text-align:right}.f{color:#555;font-size:9.5pt}p{text-align:justify}.g td{font-weight:bold;background:#f2f4f1}';
function wordDoDocumento(doc) {
  let c = '';
  for (const b of doc.blocos) {
    if (b.t === 'h2') c += `<h2>${esc(b.texto)}</h2>`;
    else if (b.t === 'h3') c += `<h3>${esc(b.texto)}</h3>`;
    else if (b.t === 'p') c += `<p${b.nota ? ' class="f"' : ''}>${esc(b.texto)}</p>`;
    else c += `<table><tr>${b.cab.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${b.linhas.map((l, j) => `<tr${b.neg.includes(j) ? ' class="g"' : ''}>${l.map((x, k) => `<td${b.dir.includes(k) ? ' class="n"' : ''}${k === 1 && b.recuo[j] ? ` style="padding-left:${6 + b.recuo[j] * 10}pt"` : ''}>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  return `<html><head><meta charset="utf-8"><title>${esc(doc.titulo)}</title><style>${CSS_WORD}</style></head><body><h1>${esc(doc.titulo)}</h1>${state.caso.fonte ? `<p class="f">Fonte: ${esc(state.caso.fonte)}</p>` : ''}${c}</body></html>`;
}

function carregarScript(src) {
  return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error(src)); document.head.appendChild(s); });
}
async function jsPDFpronto() {
  const pronto = () => window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable;
  if (!pronto()) { for (const src of PDF_LIBS) await carregarScript(src); }
  if (!pronto()) throw new Error('jsPDF');
  return window.jspdf.jsPDF;
}
// As fontes padrão do PDF cobrem o português; alguns símbolos são trocados por equivalentes.
const txtPDF = s => String(s == null ? '' : s).replace(/−/g, '-').replace(/[→]/g, '->').replace(/[✓✗↑↓]/g, '').replace(/Δ/g, 'var. ').replace(/[  ]/g, ' ');
async function pdfDoDocumento(doc) {
  const jsPDF = await jsPDFpronto();
  const larga = doc.blocos.some(b => b.t === 'tab' && (b.larga || b.cab.length > 6));
  const pdf = new jsPDF({ orientation: larga ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 14, LW = W - 2 * M;
  const COR = [13, 102, 86], TINTA = [23, 32, 28], CINZA = [86, 100, 94];
  let y = M + 4;
  const quebra = h => { if (y + h > H - M - 6) { pdf.addPage(); y = M + 4; } };
  const texto = (t, tam, estilo, cor, antes = 0, depois = 2) => {
    pdf.setFont('helvetica', estilo); pdf.setFontSize(tam); pdf.setTextColor(...cor);
    const linhas = pdf.splitTextToSize(txtPDF(t), LW);
    const alt = tam * 0.3528 * 1.35;
    y += antes;
    for (const l of linhas) { quebra(alt); pdf.text(l, M, y + alt * 0.75); y += alt; }
    y += depois;
  };
  texto(doc.titulo, 16, 'bold', TINTA, 0, 1);
  if (state.caso.fonte) texto('Fonte: ' + state.caso.fonte, 8.5, 'normal', CINZA, 0, 3);
  for (const b of doc.blocos) {
    if (b.t === 'h2') { quebra(14); texto(b.texto, 12.5, 'bold', COR, 3, 1.5); }
    else if (b.t === 'h3') { quebra(10); texto(b.texto, 10.5, 'bold', TINTA, 1.5, 0.8); }
    else if (b.t === 'p') texto(b.texto, b.nota ? 8.5 : 9.5, 'normal', b.nota ? CINZA : TINTA, 0, 2.5);
    else {
      const cols = b.cab.length;
      const fonte = cols > 10 ? 6.8 : cols > 6 ? 7.5 : 8.5;
      pdf.autoTable({
        startY: y, margin: { left: M, right: M, top: M + 6, bottom: M + 6 },
        head: [b.cab.map(txtPDF)], body: b.linhas.map(l => l.map(txtPDF)),
        theme: 'grid', styles: { font: 'helvetica', fontSize: fonte, cellPadding: 1.4, textColor: TINTA, lineColor: [214, 221, 216], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: COR, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
        columnStyles: Object.fromEntries(b.dir.map(k => [k, { halign: 'right' }])),
        didParseCell: data => {
          if (data.section === 'head' && b.dir.includes(data.column.index)) data.cell.styles.halign = 'right';
          if (data.section !== 'body') return;
          if (b.neg.includes(data.row.index)) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [242, 244, 241]; }
          const r = b.recuo[data.row.index];
          if (r && data.column.index === 1) data.cell.styles.cellPadding = { top: 1.4, bottom: 1.4, right: 1.4, left: 1.4 + r * 2.6 };
        }
      });
      y = pdf.lastAutoTable.finalY + 4;
    }
  }
  const n = pdf.internal.getNumberOfPages();
  const rodape = `${state.caso.empresa || 'Empresa'} · ${NOME_ABA[state.aba]} · gerado em ${new Date().toLocaleDateString('pt-BR')} pelo Analisador de Demonstrações`;
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...CINZA);
    pdf.text(txtPDF(rodape), M, H - 7);
    pdf.text(`Página ${i} de ${n}`, W - M, H - 7, { align: 'right' });
  }
  return pdf.output('blob');
}
$('#btn-word').addEventListener('click', async () => {
  const doc = await documentoDaAba();
  baixar(`${slug(NOME_ABA[state.aba])}-${slug(state.caso.empresa)}.doc`, '﻿' + wordDoDocumento(doc), 'application/msword');
});
$('#btn-pdf').addEventListener('click', async () => {
  const b = $('#btn-pdf'); const rot = b.textContent;
  b.disabled = true; b.textContent = 'Gerando PDF…'; esconderDica();
  try {
    const blob = await pdfDoDocumento(await documentoDaAba());
    baixar(`${slug(NOME_ABA[state.aba])}-${slug(state.caso.empresa)}.pdf`, blob, 'application/pdf');
    toast('PDF gerado');
  } catch (e) {
    toast('Não foi possível gerar o PDF. Verifique a conexão e tente de novo, ou use Imprimir.');
  } finally { b.disabled = false; b.textContent = rot; }
});
$('#btn-imprimir').addEventListener('click', () => { esconderDica(); setTimeout(() => window.print(), 50); });

$('#btn-copiar-csv').addEventListener('click', async () => { const r = await csvDaAba(); copiar(r.texto, r.rotulo); });
$('#btn-csv').addEventListener('click', async () => { const r = await csvDaAba(); baixar(r.nome, '\ufeff' + r.texto, 'text/csv;charset=utf-8'); });
$('#btn-json').addEventListener('click', () => baixar(`caso-${slug(state.caso.empresa)}.json`, JSON.stringify({ caso: state.caso, params: state.params }, null, 1), 'application/json'));
$('#btn-json').hidden = !PODE_EXPORTAR;
function atualizarRotuloExportar() {
  $('#rot-exportar').textContent = `Aba ${NOME_ABA[state.aba]}`;
  $('#imp-aba').textContent = `${NOME_ABA[state.aba]} · gerado em ${new Date().toLocaleDateString('pt-BR')} pelo Analisador de Demonstrações`;
  $('#btn-csv').textContent = ['dados', 'params'].includes(state.aba) ? 'CSV dos dados' : 'CSV';
}
$('#exportar').hidden = !PODE_EXPORTAR;
$('#btn-branco').addEventListener('click', () => { usarCaso(casoBranco(), false); irAba('dados'); toast('Caso em branco: preencha os valores na aba Dados'); });

// ---------- Parâmetros ----------
const CAMPOS = [
  ['Cálculo dos índices', [
    ['saldos', 'Base de saldos em giro, rentabilidades e prazos', [['final', 'Saldo final do período'], ['medio', 'Saldo médio: (inicial + final) ÷ 2']], 'Com saldo médio, o primeiro ano do intervalo fica sem cálculo nesses índices, porque falta o saldo do ano anterior.'],
    ['dias', 'Dias no ano dos prazos médios', [['360', '360 (ano comercial)'], ['365', '365 (ano civil)']]],
    ['lsModo', 'Numerador da liquidez seca', [['est_da', 'AC − Estoques − Despesas antecipadas'], ['est', 'AC − Estoques']]],
    ['liModo', 'Disponível na liquidez imediata', [['disp_aplic', 'Caixa, equivalentes e aplicações financeiras'], ['disp', 'Só caixa e equivalentes']]],
    ['pctModo', 'Participação de capitais de terceiros', [['ct_pl', 'CT ÷ PL × 100'], ['ct_at', 'CT ÷ Ativo total × 100 (endividamento geral)']]],
    ['taxaRef', 'Taxa de referência para o ROE (% ao ano)', 'num', 'Opcional. Representa o custo de oportunidade dos sócios (Selic, CDI ou outra).']
  ]],
  ['Comparação no tempo', [
    ['varPct', 'Variação de índices em %', [['pp', 'Pontos percentuais (p.p.)'], ['pct', 'Variação relativa (“redução de 20%”)']]],
    ['deltaArred', 'Calcular variações sobre', [['true', 'Valores exibidos (arredondados)'], ['false', 'Valores exatos']], 'Os índices são sempre calculados com valores exatos. Esta opção vale só para a diferença escrita no texto: com valores exibidos, “de 185 para 212 dias (+27 dias)” confere com a conta feita à mão; com valores exatos, pode sair “+26 dias”.'],
    ['decPct', 'Casas decimais dos índices em %', 'num'],
    ['estX', 'Faixa de estabilidade, índices em vezes (% de variação)', 'num', 'Abaixo disso, o índice é descrito como “praticamente estável”.'],
    ['estPP', 'Faixa de estabilidade, índices em % (p.p.)', 'num'],
    ['estDias', 'Faixa de estabilidade, prazos (dias)', 'num', 'Exemplo: um prazo que vai de 38 para 35 dias é descrito como “praticamente estável”.'],
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
  let h = `<div class="barra-acoes"><button class="btn" type="button" id="btn-padrao">Voltar ao padrão</button><span class="nota">O padrão segue as fórmulas usuais da disciplina. Faixas de estabilidade e seleção podem ser ajustadas.</span></div><div class="form-params">`;
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
  $('#p-params').innerHTML = h + '</div>'; travar($('#p-params'));
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
  if (e.target.id === 'btn-padrao') { state.params = { ...E.PADRAO, ...(LEITURA && LINK ? LINK.p || {} : {}) }; renderParams(); recalcular(); toast('Parâmetros restaurados'); }
});

// ---------- abas e cópia ----------
function irAba(nome) {
  state.aba = nome;
  esconderDica();
  for (const a of ['analise', 'mapa', 'demo', 'estrutura', 'dados', 'params']) {
    $('#t-' + a).setAttribute('aria-selected', String(a === nome));
    $('#p-' + a).hidden = a !== nome;
  }
  if (nome === 'mapa') requestAnimationFrame(desenharLigacoes);
  atualizarRotuloExportar();
  salvar();
}
document.querySelector('nav.abas').addEventListener('click', e => { const b = e.target.closest('.aba'); if (b) irAba(b.id.slice(2)); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copiar]'); if (!b) return;
  const k = b.dataset.copiar;
  copiar(k === 'tudo' ? textoCompleto() : k === 'abertura' ? R.abertura : R.by[k].texto, k === 'tudo' ? 'Análise' : 'Parágrafo');
});

// ---------- acesso: link de leitura ----------
const b64url = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function gerarLink() {
  const p = state.caso.periodos;
  const dif = Object.fromEntries(Object.entries(state.params).filter(([k, v]) => v !== E.PADRAO[k]));
  const dados = new TextEncoder().encode(JSON.stringify({ c: state.cvm.c, de: p[0], ate: p[p.length - 1], p: dif }));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ACESSO.chave, dados));
  const tudo = new Uint8Array(iv.length + ct.length); tudo.set(iv); tudo.set(ct, iv.length);
  return `${location.origin}${location.pathname}#l=${b64url(tudo)}`;
}
async function lerLink() {
  const doHash = (location.hash.match(/[#&]l=([\w-]+)/) || [])[1];
  let salvo = null; try { salvo = localStorage.getItem(CHAVE_LINK); } catch (e) { }
  for (const tok of [doHash, salvo]) {
    if (!tok) continue;
    try {
      const u = deB64url(tok);
      const txt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, ACESSO.chave, u.slice(12)));
      const l = JSON.parse(txt);
      try { localStorage.setItem(CHAVE_LINK, tok); } catch (e) { }
      LINK_TOK = tok;
      return l;
    } catch (e) { if (tok === doHash) setTimeout(() => toast('Link de leitura inválido'), 400); }
  }
  return null;
}
$('#btn-link').addEventListener('click', async () => {
  if (state.caso.preset !== 'cvm' || !state.cvm) { toast('O link de leitura funciona com empresas da base da CVM'); return; }
  const url = await gerarLink();
  copiar(url, `Link de leitura (${state.caso.empresa}, ${state.caso.periodos[0]} a ${state.caso.periodos[state.caso.periodos.length - 1]})`);
});
$('#btn-sair').addEventListener('click', () => ACESSO && ACESSO.sair());
function aplicarAcesso() {
  document.documentElement.dataset.acesso = LEITURA ? 'leitura' : ADMIN ? 'admin' : 'livre';
  document.querySelectorAll('.so-admin').forEach(el => { el.hidden = !ADMIN; });
  $('#btn-sair').hidden = !ACESSO;
  if (LEITURA) {
    for (const id of ['#btn-trocar', '#btn-json', 'label[for="arq-importar"]', '#btn-branco']) { const el = $(id); if (el) el.hidden = true; }
    window.addEventListener('hashchange', () => location.reload());
  }
}

(async () => {
  aplicarAcesso();
  carregar();
  if (LEITURA) {
    LINK = await lerLink();
    state.params = { ...E.PADRAO, ...(LINK ? LINK.p || {} : {}) };
    // parâmetros que a pessoa mudou neste mesmo link continuam valendo
    const sv = SALVO_LEITURA;
    if (sv && sv.link === LINK_TOK && sv.params) state.params = { ...E.PADRAO, ...sv.params };
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  recalcular(); renderDados(); renderParams(); irAba(state.aba);
  carregarBase();
})();
})();
