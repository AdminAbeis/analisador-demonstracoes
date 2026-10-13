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

# WEG por ano (R$ mil): conta CVM -> (descrição, {ano: valor})
def weg():
    A = {  # 2023, 2024, 2025
        "1.01.01": ("Caixa e Equivalentes de Caixa", [6488454, 7347599, 6296498]),
        "1.01.02": ("Aplicações Financeiras", [592770, 648477, 983367]),
        "1.01.03": ("Contas a Receber", [6070556, 7394411, 7837018]),
        "1.01.04": ("Estoques", [7116286, 9903951, 9911053]),
        "1.01.06": ("Tributos a Recuperar", [420284 + 120818, 685536 + 131878, 762068 + 221894]),
        "1.01.08": ("Outros Ativos Circulantes", [22423 + 730720, 210749 + 898758, 25146 + 873801]),
        "1.02.01": ("Ativo Realizável a Longo Prazo", [10703 + 605 + 74620 + 864394 + 74010 + 12733 + 53332,
                                                      17134 + 6166 + 58279 + 1141821 + 115193 + 8394 + 95233,
                                                      14263 + 0 + 58623 + 981841 + 167197 + 1552 + 146892]),
        "1.02.02": ("Investimentos", [77481, 71808, 67026]),
        "1.02.03": ("Imobilizado", [6707545 + 587291, 9035224 + 898435, 10625487 + 886315]),
        "1.02.04": ("Intangível", [1471245, 2820655, 2784989]),
        "2.01.01": ("Obrigações Sociais e Trabalhistas", [760609, 1053539, 1170206]),
        "2.01.02": ("Fornecedores", [2190088, 3778116, 2789346]),
        "2.01.03": ("Obrigações Fiscais", [238202, 474494, 321188]),
        "2.01.04": ("Empréstimos e Financiamentos", [2170324, 2850956, 3549314]),
        "2.01.05": ("Outras Obrigações", [73082 + 482903 + 3238834 + 563436 + 72872 + 120043 + 882224,
                                          26237 + 561679 + 4040292 + 569328 + 107668 + 77589 + 1335358,
                                          75075 + 1759319 + 4693390 + 621573 + 221934 + 200215 + 1406786]),
        "2.01.06": ("Provisões", [427072, 579009, 578055]),
        "2.02.01": ("Empréstimos e Financiamentos", [664737, 744281, 1041508]),
        "2.02.02": ("Outras Obrigações", [91863 + 484027 + 13650 + 0 + 205838, 0 + 715450 + 23647 + 0 + 473287,
                                          1367 + 625219 + 33314 + 3464232 + 506466]),
        "2.02.03": ("Tributos Diferidos", [87056, 170520, 220971]),
        "2.02.04": ("Provisões", [874634, 783034, 812188]),
        "2.03.01": ("Capital Social Realizado", [6504517, 7504517, 12504517]),
        "2.03.02": ("Reservas de Capital", [-89606 + 17831 - 55983, -121178 + 17458 - 47840, -145575 + 20215 - 43579]),
        "2.03.04": ("Reservas de Lucros", [8329343 + 1249940, 10196349 + 1269791, 2575748 + 0]),
        "2.03.06": ("Ajustes de Avaliação Patrimonial", [289441, 277498, 267222]),
        "2.03.08": ("Outros Resultados Abrangentes", [1096602, 3107626, 2238637]),
        "2.03.09": ("Participação dos Acionistas Não Controladores", [512691, 920996, 1136179]),
        "3.01": ("Receita de Venda de Bens e/ou Serviços", [32503601, 37986941, 40804110]),
        "3.02": ("Custo dos Bens e/ou Serviços Vendidos", [-21702737, -25173096, -27122477]),
        "3.03": ("Resultado Bruto", [10800864, 12813845, 13681633]),
        "3.04": ("Despesas/Receitas Operacionais", [-4338739, -5123317, -5682892]),
        "3.05": ("Resultado Antes do Resultado Financeiro e dos Tributos", [6462125, 7690528, 7998741]),
        "3.06": ("Resultado Financeiro", [128672, 217980, 148936]),
        "3.07": ("Resultado Antes dos Tributos sobre o Lucro", [6590797, 7908508, 8147677]),
        "3.08": ("Imposto de Renda e Contribuição Social sobre o Lucro", [-723182, -1589745, -1371719]),
        "3.09": ("Resultado Líquido das Operações Continuadas", [5867615, 6318763, 6775958]),
        "3.11": ("Lucro/Prejuízo Consolidado do Período", [5867615, 6318763, 6775958]),
    }
    # detalhe da conta "Outras Obrigações" do passivo circulante (níveis 4 e 5)
    out = A["2.01.05"][1]
    div = [482903, 561679, 1759319]
    adi = [3238834, 4040292, 4693390]
    A["2.01.05.02"] = ("Outros", out)
    A["2.01.05.02.01"] = ("Dividendos e JCP a Pagar", div)
    A["2.01.05.02.04"] = ("Adiantamento de Clientes", adi)
    A["2.01.05.02.05"] = ("Outras Obrigações", [out[i] - div[i] - adi[i] for i in range(3)])
    tot = {}
    for g, pref in [("1.01", "1.01."), ("1.02", "1.02."), ("2.01", "2.01."), ("2.02", "2.02."), ("2.03", "2.03.")]:
        tot[g] = [sum(v[i] for k, (_, v) in A.items() if k.startswith(pref) and k.count(".") == 2) for i in range(3)]
    A["1"] = ("Ativo Total", [tot["1.01"][i] + tot["1.02"][i] for i in range(3)])
    A["1.01"] = ("Ativo Circulante", tot["1.01"])
    A["1.02"] = ("Ativo Não Circulante", tot["1.02"])
    A["2"] = ("Passivo Total", [tot["2.01"][i] + tot["2.02"][i] + tot["2.03"][i] for i in range(3)])
    A["2.01"] = ("Passivo Circulante", tot["2.01"])
    A["2.02"] = ("Passivo Não Circulante", tot["2.02"])
    A["2.03"] = ("Patrimônio Líquido Consolidado", tot["2.03"])
    assert A["1"][1] == A["2"][1], "WEG não fecha"
    return A


def linhas_empresa(cd, cnpj, nome, contas, anos_doc, base="con", escala="MIL", versao=1, faltando=()):
    """anos_doc: ano da DFP; gera ÚLTIMO (ano) e PENÚLTIMO (ano-1). contas: {cd: (ds, {ano: v})}"""
    out = {"BPA": [], "BPP": [], "DRE": []}
    for ano in anos_doc:
        for ordem, a in (("ÚLTIMO", ano), ("PENÚLTIMO", ano - 1)):
            for cd_conta, (ds, por_ano) in sorted(contas.items()):
                if a not in por_ano or (a, cd_conta) in faltando:
                    continue
                demo = "BPA" if cd_conta.startswith("1") else "BPP" if cd_conta.startswith("2") else "DRE"
                row = {
                    "CNPJ_CIA": cnpj, "DT_REFER": f"{ano}-12-31", "VERSAO": str(versao), "DENOM_CIA": nome,
                    "CD_CVM": str(cd).zfill(6), "GRUPO_DFP": f"DF {'Consolidado' if base == 'con' else 'Individual'} - {demo}",
                    "MOEDA": "REAL", "ESCALA_MOEDA": escala, "ORDEM_EXERC": ordem, "DT_FIM_EXERC": f"{a}-12-31",
                    "CD_CONTA": cd_conta, "DS_CONTA": ds, "VL_CONTA": f"{por_ano[a]:.10f}", "ST_CONTA_FIXA": "S",
                }
                if demo == "DRE":
                    row["DT_INI_EXERC"] = f"{a}-01-01"
                out[demo].append(row)
    return out


def gravar_zip(pasta, ano, blocos):
    buf = {}
    for (demo, base), rows in blocos.items():
        s = io.StringIO()
        cols = COLS_DRE if demo == "DRE" else COLS_BP
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
    ll = [c for c in w["contas"] if c["cod"] == "DRE.LL"][0]["v"]
    checa(ll == [5867615, 6318763, 6775958], f"lucro: {ll}")
    checa(not any(c["nome"].startswith("Outras contas do grupo") for c in w["contas"]), "WEG não deveria ter diferença")
    cds = [c["cd"] for c in w["contas"]]
    checa("2.01.05" not in cds and "2.01.05.02.01" in cds and "2.01.05.02.04" in cds, f"detalhe de outras obrigações: {cds}")
    div = [c for c in w["contas"] if c["cd"] == "2.01.05.02.01"][0]
    checa(div["cod"] == "PC.OUT" and div["v"][2] == 1759319, f"dividendos: {div}")

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
