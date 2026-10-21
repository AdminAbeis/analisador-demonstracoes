#!/usr/bin/env python3
"""
Teste da rotina da CVM sem internet: monta ZIPs no mesmo layout dos arquivos da
CVM (separador ';', codificação ISO-8859-1, colunas oficiais) e confere a saída.

Empresas do teste:
  5410  WEG S.A.: valores reais das DFPs 2024 e 2025 (R$ mil), contas agrupadas
        nos códigos fixos da CVM; 2023 só existe como PENÚLTIMO da DFP 2024
  90001 empresa fictícia em UNIDADE, com reapresentação (versão 2) e uma conta
        faltando, para testar escala, versão e a linha de diferença
  90002 banco fictício (layout de instituição financeira)

Uso: python pipeline/test_cvm.py   (gera também tests/fixtures/cvm/ para os testes JS)
"""
import csv
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

COLS_BP = ["CNPJ_CIA", "DT_REFER", "VERSAO", "DENOM_CIA", "CD_CVM", "GRUPO_DFP", "MOEDA", "ESCALA_MOEDA",
           "ORDEM_EXERC", "DT_FIM_EXERC", "CD_CONTA", "DS_CONTA", "VL_CONTA", "ST_CONTA_FIXA"]
COLS_DRE = COLS_BP[:9] + ["DT_INI_EXERC"] + COLS_BP[9:]

# WEG por ano (R$ mil), contas no padrão da CVM. Detalhe conferido com as telas do RAD (DFP 2025)
# e com os PDFs das DFPs 2024 e 2025. None = valor não disponível nas fontes (fica em branco).
FOLHAS_WEG = {  # código: (descrição, [2023, 2024, 2025])
    "1.01.01.01": ("Caixa e Bancos", [None, 1900225, 2040959]),
    "1.01.01.02": ("Aplicações Financeiras", [None, 5447374, 4255539]),
    "1.01.02": ("Aplicações Financeiras", [592770, 648477, 983367]),
    "1.01.03.01": ("Clientes", [6070556, 7394411, 7837018]),
    "1.01.04": ("Estoques", [7116286, 9903951, 9911053]),
    "1.01.06.01.01": ("Imposto de Renda/Contribuição Social a Recuperar", [120818, 131878, 221894]),
    "1.01.06.01.02": ("Outros Tributos a Recuperar", [420284, 685536, 762068]),
    "1.01.08.03.01": ("Instrumentos Financeiros Derivativos", [22423, 210749, 25146]),
    "1.01.08.03.02": ("Outros", [730720, 898758, 873801]),
    "1.02.01.01": ("Aplicações Financeiras Avaliadas a Valor Justo através do Resultado", [10703, 17134, 14263]),
    "1.02.01.07.01": ("Imposto de Renda e Contribuição Social Diferidos", [864394, 1141821, 981841]),
    "1.02.01.10.03": ("Depósitos Judiciais", [74620, 58279, 58623]),
    "1.02.01.10.04": ("Imposto de Renda/Contribuição Social a Recuperar", [12733, 8394, 1552]),
    "1.02.01.10.05": ("Outros Tributos a Recuperar", [74010, 115193, 167197]),
    "1.02.01.10.06": ("Instrumentos Financeiros Derivativos", [605, 6166, 0]),
    "1.02.01.10.07": ("Outros", [53332, 95233, 146892]),
    "1.02.02.01": ("Participações Societárias", [77481, 71808, 67026]),
    "1.02.03.01": ("Imobilizado em Operação", [6707545, 9035224, 10625487]),
    "1.02.03.02": ("Direito de Uso em Arrendamento", [587291, 898435, 886315]),
    "1.02.04": ("Intangível", [1471245, 2820655, 2784989]),
    "2.01.01.01": ("Obrigações Sociais", [515538, 728469, 820283]),
    "2.01.02": ("Fornecedores", [2190088, 3778116, 2789346]),
    "2.01.03.01.01": ("Imposto de Renda e Contribuição Social a Pagar", [238202, 474494, 321188]),
    "2.01.03.01.02": ("Outros", [245071, 325070, 349923]),
    "2.01.04.01.01": ("Em Moeda Nacional", [158814, 6089, 1475622]),
    "2.01.04.01.02": ("Em Moeda Estrangeira", [2011510, 2844867, 2073692]),
    "2.01.05.02.01": ("Dividendos e JCP a Pagar", [482903, 561679, 1759319]),
    "2.01.05.02.04": ("Adiantamento de Clientes", [3238834, 4040292, 4693390]),
    "2.01.05.02.05": ("Participação nos Lucros", [563436, 569328, 621573]),
    "2.01.05.02.06": ("Instrumentos Financeiros Derivativos", [73082, 26237, 75075]),
    "2.01.05.02.07": ("Arrendamentos", [72872, 107668, 221934]),
    "2.01.05.02.08": ("Provisão para garantias de produtos", [427072, 579009, 578055]),
    "2.01.05.02.09": ("Faturamento para entrega futura", [120043, 77589, 200215]),
    "2.01.05.02.10": ("Outros", [882224, 1335358, 1406786]),
    "2.02.01.01": ("Empréstimos e Financiamentos", [664737, 744281, 1041508]),
    "2.02.02.02.01": ("Instrumentos Financeiros Derivativos", [91863, 0, 1367]),
    "2.02.02.02.02": ("Arrendamentos", [484027, 715450, 625219]),
    "2.02.02.02.03": ("Obrigações Tributárias", [13650, 23647, 33314]),
    "2.02.02.02.04": ("Dividendos a Pagar", [0, 0, 3464232]),
    "2.02.02.02.05": ("Outros", [205838, 473287, 506466]),
    "2.02.03.01": ("Imposto de Renda e Contribuição Social Diferidos", [87056, 170520, 220971]),
    "2.02.04.01": ("Provisões Fiscais Previdenciárias Trabalhistas e Cíveis", [874634, 783034, 812188]),
    "2.03.01": ("Capital Social Realizado", [6504517, 7504517, 12504517]),
    "2.03.02.04": ("Opções Outorgadas", [17831, 17458, 20215]),
    "2.03.02.05": ("Ações em Tesouraria", [-55983, -47840, -43579]),
    "2.03.02.07": ("Outras Reservas de Capital", [-89606, -121178, -145575]),
    "2.03.04": ("Reservas de Lucros", [8329343 + 1249940, 10196349 + 1269791, 2575748]),
    "2.03.06": ("Ajustes de Avaliação Patrimonial", [289441, 277498, 267222]),
    "2.03.08": ("Outros Resultados Abrangentes", [1096602, 3107626, 2238637]),
    "2.03.09": ("Participação dos Acionistas Não Controladores", [512691, 920996, 1136179]),
    # DRE (telas do RAD)
    "3.01": ("Receita de Venda de Bens e/ou Serviços", [32503601, 37986941, 40804110]),
    "3.02": ("Custo dos Bens e/ou Serviços Vendidos", [-21702737, -25173096, -27122477]),
    "3.04.01.01": ("(Provisão) reversão ao valor recuperável de clientes", [-17939, -22896, -74335]),
    "3.04.01.02": ("Outras Despesas de Vendas", [-2408520, -2964411, -3279096]),
    "3.04.02.01": ("Honorários dos Administradores", [-21368, -21646, -21427]),
    "3.04.02.02": ("Outras", [-1023520, -1277775, -1492455]),
    "3.04.04": ("Outras Receitas Operacionais", [155466, 163792, 222777]),
    "3.04.05": ("Outras Despesas Operacionais", [-1022971, -995183, -1026740]),
    "3.04.06": ("Resultado de Equivalência Patrimonial", [113, -5198, -11616]),
    "3.06.01": ("Receitas Financeiras", [1553649, 1942118, 2322314]),
    "3.06.02": ("Despesas Financeiras", [-1424977, -1724138, -2173378]),
    "3.08.01": ("Corrente", [-1127937, -1611654, -1270231]),
    "3.08.02": ("Diferido", [404755, 21909, -101488]),
    "3.11.01": ("Atribuído a Sócios da Empresa Controladora", [5731670, 6042593, 6376219]),
    "3.11.02": ("Atribuído a Sócios Não Controladores", [135945, 276170, 399739]),
    # DFC, método indireto (PDFs das DFPs 2024 e 2025)
    "6.01.01.01": ("Lucro antes dos impostos", [6590797, 7908508, 8147677]),
    "6.01.01.02": ("Depreciação, amortização e exaustão", [628042, 812485, 1001296]),
    "6.01.01.03": ("Despesas com plano de opções de compra de ações", [10908, 25618, 14641]),
    "6.01.01.04": ("Equivalência patrimonial", [-113, 5198, 11616]),
    "6.01.01.05": ("Provisão para risco de crédito", [17939, 22896, 74336]),
    "6.01.01.06": ("Provisão de passivos tributários, cíveis e trabalhistas", [154489, -101022, 29565]),
    "6.01.01.07": ("Provisão para perdas nos estoques", [41357, 31194, 41168]),
    "6.01.01.08": ("Provisão com garantia de produtos", [87732, 114027, 28667]),
    "6.01.01.09": ("Baixa de ativos não circulantes", [20964, 51602, 150310]),
    "6.01.01.10": ("Juros provisionados de empréstimos e financiamentos", [150062, 166727, 179358]),
    "6.01.01.11": ("Provisão/Liquidação Instrumentos Financeiros Derivativos", [17889, -128709, 211533]),
    "6.01.01.12": ("Rendimento s/ aplicações financeiras", [-64950, -58971, -263533]),
    "6.01.01.13": ("Participação no resultado - colaboradores", [737547, 712757, 786135]),
    "6.01.01.14": ("Crédito tributário - Exclusão do ICMS na B.C. do PIS/COFINS", [-28933, 0, 0]),
    "6.01.02.01": ("(Aumento)/redução nos clientes", [-689737, -123083, -767226]),
    "6.01.02.02": ("(Aumento)/redução nos estoques", [142764, -997309, -355541]),
    "6.01.02.03": ("(Aumento)/redução nos impostos a recuperar", [246397, -38716, 31533]),
    "6.01.02.04": ("Aumento/(redução) nos fornecedores", [194660, 944618, -909901]),
    "6.01.02.05": ("Aumento/(redução) nas obrigações sociais/tributárias", [-162284, -227047, -375592]),
    "6.01.02.06": ("Aumento/(redução) nos adiantamentos de clientes", [456271, 422836, 801256]),
    "6.01.02.07": ("Aumento/(redução) nas outras contas a receber/pagar", [325871, -129912, -103709]),
    "6.01.02.08": ("Imposto de renda e contribuição social pagos", [-1159725, -1375362, -1423537]),
    "6.01.02.09": ("Pagamento da participação no resultado - colaboradores", [-568469, -625765, -681934]),
    "6.01.02.10": ("Juros pagos sobre empréstimos e financiamentos", [-127655, -160301, -177085]),
    "6.02.01": ("Aquisição de imobilizado", [-1586001, -1780663, -2563450]),
    "6.02.02": ("Aquisição de intangível", [-72624, -69659, -127871]),
    "6.02.03": ("Aquisição de empresa - combinação de negócio (líquido de caixa)", [-7414, -2263748, -200575]),
    "6.02.04": ("Aquisição de participação societária - coligadas", [-71584, 0, 0]),
    "6.02.05": ("Aplicações financeiras", [0, -1821, -75379]),
    "6.02.06": ("Resgate de aplicações financeiras", [5590, 3264, 6682]),
    "6.02.07": ("Recebimento na venda de ativo imobilizado e intangível", [17827, 17998, 49783]),
    "6.03.01": ("Empréstimos e financiamentos obtidos", [2916805, 4331232, 6248313]),
    "6.03.02": ("Pagamento de empréstimos e financiamentos", [-3534389, -4168962, -5230662]),
    "6.03.03": ("Aquisição de ações em tesouraria", [-40396, 0, 0]),
    "6.03.04": ("Liquidação de ações em tesouraria", [3149, 8143, 4261]),
    "6.03.05": ("Pagamento de dividendos/juros sobre capital próprio", [-2308620, -2934611, -5384769]),
    "6.04": ("Variação Cambial s/ Caixa e Equivalentes", [-306714, 465703, -228467]),
    "6.05.01": ("Saldo Inicial de Caixa e Equivalentes", [4451002, 6488454, 7347599]),
}
# contas-mãe (o valor é a soma das filhas; quando o detalhe não existe num ano, usa o total conhecido)
MAES_WEG = {
    "1": "Ativo Total", "1.01": "Ativo Circulante", "1.01.01": "Caixa e Equivalentes de Caixa",
    "1.01.03": "Contas a Receber", "1.01.06": "Tributos a Recuperar", "1.01.06.01": "Tributos Correntes a Recuperar",
    "1.01.08": "Outros Ativos Circulantes", "1.01.08.03": "Outros", "1.02": "Ativo Não Circulante",
    "1.02.01": "Ativo Realizável a Longo Prazo", "1.02.01.07": "Tributos Diferidos", "1.02.01.10": "Outros Ativos Não Circulantes",
    "1.02.02": "Investimentos", "1.02.03": "Imobilizado",
    "2": "Passivo Total", "2.01": "Passivo Circulante", "2.01.01": "Obrigações Sociais e Trabalhistas",
    "2.01.03": "Obrigações Fiscais", "2.01.03.01": "Obrigações Fiscais Federais", "2.01.04": "Empréstimos e Financiamentos",
    "2.01.04.01": "Empréstimos e Financiamentos", "2.01.05": "Outras Obrigações", "2.01.05.02": "Outros",
    "2.02": "Passivo Não Circulante", "2.02.01": "Empréstimos e Financiamentos", "2.02.02": "Outras Obrigações",
    "2.02.02.02": "Outros", "2.02.03": "Tributos Diferidos", "2.02.04": "Provisões",
    "2.03": "Patrimônio Líquido Consolidado", "2.03.02": "Reservas de Capital",
    "3.03": "Resultado Bruto", "3.04": "Despesas/Receitas Operacionais", "3.04.01": "Despesas com Vendas",
    "3.04.02": "Despesas Gerais e Administrativas", "3.05": "Resultado Antes do Resultado Financeiro e dos Tributos",
    "3.06": "Resultado Financeiro", "3.07": "Resultado Antes dos Tributos sobre o Lucro",
    "3.08": "Imposto de Renda e Contribuição Social sobre o Lucro", "3.09": "Resultado Líquido das Operações Continuadas",
    "3.11": "Lucro/Prejuízo Consolidado do Período",
    "6.01": "Caixa Líquido Atividades Operacionais", "6.01.01": "Caixa Gerado nas Operações",
    "6.01.02": "Variações nos Ativos e Passivos", "6.02": "Caixa Líquido Atividades de Investimento",
    "6.03": "Caixa Líquido Atividades de Financiamento", "6.05": "Aumento (Redução) de Caixa e Equivalentes",
    "6.05.02": "Saldo Final de Caixa e Equivalentes",
}
TOTAIS_CONHECIDOS = {  # valores publicados, usados para conferir as somas e preencher totais sem detalhe
    "1.01.01": [6488454, 7347599, 6296498], "1": [31496270, 41489701, 42645030], "2": [31496270, 41489701, 42645030],
    "1.01": [21562311, 27221359, 26910845], "2.01": [11219689, 15454265, 17386401], "2.02": [2421805, 2910219, 6705265],
    "2.03": [17854776, 23125217, 18553364], "3.03": [10800864, 12813845, 13681633], "3.04": [-4338739, -5123317, -5682892],
    "3.05": [6462125, 7690528, 7998741], "3.07": [6590797, 7908508, 8147677], "3.11": [5867615, 6318763, 6775958],
    "6.01.01": [8363730, 9562310, 10412769], "6.01": [7021823, 7252269, 6451033], "6.02": [-1714206, -4094629, -2910810],
    "6.03": [-2963451, -2764198, -4362857], "6.05": [2037452, 859145, -1051101], "6.05.02": [6488454, 7347599, 6296498],
}


def weg():
    A = {k: (ds, list(v)) for k, (ds, v) in FOLHAS_WEG.items()}
    filhos_diretos = lambda pai, chaves: [c for c in chaves if c.startswith(pai + ".") and c.count(".") == pai.count(".") + 1]
    # calcula as mães do nível mais profundo para o mais raso
    for mae in sorted(MAES_WEG, key=lambda c: -c.count(".")):
        if mae in ("3.03", "3.05", "3.07", "3.09", "3.11", "6.05", "6.05.02"):
            continue
        fs = filhos_diretos(mae, A)
        vals = []
        for i in range(3):
            if fs and all(A[f][1][i] is not None for f in fs):
                vals.append(sum(A[f][1][i] for f in fs))
            else:
                vals.append(TOTAIS_CONHECIDOS[mae][i])
        A[mae] = (MAES_WEG[mae], vals)
    soma = lambda *cs: [sum(A[c][1][i] for c in cs) for i in range(3)]
    A["3.03"] = (MAES_WEG["3.03"], soma("3.01", "3.02"))
    A["3.05"] = (MAES_WEG["3.05"], soma("3.03", "3.04"))
    A["3.07"] = (MAES_WEG["3.07"], soma("3.05", "3.06"))
    A["3.09"] = (MAES_WEG["3.09"], soma("3.07", "3.08"))
    A["3.11"] = (MAES_WEG["3.11"], soma("3.11.01", "3.11.02"))
    A["6.05"] = (MAES_WEG["6.05"], soma("6.01", "6.02", "6.03", "6.04"))
    A["6.05.02"] = (MAES_WEG["6.05.02"], soma("6.05.01", "6.05"))
    for cod, esperado in TOTAIS_CONHECIDOS.items():
        assert A[cod][1] == esperado, f"WEG {cod}: {A[cod][1]} != {esperado}"
    assert A["3.09"][1] == A["3.11"][1]
    return A


def linhas_empresa(cd, cnpj, nome, contas, anos_doc, base="con", escala="MIL", versao=1, faltando=()):
    """anos_doc: ano da DFP; gera ÚLTIMO (ano) e PENÚLTIMO (ano-1). contas: {cd: (ds, {ano: v})}"""
    out = {"BPA": [], "BPP": [], "DRE": [], "DFC_MI": []}
    for ano in anos_doc:
        for ordem, a in (("ÚLTIMO", ano), ("PENÚLTIMO", ano - 1)):
            for cd_conta, (ds, por_ano) in sorted(contas.items()):
                if por_ano.get(a) is None or (a, cd_conta) in faltando:
                    continue
                demo = {"1": "BPA", "2": "BPP", "3": "DRE", "6": "DFC_MI"}[cd_conta[0]]
                row = {
                    "CNPJ_CIA": cnpj, "DT_REFER": f"{ano}-12-31", "VERSAO": str(versao), "DENOM_CIA": nome,
                    "CD_CVM": str(cd).zfill(6), "GRUPO_DFP": f"DF {'Consolidado' if base == 'con' else 'Individual'} - {demo}",
                    "MOEDA": "REAL", "ESCALA_MOEDA": escala, "ORDEM_EXERC": ordem, "DT_FIM_EXERC": f"{a}-12-31",
                    "CD_CONTA": cd_conta, "DS_CONTA": ds, "VL_CONTA": f"{por_ano[a]:.10f}", "ST_CONTA_FIXA": "S",
                }
                if demo in ("DRE", "DFC_MI"):
                    row["DT_INI_EXERC"] = f"{a}-01-01"
                out[demo].append(row)
    return out


def gravar_zip(pasta, ano, blocos):
    buf = {}
    for (demo, base), rows in blocos.items():
        s = io.StringIO()
        cols = COLS_DRE if demo in ("DRE", "DFC_MI") else COLS_BP
        w = csv.DictWriter(s, fieldnames=cols, delimiter=";", lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)
        buf[f"dfp_cia_aberta_{demo}_{base}_{ano}.csv"] = s.getvalue().encode("iso-8859-1")
    with zipfile.ZipFile(os.path.join(pasta, f"dfp_cia_aberta_{ano}.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"dfp_cia_aberta_{ano}.csv", "CNPJ_CIA;DT_REFER;VERSAO\n")
        for nome, b in buf.items():
            z.writestr(nome, b)


def gerar_fixture(pasta):
    os.makedirs(pasta, exist_ok=True)
    W = weg()
    weg_contas = {k: (ds, {2023: v[0], 2024: v[1], 2025: v[2]}) for k, (ds, v) in W.items()}
    # empresa em UNIDADE, com versão 2 corrigindo o caixa de 2025 e sem a conta 2.03.06 em 2024
    fic = {
        "1": ("Ativo Total", {2024: 1_000_000, 2025: 1_200_000}),
        "1.01": ("Ativo Circulante", {2024: 600_000, 2025: 700_000}),
        "1.01.01": ("Caixa e Equivalentes de Caixa", {2024: 100_000, 2025: 150_000}),
        "1.01.03": ("Contas a Receber", {2024: 200_000, 2025: 250_000}),
        "1.01.04": ("Estoques", {2024: 300_000, 2025: 300_000}),
        "1.02": ("Ativo Não Circulante", {2024: 400_000, 2025: 500_000}),
        "1.02.03": ("Imobilizado", {2024: 400_000, 2025: 500_000}),
        "2": ("Passivo Total", {2024: 1_000_000, 2025: 1_200_000}),
        "2.01": ("Passivo Circulante", {2024: 300_000, 2025: 400_000}),
        "2.01.02": ("Fornecedores", {2024: 120_000, 2025: 150_000}),
        "2.01.04": ("Empréstimos e Financiamentos", {2024: 180_000, 2025: 250_000}),
        "2.02": ("Passivo Não Circulante", {2024: 200_000, 2025: 200_000}),
        "2.02.01": ("Empréstimos e Financiamentos", {2024: 200_000, 2025: 200_000}),
        "2.03": ("Patrimônio Líquido", {2024: 500_000, 2025: 600_000}),
        "2.03.01": ("Capital Social Realizado", {2024: 400_000, 2025: 450_000}),
        "2.03.06": ("Ajustes de Avaliação Patrimonial", {2024: 100_000, 2025: 150_000}),
        "3.01": ("Receita de Venda de Bens e/ou Serviços", {2024: 2_000_000, 2025: 2_400_000}),
        "3.02": ("Custo dos Bens e/ou Serviços Vendidos", {2024: -1_200_000, 2025: -1_500_000}),
        "3.11": ("Lucro/Prejuízo do Período", {2024: 150_000, 2025: 180_000}),
    }
    fic_v1 = json.loads(json.dumps(fic))
    fic_v1 = {k: (ds, {int(a): v for a, v in d.items()}) for k, (ds, d) in fic_v1.items()}
    fic_v1["1.01.01"][1][2025] = 999  # valor errado da versão 1, corrigido na versão 2
    banco = {
        "1": ("Ativo Total", {2024: 5_000, 2025: 6_000}),
        "1.01": ("Caixa e Equivalentes de Caixa", {2024: 500, 2025: 600}),
        "2": ("Passivo Total", {2024: 5_000, 2025: 6_000}),
        "2.01": ("Passivos Financeiros ao Valor Justo", {2024: 4_000, 2025: 4_800}),
        "3.01": ("Receitas da Intermediação Financeira", {2024: 900, 2025: 1_000}),
    }
    for ano in (2024, 2025):
        blocos = {}
        def add(partes, base="con"):
            for demo, rows in partes.items():
                blocos.setdefault((demo, base), []).extend(rows)
        add(linhas_empresa(5410, "84.429.695/0001-11", "WEG S.A.", weg_contas, [ano]))
        add(linhas_empresa(90001, "00.000.000/0001-91", "EMPRESA TESTE UNIDADE S.A.", fic_v1, [ano], base="ind",
                           escala="UNIDADE", versao=1, faltando={(2024, "2.03.06")}), base="ind")
        add(linhas_empresa(90001, "00.000.000/0001-91", "EMPRESA TESTE UNIDADE S.A.", fic, [ano], base="ind",
                           escala="UNIDADE", versao=2, faltando={(2024, "2.03.06")}), base="ind")
        add(linhas_empresa(90002, "00.000.000/0002-72", "BANCO TESTE S.A.", banco, [ano]))
        gravar_zip(pasta, ano, blocos)
    # cadastro
    with open(os.path.join(pasta, "cad_cia_aberta.csv"), "w", encoding="iso-8859-1", newline="") as f:
        f.write("CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;SIT;SETOR_ATIV\n")
        f.write("84.429.695/0001-11;WEG S.A.;WEG;5410;ATIVO;Máquinas, Equipamentos, Veículos e Peças\n")
        f.write("00.000.000/0002-72;BANCO TESTE S.A.;BANCO TESTE;90002;ATIVO;Bancos\n")
    # códigos de negociação
    s = "CNPJ_Companhia;Valor_Mobiliario;Mercado;Codigo_Negociacao;Data_Fim_Negociacao\n" \
        "84.429.695/0001-11;Ações Ordinárias;Bolsa;WEGE3;\n"
    with zipfile.ZipFile(os.path.join(pasta, "fca_cia_aberta_2025.zip"), "w") as z:
        z.writestr("fca_cia_aberta_valor_mobiliario_2025.csv", s.encode("iso-8859-1"))


def main():
    fixture = os.path.join(RAIZ, "tests", "fixtures", "cvm")
    gerar_fixture(fixture)
    saida = os.path.join(RAIZ, "tests", "fixtures", "saida")
    subprocess.run([sys.executable, os.path.join(AQUI, "cvm.py"), "--saida", saida, "--fonte", fixture,
                    "--anos", "2023-2025"], check=True)
    meta = json.load(open(os.path.join(saida, "empresas.json"), encoding="utf-8"))
    por = {e["c"]: e for e in meta["empresas"]}
    erros = []
    def checa(cond, msg):
        if not cond:
            erros.append(msg)
    checa(set(por) == {"5410", "90001", "90002"}, f"empresas: {sorted(por)}")
    checa(por["5410"]["a"] == ["2023", "2024", "2025"], f"anos WEG: {por['5410']['a']}")
    checa(por["5410"]["t"] == ["WEGE3"], f"ticker WEG: {por['5410']['t']}")
    checa(por["5410"]["s"].startswith("Máquinas"), "setor WEG")
    checa(por["90002"].get("fin") is True, "banco não marcado como instituição financeira")
    checa(not os.path.exists(os.path.join(saida, "cia", "90002.json")), "banco não deveria ter arquivo")

    w = json.load(open(os.path.join(saida, "cia", "5410.json"), encoding="utf-8"))
    soma = lambda pref, i: sum(c["v"][i] or 0 for c in w["contas"] if c["cod"].startswith(pref))
    for i, tot in enumerate([31496270, 41489701, 42645030]):
        checa(abs(soma("AC.", i) + soma("ANC.", i) - tot) < 1, f"WEG ativo {i}")
        checa(abs(soma("PC.", i) + soma("PNC.", i) + soma("PL.", i) - tot) < 1, f"WEG passivo {i}")
    cmv = [c for c in w["contas"] if c["cod"] == "DRE.CMV"][0]["v"]
    checa(cmv == [21702737, 25173096, 27122477], f"CMV com sinal invertido: {cmv}")
    cds = [c["cd"] for c in w["contas"]]
    checa("2.02.02.02.04" in cds and "2.01.04" in cds and "2.01.04.01.01" not in cds, f"detalhe aberto só nas contas genéricas: {cds}")
    ll = [c for c in w["contas"] if c["cod"] == "DRE.LL"][0]["v"]
    checa(ll == [5867615, 6318763, 6775958], f"lucro: {ll}")
    checa(not any(c["nome"].startswith("Outras contas do grupo") for c in w["contas"]), "WEG não deveria ter diferença")
    cds = [c["cd"] for c in w["contas"]]
    checa("2.01.05" not in cds and "2.01.05.02.01" in cds and "2.01.05.02.04" in cds, f"detalhe de outras obrigações: {cds}")
    checa(not os.path.exists(os.path.join(saida, "dfp", "90002.json")), "banco sem demonstrações completas")
    div = [c for c in w["contas"] if c["cd"] == "2.01.05.02.01"][0]
    checa(div["cod"] == "PC.OUT" and div["v"][2] == 1759319, f"dividendos: {div}")

    caixa_w = [c for c in w["contas"] if c["cd"] == "1.01.01"][0]["v"]
    dfc = {l["cod"]: l for l in w.get("dfc", [])}
    checa(dfc.get("DFC.FIM", {}).get("v") == caixa_w, f"saldo final da DFC = caixa do BP: {dfc.get('DFC.FIM')}")
    checa(dfc.get("DFC.LUC", {}).get("nome") == "Lucro antes dos impostos" and dfc["DFC.LUC"]["v"] == [6590797, 7908508, 8147677], "ponto de partida da DFC")
    checa(dfc.get("DFC.CAPEX", {}).get("v") == [-1658625, -1850322, -2691321], f"CAPEX: {dfc.get('DFC.CAPEX')}")
    checa(dfc.get("DFC.DIV", {}).get("v") == [-2308620, -2934611, -5384769], f"dividendos pagos: {dfc.get('DFC.DIV')}")
    checa(dfc.get("DFC.EMP", {}).get("v") == [-617584, 162270, 1017651], f"empréstimos líquidos: {dfc.get('DFC.EMP')}")
    checa(all(p["dfc"] == "indireto" for p in w["periodos"]), "método da DFC")
    comp = json.load(open(os.path.join(saida, "dfp", "5410.json"), encoding="utf-8"))
    bpa = {l["c"]: l for l in comp["BPA"]}
    checa(bpa["1.01.01.01"]["v"] == [None, 1900225, 2040959] and bpa["1.01.01.01"]["d"] == "Caixa e Bancos", "BPA completo")
    checa([l["c"] for l in comp["DRE"]][:4] == ["3.01", "3.02", "3.03", "3.04"], "ordem da DRE")
    checa(any(l["c"] == "6.01.02.08" for l in comp["DFC"]), "DFC completa")
    checa(not any(l["c"].startswith("3.99") for l in comp["DRE"]), "lucro por ação fora")
    checa(comp["periodos"] == ["2023", "2024", "2025"], "períodos do arquivo completo")

    f = json.load(open(os.path.join(saida, "cia", "90001.json"), encoding="utf-8"))
    caixa = [c for c in f["contas"] if c["cd"] == "1.01.01"][0]["v"]
    checa(caixa == [100.0, 150.0], f"escala/versão: {caixa}")
    checa(all(p["base"] == "ind" for p in f["periodos"]), "base individual")
    dif = [c for c in f["contas"] if c["nome"].startswith("Outras contas do grupo")]
    checa(len(dif) == 1 and dif[0]["cod"] == "PL.OUT" and dif[0]["v"][0] == 100.0, f"linha de diferença: {dif}")

    if erros:
        print("FALHOU:\n- " + "\n- ".join(erros))
        sys.exit(1)
    print("Rotina da CVM: todos os testes passaram.")


if __name__ == "__main__":
    main()
