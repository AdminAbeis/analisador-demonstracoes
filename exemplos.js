/* Casos de exemplo: o gabarito da Profa. Isabel (Cia Grega) e a WEG digitada a partir dos PDFs. */
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
},
  'weg': {
 "preset": "weg",
 "empresa": "WEG S.A.",
 "fonte": "WEG S.A., Demonstrações Financeiras consolidadas de 2024 e 2025 (PDF), valores em R$ mil, digitados conta a conta. Custos e despesas em valor positivo.",
 "periodos": [
  "2023",
  "2024",
  "2025"
 ],
 "extras": {
  "estoqueInicial": "",
  "compras": []
 },
 "contas": [
  {
   "nome": "Caixa e equivalentes de caixa",
   "cod": "AC.DISP",
   "v": [
    6488454,
    7347599,
    6296498
   ]
  },
  {
   "nome": "Aplicações financeiras",
   "cod": "AC.APLIC",
   "v": [
    592770,
    648477,
    983367
   ]
  },
  {
   "nome": "Instrumentos financeiros derivativos",
   "cod": "AC.OUT",
   "v": [
    22423,
    210749,
    25146
   ]
  },
  {
   "nome": "Clientes",
   "cod": "AC.CLI",
   "v": [
    6070556,
    7394411,
    7837018
   ]
  },
  {
   "nome": "Estoques",
   "cod": "AC.EST",
   "v": [
    7116286,
    9903951,
    9911053
   ]
  },
  {
   "nome": "Tributos a recuperar",
   "cod": "AC.OUT",
   "v": [
    420284,
    685536,
    762068
   ]
  },
  {
   "nome": "IR/CS a recuperar",
   "cod": "AC.OUT",
   "v": [
    120818,
    131878,
    221894
   ]
  },
  {
   "nome": "Outros ativos circulantes",
   "cod": "AC.OUT",
   "v": [
    730720,
    898758,
    873801
   ]
  },
  {
   "nome": "Aplicações financeiras (LP)",
   "cod": "ANC.RLP",
   "v": [
    10703,
    17134,
    14263
   ]
  },
  {
   "nome": "Instrumentos financeiros derivativos (LP)",
   "cod": "ANC.RLP",
   "v": [
    605,
    6166,
    0
   ]
  },
  {
   "nome": "Depósitos judiciais",
   "cod": "ANC.RLP",
   "v": [
    74620,
    58279,
    58623
   ]
  },
  {
   "nome": "Tributos diferidos",
   "cod": "ANC.RLP",
   "v": [
    864394,
    1141821,
    981841
   ]
  },
  {
   "nome": "Tributos a recuperar (LP)",
   "cod": "ANC.RLP",
   "v": [
    74010,
    115193,
    167197
   ]
  },
  {
   "nome": "IR/CS a recuperar (LP)",
   "cod": "ANC.RLP",
   "v": [
    12733,
    8394,
    1552
   ]
  },
  {
   "nome": "Outros ativos não circulantes",
   "cod": "ANC.RLP",
   "v": [
    53332,
    95233,
    146892
   ]
  },
  {
   "nome": "Investimentos",
   "cod": "ANC.INV",
   "v": [
    77481,
    71808,
    67026
   ]
  },
  {
   "nome": "Imobilizado",
   "cod": "ANC.IMOB",
   "v": [
    6707545,
    9035224,
    10625487
   ]
  },
  {
   "nome": "Direito de uso em arrendamento",
   "cod": "ANC.IMOB",
   "v": [
    587291,
    898435,
    886315
   ]
  },
  {
   "nome": "Intangível",
   "cod": "ANC.INT",
   "v": [
    1471245,
    2820655,
    2784989
   ]
  },
  {
   "nome": "Fornecedores",
   "cod": "PC.FORN",
   "v": [
    2190088,
    3778116,
    2789346
   ]
  },
  {
   "nome": "Empréstimos e financiamentos",
   "cod": "PC.EMP",
   "v": [
    2170324,
    2850956,
    3549314
   ]
  },
  {
   "nome": "Instrumentos financeiros derivativos",
   "cod": "PC.OUT",
   "v": [
    73082,
    26237,
    75075
   ]
  },
  {
   "nome": "Obrigações sociais e tributárias",
   "cod": "PC.OUT",
   "v": [
    760609,
    1053539,
    1170206
   ]
  },
  {
   "nome": "IR e CS a pagar",
   "cod": "PC.OUT",
   "v": [
    238202,
    474494,
    321188
   ]
  },
  {
   "nome": "Dividendos e JCP a pagar",
   "cod": "PC.OUT",
   "v": [
    482903,
    561679,
    1759319
   ]
  },
  {
   "nome": "Adiantamento de clientes",
   "cod": "PC.OUT",
   "v": [
    3238834,
    4040292,
    4693390
   ]
  },
  {
   "nome": "Participação nos lucros",
   "cod": "PC.OUT",
   "v": [
    563436,
    569328,
    621573
   ]
  },
  {
   "nome": "Arrendamentos",
   "cod": "PC.OUT",
   "v": [
    72872,
    107668,
    221934
   ]
  },
  {
   "nome": "Faturamento para entrega futura",
   "cod": "PC.OUT",
   "v": [
    120043,
    77589,
    200215
   ]
  },
  {
   "nome": "Provisão para garantia de produtos",
   "cod": "PC.OUT",
   "v": [
    427072,
    579009,
    578055
   ]
  },
  {
   "nome": "Outros passivos circulantes",
   "cod": "PC.OUT",
   "v": [
    882224,
    1335358,
    1406786
   ]
  },
  {
   "nome": "Empréstimos e financiamentos (LP)",
   "cod": "PNC.EMP",
   "v": [
    664737,
    744281,
    1041508
   ]
  },
  {
   "nome": "Instrumentos financeiros derivativos (LP)",
   "cod": "PNC.OUT",
   "v": [
    91863,
    0,
    1367
   ]
  },
  {
   "nome": "Arrendamentos (LP)",
   "cod": "PNC.OUT",
   "v": [
    484027,
    715450,
    625219
   ]
  },
  {
   "nome": "Provisão para contingências",
   "cod": "PNC.OUT",
   "v": [
    874634,
    783034,
    812188
   ]
  },
  {
   "nome": "Tributos diferidos (passivo)",
   "cod": "PNC.OUT",
   "v": [
    87056,
    170520,
    220971
   ]
  },
  {
   "nome": "Obrigações tributárias",
   "cod": "PNC.OUT",
   "v": [
    13650,
    23647,
    33314
   ]
  },
  {
   "nome": "Dividendos a pagar (LP)",
   "cod": "PNC.OUT",
   "v": [
    0,
    0,
    3464232
   ]
  },
  {
   "nome": "Outros passivos não circulantes",
   "cod": "PNC.OUT",
   "v": [
    205838,
    473287,
    506466
   ]
  },
  {
   "nome": "Capital social",
   "cod": "PL.CAP",
   "v": [
    6504517,
    7504517,
    12504517
   ]
  },
  {
   "nome": "Reservas de capital",
   "cod": "PL.OUT",
   "v": [
    -89606,
    -121178,
    -145575
   ]
  },
  {
   "nome": "Plano de opções de ações",
   "cod": "PL.OUT",
   "v": [
    17831,
    17458,
    20215
   ]
  },
  {
   "nome": "Ações em tesouraria",
   "cod": "PL.OUT",
   "v": [
    -55983,
    -47840,
    -43579
   ]
  },
  {
   "nome": "Reservas de lucros",
   "cod": "PL.RES",
   "v": [
    8329343,
    10196349,
    2575748
   ]
  },
  {
   "nome": "Ajuste de avaliação patrimonial",
   "cod": "PL.OUT",
   "v": [
    289441,
    277498,
    267222
   ]
  },
  {
   "nome": "Outros resultados abrangentes",
   "cod": "PL.OUT",
   "v": [
    1096602,
    3107626,
    2238637
   ]
  },
  {
   "nome": "Dividendos adicionais propostos",
   "cod": "PL.OUT",
   "v": [
    1249940,
    1269791,
    0
   ]
  },
  {
   "nome": "Acionistas não controladores",
   "cod": "PL.OUT",
   "v": [
    512691,
    920996,
    1136179
   ]
  },
  {
   "nome": "Receita líquida",
   "cod": "DRE.RL",
   "v": [
    32503601,
    37986941,
    40804110
   ]
  },
  {
   "nome": "Custo dos produtos e serviços vendidos",
   "cod": "DRE.CMV",
   "v": [
    21702737,
    25173096,
    27122477
   ]
  },
  {
   "nome": "Lucro bruto",
   "cod": "DRE.LB",
   "v": [
    10800864,
    12813845,
    13681633
   ]
  },
  {
   "nome": "Despesas com vendas",
   "cod": "DRE.DOP",
   "v": [
    2426459,
    2987307,
    3353431
   ]
  },
  {
   "nome": "Despesas administrativas",
   "cod": "DRE.DOP",
   "v": [
    1044888,
    1299421,
    1513882
   ]
  },
  {
   "nome": "Outros resultados operacionais",
   "cod": "DRE.DOP",
   "v": [
    867505,
    831391,
    803963
   ]
  },
  {
   "nome": "Lucro antes do resultado financeiro e impostos",
   "cod": "DRE.RO",
   "v": [
    6462125,
    7690528,
    7998741
   ]
  },
  {
   "nome": "Resultado financeiro",
   "cod": "DRE.RFIN",
   "v": [
    128672,
    217980,
    148936
   ]
  },
  {
   "nome": "Lucro antes dos impostos",
   "cod": "DRE.OUT",
   "v": [
    6590797,
    7908508,
    8147677
   ]
  },
  {
   "nome": "Impostos sobre o lucro",
   "cod": "DRE.IR",
   "v": [
    723182,
    1589745,
    1371719
   ]
  },
  {
   "nome": "Lucro líquido do exercício",
   "cod": "DRE.LL",
   "v": [
    5867615,
    6318763,
    6775958
   ]
  }
 ]
}
};
