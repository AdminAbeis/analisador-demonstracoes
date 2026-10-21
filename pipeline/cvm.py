#!/usr/bin/env python3
"""
Baixa as Demonstrações Financeiras Padronizadas (DFP) do portal de dados abertos
da CVM e gera os arquivos que a página usa:

  <saida>/empresas.json        lista de empresas com os anos disponíveis
  <saida>/cia/<CD_CVM>.json    balanço, DRE e resumo da DFC de cada empresa, já
                               classificados no plano de contas do sistema (R$ mil)
  <saida>/dfp/<CD_CVM>.json    demonstrações completas (BP ativo e passivo, DRE e DFC)
                               com os códigos e descrições da CVM, como no RAD

Uso:
  python pipeline/cvm.py --saida _site/data
  python pipeline/cvm.py --saida _site/data --anos 2018-2025 --cache .cache-cvm
  python pipeline/cvm.py --saida /tmp/x --fonte pasta/com/zips   (testes)

Só usa a biblioteca padrão do Python.
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict

BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA"
URL_DFP = BASE + "/DOC/DFP/DADOS/dfp_cia_aberta_{ano}.zip"
URL_FCA = BASE + "/DOC/FCA/DADOS/fca_cia_aberta_{ano}.zip"
URL_CAD = BASE + "/CAD/DADOS/cad_cia_aberta.csv"

csv.field_size_limit(10_000_000)

# --------------------------------------------------------------------------
# Plano de contas: código CVM (contas fixas do layout de empresas comerciais,
# industriais e outras) -> código do sistema
# --------------------------------------------------------------------------
MAPA = {
    "1.01.01": "AC.DISP", "1.01.02": "AC.APLIC", "1.01.03": "AC.CLI", "1.01.04": "AC.EST",
    "1.01.05": "AC.OUT", "1.01.06": "AC.OUT", "1.01.07": "AC.DESPANT", "1.01.08": "AC.OUT",
    "1.02.01": "ANC.RLP", "1.02.02": "ANC.INV", "1.02.03": "ANC.IMOB", "1.02.04": "ANC.INT",
    "2.01.01": "PC.OUT", "2.01.02": "PC.FORN", "2.01.03": "PC.OUT", "2.01.04": "PC.EMP",
    "2.01.05": "PC.OUT", "2.01.06": "PC.OUT", "2.01.07": "PC.OUT",
    "2.02.01": "PNC.EMP", "2.02.02": "PNC.OUT", "2.02.03": "PNC.OUT", "2.02.04": "PNC.OUT",
    "2.02.05": "PNC.OUT", "2.02.06": "PNC.OUT",
    "2.03.01": "PL.CAP", "2.03.02": "PL.OUT", "2.03.03": "PL.OUT", "2.03.04": "PL.RES",
    "2.03.05": "PL.OUT", "2.03.06": "PL.OUT", "2.03.07": "PL.OUT", "2.03.08": "PL.OUT",
    "2.03.09": "PL.OUT",
}
# grupo do sistema -> conta-total da CVM (para conferir e fechar a diferença)
TOTAIS = {"AC": "1.01", "ANC": "1.02", "PC": "2.01", "PNC": "2.02", "PL": "2.03"}
OUTROS = {"AC": "AC.OUT", "ANC": "ANC.RLP", "PC": "PC.OUT", "PNC": "PNC.OUT", "PL": "PL.OUT"}
# DRE: código CVM -> (código do sistema, inverter sinal para "despesa positiva")
DRE = [
    ("3.01", "DRE.RL", False), ("3.02", "DRE.CMV", True), ("3.03", "DRE.LB", False),
    ("3.04", "DRE.DOP", True), ("3.05", "DRE.RO", False), ("3.06", "DRE.RFIN", False),
    ("3.07", "DRE.OUT", False), ("3.08", "DRE.IR", True), ("3.11", "DRE.LL", False),
]
ORDEM_GRUPOS = ["AC", "ANC", "PC", "PNC", "PL"]
# contas genéricas que são abertas no detalhe (níveis 4 e 5) quando a empresa informa as subcontas
ABRIR = {"1.01.08", "1.02.01", "2.01.05", "2.02.02", "2.01.06", "2.02.04"}


def folhas(cd_conta, datas_contas):
    """Devolve as contas que representam cd_conta no detalhe, iguais em todos os períodos.
    Só abre uma conta se, em todos os períodos onde ela existe, as subcontas somam o total."""
    nivel = cd_conta.count(".")
    if nivel >= 4:
        return [cd_conta]
    ds_pai = ""
    filhos = set()
    for contas in datas_contas:
        if cd_conta in contas:
            ds_pai = contas[cd_conta][0]
            filhos |= {c for c in contas if c.startswith(cd_conta + ".") and c.count(".") == nivel + 1}
    abrir = cd_conta in ABRIR or sem_acento(ds_pai).startswith("OUTR")
    if not abrir or not filhos:
        return [cd_conta]
    for contas in datas_contas:
        if cd_conta not in contas:
            continue
        soma = sum(contas[f][1] for f in filhos if f in contas)
        if abs(soma - contas[cd_conta][1]) > 1 or not any(f in contas for f in filhos):
            return [cd_conta]
    out = []
    for f in sorted(filhos):
        out.extend(folhas(f, datas_contas))
    return out


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").upper().strip()


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------
# Download
# --------------------------------------------------------------------------
def obter(url, fonte, cache):
    """Devolve os bytes do arquivo (ou None se não existir)."""
    nome = url.rsplit("/", 1)[-1]
    if fonte:
        caminho = os.path.join(fonte, nome)
        return open(caminho, "rb").read() if os.path.exists(caminho) else None
    if cache:
        os.makedirs(cache, exist_ok=True)
        caminho = os.path.join(cache, nome)
        if os.path.exists(caminho) and not url.endswith(f"{dt.date.today().year}.zip") and not nome.startswith("cad_"):
            return open(caminho, "rb").read()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "analisador-demonstracoes/1.0"})
        with urllib.request.urlopen(req, timeout=180) as r:
            dados = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    if cache:
        with open(os.path.join(cache, nome), "wb") as f:
            f.write(dados)
    return dados


def ler_csv(dados_bytes):
    texto = io.TextIOWrapper(io.BytesIO(dados_bytes), encoding="iso-8859-1", newline="")
    return csv.DictReader(texto, delimiter=";")


def numero(s):
    s = (s or "").strip()
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# --------------------------------------------------------------------------
# Leitura das DFPs
# --------------------------------------------------------------------------
class Base:
    def __init__(self):
        # (cd_cvm, base, data_fim, ordem) -> {versao: {cd_conta: (ds, valor)}}
        self.valores = defaultdict(lambda: defaultdict(dict))
        self.metodo_dfc = {}  # (cd_cvm, base, data_fim, ordem) -> "indireto" | "direto"
        self.nomes = {}       # cd_cvm -> (dt_refer, nome)
        self.cnpj = {}

    def ler_zip(self, dados, ano):
        z = zipfile.ZipFile(io.BytesIO(dados))
        nomes = z.namelist()
        lidos = 0
        # consolidado primeiro; o individual só é guardado quando não há consolidado
        for base in ("con", "ind"):
            for demo in ("BPA", "BPP", "DRE", "DFC_MI", "DFC_MD"):
                alvo = [n for n in nomes if re.search(rf"_{demo}_{base}_\d{{4}}\.csv$", n, re.I)]
                if not alvo:
                    continue
                for row in ler_csv(z.read(alvo[0])):
                    if self._linha(row, base, demo):
                        lidos += 1
        return lidos

    def _linha(self, row, base, demo):
        cd_conta = (row.get("CD_CONTA") or "").strip()
        if not cd_conta or cd_conta[0] not in "1236" or cd_conta.startswith("3.99"):
            return False
        try:
            cd = str(int(row["CD_CVM"]))
        except (KeyError, ValueError):
            return False
        ordem = sem_acento(row.get("ORDEM_EXERC"))
        ordem = "ULTIMO" if ordem.startswith("ULT") else "PENULTIMO" if ordem.startswith("PEN") else None
        if not ordem:
            return False
        data_fim = (row.get("DT_FIM_EXERC") or "").strip()
        if not data_fim:
            return False
        valor = numero(row.get("VL_CONTA"))
        if not valor:          # vazio ou zero: a conta não é guardada
            return False
        chave = (cd, base, data_fim, ordem)
        if base == "ind" and (cd, "con", data_fim, ordem) in self.valores:
            return False
        if demo == "DFC_MD":
            if self.metodo_dfc.get(chave) == "indireto":
                return False
            self.metodo_dfc[chave] = "direto"
        elif demo == "DFC_MI":
            self.metodo_dfc[chave] = "indireto"
        if sem_acento(row.get("ESCALA_MOEDA")) == "UNIDADE":
            valor = valor / 1000.0
        try:
            versao = int(row.get("VERSAO") or 1)
        except ValueError:
            versao = 1
        ds = sys.intern((row.get("DS_CONTA") or "").strip())
        self.valores[chave][versao][sys.intern(cd_conta)] = (ds, valor)
        refer = (row.get("DT_REFER") or "").strip()
        nome = (row.get("DENOM_CIA") or "").strip()
        if nome and (cd not in self.nomes or refer >= self.nomes[cd][0]):
            self.nomes[cd] = (refer, nome)
            self.cnpj[cd] = (row.get("CNPJ_CIA") or "").strip()
        return True

    def periodos(self):
        """cd -> base -> data_fim -> ({cd_conta: (ds, valor)}, metodo_dfc); usa o ÚLTIMO de cada
        DFP e completa com o PENÚLTIMO da DFP seguinte só quando o ano não existe."""
        out = defaultdict(lambda: defaultdict(dict))
        for ordem in ("ULTIMO", "PENULTIMO"):
            for chave, versoes in self.valores.items():
                cd, base, data_fim, o = chave
                if o != ordem or data_fim in out[cd][base]:
                    continue
                out[cd][base][data_fim] = (versoes[max(versoes)], self.metodo_dfc.get(chave, ""))
        return out


# --------------------------------------------------------------------------
# Montagem do caso de cada empresa
# --------------------------------------------------------------------------
def eh_financeira(contas_por_data):
    for contas in contas_por_data.values():
        if "1.01" in contas:
            return "CIRCULANTE" not in sem_acento(contas["1.01"][0])
    return True


def montar_empresa(cd, por_base):
    # base preferida: consolidado onde existir; anos só individuais entram como individual
    datas = sorted(set(por_base.get("con", {})) | set(por_base.get("ind", {})))
    escolhidos = []
    for d in datas:
        for base in ("con", "ind"):
            par = por_base.get(base, {}).get(d)
            contas = par[0] if par else None
            if contas and "1" in contas and "2" in contas and "3.01" in contas:
                escolhidos.append((d, base, contas, par[1]))
                break
    if not escolhidos:
        return None
    if eh_financeira({e[0]: e[2] for e in escolhidos}):
        return {"financeira": True}
    # um período por ano; se houver duas datas no mesmo ano, fica a mais recente
    por_ano = {}
    for e in escolhidos:
        por_ano[e[0][:4]] = e
    escolhidos = [por_ano[a] for a in sorted(por_ano)]

    n = len(escolhidos)
    linhas = []          # {nome, cod, cd, v}
    idx = {}

    def linha(chave, nome, cod, cd_conta):
        if chave not in idx:
            idx[chave] = len(linhas)
            linhas.append({"nome": nome, "cod": cod, "cd": cd_conta, "v": [None] * n})
        return linhas[idx[chave]]

    todas = [e[2] for e in escolhidos]
    nivel3 = sorted({c for contas in todas for c in contas if c.count(".") == 2 and c[0] in "12"})
    usar = []
    for c3 in nivel3:
        usar.extend(folhas(c3, todas))
    for i, (d, base, contas, _m) in enumerate(escolhidos):
        soma = defaultdict(float)
        for cd_conta in usar:
            if cd_conta not in contas:
                continue
            ds, valor = contas[cd_conta]
            grupo = {v: k for k, v in TOTAIS.items()}.get(cd_conta[:4])
            if not grupo:
                continue
            cod = MAPA.get(cd_conta[:7]) or OUTROS[grupo]
            ln = linha(cd_conta, ds, cod, cd_conta)
            ln["v"][i] = r2(valor)
            soma[grupo] += valor
        for grupo, cd_total in TOTAIS.items():
            if cd_total not in contas:
                continue
            dif = contas[cd_total][1] - soma[grupo]
            if abs(dif) > 0.5:
                ln = linha("dif-" + grupo, "Outras contas do grupo (diferença para o total informado)", OUTROS[grupo], cd_total)
                ln["v"][i] = r2(dif)
        for cd_conta, cod, inverte in DRE:
            if cd_conta in contas:
                ds, valor = contas[cd_conta]
                ln = linha(cd_conta, ds, cod, cd_conta)
                ln["v"][i] = r2(-valor if inverte else valor)

    # nomes das contas: usa a descrição do período mais recente (já está, pois sorted por data)
    for i, (d, base, contas, _m) in enumerate(escolhidos):
        for ln in linhas:
            if ln["cd"] in contas and ln["v"][i] is not None and not ln["nome"].startswith("Outras contas do grupo"):
                ln["nome"] = contas[ln["cd"]][0] or ln["nome"]

    # contas ausentes num período em que a empresa entregou a DFP valem zero (a CVM omite contas zeradas)
    for ln in linhas:
        if not ln["nome"].startswith("Outras contas do grupo"):
            ln["v"] = [0 if v is None else v for v in ln["v"]]

    ordem_cod = {g: k for k, g in enumerate(ORDEM_GRUPOS + ["DRE"])}
    linhas.sort(key=lambda l: (ordem_cod[l["cod"].split(".")[0]], l["cd"] if not l["nome"].startswith("Outras contas do grupo") else "9"))
    # remove linhas sempre zeradas ou vazias
    linhas = [l for l in linhas if any(v not in (None, 0) for v in l["v"])]

    periodos = []
    for d, base, _c, metodo in escolhidos:
        rot = d[:4] if d[5:7] == "12" else d[:7]
        periodos.append({"rotulo": rot, "data": d, "base": base, "dfc": metodo})
    return {"periodos": periodos, "contas": linhas,
            "dfc": resumo_dfc([e[2] for e in escolhidos]),
            "completo": demonstracoes_completas([e[2] for e in escolhidos])}


def r2(v):
    """Arredonda para 2 casas e grava como inteiro quando não há centavos (arquivos menores)."""
    v = round(v, 2)
    return int(v) if float(v).is_integer() else v


def chave_codigo(c):
    return tuple(int(x) for x in c.split(".") if x.isdigit())


def demonstracoes_completas(lista_contas):
    """Todas as contas informadas, por demonstração, no formato do RAD da CVM."""
    n = len(lista_contas)
    codigos = sorted({c for contas in lista_contas for c in contas}, key=chave_codigo)
    out = {"BPA": [], "BPP": [], "DRE": [], "DFC": []}
    grupo = {"1": "BPA", "2": "BPP", "3": "DRE", "6": "DFC"}
    for c in codigos:
        ds = ""
        v = [None] * n
        for i, contas in enumerate(lista_contas):
            if c in contas:
                ds = contas[c][0] or ds
                v[i] = r2(contas[c][1])
        out[grupo[c[0]]].append({"c": c, "d": ds, "v": v})
    return out


def resumo_dfc(lista_contas):
    """Linhas-chave da DFC para a aba Estruturas, com códigos do sistema.
    Contas fixas da CVM: 6.01 operacionais, 6.01.01 caixa gerado nas operações,
    6.01.02 variações nos ativos e passivos, 6.02 investimento, 6.03 financiamento,
    6.04 variação cambial, 6.05 aumento/redução, 6.05.01 saldo inicial, 6.05.02 saldo final."""
    n = len(lista_contas)
    fixas = [("DFC.OPG", "6.01.01"), ("DFC.VCG", "6.01.02"), ("DFC.OP", "6.01"), ("DFC.INV", "6.02"),
             ("DFC.FIN", "6.03"), ("DFC.CAMB", "6.04"), ("DFC.VAR", "6.05"), ("DFC.INI", "6.05.01"), ("DFC.FIM", "6.05.02")]
    linhas = {}

    def put(cod, nome, cd, i, valor):
        ln = linhas.setdefault(cod, {"cod": cod, "nome": nome, "cd": cd, "v": [None] * n})
        ln["v"][i] = r2(valor)
        if nome:
            ln["nome"] = nome

    for i, contas in enumerate(lista_contas):
        if not any(c.startswith("6") for c in contas):
            continue
        for cod, cd in fixas:
            if cd in contas:
                put(cod, contas[cd][0], cd, i, contas[cd][1])
        filhos = lambda pai: sorted((c for c in contas if c.startswith(pai + ".") and c.count(".") == pai.count(".") + 1), key=chave_codigo)
        op = filhos("6.01.01")
        if op:  # ponto de partida: primeira linha do caixa gerado nas operações (lucro líquido ou antes dos impostos)
            put("DFC.LUC", contas[op[0]][0], op[0], i, contas[op[0]][1])
        dep = [c for c in op if "DEPRECI" in sem_acento(contas[c][0]) or "AMORTIZ" in sem_acento(contas[c][0])]
        if dep:
            put("DFC.DEP", contas[dep[0]][0], dep[0], i, sum(contas[c][1] for c in dep))
        capex = [c for c in filhos("6.02") if any(k in sem_acento(contas[c][0]) for k in ("IMOBILIZ", "INTANG"))
                 and any(k in sem_acento(contas[c][0]) for k in ("AQUISI", "ADICO", "ADICA", "COMPRA", "INVESTIMENTO EM", "AUMENTO D"))]
        if capex:
            put("DFC.CAPEX", "Aquisição de imobilizado e intangível (CAPEX)", ",".join(capex), i, sum(contas[c][1] for c in capex))
        emp = [c for c in filhos("6.03") if any(k in sem_acento(contas[c][0]) for k in ("EMPREST", "FINANCIAM", "DEBENT"))]
        if emp:
            put("DFC.EMP", "Empréstimos: captações menos pagamentos", ",".join(emp), i, sum(contas[c][1] for c in emp))
        div = [c for c in filhos("6.03") if any(k in sem_acento(contas[c][0]) for k in ("DIVIDEN", "CAPITAL PROPRIO", "JCP"))]
        if div:
            put("DFC.DIV", "Dividendos e JCP pagos", ",".join(div), i, sum(contas[c][1] for c in div))
    ordem = ["DFC.LUC", "DFC.DEP", "DFC.OPG", "DFC.VCG", "DFC.OP", "DFC.CAPEX", "DFC.INV", "DFC.EMP", "DFC.DIV",
             "DFC.FIN", "DFC.CAMB", "DFC.VAR", "DFC.INI", "DFC.FIM"]
    return [linhas[c] for c in ordem if c in linhas]


# --------------------------------------------------------------------------
# Cadastro e códigos de negociação (opcionais)
# --------------------------------------------------------------------------
def ler_cadastro(fonte, cache):
    cad = {}
    try:
        dados = obter(URL_CAD, fonte, cache)
        if not dados:
            return cad
        for row in ler_csv(dados):
            try:
                cd = str(int(row.get("CD_CVM") or ""))
            except ValueError:
                continue
            cad[cd] = {
                "setor": (row.get("SETOR_ATIV") or "").strip(),
                "situacao": (row.get("SIT") or "").strip(),
                "comercial": (row.get("DENOM_COMERC") or "").strip(),
            }
    except Exception as e:  # o cadastro é complementar; a base funciona sem ele
        log("aviso: cadastro indisponível:", e)
    return cad


def ler_tickers(anos, fonte, cache):
    por_cnpj = defaultdict(set)
    for ano in sorted(anos, reverse=True)[:2]:
        try:
            dados = obter(URL_FCA.format(ano=ano), fonte, cache)
            if not dados:
                continue
            z = zipfile.ZipFile(io.BytesIO(dados))
            alvo = [n for n in z.namelist() if re.search(r"valor_mobiliario_\d{4}\.csv$", n, re.I)]
            if not alvo:
                continue
            for row in ler_csv(z.read(alvo[0])):
                cod = (row.get("Codigo_Negociacao") or "").strip().upper()
                fim = (row.get("Data_Fim_Negociacao") or "").strip()
                cnpj = (row.get("CNPJ_Companhia") or "").strip()
                if cod and cnpj and not fim and re.fullmatch(r"[A-Z0-9]{4}\d{1,2}[A-Z]?", cod):
                    por_cnpj[cnpj].add(cod)
            if por_cnpj:
                break
        except Exception as e:
            log("aviso: códigos de negociação indisponíveis:", e)
    return {k: sorted(v) for k, v in por_cnpj.items()}


# --------------------------------------------------------------------------
def intervalo(txt):
    hoje = dt.date.today().year
    if not txt:
        return list(range(2010, hoje + 1))
    a, _, b = txt.partition("-")
    return list(range(int(a), int(b or a) + 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--anos", help="ex.: 2015-2025 (padrão: 2010 até o ano atual)")
    ap.add_argument("--fonte", help="pasta local com os arquivos da CVM (para testes)")
    ap.add_argument("--cache", help="pasta para guardar os ZIPs baixados")
    args = ap.parse_args()

    base = Base()
    anos_lidos = []
    for ano in intervalo(args.anos):
        dados = obter(URL_DFP.format(ano=ano), args.fonte, args.cache)
        if not dados:
            log(f"DFP {ano}: não encontrada, ignorando")
            continue
        n = base.ler_zip(dados, ano)
        anos_lidos.append(ano)
        log(f"DFP {ano}: {n} linhas lidas")
    if not anos_lidos:
        log("Nenhuma DFP encontrada. Nada foi gerado.")
        sys.exit(1)

    cad = ler_cadastro(args.fonte, args.cache)
    tickers = ler_tickers(anos_lidos, args.fonte, args.cache)

    os.makedirs(os.path.join(args.saida, "cia"), exist_ok=True)
    os.makedirs(os.path.join(args.saida, "dfp"), exist_ok=True)
    lista, n_fin, n_vazias = [], 0, 0
    for cd, por_base in sorted(base.periodos().items(), key=lambda x: int(x[0])):
        emp = montar_empresa(cd, por_base)
        nome = base.nomes.get(cd, ("", ""))[1]
        cnpj = base.cnpj.get(cd, "")
        info = cad.get(cd, {})
        if emp is None:
            n_vazias += 1
            continue
        item = {"c": cd, "n": nome, "cnpj": cnpj, "t": tickers.get(cnpj, []), "s": info.get("setor", ""),
                "sit": info.get("situacao", ""), "nc": info.get("comercial", "")}
        if emp.get("financeira"):
            n_fin += 1
            item["fin"] = True
            item["a"] = []
            lista.append(item)
            continue
        item["a"] = [p["rotulo"] for p in emp["periodos"]]
        lista.append(item)
        doc = {
            "cd_cvm": cd, "empresa": nome, "cnpj": cnpj, "tickers": item["t"], "setor": item["s"],
            "escala": "R$ mil",
            "fonte": "CVM, Dados Abertos: Demonstrações Financeiras Padronizadas (DFP). Valores em R$ mil; "
                     "custos, despesas e impostos com sinal positivo.",
            "periodos": emp["periodos"], "contas": emp["contas"], "dfc": emp["dfc"],
        }
        with open(os.path.join(args.saida, "cia", f"{cd}.json"), "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        completo = {"cd_cvm": cd, "empresa": nome, "escala": "R$ mil",
                    "periodos": [p["rotulo"] for p in emp["periodos"]], **emp["completo"]}
        with open(os.path.join(args.saida, "dfp", f"{cd}.json"), "w", encoding="utf-8") as f:
            json.dump(completo, f, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "atualizado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
        "anos": anos_lidos,
        "fonte": "CVM, Portal de Dados Abertos (dados.cvm.gov.br), licença ODbL",
        "empresas": lista,
    }
    with open(os.path.join(args.saida, "empresas.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    log(f"Pronto: {len(lista)} empresas ({n_fin} com layout de instituição financeira), "
        f"{n_vazias} sem demonstrações completas.")


if __name__ == "__main__":
    main()
