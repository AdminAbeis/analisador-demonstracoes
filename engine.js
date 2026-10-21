/* Motor de análise das demonstrações contábeis: índices, decomposição, seleção de contas e textos.
   Funciona no navegador (window.Engine) e no Node (require). */
const Engine = (() => {
  const GRUPOS_BP = [
    ['AC', 'Ativo circulante'], ['ANC', 'Ativo não circulante'],
    ['PC', 'Passivo circulante'], ['PNC', 'Passivo não circulante'],
    ['PL', 'Patrimônio líquido'], ['DRE', 'Demonstração do resultado']
  ];
  const CODIGOS = [
    ['AC.DISP', 'Disponível (caixa e equivalentes)'], ['AC.APLIC', 'Aplicações financeiras'],
    ['AC.CLI', 'Clientes / duplicatas a receber'], ['AC.EST', 'Estoques'],
    ['AC.DESPANT', 'Despesas antecipadas'], ['AC.OUT', 'Outros ativos circulantes'],
    ['ANC.RLP', 'Realizável a longo prazo'], ['ANC.INV', 'Investimentos'],
    ['ANC.IMOB', 'Imobilizado'], ['ANC.INT', 'Intangível'],
    ['PC.FORN', 'Fornecedores'], ['PC.EMP', 'Empréstimos e financiamentos (CP)'],
    ['PC.OUT', 'Outros passivos circulantes'],
    ['PNC.EMP', 'Empréstimos e financiamentos (LP)'], ['PNC.OUT', 'Outros passivos não circulantes'],
    ['PL.CAP', 'Capital social'], ['PL.RES', 'Reservas'], ['PL.OUT', 'Outras contas do PL'],
    ['DRE.RL', 'Receita líquida'], ['DRE.CMV', 'CMV / CPV (custo)'], ['DRE.LB', 'Resultado bruto'],
    ['DRE.DOP', 'Despesas operacionais'], ['DRE.RO', 'Resultado operacional'], ['DRE.RFIN', 'Resultado financeiro'],
    ['DRE.IR', 'Impostos sobre o lucro'], ['DRE.OUT', 'Outras linhas da DRE'], ['DRE.LL', 'Lucro (prejuízo) líquido']
  ];
  const PADRAO = {
    saldos: 'final', dias: 360, lsModo: 'est_da', liModo: 'disp_aplic', pctModo: 'ct_pl',
    varPct: 'pp', decPct: 2, deltaArred: true, estX: 2, estPP: 0.5, estDias: 5, estGrupo: 0.5,
    repAcum: 70, repMin: 10, repMax: 5, varAcum: 70, varMin: 10, atenuante: 30, taxaRef: ''
  };
  const SIGNIFICADO = {
    'AC.EST': 'a liquidez depende da venda dos estoques, recursos que ficam parados até a venda',
    'AC.CLI': 'a liquidez depende do recebimento das vendas a prazo',
    'AC.DISP': 'há folga de caixa imediata; em excesso, pode indicar recursos ociosos',
    'AC.APLIC': 'há folga de caixa imediata; em excesso, pode indicar recursos ociosos',
    'ANC.RLP': 'parte relevante do não circulante são direitos a receber no longo prazo',
    'ANC.IMOB': 'a empresa é intensiva em ativo fixo, o que deve ser lido junto com a imobilização do PL',
    'PC.EMP': 'a dívida de curto prazo é principalmente onerosa, com juros',
    'PC.FORN': 'a operação é financiada principalmente por fornecedores, normalmente sem juros',
    'PNC.EMP': 'a dívida de longo prazo dá mais tempo para a empresa gerar recursos',
    'PL.CAP': 'o patrimônio é formado principalmente pelo capital investido pelos sócios',
    'PL.RES': 'o patrimônio cresceu principalmente pela retenção de lucros'
  };

  // ---------- formatação ----------
  const num = v => (v === '' || v == null || !isFinite(Number(v))) ? null : Number(v);
  const fmtN = (v, d) => (v == null || !isFinite(v)) ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = v => fmtN(Math.abs(v), Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2);
  const sinal = v => (v >= 0 ? '+' : '−') + money(v);
  const pct = g => fmtN(Math.abs(g) * 100, 2) + '%';
  const pctSig = g => (g >= 0 ? '+' : '−') + pct(g);
  const lista = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const fem = l => l.startsWith('a ');
  const sem = l => l.replace(/^(o|a) /, '');
  const de = l => (fem(l) ? 'da ' : 'do ') + sem(l);
  const por = l => (fem(l) ? 'pela ' : 'pelo ') + sem(l);
  const em = l => (fem(l) ? 'na ' : 'no ') + sem(l);
  const ao = l => (fem(l) ? 'à ' : 'ao ') + sem(l);

  function fmtVal(d, v, P) {
    if (v == null) return '—';
    if (d.unid === 'x') return fmtN(v, 2);
    if (d.unid === '%') return fmtN(v, P.decPct) + '%';
    return fmtN(v, 0);
  }
  function fmtValLongo(d, v, P) {
    return d.unid === 'd' ? fmtVal(d, v, P) + ' dias' : fmtVal(d, v, P);
  }
  function fmtDelta(d, delta, P) {
    const a = Math.abs(delta);
    if (d.unid === 'x') return fmtN(a, 2);
    if (d.unid === '%') return fmtN(a, P.decPct) + (P.varPct === 'pp' ? ' p.p.' : '%');
    return fmtN(a, 0) + (Math.round(a) === 1 ? ' dia' : ' dias');
  }
  const ANO = /^ano\s*(\d+)$/i;
  function perFrase(labels) {
    if (labels.every(l => ANO.test(l))) {
      const ns = labels.map(l => l.match(ANO)[1]);
      return ns.length === 1 ? `no ano ${ns[0]}` : `nos anos ${lista(ns)}`;
    }
    return `em ${lista(labels)}`;
  }
  function perPar(a, b) {
    if (ANO.test(a) && ANO.test(b)) return `do ano ${a.match(ANO)[1]} para o ano ${b.match(ANO)[1]}`;
    return `de ${a} para ${b}`;
  }

  // ---------- definições dos índices ----------
  function defs(P) {
    const L = [];
    const R = o => L.push({ tipo: 'razao', ...o });
    const ct = ['PC.', 'PNC.'];
    const at = ['AC.', 'ANC.'];
    const fixos = ['ANC.', '-ANC.RLP'];
    const acima1 = (rotOk, rotMal) => (v, vals) => {
      const ok = vals.filter(x => x != null);
      const todos = ok.every(x => x > 1);
      if (v > 1.02) return todos ? 'O índice manteve-se acima de 1 em todos os períodos, o que é considerado satisfatório.'
        : 'Ao final do período o índice está acima de 1, o que é considerado satisfatório.';
      if (v >= 0.98) return 'Ao final do período o índice está próximo de 1, uma situação de equilíbrio, sem folga.';
      return `Ao final do período o índice ficou abaixo de 1, indicando que ${rotMal}.`;
    };
    R({
      id: 'LI', grupo: 'liq', nome: 'o índice de liquidez imediata', unid: 'x', dir: 1, mult: 1,
      obj: 'a capacidade de pagamento imediata, apenas com as disponibilidades',
      formula: P.liModo === 'disp' ? 'Caixa e equivalentes ÷ PC' : 'Disponível (caixa, equivalentes e aplicações) ÷ PC',
      num: { sels: P.liModo === 'disp' ? ['AC.DISP'] : ['AC.DISP', 'AC.APLIC'], rot: 'o disponível' },
      den: { sels: ['PC.'], rot: 'o passivo circulante' },
      julg: v => v < 1 ? 'Ficar abaixo de 1 é normal neste índice, pois as empresas não costumam manter recursos parados no caixa.'
        : 'Acima de 1, a empresa cobre todo o passivo circulante só com suas disponibilidades; em excesso, isso pode indicar recursos ociosos.',
      intr: (v, P) => `Para cada R$ 1,00 de dívida de curto prazo, a empresa possui ${fmtN(v, 2)} em disponibilidades.`
    });
    R({
      id: 'LC', grupo: 'liq', nome: 'o índice de liquidez corrente', unid: 'x', dir: 1, mult: 1,
      obj: 'a capacidade de pagamento de curto prazo', formula: 'AC ÷ PC',
      num: { sels: ['AC.'], rot: 'o ativo circulante' }, den: { sels: ['PC.'], rot: 'o passivo circulante' },
      julg: acima1('', 'o ativo circulante não cobre o passivo circulante'),
      intr: v => `Para cada R$ 1,00 de passivo circulante, a empresa possui ${fmtN(v, 2)} de ativo circulante.`
    });
    const lsDa = P.lsModo === 'est_da';
    R({
      id: 'LS', grupo: 'liq', nome: 'o índice de liquidez seca', unid: 'x', dir: 1, mult: 1,
      obj: 'a capacidade de pagamento de curto prazo sem depender da venda dos estoques',
      formula: lsDa ? '(AC − Estoques − Desp. antecipadas) ÷ PC' : '(AC − Estoques) ÷ PC',
      num: { sels: lsDa ? ['AC.', '-AC.EST', '-AC.DESPANT'] : ['AC.', '-AC.EST'], rot: lsDa ? 'o ativo circulante sem estoques e despesas antecipadas' : 'o ativo circulante sem estoques' },
      den: { sels: ['PC.'], rot: 'o passivo circulante' },
      julg: acima1('', 'sem vender os estoques a empresa não cobre o passivo circulante'),
      intr: v => `Para cada R$ 1,00 de passivo circulante, a empresa possui ${fmtN(v, 2)} de ativo circulante, sem contar ${lsDa ? 'estoques e despesas antecipadas' : 'estoques'}.`
    });
    R({
      id: 'LG', grupo: 'liq', nome: 'o índice de liquidez geral', unid: 'x', dir: 1, mult: 1,
      obj: 'a capacidade de pagamento de longo prazo', formula: '(AC + RLP) ÷ (PC + PNC)',
      num: { sels: ['AC.', 'ANC.RLP'], rot: 'o ativo circulante somado ao realizável a longo prazo' },
      den: { sels: ct, rot: 'o capital de terceiros' },
      julg: acima1('', 'os bens e direitos realizáveis não cobrem as dívidas totais; vale verificar se a dívida financiou ativo fixo (imobilização do PL)'),
      intr: v => `Para cada R$ 1,00 de dívida total, a empresa possui ${fmtN(v, 2)} entre ativo circulante e realizável a longo prazo.`
    });
    const pctAt = P.pctModo === 'ct_at';
    R({
      id: 'PCT', grupo: 'est', nome: 'o índice de participação de capitais de terceiros', unid: '%', dir: -1, mult: 100,
      obj: pctAt ? 'quanto do ativo total é financiado por capitais de terceiros' : 'quanto a empresa tem de capitais de terceiros em relação ao capital próprio',
      formula: pctAt ? 'CT ÷ Ativo total × 100' : 'CT ÷ PL × 100',
      num: { sels: ct, rot: 'o capital de terceiros' },
      den: pctAt ? { sels: at, rot: 'o ativo total' } : { sels: ['PL.'], rot: 'o patrimônio líquido' },
      julg: v => pctAt
        ? (v > 50 ? 'Mais da metade do ativo é financiada por capitais de terceiros.' : 'A maior parte do ativo é financiada por capital próprio.')
        : (v > 100 ? 'A empresa utiliza mais capital de terceiros do que capital próprio. Endividamento alto não é ruim por si; deve ser lido junto com a composição do endividamento e a rentabilidade do PL.'
          : 'O capital próprio supera o capital de terceiros.'),
      intr: v => pctAt ? `De cada R$ 100,00 aplicados no ativo, ${fmtN(v, 2)} vieram de capitais de terceiros.`
        : `Para cada R$ 100,00 de capital próprio, a empresa tomou ${fmtN(v, 2)} de capital de terceiros.`
    });
    R({
      id: 'CE', grupo: 'est', nome: 'o índice de composição do endividamento', unid: '%', dir: -1, mult: 100,
      obj: 'quanto do capital de terceiros vence no curto prazo', formula: 'PC ÷ CT × 100',
      num: { sels: ['PC.'], rot: 'o passivo circulante' }, den: { sels: ct, rot: 'o capital de terceiros' },
      julg: (v, vals, t) => !t || t.est ? '' : (t.d > 0
        ? 'A empresa está concentrando a dívida no curto prazo, o que não é considerado satisfatório, pois reduz o tempo para gerar recursos com as atividades operacionais.'
        : 'O perfil da dívida melhorou, com mais obrigações no longo prazo e mais tempo para a empresa gerar recursos.'),
      intr: (v, P) => `${fmtN(v, P.decPct)}% das obrigações com terceiros vencem no curto prazo e ${fmtN(100 - v, P.decPct)}% no longo prazo.`
    });
    R({
      id: 'IPL', grupo: 'est', nome: 'o índice de imobilização do patrimônio líquido', unid: '%', dir: -1, mult: 100,
      obj: 'quanto do patrimônio líquido foi aplicado em ativos fixos (investimentos, imobilizado e intangível)', formula: '(ANC − RLP) ÷ PL × 100',
      num: { sels: fixos, rot: 'o ativo permanente' }, den: { sels: ['PL.'], rot: 'o patrimônio líquido' },
      julg: (v, vals, t, P) => v > 100
        ? 'Acima de 100%, o capital próprio não é suficiente nem para financiar os ativos fixos, e a empresa não tem capital próprio para financiar o giro do negócio.'
        : `Sobra ${fmtN(100 - v, P.decPct)}% do patrimônio líquido para financiar o giro do negócio.`,
      intr: v => `Para cada R$ 100,00 de patrimônio líquido, a empresa aplicou ${fmtN(v, 2)} em ativos fixos.`
    });
    R({
      id: 'IRNC', grupo: 'est', nome: 'o índice de imobilização dos recursos não correntes', unid: '%', dir: -1, mult: 100,
      obj: 'quanto dos recursos não correntes (patrimônio líquido e passivo não circulante) foi aplicado em ativos fixos', formula: '(ANC − RLP) ÷ (PL + PNC) × 100',
      num: { sels: fixos, rot: 'o ativo permanente' }, den: { sels: ['PL.', 'PNC.'], rot: 'o total de recursos não correntes' },
      julg: (v, vals, t, P) => v > 100
        ? 'Acima de 100%, o patrimônio líquido e o passivo não circulante não bastam para financiar os ativos fixos, e o giro do negócio passa a ser financiado por capitais de terceiros de curto prazo.'
        : `Restam ${fmtN(100 - v, P.decPct)}% dos recursos não correntes para financiar o giro do negócio.`,
      intr: (v, P) => `${fmtN(v, P.decPct)}% dos recursos não correntes estão aplicados em ativos fixos.`
    });
    R({
      id: 'GA', grupo: 'rent', nome: 'o giro do ativo', unid: 'x', dir: 1, mult: 1, media: true,
      obj: 'quanto a empresa vendeu em relação ao seu ativo total', formula: 'Receita líquida ÷ Ativo total',
      num: { sels: ['DRE.RL'], rot: 'a receita líquida' }, den: { sels: at, rot: 'o ativo total' },
      julg: () => '', intr: v => `Para cada R$ 1,00 investido no ativo total, a empresa vendeu ${fmtN(v, 2)}.`
    });
    const prejuizo = v => v < 0 ? 'A empresa apresentou prejuízo no último período.' : '';
    R({
      id: 'ML', grupo: 'rent', nome: 'a margem líquida', unid: '%', dir: 1, mult: 100,
      obj: 'quanto da receita líquida a empresa retém em forma de lucro líquido', formula: 'Lucro líquido ÷ Receita líquida × 100',
      num: { sels: ['DRE.LL'], rot: 'o lucro líquido' }, den: { sels: ['DRE.RL'], rot: 'a receita líquida' },
      julg: prejuizo, intr: v => `Para cada R$ 100,00 vendidos, a empresa obteve ${fmtN(v, 2)} de lucro líquido.`
    });
    R({
      id: 'RA', grupo: 'rent', nome: 'a rentabilidade do ativo', unid: '%', dir: 1, mult: 100, media: true,
      obj: 'o retorno sobre o investimento total da empresa (capital próprio e de terceiros)', formula: 'Lucro líquido ÷ Ativo total × 100',
      num: { sels: ['DRE.LL'], rot: 'o lucro líquido' }, den: { sels: at, rot: 'o ativo total' },
      julg: prejuizo, intr: v => `Para cada R$ 100,00 de investimento total, a empresa obteve ${fmtN(v, 2)} de lucro líquido.`
    });
    R({
      id: 'RPL', grupo: 'rent', nome: 'a rentabilidade do patrimônio líquido', unid: '%', dir: 1, mult: 100, media: true,
      obj: 'a rentabilidade do capital próprio investido pelos sócios', formula: 'Lucro líquido ÷ PL × 100',
      num: { sels: ['DRE.LL'], rot: 'o lucro líquido' }, den: { sels: ['PL.'], rot: 'o patrimônio líquido' },
      julg: (v, vals, t, P) => {
        const ref = num(P.taxaRef);
        if (v < 0) return 'A empresa apresentou prejuízo, sem retorno para os sócios no último período.';
        if (ref == null) return '';
        return v >= ref ? `O retorno supera a taxa de referência de ${fmtN(ref, 2)}%, que representa o custo de oportunidade dos sócios.`
          : `O retorno fica abaixo da taxa de referência de ${fmtN(ref, 2)}%, que representa o custo de oportunidade dos sócios.`;
      },
      intr: v => `Para cada R$ 100,00 de capital próprio, a empresa obteve ${fmtN(v, 2)} de lucro líquido.`
    });
    R({
      id: 'PMRE', grupo: 'ativ', nome: 'o prazo médio de renovação de estoques', unid: 'd', dir: -1, mult: 'dias', media: true,
      obj: 'o tempo médio que o estoque permanece na empresa até ser vendido', formula: 'Estoques ÷ CMV × ' + P.dias,
      num: { sels: ['AC.EST'], rot: 'o estoque' }, den: { sels: ['DRE.CMV'], rot: 'o custo das mercadorias vendidas' },
      julg: (v, vals, t) => !t || t.est ? '' : (t.d < 0 ? 'A redução é favorável: quanto menos tempo o produto fica estocado, menos capital a empresa precisa para financiar o giro.'
        : 'O aumento é desfavorável: o produto fica mais tempo estocado e exige mais capital para financiar o giro.'),
      intr: v => `Em média, o estoque permanece ${fmtN(v, 0)} dias na empresa até ser vendido.`
    });
    R({
      id: 'PMRV', grupo: 'ativ', nome: 'o prazo médio de recebimento das vendas', unid: 'd', dir: -1, mult: 'dias', media: true,
      obj: 'o tempo médio entre a venda e o recebimento', formula: 'Clientes ÷ Receita líquida × ' + P.dias,
      num: { sels: ['AC.CLI'], rot: 'o saldo de clientes' }, den: { sels: ['DRE.RL'], rot: 'a receita líquida' },
      julg: (v, vals, t) => !t || t.est ? '' : (t.d < 0 ? 'A redução é satisfatória: quanto menos o cliente demora para pagar, menos recursos a empresa precisa para financiá-lo.'
        : 'O aumento é desfavorável: quanto mais o cliente demora para pagar, mais recursos a empresa precisa para financiá-lo.'),
      intr: v => `Em média, a empresa leva ${fmtN(v, 0)} dias para receber suas vendas.`
    });
    R({
      id: 'PMPC', grupo: 'ativ', nome: 'o prazo médio de pagamento das compras', unid: 'd', dir: 1, mult: 'dias', media: true,
      obj: 'o tempo médio concedido pelos fornecedores para o pagamento das compras', formula: 'Fornecedores ÷ Compras × ' + P.dias,
      num: { sels: ['PC.FORN'], rot: 'o saldo de fornecedores' }, den: { compras: true, rot: 'o volume de compras' },
      julg: (v, vals, t) => !t || t.est ? '' : (t.d > 0 ? 'O aumento é benéfico: com mais prazo dos fornecedores, a empresa consegue financiar por mais tempo seus clientes e o giro do negócio.'
        : 'A redução é desfavorável: a empresa passa a pagar os fornecedores mais rápido.'),
      intr: v => `Em média, a empresa leva ${fmtN(v, 0)} dias para pagar seus fornecedores.`
    });
    L.push({
      tipo: 'soma', id: 'CO', grupo: 'ativ', nome: 'o ciclo operacional', unid: 'd', dir: -1,
      obj: 'o tempo entre a compra do estoque e o recebimento da venda', formula: 'PMRE + PMRV',
      parts: [['PMRE', 1], ['PMRV', 1]], explica: 'O ciclo operacional é a soma do prazo médio de renovação de estoques com o prazo médio de recebimento das vendas.',
      julg: () => '', intr: v => `Da compra do estoque ao recebimento da venda passam, em média, ${fmtN(v, 0)} dias.`
    });
    L.push({
      tipo: 'soma', id: 'CF', grupo: 'ativ', nome: 'o ciclo financeiro', unid: 'd', dir: -1,
      obj: 'por quantos dias a empresa precisa financiar o giro do negócio', formula: 'CO − PMPC',
      parts: [['PMRE', 1], ['PMRV', 1], ['PMPC', -1]], explica: 'O ciclo financeiro é o ciclo operacional menos o prazo médio de pagamento das compras.',
      julg: v => v < 0 ? 'O ciclo financeiro é negativo (inverso): os fornecedores financiam toda a operação, e a empresa recebe dos clientes antes de pagar as compras.'
        : 'O ideal é que este indicador seja o menor possível, pois a empresa só pode conceder prazos aos clientes se tiver capital para financiar esse período sem recorrer a capital de terceiros de curto prazo, que é mais oneroso.',
      intr: v => v < 0 ? `A empresa recebe das vendas, em média, ${fmtN(-v, 0)} dias antes de pagar os fornecedores.` : `A empresa precisa financiar o giro do negócio por ${fmtN(v, 0)} dias.`
    });
    return L;
  }

  // ---------- séries ----------
  function lado(caso, sels) {
    const m = new Map();
    for (const s of sels) {
      const neg = s[0] === '-'; const sel = neg ? s.slice(1) : s; const pre = sel.endsWith('.');
      const cs = caso.contas.filter(c => pre ? (c.cod.startsWith(sel) && !c.detalhe) : c.cod === sel);
      for (const c of cs) {
        const e = m.get(c) || { c, k: 0, exact: false };
        e.k += neg ? -1 : 1; if (!pre) e.exact = true; m.set(c, e);
      }
    }
    return [...m.values()].filter(e => e.k !== 0);
  }
  function acc(c, i, media) {
    if (!media) return c.v[i];
    if (i === 0 || c.v[i] == null || c.v[i - 1] == null) return null;
    return (c.v[i] + c.v[i - 1]) / 2;
  }
  function serieLado(n, entries, media) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!entries.length || (media && i === 0)) { out.push(null); continue; }
      let s = 0, ok = true, cont = 0;
      for (const e of entries) {
        const v = acc(e.c, i, media);
        if (v == null) { if (e.exact) { ok = false; break; } continue; }
        s += e.k * v; cont++;
      }
      out.push(ok && cont ? s : null);
    }
    return out;
  }
  const ehDRE = sels => sels.every(s => s.replace('-', '').startsWith('DRE.'));
  function serieCompras(caso, n) {
    const est = serieLado(n, lado(caso, ['AC.EST']), false);
    const cmv = serieLado(n, lado(caso, ['DRE.CMV']), false);
    const ov = (caso.extras && caso.extras.compras) || [];
    const ei0 = num(caso.extras && caso.extras.estoqueInicial);
    return est.map((e, i) => {
      const o = num(ov[i]); if (o != null) return o;
      const ei = i === 0 ? ei0 : est[i - 1];
      if (ei == null || e == null || cmv[i] == null) return null;
      return cmv[i] - ei + e;
    });
  }

  function comprasDetalhe(caso, n, i) {
    const est = serieLado(n, lado(caso, ['AC.EST']), false);
    const cmv = serieLado(n, lado(caso, ['DRE.CMV']), false);
    const ov = num(((caso.extras && caso.extras.compras) || [])[i]);
    if (ov != null) return { informado: ov };
    const ei = i === 0 ? num(caso.extras && caso.extras.estoqueInicial) : est[i - 1];
    return { cmv: cmv[i], ei, ef: est[i], total: cmv[i] - ei + est[i] };
  }
  function calcRazao(d, caso, P, n) {
    const media = P.saldos === 'medio' && !!d.media;
    const mN = media && !ehDRE(d.num.sels);
    const eN = lado(caso, d.num.sels);
    const N = serieLado(n, eN, mN);
    let eD = [], mD = false, Dn;
    if (d.den.compras) Dn = serieCompras(caso, n);
    else { mD = media && !ehDRE(d.den.sels); eD = lado(caso, d.den.sels); Dn = serieLado(n, eD, mD); }
    const mult = d.mult === 'dias' ? P.dias : d.mult;
    const vals = N.map((x, i) => (x == null || Dn[i] == null || Dn[i] === 0) ? null : x / Dn[i] * mult);
    // composição de numerador e denominador em cada período (para mostrar o cálculo)
    const comp = (entries, media, i) => entries.map(e => {
      const v = acc(e.c, i, media);
      return v == null ? null : { nome: e.c.nome, v, k: e.k, media, v0: media ? e.c.v[i - 1] : null, v1: media ? e.c.v[i] : null };
    }).filter(Boolean);
    const detalhe = vals.map((v, i) => {
      if (v == null) return null;
      const den = d.den.compras ? { compras: comprasDetalhe(caso, n, i) } : { contas: comp(eD, mD, i) };
      return { N: N[i], D: Dn[i], num: { contas: comp(eN, mN, i) }, den };
    });
    return { d, eN, eD, N, D: Dn, mN, mD, mult, vals, detalhe };
  }
  function calcSoma(d, res, n) {
    const vals = [];
    for (let i = 0; i < n; i++) {
      let s = 0, ok = true;
      for (const [id, k] of d.parts) { const v = res[id].vals[i]; if (v == null) { ok = false; break; } s += k * v; }
      vals.push(ok ? s : null);
    }
    return { d, vals };
  }

  // ---------- tendência ----------
  function estavelDelta(d, delta, base, P) {
    if (d.unid === 'x') return Math.abs(base) > 1e-9 ? Math.abs(delta / base) * 100 < P.estX : Math.abs(delta) < 0.005;
    if (d.unid === '%') return Math.abs(delta) < P.estPP;
    return Math.abs(delta) < P.estDias;
  }
  function arred(d, v, P) {
    if (v == null || !P.deltaArred) return v;
    const c = d.unid === 'x' ? 2 : d.unid === '%' ? P.decPct : 0;
    return Math.round(v * 10 ** c) / 10 ** c;
  }
  function tendencia(d, valsRaw, P) {
    const vals = valsRaw.map(v => arred(d, v, P));
    const idx = vals.map((v, i) => v == null ? null : i).filter(i => i != null);
    if (idx.length < 2) return null;
    const i0 = idx[0], i1 = idx[idx.length - 1], v0 = vals[i0], v1 = vals[i1], delta = v1 - v0;
    const est = estavelDelta(d, delta, v0, P);
    const melhora = !est && delta * d.dir > 0;
    return { i0, i1, v0, v1, d: delta, est, melhora, piora: !est && !melhora, idx };
  }

  function fraseCaso(d, gN, gD, P) {
    const eN = Math.abs(gN * 100) < P.estGrupo, eD = Math.abs(gD * 100) < P.estGrupo;
    const n = d.num.rot, dd = d.den.rot;
    const v = g => g > 0 ? 'aumentou' : 'diminuiu';
    if (eN && eD) return `${n} e ${dd} variaram pouco (${pctSig(gN)} e ${pctSig(gD)}), mas em proporções diferentes`;
    if (eN) return `${n} permaneceu praticamente estável (${pctSig(gN)}), e a variação veio ${de(dd)}, que ${v(gD)} ${pct(gD)}`;
    if (eD) return `${dd} permaneceu praticamente estável (${pctSig(gD)}), e a variação veio ${de(n)}, que ${v(gN)} ${pct(gN)}`;
    if (gN > 0 && gD > 0) return `ambos aumentaram, só que ${n} teve um aumento de ${pct(gN)} e ${dd} de ${pct(gD)}`;
    if (gN < 0 && gD < 0) return `ambos diminuíram, só que ${n} teve uma redução de ${pct(gN)} e ${dd} de ${pct(gD)}`;
    return `${n} ${v(gN)} ${pct(gN)}, enquanto ${dd} ${v(gD)} ${pct(gD)}`;
  }

  function explicar(entries, rot, i0, i1, media, estavel, S0, P) {
    const cs = entries.map(e => {
      const a0 = acc(e.c, i0, media), a1 = acc(e.c, i1, media);
      return (a0 == null || a1 == null) ? null : { nome: e.c.nome, own: a1 - a0, d: e.k * (a1 - a0) };
    }).filter(Boolean);
    if (cs.length === 1 && entries.length === 1 && !entries[0].exact && !estavel) {
      return `As contas ${de(rot)} não estão detalhadas nos dados, por isso não é possível apontar qual conta explica a variação`;
    }
    if (cs.length < 2) return '';
    const tot = cs.reduce((s, x) => s + x.d, 0);
    if (estavel || Math.abs(tot) < 1e-9) {
      const gross = cs.reduce((s, x) => s + Math.abs(x.d), 0);
      if (!S0 || gross < 0.1 * Math.abs(S0)) return '';
      const up = cs.filter(x => x.own > 0).sort((a, b) => b.own - a.own)[0];
      const dn = cs.filter(x => x.own < 0).sort((a, b) => a.own - b.own)[0];
      if (!up || !dn) return '';
      return `Embora ${rot} tenha ficado praticamente estável, houve mudança na sua composição: ${up.nome} aumentou ${money(up.own)} e ${dn.nome} diminuiu ${money(dn.own)}`;
    }
    const mesmo = cs.filter(x => Math.sign(x.d) === Math.sign(tot)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const sel = []; let acum = 0;
    for (const x of mesmo) {
      const p = Math.abs(x.d) / Math.abs(tot) * 100;
      if (p < P.varMin) break;
      sel.push(x); acum += p;
      if (acum >= P.varAcum || sel.length >= 3) break;
    }
    if (!sel.length) return '';
    const up = tot > 0;
    let s = sel.length === 1
      ? `${cap(em(rot))}, a conta que mais ${up ? 'aumentou' : 'diminuiu'} foi ${sel[0].nome} (${sinal(sel[0].own)})`
      : `${cap(em(rot))}, as contas que mais ${up ? 'aumentaram' : 'diminuíram'} foram ${lista(sel.map(x => `${x.nome} (${sinal(x.own)})`))}, que juntas ${acum > 100 ? 'superam a variação líquida do grupo' : `explicam ${fmtN(acum, 0)}% da variação`}`;
    const at = cs.filter(x => Math.sign(x.d) !== Math.sign(tot) && Math.abs(x.d) / Math.abs(tot) * 100 >= P.atenuante)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
    if (at) s += `. Em sentido contrário, ${at.nome} ${at.own > 0 ? 'aumentou' : 'diminuiu'} ${money(at.own)}, compensando parte do movimento`;
    return s;
  }

  function explicarDRE(caso, i0, i1, sobe) {
    const rl = caso.contas.filter(c => c.cod === 'DRE.RL');
    const R0 = rl.reduce((a, c) => a + (c.v[i0] || 0), 0), R1 = rl.reduce((a, c) => a + (c.v[i1] || 0), 0);
    if (!R0 || !R1) return '';
    const linhas = caso.contas.filter(c => ['DRE.CMV', 'DRE.DOP', 'DRE.IR', 'DRE.RFIN'].includes(c.cod) && c.v[i0] != null && c.v[i1] != null)
      .map(c => { const a = c.v[i0] / R0 * 100, b = c.v[i1] / R1 * 100; const desp = c.cod !== 'DRE.RFIN'; return { nome: c.nome, a, b, efeito: desp ? -(b - a) : (b - a) }; })
      .filter(x => Math.abs(x.efeito) >= 0.3);
    if (!linhas.length) return '';
    const alvo = linhas.filter(x => sobe ? x.efeito > 0 : x.efeito < 0).sort((x, y) => Math.abs(y.efeito) - Math.abs(x.efeito)).slice(0, 2);
    if (!alvo.length) return '';
    const f = x => `${x.nome}, que passou de ${fmtN(x.a, 2)}% para ${fmtN(x.b, 2)}% da receita líquida`;
    const contra = linhas.filter(x => sobe ? x.efeito < 0 : x.efeito > 0).sort((x, y) => Math.abs(y.efeito) - Math.abs(x.efeito))[0];
    const um = alvo.length === 1;
    const verbo = sobe ? (um ? 'contribuiu para a melhora' : 'contribuíram para a melhora') : (um ? 'pressionou a margem' : 'pressionaram a margem');
    let s = `Na DRE, ${um ? 'a linha que mais' : 'as linhas que mais'} ${verbo} ${um ? 'foi' : 'foram'} ${alvo.map(f).join(', e ')}`;
    if (contra) s += `; em sentido contrário, ${f(contra)}`;
    return s + '.';
  }

  // ---------- texto por índice ----------
  function texto(r, res, caso, P) {
    const d = r.d, Lb = caso.periodos, n = Lb.length;
    const idx = r.vals.map((v, i) => v == null ? null : i).filter(i => i != null);
    const partes = [];
    if (!idx.length) return { paragrafo: `Não foi possível calcular ${d.nome} com os dados informados.`, t: null };
    const vt = idx.map(i => fmtVal(d, r.vals[i], P) + (d.unid === 'd' && idx.length === 1 ? ' dias' : ''));
    const valores = d.unid === 'd' && idx.length > 1 ? lista(vt) + ' dias' : lista(vt);
    partes.push(idx.length > 1
      ? `Em relação ${ao(d.nome)}, que avalia ${d.obj}, os valores ${perFrase(idx.map(i => Lb[i]))} foram de ${valores}${idx.length > 2 ? ', respectivamente' : ''}.`
      : `Em relação ${ao(d.nome)}, que avalia ${d.obj}, o valor ${perFrase(idx.map(i => Lb[i]))} foi de ${valores}.`);
    const falt = Lb.map((l, i) => r.vals[i] == null ? i : null).filter(i => i != null);
    if (falt.length) {
      let motivo = 'por falta de dados';
      if ((d.id === 'PMPC' || d.id === 'CF') && falt.includes(0) && num(caso.extras && caso.extras.estoqueInicial) == null)
        motivo = 'pois falta o estoque inicial necessário para apurar as compras (CMV = EI + C − EF)';
      else if (P.saldos === 'medio' && (d.media || d.tipo === 'soma') && falt.length === 1 && falt[0] === 0)
        motivo = 'pois o saldo médio exige o saldo do período anterior';
      partes.push(`${cap(perFrase(falt.map(i => Lb[i])))} não é possível calcular este indicador, ${motivo}.`);
    }
    const t = tendencia(d, r.vals, P);
    if (t) {
      if (t.est) partes.push(`Observa-se que este indicador permaneceu praticamente estável no período analisado (variação de ${fmtDelta(d, t.d, P)}).`);
      else partes.push(`Observa-se que este indicador teve uma evolução ${t.melhora ? 'positiva' : 'negativa'} (${t.d > 0 ? 'aumento' : 'redução'} do indicador) de ${fmtDelta(d, t.d, P)} no período analisado.`);
      if (!t.est && d.tipo === 'razao') {
        const N0 = r.N[t.i0], N1 = r.N[t.i1], D0 = r.D[t.i0], D1 = r.D[t.i1];
        const sobe = t.d > 0;
        partes.push(`Esse indicador é obtido pela divisão ${de(d.num.rot)} ${por(d.den.rot)}; então, para que haja ${sobe ? 'um aumento' : 'uma redução'} nele, ou ${d.num.rot} ${sobe ? 'aumenta' : 'diminui'}, ou ${d.den.rot} ${sobe ? 'diminui' : 'aumenta'}, ou ambos variam, só que em percentuais diferentes.`);
        const emp = caso.empresa ? `da ${caso.empresa}` : 'da empresa analisada';
        let gN = null, gD = null;
        if (N0 > 0 && D0 > 0) {
          gN = N1 / N0 - 1; gD = D1 / D0 - 1;
          partes.push(`No caso ${emp}, observa-se que ${fraseCaso(d, gN, gD, P)}.`);
        } else {
          partes.push(`No caso ${emp}, ${d.num.rot} passou de ${fmtN(N0, 2)} para ${fmtN(N1, 2)} e ${d.den.rot} de ${fmtN(D0, 2)} para ${fmtN(D1, 2)}.`);
        }
        const lados = [
          { g: gN, e: r.eN, rot: d.num.rot, m: r.mN, S0: N0 },
          { g: gD, e: r.eD, rot: d.den.rot, m: r.mD, S0: D0 }
        ].sort((a, b) => Math.abs(b.g || 0) - Math.abs(a.g || 0));
        for (const l of lados) {
          if (!l.e.length) continue;
          const est = l.g == null ? false : Math.abs(l.g * 100) < P.estGrupo;
          const s = explicar(l.e, l.rot, t.i0, t.i1, l.m, est, l.S0, P);
          if (s) partes.push(s + '.');
        }
      }
      if (!t.est && (d.id === 'ML' || d.id === 'RA' || d.id === 'RPL')) {
        const sDRE = explicarDRE(caso, t.i0, t.i1, t.d > 0, P);
        if (sDRE && d.id === 'ML') partes.push(sDRE);
      }
      if (!t.est && d.tipo === 'soma') {
        partes.push(d.explica);
        const comps = d.parts.map(([id, k]) => {
          const rr = res[id]; const own = arred(rr.d, rr.vals[t.i1], P) - arred(rr.d, rr.vals[t.i0], P);
          return { nome: rr.d.nome, own, c: k * own, k };
        }).sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
        const frase = x => `${x.nome} ${x.own > 0 ? 'aumentou' : 'diminuiu'} ${fmtN(Math.abs(x.own), 0)} dias${x.k < 0 ? `, o que ${x.own > 0 ? 'reduz' : 'aumenta'} o ciclo` : ''}`;
        const p = comps[0];
        const outros = comps.slice(1).filter(x => Math.abs(x.own) >= 0.5);
        partes.push(`A variação veio principalmente ${de(p.nome)}, que ${p.own > 0 ? 'aumentou' : 'diminuiu'} ${fmtN(Math.abs(p.own), 0)} dias${p.k < 0 ? `, o que ${p.own > 0 ? 'reduz' : 'aumenta'} o ciclo` : ''}${outros.length ? `; no mesmo período, ${lista(outros.map(frase))}` : ''}.`);
      }
      if (t.idx.length >= 3) {
        const passos = [];
        for (let k = 1; k < t.idx.length; k++) {
          const a = t.idx[k - 1], b = t.idx[k], dl = arred(d, r.vals[b], P) - arred(d, r.vals[a], P);
          let det = '';
          if (d.tipo === 'razao' && r.N[a] > 0 && r.D[a] > 0) det = ` (${sem(d.num.rot)} ${pctSig(r.N[b] / r.N[a] - 1)}; ${sem(d.den.rot)} ${pctSig(r.D[b] / r.D[a] - 1)})`;
          passos.push({ a, b, dl, det, s: estavelDelta(d, dl, r.vals[a], P) ? 0 : Math.sign(dl) });
        }
        const sinais = new Set(passos.map(p => p.s).filter(x => x));
        if (sinais.size > 1) {
          partes.push(`A trajetória, porém, não foi linear: ${passos.map(p => `${perPar(Lb[p.a], Lb[p.b])}, ${p.s === 0 ? 'ficou praticamente estável' : (p.dl > 0 ? 'subiu ' : 'caiu ') + fmtDelta(d, p.dl, P)}${p.det}`).join('; ')}.`);
        }
      }
    }
    const vLast = r.vals[idx[idx.length - 1]];
    const j = d.julg ? d.julg(vLast, r.vals, t, P) : '';
    if (j) partes.push(j);
    if (d.id === 'LC' && res.LS) {
      const ls = res.LS.vals[idx[idx.length - 1]];
      if (ls != null && vLast > 0 && (vLast - ls) / vLast > 0.3)
        partes.push(`Vale notar que ${fmtN((vLast - ls) / vLast * 100, 0)}% do ativo circulante está em estoques e despesas antecipadas, o que torna essa folga dependente das vendas.`);
    }
    partes.push(d.intr(vLast, P));
    return { paragrafo: partes.join(' '), t };
  }

  // ---------- estrutura (AV / AH / representatividade) ----------
  function estrutura(caso, P) {
    const n = caso.periodos.length, Lb = caso.periodos;
    const soma = sels => serieLado(n, lado(caso, sels), false);
    const AT = soma(['AC.', 'ANC.']), PT = soma(['PC.', 'PNC.', 'PL.']), RL = soma(['DRE.RL']);
    const grupos = [];
    for (const [g, titulo] of GRUPOS_BP) {
      const contas = caso.contas.filter(c => c.cod.split('.')[0] === g);
      if (!contas.length) continue;
      const tot = g === 'DRE' ? null : soma([g + '.']);
      const base = g === 'DRE' ? RL : AT;
      const linha = (nome, v, detalhe) => ({
        nome, v, detalhe,
        av: v.map((x, i) => (x == null || !base[i]) ? null : x / base[i] * 100),
        ah: v.map(x => (x == null || v[0] == null || v[0] === 0) ? null : x / v[0] * 100),
        var: v.map((x, i) => (i === 0 || x == null || v[i - 1] == null || v[i - 1] === 0) ? null : (x / v[i - 1] - 1) * 100)
      });
      const linhas = contas.map(c => linha(c.nome, c.v, !!c.detalhe));
      let rep = '';
      if (g !== 'DRE') {
        const i = n - 1;
        const T = tot[i];
        const cs = contas.filter(c => !c.detalhe && c.v[i] != null && c.v[i] > 0);
        if (T > 0 && cs.length >= 2) {
          const ord = cs.map(c => ({ c, p: c.v[i] / T * 100 })).sort((a, b) => b.p - a.p);
          const sel = []; let acum = 0;
          for (const x of ord) { if (x.p < P.repMin) break; sel.push(x); acum += x.p; if (acum >= P.repAcum) break; }
          const per = perFrase([Lb[i]]);
          const nomeG = titulo.toLowerCase();
          const sig = sel.length ? SIGNIFICADO[sel[0].c.cod] : '';
          if (!sel.length || sel.length > P.repMax) {
            rep = `O ${nomeG} é pulverizado ${per}: nenhuma conta concentra o grupo, e são necessárias mais de ${P.repMax} contas para chegar a ${P.repAcum}% do total.`;
          } else if (sel.length === 1) {
            rep = `A principal conta do ${nomeG} ${per} é ${sel[0].c.nome}, com ${fmtN(sel[0].p, 2)}% do total${sig ? `, o que indica que ${sig}` : ''}.`;
          } else {
            rep = `${cap(em('o ' + nomeG))}, as contas mais representativas ${per} são ${lista(sel.map(x => `${x.c.nome} (${fmtN(x.p, 2)}%)`))}, que somam ${fmtN(acum, 2)}% do grupo.${sig ? ` A maior delas indica que ${sig}.` : ''}`;
          }
        } else if (T > 0 && cs.length === 1) {
          rep = `O ${titulo.toLowerCase()} aparece como uma única conta nos dados, sem detalhamento.`;
        }
      }
      grupos.push({ g, titulo, total: tot ? linha('Total do ' + titulo.toLowerCase(), tot, false) : null, linhas, rep });
    }
    const totais = { AT: { nome: 'Ativo total', v: AT }, PT: { nome: 'Passivo + PL', v: PT } };
    return { grupos, totais };
  }

  // ---------- análise completa ----------
  const GR = [['liq', 'Liquidez'], ['est', 'Estrutura de capital'], ['rent', 'Rentabilidade'], ['ativ', 'Atividade']];

  function analisar(casoIn, Pin) {
    const P = { ...PADRAO, ...(Pin || {}) };
    ['dias', 'decPct', 'estX', 'estPP', 'estDias', 'estGrupo', 'repAcum', 'repMin', 'repMax', 'varAcum', 'varMin', 'atenuante'].forEach(k => { P[k] = Number(P[k]); });
    const n = casoIn.periodos.length;
    const caso = {
      ...casoIn,
      contas: casoIn.contas.map(c => {
        let v = Array.from({ length: n }, (_, i) => num(c.v[i]));
        // custos, despesas e impostos: o sistema trabalha com valor positivo. Dados digitados
        // com sinal negativo (como na DRE publicada) são invertidos; dados que já vêm com
        // "despesa positiva" (rotina da CVM) ficam como estão.
        if (casoIn.sinais !== 'despesa_positiva' && ['DRE.CMV', 'DRE.DOP', 'DRE.IR'].includes(c.cod)) {
          const ok = v.filter(x => x != null && x !== 0);
          if (ok.length && ok.every(x => x < 0)) v = v.map(x => x == null ? x : -x);
        }
        return { ...c, v };
      })
    };
    const D = defs(P);
    const res = {};
    for (const d of D) if (d.tipo === 'razao') res[d.id] = calcRazao(d, caso, P, n);
    for (const d of D) if (d.tipo === 'soma') res[d.id] = calcSoma(d, res, n);
    const indices = D.map(d => {
      const r = res[d.id];
      const tx = texto(r, res, caso, P);
      let calc;
      if (d.tipo === 'razao') {
        const m = r.mult === 1 ? '' : ` × ${r.mult}`;
        calc = r.vals.map((v, i) => v == null ? null : `${fmtN(r.N[i], 2)} ÷ ${fmtN(r.D[i], 2)}${m} = ${fmtVal(d, v, P)}`);
      } else {
        calc = r.vals.map((v, i) => v == null ? null : d.parts.map(([id, k], j) => `${j ? (k > 0 ? ' + ' : ' − ') : ''}${fmtN(res[id].vals[i], 0)}`).join('') + ` = ${fmtN(v, 0)}`);
      }
      const detalhe = d.tipo === 'razao'
        ? r.detalhe.map(x => x && { ...x, rotN: d.num.rot, rotD: d.den.rot, mult: r.mult })
        : r.vals.map((v, i) => v == null ? null : { partes: d.parts.map(([id, k]) => ({ id, nome: res[id].d.nome, v: res[id].vals[i], k })) });
      return {
        id: d.id, grupo: d.grupo, nome: d.nome, formula: d.formula, unid: d.unid, dir: d.dir, detalhe,
        vals: r.vals, fmt: r.vals.map(v => fmtVal(d, v, P)), calc, texto: tx.paragrafo, t: tx.t,
        delta: tx.t ? (tx.t.d > 0 ? '+' : tx.t.d < 0 ? '−' : '') + fmtDelta(d, tx.t.d, P) : ''
      };
    });
    const by = Object.fromEntries(indices.map(i => [i.id, i]));
    const grupos = GR.map(([id, titulo]) => {
      const its = indices.filter(i => i.grupo === id);
      const m = its.filter(i => i.t && i.t.melhora).map(i => i.id);
      const p = its.filter(i => i.t && i.t.piora).map(i => i.id);
      const e = its.filter(i => i.t && i.t.est).map(i => i.id);
      const seg = [];
      if (m.length) seg.push(`${lista(m)} ${m.length > 1 ? 'tiveram' : 'teve'} evolução positiva`);
      if (p.length) seg.push(`${lista(p)} ${p.length > 1 ? 'tiveram' : 'teve'} evolução negativa`);
      if (e.length) seg.push(`${lista(e)} ${e.length > 1 ? 'ficaram praticamente estáveis' : 'ficou praticamente estável'}`);
      const regra = id === 'est' ? ' Todos os índices deste grupo seguem a regra “quanto menor, melhor”.' : '';
      return { id, titulo, ids: its.map(i => i.id), sintese: seg.length ? `No período analisado, ${seg.join('; ')}.${regra}` : 'Não há períodos suficientes para avaliar a evolução deste grupo.' };
    });
    // conclusão integrada
    const last = id => { const v = by[id].vals.filter(x => x != null); return v.length ? v[v.length - 1] : null; };
    const tt = id => by[id].t;
    const RLs = serieLado(n, lado(caso, ['DRE.RL']), false).filter(x => x != null);
    const conc = [];
    if (last('LG') != null && last('LG') < 1 && last('IPL') != null && last('IPL') > 100)
      conc.push('A liquidez geral abaixo de 1 junto com a imobilização do PL acima de 100% indica que a empresa usa capital de terceiros para financiar ativos fixos, comprometendo a capacidade de pagamento de longo prazo.');
    if (tt('PCT') && tt('RPL') && tt('PCT').d > 0 && tt('RPL').d > 0 && last('RPL') > last('RA'))
      conc.push('O aumento do endividamento acompanhado de alta na rentabilidade do PL, que supera a rentabilidade do ativo, sugere alavancagem financeira favorável aos sócios, porém com mais risco.');
    if (tt('CE') && tt('LC') && !tt('CE').est && tt('CE').d > 0 && !tt('LC').est && tt('LC').d < 0)
      conc.push('A dívida migrou para o curto prazo ao mesmo tempo em que a liquidez corrente caiu, o que aumenta a pressão de pagamentos nos próximos meses.');
    if (RLs.length >= 2 && RLs[RLs.length - 1] > RLs[0] && tt('ML') && tt('ML').piora)
      conc.push('As vendas cresceram, mas a margem líquida caiu: custos ou despesas cresceram proporcionalmente mais que a receita, e vale examinar a DRE linha a linha.');
    if (last('LC') != null && last('LC') > 1 && tt('LC') && !tt('LC').piora && tt('RA') && tt('RA').piora)
      conc.push('A boa liquidez convive com queda na rentabilidade do ativo, o que pode indicar recursos ociosos ou mal utilizados.');
    if (last('LS') != null && last('LS') < 1 && last('LC') > 1)
      conc.push('A liquidez corrente acima de 1 com liquidez seca abaixo de 1 mostra que a capacidade de pagamento depende da venda dos estoques.');
    if (tt('CF') && tt('CF').piora)
      conc.push('O ciclo financeiro aumentou, elevando a necessidade de capital de giro; convém verificar se isso foi financiado com empréstimos de curto prazo.');
    if (tt('CF') && tt('CF').melhora && tt('RPL') && tt('RPL').melhora)
      conc.push('A redução do ciclo financeiro acompanhada de melhora na rentabilidade do PL indica gestão mais eficiente do capital de giro.');
    conc.push('Esses resultados devem ser lidos em conjunto e, sempre que possível, comparados com empresas do mesmo setor, pois um índice isolado não explica a situação da empresa.');
    // avisos
    const est = estrutura(caso, P);
    const avisos = [];
    const AT = est.totais.AT.v, PT = est.totais.PT.v;
    caso.periodos.forEach((l, i) => {
      if (AT[i] != null && PT[i] != null && Math.abs(AT[i] - PT[i]) > 1)
        avisos.push(`${l}: o ativo total (${fmtN(AT[i], 2)}) difere do passivo + PL (${fmtN(PT[i], 2)}) em ${fmtN(Math.abs(AT[i] - PT[i]), 2)}.`);
    });
    for (const [cod, nome] of [['DRE.RL', 'receita líquida'], ['DRE.CMV', 'CMV'], ['DRE.LL', 'lucro líquido']])
      if (!caso.contas.some(c => c.cod === cod)) avisos.push(`Falta a conta de ${nome} na DRE; os índices que dependem dela não serão calculados.`);
    return { P, indices, by, grupos, conclusao: conc, estrutura: est, avisos };
  }

  // Monta um caso a partir de um arquivo da base CVM (data/cia/<cd>.json), para um intervalo
  // contínuo de períodos [de, ate] (índices em doc.periodos). O estoque do período anterior,
  // quando existe, vira o estoque inicial (permite calcular o PMPC do primeiro ano).
  function casoDaBase(doc, de, ate) {
    const sel = []; for (let i = de; i <= ate; i++) sel.push(i);
    const contas = doc.contas.map(c => ({ nome: c.nome, cod: c.cod, v: sel.map(i => c.v[i] == null ? null : c.v[i]) }))
      .filter(c => c.v.some(x => x != null && x !== 0));
    let ei = '';
    if (de > 0) {
      const a0 = parseInt(doc.periodos[de].rotulo, 10), a1 = parseInt(doc.periodos[de - 1].rotulo, 10);
      if (a0 - a1 === 1) {
        const est = doc.contas.filter(c => c.cod === 'AC.EST' && c.v[de - 1] != null);
        if (est.length) ei = est.reduce((s, c) => s + c.v[de - 1], 0);
      }
    }
    const ind = sel.filter(i => doc.periodos[i].base === 'ind').map(i => doc.periodos[i].rotulo);
    return {
      preset: 'cvm', cd_cvm: doc.cd_cvm, empresa: doc.empresa, sinais: 'despesa_positiva',
      fonte: doc.fonte + (ind.length ? ` Em ${lista(ind)} a empresa não publicou demonstrações consolidadas; foram usadas as individuais.` : ''),
      periodos: sel.map(i => doc.periodos[i].rotulo),
      extras: { estoqueInicial: ei, compras: [] }, contas,
      dfc: (doc.dfc || []).map(l => ({ cod: l.cod, nome: l.nome, cd: l.cd, v: sel.map(i => l.v[i] == null ? null : l.v[i]) }))
        .filter(l => l.v.some(x => x != null)),
      sel: { de, ate }
    };
  }

  return { analisar, casoDaBase, CODIGOS, GRUPOS_BP, PADRAO, fmtN, fmtVal: (unid, v, P) => fmtVal({ unid }, v, { ...PADRAO, ...(P || {}) }), num };
})();
if (typeof module !== 'undefined') module.exports = Engine;
if (typeof window !== 'undefined') window.Engine = Engine;
