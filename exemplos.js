/* Gabarito da Profa. Isabel (Cia Grega), usado na aba Teste. */
window.EXEMPLOS = {
  'cia-grega': {
  preset: 'cia-grega', empresa: 'Cia Grega',
  fonte: 'Exemplo de análise de indicadores (Martins et al., 2014), material da Profa. Isabel Gozer. O exemplo traz os totais por grupo; as contas aparecem detalhadas só onde o material informa.',
  periodos: ['Ano 1', 'Ano 2', 'Ano 3'], extras: { estoqueInicial: '', compras: [] },
  contas: [
    { nome: 'Disponível (caixa, equivalentes e aplicações)', cod: 'AC.DISP', v: [303, 436, 588] },
    { nome: 'Clientes', cod: 'AC.CLI', v: [1445, 1603, 1624] },
    { nome: 'Estoques', cod: 'AC.EST', v: [692, 544, 713] },
    { nome: 'Despesas antecipadas', cod: 'AC.DESPANT', v: [3, 7, 6] },
    { nome: 'Outros ativos circulantes (não detalhado)', cod: 'AC.OUT', v: [953, 1025, 1410] },
    { nome: 'Realizável a longo prazo', cod: 'ANC.RLP', v: [187, 210, 226] },
    { nome: 'Investimentos, imobilizado e intangível (não detalhado)', cod: 'ANC.IMOB', v: [1591, 1501, 1490] },
    { nome: 'Passivo circulante (não detalhado)', cod: 'PC.OUT', v: [1026, 1260, 1522] },
    { nome: 'Fornecedores (já incluído no passivo circulante)', cod: 'PC.FORN', v: [null, 320, 372], detalhe: true },
    { nome: 'Passivo não circulante (não detalhado)', cod: 'PNC.OUT', v: [1349, 945, 853] },
    { nome: 'Patrimônio líquido (não detalhado)', cod: 'PL.OUT', v: [2799, 3121, 3682] },
    { nome: 'Receita líquida', cod: 'DRE.RL', v: [3092, 5202, 6044] },
    { nome: 'CMV', cod: 'DRE.CMV', v: [1846, 3214, 3664] },
    { nome: 'Lucro líquido', cod: 'DRE.LL', v: [407, 601, 753] }
  ]
}
};
