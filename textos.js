/* Textos da análise além do texto do sistema.
   - preencher(): textos escritos à mão (trabalho.js) com os números vindos do motor, por marcadores {{...}}.
     Assim o texto nunca diverge do que o site calcula.
   - estiloGrupo(): gerador automático que escreve no estilo dos textos do grupo, para qualquer empresa.
   Funciona no navegador (window.Textos) e no Node (require). */
(function (raiz, fabrica) {
  const T = fabrica(typeof module === 'object' && module.exports ? require('./engine.js') : raiz.Engine);
  if (typeof module === 'object' && module.exports) module.exports = T; else raiz.Textos = T;
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  const fmtN = E.fmtN, num = E.num;
  const GRUPOS = ['AC', 'ANC', 'PC', 'PNC', 'PL'];

  // R$ a partir de valores na escala do caso (R$ mil na base da CVM)
  function rs(v, caso) {
    if (v == null || !isFinite(v)) return '[?]';
    const a = Math.abs(v) * (caso && caso.escala === 'mil' ? 1000 : 1);
    if (a >= 1e9) { const n = a / 1e9; return `R$ ${fmtN(n, 2)} ${n < 2 ? 'bilhão' : 'bilhões'}`; }
    if (a >= 1e6) { const n = a / 1e6; return `R$ ${fmtN(n, 2)} ${n < 2 ? 'milhão' : 'milhões'}`; }
    return `R$ ${fmtN(a, 2)}${caso && caso.escala === 'mil' ? '' : ''}`;
  }
  const lista = xs => xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1];

  // valor de um código num período (k = posição do período no caso)
  function valor(cod, k, caso, R) {
    const contas = caso.contas;
    const soma = f => { const cs = contas.filter(f).map(c => num(c.v[k])).filter(v => v != null); return cs.length ? cs.reduce((a, b) => a + b, 0) : 0; };
    if (R && R.by && R.by[cod]) return R.by[cod].vals[k];
    if (cod === 'AT') return soma(c => /^(AC|ANC)\./.test(c.cod) && !c.detalhe);
    if (cod === 'CT') return soma(c => /^(PC|PNC)\./.test(c.cod) && !c.detalhe);
    if (GRUPOS.includes(cod)) return soma(c => c.cod.startsWith(cod + '.') && !c.detalhe);
    if (cod === 'RLP') return soma(c => c.cod === 'ANC.RLP' && !c.detalhe);
    if (cod.startsWith('DFC.')) { const l = (caso.dfc || []).find(x => x.cod === cod); return l ? num(l.v[k]) : null; }
    if (cod.startsWith('N[')) { const nome = cod.slice(2, -1); return soma(c => c.nome === nome); }
    return soma(c => c.cod === cod && !c.detalhe);
  }
  // expressão com códigos: "PC.EMP+PNC.EMP", "DRE.CMV/AC.EST", "N[Adiantamento de Clientes]"
  function avaliar(expr, k, caso, R) {
    let falhou = false;
    const js = expr.replace(/N\[[^\]]+\]|[A-Z]{2,5}(\.[A-Z]+)*/g, m => {
      const v = valor(m, k, caso, R);
      if (v == null || !isFinite(v)) { falhou = true; return '0'; }
      return `(${v})`;
    });
    if (falhou || !/^[\d\s+\-*/().e]*$/.test(js)) return null;
    try { const v = Function(`return (${js});`)(); return isFinite(v) ? v : null; } catch (e) { return null; }
  }
  // "2024..2025" soma os períodos (fluxos da DFC); "2025" um período
  function periodos(spec, caso) {
    const P = caso.periodos.map(String);
    if (spec.includes('..')) { const [a, b] = spec.split('..'); const i = P.indexOf(a), j = P.indexOf(b); return i < 0 || j < 0 ? null : Array.from({ length: j - i + 1 }, (_, n) => i + n); }
    const i = P.indexOf(spec); return i < 0 ? null : [i];
  }
  function noPeriodo(expr, spec, caso, R) {
    const ks = periodos(spec, caso); if (!ks) return null;
    let s = 0; for (const k of ks) { const v = avaliar(expr, k, caso, R); if (v == null) return null; s += v; }
    return s;
  }
  const unidade = i => i.unid === 'd' ? ' dias' : '';
  const lerFmt = t => t == null ? null : Number(String(t).replace(/[^\d,\-−]/g, '').replace('−', '-').replace(',', '.'));
  function deltaFmt(i, a, b) { // diferença entre valores exibidos (arredondados), com a unidade do índice
    const x = lerFmt(i.fmt[a]), y = lerFmt(i.fmt[b]); if (x == null || y == null || isNaN(x) || isNaN(y)) return '[?]';
    const casas = i.unid === 'd' ? 0 : 2, d = y - x;
    const s = (d > 0 ? '+' : d < 0 ? '−' : '') + fmtN(Math.abs(d), casas);
    return s + (i.unid === '%' ? ' p.p.' : i.unid === 'd' ? ' dias' : '');
  }

  // {{tipo:expr@periodo}} — veja trabalho.js
  function preencher(tpl, caso, R) {
    if (!tpl) return '';
    const P = caso.periodos.map(String);
    return String(tpl).replace(/\{\{([^}]+)\}\}/g, (m, corpo) => {
      const [tipo, resto] = corpo.includes(':') ? [corpo.slice(0, corpo.indexOf(':')), corpo.slice(corpo.indexOf(':') + 1)] : ['', corpo];
      try {
        if (corpo === 'anos') return lista(P);
        const [expr, per] = resto.split('@');
        const i = R.by[expr];
        if (tipo === 'v') { // série do índice: "1,92; 1,76 e 1,55"
          const xs = i.fmt.map(x => x == null ? 'n/c' : x);
          return xs.slice(0, -1).join('; ') + ' e ' + xs[xs.length - 1] + unidade(i);
        }
        if (tipo === 'i') { const k = P.indexOf(per); return k < 0 || i.fmt[k] == null ? '[?]' : i.fmt[k] + unidade(i); }
        if (tipo === 'd' || tipo === 'da') { // variação do índice: d:LC (período todo) ou d:LC@2024>2025; da = sem sinal
          let r;
          if (!per) r = deltaFmt(i, 0, P.length - 1);
          else { const [a, b] = per.split('>'); r = deltaFmt(i, P.indexOf(a), P.indexOf(b)); }
          return tipo === 'da' ? r.replace(/^[+−]/, '') : r;
        }
        if (tipo === 'drs' || tipo === 'pct' || tipo === 'dpp') {
          const [a, b] = per.split('>');
          const va = noPeriodo(expr, a, caso, R), vb = noPeriodo(expr, b, caso, R);
          if (va == null || vb == null) return '[?]';
          if (tipo === 'drs') return rs(vb - va, caso);
          if (tipo === 'dpp') return fmtN(Math.abs(vb - va) * 100, 2) + ' p.p.';
          return va ? fmtN(Math.abs(vb / va - 1) * 100, 2) + '%' : '[?]';
        }
        const v = noPeriodo(expr, per, caso, R);
        if (v == null) return '[?]';
        if (tipo === 'rs') return rs(v, caso);
        if (tipo === 'pc1') return fmtN(Math.abs(v) * 100, 1) + '%';
        if (tipo === 'pc2') return fmtN(Math.abs(v) * 100, 2) + '%';
        if (tipo === 'n0') return fmtN(Math.abs(v), 0);
        if (tipo === 'n1') return fmtN(Math.abs(v), 1);
        if (tipo === 'n2') return fmtN(Math.abs(v), 2);
        return '[?]';
      } catch (e) { return '[?]'; }
    });
  }

  // ---------- gerador automático no estilo do grupo ----------
  const NOME_LADO = { num: 'numerador', den: 'denominador' };
  function moverConta(det0, det1, lado) {
    const m = new Map();
    for (const [k, d] of [[0, det0], [1, det1]]) for (const c of ((d && d[lado] && d[lado].contas) || [])) {
      const x = m.get(c.nome) || [0, 0]; x[k] += (c.k || 1) * (c.v || 0); m.set(c.nome, x);
    }
    return [...m.entries()].map(([nome, [a, b]]) => ({ nome, a, b, d: b - a }));
  }
  const ROTULO = { // nomes dos lados como o grupo escreve
    LI: ['o disponível', 'o passivo circulante'], LC: ['o ativo circulante', 'o passivo circulante'],
    LS: ['o ativo circulante sem estoques', 'o passivo circulante'], LG: ['o ativo circulante somado ao realizável a longo prazo', 'o passivo total (circulante e não circulante)'],
    PCT: ['o capital de terceiros', 'o patrimônio líquido'], CE: ['o passivo circulante', 'o capital de terceiros'],
    IPL: ['o ativo não circulante (sem o realizável a longo prazo)', 'o patrimônio líquido'], IRNC: ['o ativo não circulante (sem o realizável a longo prazo)', 'o patrimônio líquido somado ao passivo não circulante'],
    GA: ['a receita líquida', 'o ativo total'], ML: ['o lucro líquido', 'a receita líquida'], RA: ['o lucro líquido', 'o ativo total'], RPL: ['o lucro líquido', 'o patrimônio líquido'],
    PMRE: ['o estoque', 'o custo das mercadorias vendidas'], PMRV: ['o saldo de clientes', 'a receita líquida'], PMPC: ['o saldo de fornecedores', 'as compras']
  };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function estiloGrupo(i, R, caso) {
    const P = caso.periodos.map(String), n = P.length;
    const nome = i.nome.replace(/^(o|a) /, '').replace(/^índice de /, '');
    if (!i.vals.some(v => v != null)) return `Não foi possível calcular ${i.nome} com os dados informados.`;
    let s = `De acordo com os dados calculados de ${nome} (${i.formula}), respectivamente ${preencher(`{{v:${i.id}}}`, caso, R)}`;
    const k0 = i.vals.findIndex(v => v != null), k1 = n - 1 - [...i.vals].reverse().findIndex(v => v != null);
    if (k1 <= k0) return s + '.';
    const t = i.t || {};
    s += t.est ? ', o indicador manteve-se praticamente estável no período' : `, houve ${i.vals[k1] > i.vals[k0] ? 'aumento' : 'redução'} do indicador de ${P[k0]} para ${P[k1]} (${deltaFmt(i, k0, k1)}), o que representa ${t.melhora ? 'uma melhora' : 'uma piora'}`;
    s += '.';
    const det0 = i.detalhe[k0], det1 = i.detalhe[k1], rot = ROTULO[i.id];
    if (rot && det0 && det1 && det0.N != null && det1.N != null) {
      const vN = det0.N ? det1.N / det0.N - 1 : null, vD = det0.D ? det1.D / det0.D - 1 : null;
      const pct = v => fmtN(Math.abs(v) * 100, 2) + '%';
      const verbo = v => v >= 0 ? 'aumentou' : 'diminuiu';
      if (vN != null && vD != null) {
        if (Math.sign(vN) === Math.sign(vD)) {
          const maior = Math.abs(vD) > Math.abs(vN) ? 1 : 0;
          s += ` ${cap(rot[0])} e ${rot[1]} ${vN >= 0 ? 'aumentaram' : 'diminuíram'} de ${P[k0]} a ${P[k1]}, porém ${rot[maior]} ${vN >= 0 ? 'aumentou' : 'diminuiu'} proporcionalmente mais (${pct(maior ? vD : vN)}, contra ${pct(maior ? vN : vD)}).`;
        } else s += ` De ${P[k0]} a ${P[k1]}, ${rot[0]} ${verbo(vN)} ${pct(vN)}, enquanto ${rot[1]} ${verbo(vD)} ${pct(vD)}.`;
        // contas que mais se moveram no lado que puxou o índice
        const lado = Math.abs(vD) > Math.abs(vN) ? 'den' : 'num';
        const dirLado = (lado === 'den' ? vD : vN) >= 0 ? 1 : -1;
        const movs = moverConta(det0, det1, lado).filter(c => Math.sign(c.d) === dirLado && Math.abs(c.d) > 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
        if (movs.length && moverConta(det0, det1, lado).length > 1) {
          s += ` No ${NOME_LADO[lado]}, destacam-se ${movs.length > 1 ? 'as contas' : 'a conta'} ${lista(movs.map(c => `${c.nome} (${c.d >= 0 ? '+' : '−'}${rs(c.d, caso)}${c.a === 0 ? ', conta que não existia em ' + P[k0] : ''})`))}.`;
        }
      }
    }
    // leitura do índice: última frase do texto do sistema ("Para cada R$ 1,00...")
    const frases = String(i.texto || '').split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/);
    const ultima = frases[frases.length - 1];
    if (ultima && /^(Para cada|Em média|Da compra|A empresa precisa|\d)/.test(ultima)) s += ` Ou seja: ${ultima[0].toLowerCase() + ultima.slice(1)}`;
    return s;
  }

  return { preencher, estiloGrupo, rs, valor, avaliar };
});
