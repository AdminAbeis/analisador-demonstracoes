/* Relatório completo no padrão ABNT (NBR 14724, 6023, 6024, 6027, 6028 e normas tabulares do IBGE),
   gerado no navegador a partir dos mesmos números e textos do site, em PDF (jsPDF) e Word (docx).
   Carregado sob demanda pelo app.js; recebe os dados por window.Relatorio.gerar(api, 'pdf' | 'docx'). */
(function () {
  'use strict';
  const LIBS = {
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
    docx: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'
  };
  const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  const NOMES_GRUPO = { liq: 'Índices de liquidez', est: 'Índices de estrutura de capital', rent: 'Índices de rentabilidade', ativ: 'Índices de atividade' };
  const LEITURA_GRUPO = {
    liq: 'Os índices de liquidez comparam os bens e direitos da empresa com as suas obrigações e indicam a capacidade de pagamento em diferentes horizontes de tempo. Quanto maiores, melhor.',
    est: 'Os índices de estrutura de capital mostram como a empresa financia os seus ativos, com capital próprio ou de terceiros, e quanto dos recursos está aplicado em ativos de longo prazo. Quanto menores, menor o risco financeiro.',
    rent: 'Os índices de rentabilidade relacionam o lucro com a receita, com o ativo e com o capital próprio, e mostram o retorno obtido pela empresa. Quanto maiores, melhor.',
    ativ: 'Os índices de atividade medem, em dias, quanto tempo os estoques ficam parados, quanto tempo a empresa leva para receber dos clientes e para pagar os fornecedores, e determinam os ciclos operacional e financeiro.'
  };
  const SIGLAS_PADRAO = [['AC', 'Ativo circulante'], ['ANC', 'Ativo não circulante'], ['CE', 'Composição do endividamento'], ['CF', 'Ciclo financeiro'], ['CMV', 'Custo das mercadorias vendidas'], ['CO', 'Ciclo operacional'], ['CT', 'Capital de terceiros'], ['CVM', 'Comissão de Valores Mobiliários'], ['DFC', 'Demonstração dos fluxos de caixa'], ['DFP', 'Demonstrações financeiras padronizadas'], ['DRE', 'Demonstração do resultado do exercício'], ['GA', 'Giro do ativo'], ['IPL', 'Imobilização do patrimônio líquido'], ['IRNC', 'Imobilização dos recursos não correntes'], ['LC', 'Liquidez corrente'], ['LG', 'Liquidez geral'], ['LI', 'Liquidez imediata'], ['LS', 'Liquidez seca'], ['ML', 'Margem líquida'], ['PC', 'Passivo circulante'], ['PCT', 'Participação de capitais de terceiros'], ['PL', 'Patrimônio líquido'], ['PMPC', 'Prazo médio de pagamento das compras'], ['PMRE', 'Prazo médio de renovação dos estoques'], ['PMRV', 'Prazo médio de recebimento das vendas'], ['PNC', 'Passivo não circulante'], ['RA', 'Rentabilidade do ativo'], ['RLP', 'Realizável a longo prazo'], ['RPL', 'Rentabilidade do patrimônio líquido']];

  // ---------------------------------------------------------------- gráficos (canvas -> PNG, o mesmo no PDF e no Word)
  // Paleta categórica validada (ordem fixa) + marcador e traço diferentes por série, para leitura em preto e branco.
  const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
  const TRACOS = [[], [18, 10], [6, 8], [24, 8, 6, 8], [2, 6]];
  const SERIES = { liq: ['LI', 'LC', 'LS', 'LG'], est: ['PCT', 'CE', 'IPL', 'IRNC'], rent: ['ML', 'RA', 'RPL'], ativ: ['PMRE', 'PMRV', 'PMPC', 'CO', 'CF'] };
  const UNID = { liq: 'índice', est: '%', rent: '%', ativ: 'dias' };
  function graficoGrupo(g, R, per, emp) {
    if (typeof document === 'undefined' || per.length < 2) return null;
    const ids = (SERIES[g.id] || g.ids).filter(id => R.by[id] && R.by[id].vals.some(v => v != null));
    if (!ids.length) return null;
    const Wc = 1500, Hc = 760, pad = { l: 120, r: 250, t: 40, b: 130 };
    const cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, Wc, Hc);
    const vals = ids.flatMap(id => R.by[id].vals.filter(v => v != null));
    let lo = Math.min(0, ...vals), hi = Math.max(...vals);
    const passo = (() => { const bruto = (hi - lo) / 5, m = Math.pow(10, Math.floor(Math.log10(bruto))); return [1, 2, 2.5, 5, 10].map(f => f * m).find(f => bruto <= f); })();
    lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo;
    const X = k => pad.l + (Wc - pad.l - pad.r) * (per.length === 1 ? 0.5 : k / (per.length - 1));
    const Y = v => Hc - pad.b - (Hc - pad.t - pad.b) * (v - lo) / (hi - lo);
    const fonte = n => `${n}px "Times New Roman", Times, serif`;
    const fmt = v => v.toLocaleString('pt-BR', { minimumFractionDigits: g.id === 'ativ' ? 0 : passo < 1 ? 2 : 0, maximumFractionDigits: g.id === 'ativ' ? 0 : 2 });
    // grade e eixos (recessivos)
    c.font = fonte(26); c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = lo; v <= hi + passo / 2; v += passo) {
      c.strokeStyle = v === 0 ? '#9a9a96' : '#e3e3df'; c.lineWidth = 2; c.beginPath(); c.moveTo(pad.l, Y(v)); c.lineTo(Wc - pad.r, Y(v)); c.stroke();
      c.fillStyle = '#55554f'; c.fillText(fmt(v), pad.l - 14, Y(v));
    }
    c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = '#33332f';
    per.forEach((p, k) => c.fillText(p, X(k), Hc - pad.b + 14));
    c.save(); c.translate(30, (pad.t + Hc - pad.b) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#55554f'; c.fillText(UNID[g.id] || '', 0, 0); c.restore();
    // séries
    const marcador = (k, x, y) => {
      c.beginPath(); const r = 9;
      if (k % 4 === 0) c.arc(x, y, r, 0, Math.PI * 2);
      else if (k % 4 === 1) c.rect(x - r, y - r, 2 * r, 2 * r);
      else if (k % 4 === 2) { c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 1.1, y + r * 0.8); c.lineTo(x - r * 1.1, y + r * 0.8); c.closePath(); }
      else { c.moveTo(x, y - r * 1.25); c.lineTo(x + r * 1.1, y); c.lineTo(x, y + r * 1.25); c.lineTo(x - r * 1.1, y); c.closePath(); }
      c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke();
    };
    const finais = [];
    ids.forEach((id, k) => {
      const i = R.by[id], cor = CORES[k % CORES.length];
      c.strokeStyle = cor; c.lineWidth = 4; c.setLineDash(TRACOS[k % TRACOS.length]); c.beginPath();
      let ini = false; i.vals.forEach((v, j) => { if (v == null) { ini = false; return; } if (!ini) { c.moveTo(X(j), Y(v)); ini = true; } else c.lineTo(X(j), Y(v)); });
      c.stroke(); c.setLineDash([]);
      c.fillStyle = cor; i.vals.forEach((v, j) => { if (v != null) marcador(k, X(j), Y(v)); });
      const j = i.vals.length - 1; if (i.vals[j] != null) finais.push({ id, y: Y(i.vals[j]), txt: `${id} ${i.fmt[j]}${i.unid === 'd' ? '' : ''}`, cor });
    });
    // rótulos diretos no fim de cada linha, sem sobreposição
    finais.sort((a, b) => a.y - b.y);
    for (let k = 1; k < finais.length; k++) if (finais[k].y - finais[k - 1].y < 30) finais[k].y = finais[k - 1].y + 30;
    c.font = fonte(26); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#1b1b18';
    finais.forEach(f => c.fillText(f.txt, Wc - pad.r + 22, f.y));
    // legenda (sempre presente com 2 ou mais séries)
    let lx = pad.l; const ly = Hc - 46; c.font = fonte(25);
    ids.forEach((id, k) => {
      const nome = `${id} – ${R.by[id].nome.replace(/^(o|a) /, '').replace(/^índice de /, '')}`;
      c.strokeStyle = CORES[k]; c.lineWidth = 4; c.setLineDash(TRACOS[k]); c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 44, ly); c.stroke(); c.setLineDash([]);
      c.fillStyle = CORES[k]; marcador(k, lx + 22, ly);
      c.fillStyle = '#33332f'; c.textAlign = 'left'; c.textBaseline = 'middle';
      const curto = ids.length > 3 ? id : nome; c.fillText(curto, lx + 54, ly); lx += 54 + c.measureText(curto).width + 36;
    });
    const titulo = `Evolução dos ${(NOMES_GRUPO[g.id] || g.titulo).toLowerCase()} da ${emp}${g.id === 'rent' ? ' (exceto o giro do ativo, medido em vezes)' : ''}`;
    return { titulo, data: cv.toDataURL('image/png'), w: Wc, h: Hc };
  }

  function hoje() { const d = new Date(); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; }
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  // ---------------------------------------------------------------- modelo
  // Blocos: {t:'h1'|'h2'|'h3', texto} | {t:'p', texto, semRecuo} | {t:'li', texto} | {t:'tabela', titulo, cab, linhas, fonte, dir, negrito, larg}
  //         {t:'grafico', titulo, fonte, png, w, h} | {t:'refs', itens} | {t:'apendice', texto}
  async function montar(api) {
    const { state, R } = api;
    const caso = state.caso, per = caso.periodos.map(String);
    const T = api.trabalhoPronto() ? api.TRABALHO : null;
    const P = t => api.preencher(t);
    const emp = caso.empresa || 'Empresa';
    const faixa = per.length > 1 ? `${per[0]}–${per[per.length - 1]}` : per[0];
    const fonteCVM = `Fonte: elaborado pelos autores com dados da CVM (${new Date().getFullYear()}).`;
    const B = [];
    const tabelas = [], graficos = [];
    const tabela = (titulo, cab, linhas, o = {}) => { tabelas.push(titulo); B.push({ t: 'tabela', titulo, cab, linhas, fonte: o.fonte || fonteCVM, dir: o.dir || [], negrito: o.negrito || [], larg: o.larg, n: tabelas.length }); };
    const grafico = (titulo, png, w, h) => { if (!png) return; graficos.push(titulo); B.push({ t: 'grafico', titulo, png, w, h, fonte: fonteCVM, n: graficos.length }); };
    const h1 = t => B.push({ t: 'h1', texto: t }), h2 = t => B.push({ t: 'h2', texto: t }), h3 = t => B.push({ t: 'h3', texto: t });
    const p = (t, o = {}) => B.push({ t: 'p', texto: t, ...o });

    // 1 Introdução
    h1('Introdução');
    if (T) T.introducao.forEach(t => p(P(t)));
    else {
      p(`Este relatório analisa a situação econômico-financeira da ${emp} nos exercícios de ${per.join(', ').replace(/, ([^,]*)$/, ' e $1')}, por meio da técnica de análise de indicadores. Para cada índice, apresentam-se os valores, a fórmula, a decomposição da variação entre numerador e denominador e as contas que explicam o movimento.`);
      p(`Os dados foram extraídos das demonstrações financeiras padronizadas (DFP) da companhia, arquivadas na Comissão de Valores Mobiliários (CVM), com valores em milhares de reais. Os índices foram calculados com ${state.params.saldos === 'medio' ? 'os saldos médios' : 'os saldos finais'} de cada exercício e com o ano de ${state.params.dias} dias para os prazos médios. A Tabela 1 apresenta as fórmulas utilizadas.`);
    }
    tabela('Indicadores utilizados na análise e respectivas fórmulas', ['Grupo', 'Indicador', 'Fórmula', 'Leitura'],
      R.grupos.flatMap(g => g.ids.map(id => { const i = R.by[id]; return [g.titulo, `${api.nomeIndice(i)} (${i.id})`, i.formula, i.dir > 0 ? 'quanto maior, melhor' : 'quanto menor, melhor']; })),
      { fonte: 'Fonte: elaborado pelos autores com base em Matarazzo (2010), Marion (2019) e Assaf Neto (2020).', larg: [0.18, 0.3, 0.32, 0.2] });

    // 2 Caracterização da empresa
    h1('Caracterização da empresa');
    if (T) {
      const C = T.caracterizacao;
      h2('Identificação');
      p(`A Tabela ${tabelas.length + 1} resume as principais informações da companhia.`);
      tabela(`Identificação da ${emp}`, ['Item', 'Informação'], C.identificacao.map(([k, v]) => [k, v]), { fonte: C.fonteIdentificacao, larg: [0.3, 0.7] });
      for (const sec of C.secoes) {
        h2(sec.titulo);
        sec.paragrafos.forEach(t => p(P(t)));
        (sec.itens || []).forEach(t => B.push({ t: 'li', texto: P(t) }));
        (sec.depois || []).forEach(t => p(P(t)));
      }
    } else {
      const f = api.fichaEmpresa();
      if (f.length) tabela(`Identificação da ${emp}`, ['Item', 'Informação'], f, { fonte: `Fonte: cadastro de companhias abertas da CVM (${new Date().getFullYear()}).`, larg: [0.3, 0.7] });
      if (R.abertura) p(R.abertura);
    }

    // 3 Análise das demonstrações contábeis
    h1('Análise das demonstrações contábeis');
    p(`Esta seção apresenta os índices calculados para ${per.length > 1 ? `os exercícios de ${per.join(', ').replace(/, ([^,]*)$/, ' e $1')}` : `o exercício de ${per[0]}`}, organizados em quatro grupos. Cada grupo traz a tabela com os valores e a variação no período e, em seguida, a interpretação de cada indicador. As demonstrações utilizadas estão nos apêndices.`);
    for (const g of R.grupos) {
      h2(NOMES_GRUPO[g.id] || g.titulo);
      if (LEITURA_GRUPO[g.id]) p(LEITURA_GRUPO[g.id]);
      const its = g.ids.map(id => R.by[id]);
      const prox = tabelas.length + 1;
      p(`A Tabela ${prox} apresenta os ${(NOMES_GRUPO[g.id] || g.titulo).toLowerCase()} da ${emp} no período.${g.sintese ? ' ' + g.sintese : ''}`);
      tabela(`${NOMES_GRUPO[g.id] || g.titulo} da ${emp} (${faixa})`, ['Indicador', ...per, 'Variação'],
        its.map(i => [`${api.nomeIndice(i)} (${i.id})`, ...i.fmt.map(v => v == null ? '–' : v + (i.unid === 'd' ? ' dias' : '')), i.t ? (i.t.est ? 'estável' : `${i.delta} (${i.t.melhora ? 'melhora' : 'piora'})`) : '–']),
        { dir: per.map((_, k) => k + 1).concat(per.length + 1), larg: [0.36].concat(per.map(() => 0.42 / per.length), [0.22]) });
      const png = graficoGrupo(g, R, per, emp);
      if (png) grafico(png.titulo, png.data, png.w, png.h);
      for (const i of its) { h3(`${api.nomeIndice(i)} (${i.id})`); p(api.textoIndice(i)); }
    }

    // 4 Interpretação e 5 Conclusão
    if (api.estiloTrabalho()) {
      h1('Interpretação dos resultados');
      p('Esta seção reúne os indicadores para avaliar a situação econômica e financeira da empresa sob quatro aspectos: estrutura de capital, capacidade de pagamento, rentabilidade e ciclos operacional e financeiro.');
      for (const sec of T.interpretacao) { h2(sec.titulo); sec.paragrafos.forEach(t => p(P(t))); }
      h1('Conclusão');
      T.conclusao.forEach(t => p(P(t)));
    } else {
      h1('Interpretação dos resultados');
      R.conclusao.slice(0, -1).forEach(c => p(c));
      h1('Conclusão');
      p(R.conclusao[R.conclusao.length - 1]);
    }

    // Referências
    const refs = T ? T.referencias.slice() : [
      'ASSAF NETO, Alexandre. **Estrutura e análise de balanços**: um enfoque econômico-financeiro. 12. ed. São Paulo: Atlas, 2020.',
      `COMISSÃO DE VALORES MOBILIÁRIOS (CVM). **Portal Dados Abertos CVM**: companhias abertas – documentos – formulário de demonstrações financeiras padronizadas (DFP). Rio de Janeiro: CVM, ${new Date().getFullYear()}. Disponível em: https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp. Acesso em: ${hoje()}.`,
      'MARION, José Carlos. **Análise das demonstrações contábeis**: contabilidade empresarial. 8. ed. São Paulo: Atlas, 2019.',
      'MATARAZZO, Dante Carmine. **Análise financeira de balanços**: abordagem gerencial. 7. ed. São Paulo: Atlas, 2010.'
    ];
    B.push({ t: 'refs', itens: refs });

    // Apêndices: demonstrações (até o 3º nível de contas)
    const nivel = c => c.split('.').length;
    const apend = [['BPA', 'Balanço patrimonial – ativo'], ['BPP', 'Balanço patrimonial – passivo e patrimônio líquido'], ['DRE', 'Demonstração do resultado do exercício'], ['DFC', 'Demonstração dos fluxos de caixa']];
    const letras = 'ABCDEFG';
    let n = 0;
    for (const [demo, nome] of apend) {
      let d; try { d = await api.dadosDemo(demo); } catch (e) { d = null; }
      if (!d || !d.linhas || !d.linhas.length) continue;
      const lim = demo === 'DRE' ? 3 : 3;
      const ls = d.linhas.filter(l => nivel(l.c) <= lim && l.v.some(v => v != null && v !== 0));
      if (!ls.length) continue;
      const fmt = v => v == null ? '–' : v < 0 ? `(${api.fmtR(-v)})` : api.fmtR(v);
      B.push({ t: 'apendice', texto: `Apêndice ${letras[n++]} – ${cap(nome)} consolidado da ${emp} (${faixa})` });
      tabela(`${cap(nome)} da ${emp}, em R$ mil (${faixa})`, ['Código', 'Conta', ...per], ls.map(l => [l.c, l.d, ...l.v.map(fmt)]),
        { dir: per.map((_, k) => k + 2), negrito: ls.map((l, k) => nivel(l.c) <= 2 ? k : -1).filter(k => k >= 0), larg: [0.12, 0.52].concat(per.map(() => 0.36 / per.length)), fonte: `Fonte: demonstrações financeiras padronizadas da ${emp} (CVM, ${new Date().getFullYear()}).` });
    }

    // Pré-textuais
    const capa = T ? T.capa : {
      instituicao: '', cursos: '', disciplina: '', professora: '', alunos: [], titulo: `ANÁLISE DAS DEMONSTRAÇÕES CONTÁBEIS DA ${emp.toUpperCase()}`,
      subtitulo: `relatório de análise por indicadores (${faixa})`, natureza: 'Relatório de análise das demonstrações contábeis por meio de indicadores.', orientacao: '', cidade: '', uf: '', ano: String(new Date().getFullYear())
    };
    return {
      capa, emp, per, B, tabelas, graficos,
      resumo: T ? P(T.resumo) : null, palavras: T ? T.palavrasChave : null,
      siglas: (T && T.siglas) || SIGLAS_PADRAO,
      estilo: api.nomeEstilo
    };
  }

  // numeração progressiva (NBR 6024) e entradas do sumário
  function numerar(B) {
    const c = [0, 0, 0]; const entradas = [];
    for (const b of B) {
      if (b.t === 'h1') { c[0]++; c[1] = 0; c[2] = 0; b.num = `${c[0]}`; }
      else if (b.t === 'h2') { c[1]++; c[2] = 0; b.num = `${c[0]}.${c[1]}`; }
      else if (b.t === 'h3') { c[2]++; b.num = `${c[0]}.${c[1]}.${c[2]}`; }
      else continue;
      entradas.push(b);
    }
    return entradas;
  }
  const tituloH = b => b.t === 'h1' || b.t === 'h2' ? b.texto.toUpperCase() : b.texto;

  // ---------------------------------------------------------------- PDF
  // caracteres fora da codificação das fontes padrão do PDF
  const limpa = s => String(s).replace(/−/g, '-').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/ /g, ' ').replace(/[  ]/g, ' ');

  async function pdf(M, api) {
    await api.carregarScript(LIBS.jspdf); await api.carregarScript(LIBS.autotable);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ML = 30, MR = 20, MT = 30, MB = 20, W = 210 - ML - MR, H = 297;
    const LH = 12 * 1.5 * 0.3528; // 1,5 de entrelinha em corpo 12, em mm
    const LH1 = 12 * 1.15 * 0.3528; // simples
    let y = MT;
    doc.setFont('times', 'normal'); doc.setFontSize(12);
    // largura sem kerning (o texto é desenhado sem kerning; getTextWidth subtrai pares como "VA" e cola palavras)
    const cacheL = {};
    const larg = (t, est = 'normal', tam = 12) => {
      doc.setFont('times', est); doc.setFontSize(tam);
      let w = 0; for (const ch of t) { const k = est + ch; if (cacheL[k] == null) cacheL[k] = doc.getTextWidth(ch) / tam; w += cacheL[k]; }
      return w * tam;
    };
    const novaPagina = () => { doc.addPage(); y = MT; };
    const cabe = h => { if (y + h > H - MB) novaPagina(); };
    const centro = (t, yy, est = 'normal', tam = 12) => { doc.setFont('times', est); doc.setFontSize(tam); doc.text(limpa(t), 105 + (ML - MR) / 2, yy, { align: 'center' }); };

    // texto com **negrito**, justificado ou alinhado à esquerda, com recuo de primeira linha
    function paragrafo(texto, o = {}) {
      const tam = o.tam || 12, lh = o.lh || LH, x0 = o.x != null ? o.x : ML, w = o.w || W, recuo = o.recuo != null ? o.recuo : 12.5;
      const partes = limpa(texto).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s => s.startsWith('**') ? { s: s.slice(2, -2), b: true } : { s, b: false });
      const palavras = [];
      let fimComEspaco = true;
      for (const pt of partes) {
        pt.s.split(/(\s+)/).forEach((w, k) => {
          if (!w || /^\s+$/.test(w)) return;
          // pedaço que começa sem espaço logo após outro sem espaço (": um", ". Jaraguá") cola na palavra anterior
          palavras.push({ w, b: pt.b || !!o.negrito, cola: k === 0 && palavras.length > 0 && !fimComEspaco });
        });
        fimComEspaco = /\s$/.test(pt.s);
      }
      // palavras maiores que a linha (endereços longos) são quebradas por caractere
      const maxw = (o.w || W) - 2;
      for (let k = 0; k < palavras.length; k++) {
        const pw = palavras[k];
        if (larg(pw.w, pw.b ? 'bold' : 'normal', tam) <= maxw) continue;
        const pedacos = []; let atual = '';
        for (const ch of pw.w) { if (larg(atual + ch, pw.b ? 'bold' : 'normal', tam) > maxw) { pedacos.push(atual); atual = ''; } atual += ch; }
        if (atual) pedacos.push(atual);
        palavras.splice(k, 1, ...pedacos.map((w, j) => ({ w, b: pw.b, cola: j === 0 ? pw.cola : false, quebra: j > 0 })));
        k += pedacos.length - 1;
      }
      // quebra de linhas
      const linhas = []; let atual = [], lw = 0; let primeira = true;
      const espaco = larg(' ', 'normal', tam);
      for (const p of palavras) {
        const pw = larg(p.w, p.b ? 'bold' : 'normal', tam), lim = w - (primeira ? recuo : 0);
        const g = p.cola ? 0 : espaco;
        if (atual.length && lw + g + pw > lim) { linhas.push({ ps: atual, lw, primeira }); atual = []; lw = 0; primeira = false; }
        lw += (atual.length ? g : 0) + pw; atual.push({ ...p, pw, g: atual.length ? g : 0 });
      }
      if (atual.length) linhas.push({ ps: atual, lw, primeira, ultima: true });
      linhas.forEach((ln, k) => {
        if (y + lh > H - MB) novaPagina();
        const xi = x0 + (ln.primeira ? recuo : 0), lim = w - (ln.primeira ? recuo : 0);
        const nGaps = ln.ps.filter((p, k) => k > 0 && p.g > 0).length;
        const extra = o.justificar !== false && !ln.ultima && nGaps ? (lim - ln.lw) / nGaps : 0;
        let x = o.centro ? x0 + (w - ln.lw) / 2 : xi;
        ln.ps.forEach((p, k) => { if (k > 0) x += p.g + (p.g > 0 ? extra : 0); doc.setFont('times', p.b ? 'bold' : 'normal'); doc.setFontSize(tam); doc.text(p.w, x, y + lh * 0.72); x += p.pw; });
        y += lh;
      });
    }
    function tituloSemNumero(t) { centro(t.toUpperCase(), y + LH * 0.72, 'bold'); y += LH * 2; }

    // tabela no padrão IBGE: título acima, linhas só no cabeçalho e no fim, fonte abaixo
    function tabelaPDF(b) {
      // tabela curta não se divide nem deixa a fonte sozinha na página seguinte
      const estimada = (b.linhas.length + 1) * 6.4 + 16;
      if (estimada < 130 && y + estimada > H - MB) novaPagina(); else cabe(LH * 2 + 20);
      doc.setFont('times', 'normal'); doc.setFontSize(10);
      const tit = `Tabela ${b.n} – ${b.titulo}`;
      const lt = doc.splitTextToSize(limpa(tit), W); lt.forEach(l => { doc.text(l, ML, y + 4); y += 4.6; }); y += 1;
      const largs = b.larg ? b.larg.map(f => f * W) : null;
      const colunas = {}; if (largs) largs.forEach((w, k) => { colunas[k] = { cellWidth: w }; });
      b.dir.forEach(k => { colunas[k] = { ...(colunas[k] || {}), halign: 'right' }; });
      let ultimaLinhaY = null;
      doc.autoTable({
        startY: y, margin: { left: ML, right: MR, top: MT, bottom: MB + 2 },
        head: [b.cab.map(limpa)], body: b.linhas.map(l => l.map(c => limpa(c == null ? '' : c))),
        theme: 'plain', styles: { font: 'times', fontSize: 9.5, cellPadding: { top: 1.1, bottom: 1.1, left: 1.2, right: 1.2 }, textColor: 20, overflow: 'linebreak' },
        headStyles: { fontStyle: 'bold' }, columnStyles: colunas,
        didParseCell: d => { if (d.section === 'body' && b.negrito.includes(d.row.index)) d.cell.styles.fontStyle = 'bold'; if (d.section === 'head' && b.dir.includes(d.column.index)) d.cell.styles.halign = 'right'; },
        didDrawCell: d => {
          doc.setDrawColor(0); doc.setLineWidth(0.3);
          if (d.section === 'head') { doc.line(d.cell.x, d.cell.y, d.cell.x + d.cell.width, d.cell.y); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); }
          if (d.section === 'body' && d.row.index === b.linhas.length - 1) doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
        }
      });
      y = doc.lastAutoTable.finalY + 1.5;
      doc.setFont('times', 'normal'); doc.setFontSize(10);
      if (y + 5 > H - MB) novaPagina();
      doc.text(limpa(b.fonte), ML, y + 3.5); y += 4.5 + LH * 0.8;
    }
    function graficoPDF(b) {
      const w = W * 0.9, h = w * b.h / b.w;
      cabe(h + 16);
      doc.setFont('times', 'normal'); doc.setFontSize(10);
      doc.text(limpa(`Gráfico ${b.n} – ${b.titulo}`), ML, y + 4); y += 6;
      doc.addImage(b.png, 'PNG', ML + (W - w) / 2, y, w, h); y += h + 1.5;
      doc.text(limpa(b.fonte), ML, y + 3.5); y += 4.5 + LH * 0.8;
    }

    const C = M.capa;
    // capa (NBR 14724): instituição, curso, autores, título, subtítulo, local e ano
    y = MT;
    if (C.instituicao) { centro(C.instituicao, y, 'bold'); y += LH; }
    if (C.cursos) { centro(C.cursos, y, 'bold'); y += LH; }
    if (C.disciplina) { centro(C.disciplina.toUpperCase(), y); y += LH; }
    y += LH * 2;
    for (const [nome, , ra] of (C.alunos || [])) { centro(`${nome.toUpperCase()}${ra ? ' – RA ' + ra : ''}`, y); y += LH; }
    y = 140;
    doc.setFont('times', 'bold'); doc.setFontSize(14);
    doc.splitTextToSize(limpa(C.titulo + (C.subtitulo ? ':' : '')), W).forEach(l => { centro(l, y, 'bold', 14); y += LH; });
    if (C.subtitulo) doc.splitTextToSize(limpa(C.subtitulo), W).forEach(l => { centro(l, y, 'normal', 12); y += LH; });
    if (C.professora) centro(`Professora: ${C.professora.replace(/^Profa\.\s*/, '')}`, 245);
    if (C.cidade) centro(`${C.cidade}${C.uf ? ' – ' + C.uf : ''}`, H - MB - LH * 1.2);
    centro(C.ano, H - MB);

    // folha de rosto
    novaPagina();
    for (const [nome] of (C.alunos || [])) { centro(nome.toUpperCase(), y); y += LH; }
    y = 110;
    doc.splitTextToSize(limpa(C.titulo + (C.subtitulo ? ':' : '')), W).forEach(l => { centro(l, y, 'bold', 14); y += LH; });
    if (C.subtitulo) doc.splitTextToSize(limpa(C.subtitulo), W).forEach(l => { centro(l, y); y += LH; });
    y = Math.max(y + LH * 2, 160);
    paragrafo(C.natureza, { x: ML + 80, w: W - 80, recuo: 0, tam: 10, lh: 10 * 0.3528 * 1.15 });
    if (C.orientacao) { y += 3; paragrafo(C.orientacao, { x: ML + 80, w: W - 80, recuo: 0, tam: 10, lh: 10 * 0.3528 * 1.15, justificar: false }); }
    if (C.cidade) centro(`${C.cidade}${C.uf ? ' – ' + C.uf : ''}`, H - MB - LH * 1.2);
    centro(C.ano, H - MB);

    // resumo (NBR 6028)
    if (M.resumo) {
      novaPagina(); tituloSemNumero('Resumo');
      paragrafo(M.resumo, { recuo: 0, lh: LH1 * 1.3 });
      y += LH;
      paragrafo(`**Palavras-chave:** ${M.palavras.join('. ')}.`, { recuo: 0, justificar: false, lh: LH1 * 1.3 });
    }
    // listas e sumário: páginas reservadas, preenchidas depois de saber as páginas
    novaPagina(); const pgListaTab = doc.getNumberOfPages();
    let pgListaGraf = null; if (M.graficos.length) { novaPagina(); pgListaGraf = doc.getNumberOfPages(); }
    novaPagina(); const pgSiglas = doc.getNumberOfPages();
    doc.setFont('times', 'normal'); doc.setFontSize(12);
    tituloSemNumero('Lista de abreviaturas e siglas');
    for (const [s, d] of M.siglas) { if (y + LH > H - MB) novaPagina(); doc.setFont('times', 'normal'); doc.text(limpa(s), ML, y + LH * 0.72); doc.text(limpa(d), ML + 25, y + LH * 0.72); y += LH; }
    novaPagina(); const pgSumario = doc.getNumberOfPages();
    const entradas = numerar(M.B);
    const extra = Math.ceil(Math.max(0, entradas.length + 3 - 34) / 36);
    for (let k = 0; k < extra; k++) novaPagina();

    // corpo
    const paginaDe = {}; const pgTabela = {}, pgGrafico = {};
    let pgIntro = null;
    for (const b of M.B) {
      if (b.t === 'h1') { novaPagina(); if (pgIntro == null) pgIntro = doc.getNumberOfPages(); doc.setFont('times', 'bold'); doc.setFontSize(12); doc.text(limpa(`${b.num} ${b.texto.toUpperCase()}`), ML, y + LH * 0.72); paginaDe[b.num] = doc.getNumberOfPages(); y += LH * 2; }
      else if (b.t === 'h2') { cabe(LH * 4); y += LH * 0.5; doc.setFont('times', 'normal'); doc.setFontSize(12); doc.text(limpa(`${b.num} ${b.texto.toUpperCase()}`), ML, y + LH * 0.72); paginaDe[b.num] = doc.getNumberOfPages(); y += LH * 1.5; }
      else if (b.t === 'h3') { cabe(LH * 4); y += LH * 0.3; doc.setFont('times', 'bold'); doc.setFontSize(12); doc.text(limpa(`${b.num} ${b.texto}`), ML, y + LH * 0.72); paginaDe[b.num] = doc.getNumberOfPages(); y += LH * 1.3; }
      else if (b.t === 'p') paragrafo(b.texto, { recuo: b.semRecuo ? 0 : 12.5 });
      else if (b.t === 'li') { const x0 = ML + 12.5; doc.setFont('times', 'normal'); doc.setFontSize(12); if (y + LH > H - MB) novaPagina(); doc.text('•', ML + 7, y + LH * 0.72); paragrafo(b.texto, { x: x0, w: W - 12.5, recuo: 0 }); }
      else if (b.t === 'tabela') { pgTabela[b.n] = doc.getNumberOfPages(); tabelaPDF(b); pgTabela[b.n] = pgTabela[b.n] === doc.getNumberOfPages() ? pgTabela[b.n] : pgTabela[b.n]; }
      else if (b.t === 'grafico') { graficoPDF(b); pgGrafico[b.n] = doc.getNumberOfPages(); }
      else if (b.t === 'refs') {
        novaPagina(); paginaDe.refs = doc.getNumberOfPages(); tituloSemNumero('Referências');
        for (const r of b.itens) { paragrafo(r, { recuo: 0, justificar: false, lh: LH1 }); y += LH1; }
      } else if (b.t === 'apendice') {
        novaPagina(); paginaDe['ap:' + b.texto] = doc.getNumberOfPages();
        doc.setFont('times', 'bold'); doc.setFontSize(12);
        doc.splitTextToSize(limpa(b.texto.toUpperCase()), W).forEach(l => { centro(l, y + LH * 0.72, 'bold'); y += LH; }); y += LH;
      }
    }
    // tabelas: página onde o título ficou (a tabela pode ter passado para a página seguinte)
    const total = doc.getNumberOfPages();
    const num = pg => pg - 1; // a capa conta como página, mas não é numerada; a folha de rosto é a página 1 (NBR 14724)

    // lista de tabelas, de gráficos e sumário
    function lista(pg, titulo, itens) {
      doc.setPage(pg); y = MT; tituloSemNumero(titulo);
      for (const [rot, n] of itens) {
        if (y + LH > H - MB) { pg++; doc.setPage(pg); y = MT; }
        const linhas = doc.splitTextToSize(limpa(rot), W - 14);
        linhas.forEach((l, k) => {
          doc.setFont('times', 'normal'); doc.setFontSize(12); doc.text(l, ML, y + LH * 0.72);
          if (k === linhas.length - 1) { const lw = doc.getTextWidth(l); const nt = String(n); const nw = doc.getTextWidth(nt); let x = ML + lw + 1.5; const dot = doc.getTextWidth('.'); let dots = ''; while (x + dot * (dots.length + 1) < ML + W - nw - 1.5) dots += '.'; doc.text(dots, ML + lw + 1.5, y + LH * 0.72); doc.text(nt, ML + W, y + LH * 0.72, { align: 'right' }); }
          y += LH;
        });
      }
    }
    lista(pgListaTab, 'Lista de tabelas', M.tabelas.map((t, k) => [`Tabela ${k + 1} – ${t}`, num(pgTabela[k + 1])]));
    if (pgListaGraf) lista(pgListaGraf, 'Lista de gráficos', M.graficos.map((t, k) => [`Gráfico ${k + 1} – ${t}`, num(pgGrafico[k + 1])]));
    // sumário (NBR 6027): mesma tipografia das seções
    doc.setPage(pgSumario); y = MT; tituloSemNumero('Sumário');
    let pgs = pgSumario;
    const itensSum = [...entradas.map(b => ({ b, rot: `${b.num}`, txt: tituloH(b), pg: num(paginaDe[b.num]) })), { rot: '', txt: 'REFERÊNCIAS', pg: num(paginaDe.refs), b: { t: 'h1' } },
      ...Object.keys(paginaDe).filter(k => k.startsWith('ap:')).map(k => ({ rot: '', txt: k.slice(3).toUpperCase(), pg: num(paginaDe[k]), b: { t: 'h1' } }))];
    for (const it of itensSum) {
      if (y + LH > H - MB) { pgs++; doc.setPage(pgs); y = MT; }
      const est = it.b.t === 'h1' ? 'bold' : it.b.t === 'h3' ? 'bold' : 'normal';
      doc.setFont('times', est); doc.setFontSize(12);
      const xTxt = ML + 16;
      if (it.rot) doc.text(it.rot, ML, y + LH * 0.72);
      const linhas = doc.splitTextToSize(limpa(it.txt), W - 16 - 12);
      linhas.forEach((l, k) => {
        doc.setFont('times', est); doc.text(l, it.rot ? xTxt : ML, y + LH * 0.72);
        if (k === linhas.length - 1) {
          const lw = doc.getTextWidth(l); doc.setFont('times', 'normal'); const nt = String(it.pg), nw = doc.getTextWidth(nt), dot = doc.getTextWidth('.');
          let dots = ''; const x0 = (it.rot ? xTxt : ML) + lw + 1.5; while (x0 + dot * (dots.length + 1) < ML + W - nw - 1.5) dots += '.';
          doc.text(dots, x0, y + LH * 0.72); doc.text(nt, ML + W, y + LH * 0.72, { align: 'right' });
        }
        y += LH;
      });
    }
    // numeração de páginas: a partir da introdução, no canto superior direito (NBR 14724)
    for (let pg = pgIntro; pg <= total; pg++) { doc.setPage(pg); doc.setFont('times', 'normal'); doc.setFontSize(10); doc.text(String(num(pg)), 210 - MR, 20, { align: 'right' }); }
    doc.setProperties({ title: M.capa.titulo, subject: M.capa.subtitulo || '', author: (M.capa.alunos || []).map(a => a[0]).join('; '), keywords: (M.palavras || []).join(', '), creator: 'Analisador de Demonstrações' });
    return doc.output('blob');
  }

  // ---------------------------------------------------------------- DOCX
  async function docx(M, api) {
    await api.carregarScript(LIBS.docx);
    const D = window.docx;
    const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Header, PageNumber, TableOfContents, Table, TableRow, TableCell, WidthType, BorderStyle, StyleLevel, ImageRun, PageBreak, LineRuleType, VerticalAlign, TabStopType, LeaderType } = D;
    const CM = 567; // twips por centímetro
    const corpo = 24, mancha = 16 * CM; // corpo 12 (meio-pontos), largura útil 16 cm
    const runs = (texto, o = {}) => String(texto).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s => s.startsWith('**') ? new TextRun({ text: s.slice(2, -2), bold: true, size: o.size }) : new TextRun({ text: s, bold: !!o.bold, size: o.size, allCaps: !!o.caps }));
    const par = (texto, o = {}) => new Paragraph({ children: runs(texto, o), alignment: o.alinhamento || AlignmentType.JUSTIFIED, indent: o.semRecuo ? undefined : { firstLine: Math.round(1.25 * CM) }, spacing: { line: o.linha || 360, after: o.depois || 0 }, ...(o.extra || {}) });
    const centro = (texto, o = {}) => new Paragraph({ children: runs(texto, o), alignment: AlignmentType.CENTER, spacing: { line: 360, before: o.antes || 0, after: o.depois || 0 }, pageBreakBefore: !!o.quebra });
    const semNumero = (t, quebra = true) => centro(t.toUpperCase(), { bold: true, quebra, depois: 360 });
    const borda = { style: BorderStyle.SINGLE, size: 6, color: '000000' }, nada = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

    function tabelaDocx(b) {
      const ws = (b.larg || b.cab.map(() => 1 / b.cab.length)).map(f => Math.round(f * mancha));
      const cel = (t, k, o = {}) => new TableCell({
        width: { size: ws[k], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        borders: { top: o.topo ? borda : nada, bottom: o.base ? borda : nada, left: nada, right: nada },
        margins: { top: 30, bottom: 30, left: 60, right: 60 },
        children: [new Paragraph({ alignment: b.dir.includes(k) ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { line: 240 }, children: [new TextRun({ text: String(t == null ? '' : t), size: 19, bold: !!o.negrito })] })]
      });
      const linhas = [new TableRow({ tableHeader: true, children: b.cab.map((t, k) => cel(t, k, { topo: true, base: true, negrito: true })) })]
        .concat(b.linhas.map((l, r) => new TableRow({ cantSplit: true, children: l.map((t, k) => cel(t, k, { base: r === b.linhas.length - 1, negrito: b.negrito.includes(r) })) })));
      return [
        new Paragraph({ keepNext: true, spacing: { before: 120, after: 60, line: 240 }, children: [new TextRun({ text: `Tabela ${b.n} – ${b.titulo}`, size: 20 })], style: 'Legenda' }),
        new Table({ width: { size: mancha, type: WidthType.DXA }, columnWidths: ws, rows: linhas }),
        new Paragraph({ spacing: { before: 60, after: 240, line: 240 }, children: [new TextRun({ text: b.fonte, size: 20 })] })
      ];
    }
    function graficoDocx(b) {
      const bin = Uint8Array.from(atob(b.png.split(',')[1]), c => c.charCodeAt(0));
      const wpx = 560, hpx = Math.round(wpx * b.h / b.w);
      return [
        new Paragraph({ keepNext: true, spacing: { before: 120, after: 60, line: 240 }, children: [new TextRun({ text: `Gráfico ${b.n} – ${b.titulo}`, size: 20 })], style: 'LegendaGrafico' }),
        new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({ data: bin, transformation: { width: wpx, height: hpx } })] }),
        new Paragraph({ spacing: { before: 60, after: 240, line: 240 }, children: [new TextRun({ text: b.fonte, size: 20 })] })
      ];
    }

    const C = M.capa;
    const capa = [];
    if (C.instituicao) capa.push(centro(C.instituicao, { bold: true }));
    if (C.cursos) capa.push(centro(C.cursos, { bold: true }));
    if (C.disciplina) capa.push(centro(C.disciplina.toUpperCase()));
    capa.push(centro('', { antes: 720 }));
    for (const [nome, , ra] of (C.alunos || [])) capa.push(centro(`${nome.toUpperCase()}${ra ? ' – RA ' + ra : ''}`));
    capa.push(centro(C.titulo + (C.subtitulo ? ':' : ''), { bold: true, size: 28, antes: 2200 }));
    if (C.subtitulo) capa.push(centro(C.subtitulo));
    if (C.professora) capa.push(centro(`Professora: ${C.professora.replace(/^Profa\.\s*/, '')}`, { antes: 1800 }));
    capa.push(centro(`${C.cidade || ''}${C.uf ? ' – ' + C.uf : ''}`, { antes: C.professora ? 900 : 3600 }));
    capa.push(centro(C.ano));

    const pre = [];
    for (const [nome] of (C.alunos || [])) pre.push(centro(nome.toUpperCase()));
    pre.push(centro(C.titulo + (C.subtitulo ? ':' : ''), { bold: true, size: 28, antes: 2400 }));
    if (C.subtitulo) pre.push(centro(C.subtitulo));
    pre.push(new Paragraph({ indent: { left: 8 * CM }, alignment: AlignmentType.JUSTIFIED, spacing: { before: 1200, line: 240 }, children: [new TextRun({ text: C.natureza, size: 20 })] }));
    if (C.orientacao) pre.push(new Paragraph({ indent: { left: 8 * CM }, spacing: { before: 200, line: 240 }, children: [new TextRun({ text: C.orientacao, size: 20 })] }));
    pre.push(centro(`${C.cidade || ''}${C.uf ? ' – ' + C.uf : ''}`, { antes: 2400 }));
    pre.push(centro(C.ano));
    if (M.resumo) {
      pre.push(semNumero('Resumo'));
      pre.push(par(M.resumo, { semRecuo: true, linha: 276 }));
      pre.push(par(`**Palavras-chave:** ${M.palavras.join('. ')}.`, { semRecuo: true, linha: 276, extra: { spacing: { before: 280, line: 276 } }, alinhamento: AlignmentType.LEFT }));
    }
    pre.push(semNumero('Lista de tabelas'));
    // listas montadas pelo Word a partir dos estilos das legendas (atualizadas ao abrir o arquivo)
    pre.push(new TableOfContents('Lista de tabelas', { stylesWithLevels: [new StyleLevel('Legenda', 1)], hyperlink: true }));
    if (M.graficos.length) { pre.push(semNumero('Lista de gráficos')); pre.push(new TableOfContents('Lista de gráficos', { stylesWithLevels: [new StyleLevel('LegendaGrafico', 1)], hyperlink: true })); }
    pre.push(semNumero('Lista de abreviaturas e siglas'));
    for (const [s, d] of M.siglas) pre.push(new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: Math.round(2.5 * CM) }], spacing: { line: 360 }, children: [new TextRun(s), new TextRun({ text: '\t' + d })] }));
    pre.push(semNumero('Sumário'));
    pre.push(new TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-3' }));

    numerar(M.B);
    const txt = [];
    let primeiro = true;
    for (const b of M.B) {
      if (b.t === 'h1') { txt.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !primeiro, children: [new TextRun(`${b.num} ${b.texto.toUpperCase()}`)] })); primeiro = false; }
      else if (b.t === 'h2') txt.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${b.num} ${b.texto.toUpperCase()}`)] }));
      else if (b.t === 'h3') txt.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(`${b.num} ${b.texto}`)] }));
      else if (b.t === 'p') txt.push(par(b.texto, { semRecuo: b.semRecuo }));
      else if (b.t === 'li') txt.push(new Paragraph({ bullet: { level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 360 }, children: runs(b.texto) }));
      else if (b.t === 'tabela') txt.push(...tabelaDocx(b));
      else if (b.t === 'grafico') txt.push(...graficoDocx(b));
      else if (b.t === 'refs') {
        txt.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, alignment: AlignmentType.CENTER, children: [new TextRun('REFERÊNCIAS')] }));
        for (const r of b.itens) txt.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 240, after: 240 }, children: runs(r) }));
      } else if (b.t === 'apendice') txt.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, alignment: AlignmentType.CENTER, children: [new TextRun(b.texto.toUpperCase())] }));
    }
    const pagina = { size: { width: 11906, height: 16838 }, margin: { top: 3 * CM, left: 3 * CM, bottom: 2 * CM, right: 2 * CM, header: 2 * CM } };
    const doc = new Document({
      creator: (C.alunos || []).map(a => a[0]).join('; ') || 'Analisador de Demonstrações', title: C.titulo, description: C.subtitulo || '',
      features: { updateFields: true },
      styles: {
        default: { document: { run: { font: 'Times New Roman', size: corpo }, paragraph: { spacing: { line: 360 } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Times New Roman', size: corpo, bold: true, color: '000000' }, paragraph: { spacing: { before: 0, after: 360, line: 360 }, keepNext: true } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Times New Roman', size: corpo, bold: false, color: '000000' }, paragraph: { spacing: { before: 240, after: 240, line: 360 }, keepNext: true } },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Times New Roman', size: corpo, bold: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 120, line: 360 }, keepNext: true } },
          { id: 'Legenda', name: 'Legenda de tabela', basedOn: 'Normal', run: { font: 'Times New Roman', size: 20 } },
          { id: 'LegendaGrafico', name: 'Legenda de gráfico', basedOn: 'Normal', run: { font: 'Times New Roman', size: 20 } }
        ]
      },
      sections: [
        { properties: { page: pagina }, children: capa },
        { properties: { page: { ...pagina, pageNumbers: { start: 1 } } }, children: pre },
        {
          properties: { page: pagina },
          headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] }) },
          children: txt
        }
      ]
    });
    return Packer.toBlob(doc);
  }

  window.Relatorio = {
    montar,
    async gerar(api, formato) {
      const M = await montar(api);
      return formato === 'docx' ? docx(M, api) : pdf(M, api);
    }
  };
})();
