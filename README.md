# Analisador de Demonstrações

Página web que analisa o balanço patrimonial e a DRE de companhias abertas com os 17 índices da disciplina *Demonstrativos Financeiros* (Profa. Isabel Gozer, UNIPAR). Para cada índice, o sistema:

1. calcula os valores de cada período;
2. diz se houve melhora, piora ou estabilidade;
3. decompõe a variação no numerador e no denominador;
4. aponta as contas que explicam o movimento;
5. redige o parágrafo no modelo da Cia Grega.

A pessoa escolhe a empresa numa lista com todas as companhias abertas da CVM e define o intervalo de anos. Também dá para digitar ou importar os dados de qualquer empresa.

Abas da página:

| Aba | O que mostra |
|---|---|
| Análise | Os 17 índices, a evolução de cada um, o parágrafo interpretativo e a conclusão integrada |
| Estruturas | Balanço, DRE e fluxo de caixa lado a lado, com as três ligações entre eles conferidas (lucro → PL, ponto de partida da DFC, saldo final → caixa) |
| Demonstrações | Balanço ativo e passivo, DRE e DFC conta a conta, com os códigos da CVM, no formato do RAD |
| AV e AH | Análise vertical e horizontal de todas as contas |
| Dados, Parâmetros, Teste | Edição dos dados, regras configuráveis e gabarito da Cia Grega |

Em todas as abas, os valores sublinhados mostram a fórmula e o cálculo. No computador, basta passar o mouse; no celular, o toque abre um painel na parte de baixo da tela.

Tudo é gratuito: os dados vêm do Portal de Dados Abertos da CVM, e o site roda no GitHub Pages.

## Como funciona

```
CVM (dados.cvm.gov.br)                     GitHub Actions, toda segunda-feira
  dfp_cia_aberta_2010.zip … 2025.zip  ──►  pipeline/cvm.py
  cad_cia_aberta.csv (setor)                 · lê balanço, DRE e DFC (consolidado; individual quando não há)
  fca_cia_aberta_AAAA.zip (WEGE3 etc.)       · classifica as contas no plano do sistema
                                             · gera data/empresas.json, data/cia/<código>.json
                                               (análise) e data/dfp/<código>.json (demonstrações completas)
                                                         │
                                                         ▼
                                     GitHub Pages: index.html + app.js + engine.js
                                     (a análise roda no navegador de quem usa)
```

| Arquivo | O que faz |
|---|---|
| `index.html`, `app.js` | Interface: busca de empresas, períodos, abas Análise / AV e AH / Dados / Parâmetros / Teste, exportação |
| `engine.js` | Motor: índices, decomposição, seleção de contas, textos, AV/AH e conclusão integrada |
| `exemplos.js` | Casos prontos: Cia Grega (gabarito da professora) e WEG digitada dos PDFs |
| `pipeline/cvm.py` | Rotina que baixa e processa os arquivos da CVM (só biblioteca padrão do Python) |
| `pipeline/test_cvm.py` | Teste da rotina com arquivos montados no layout da CVM |
| `tests/engine.test.js` | Testes do motor (gabarito da Cia Grega, coerência CVM × WEG digitada, DFC e detalhe dos cálculos) |
| `.github/workflows/publicar.yml` | Roda os testes, atualiza os dados e publica o site |

## Colocar no ar (uma vez)

1. Crie um repositório **público** no GitHub, por exemplo `analisador-demonstracoes`. O GitHub Pages é gratuito para repositórios públicos.
2. Envie todos os arquivos desta pasta, incluindo a pasta `.github`.
   - No Mac, o Finder esconde pastas que começam com ponto. Use **Cmd + Shift + .** para mostrá-las antes de arrastar os arquivos para o GitHub.
   - Outra opção é o GitHub Desktop.
3. No repositório, abra **Settings → Pages** e, em *Source*, escolha **GitHub Actions**.
4. Abra a aba **Actions**, escolha **Atualizar dados e publicar** e clique em **Run workflow**.
   - A primeira execução baixa todos os anos desde 2010 e leva alguns minutos.
5. O site fica em `https://<seu-usuario>.github.io/<nome-do-repositório>/`.

Depois disso, os dados se atualizam sozinhos toda segunda-feira. Para rodar fora de hora, use o mesmo botão **Run workflow**.

Se uma execução falhar, o site continua com a última versão publicada. O log da etapa *Baixar e processar as DFPs da CVM* mostra quantas linhas foram lidas por ano e quantas empresas foram geradas.

## Rodar no próprio computador

```bash
python3 pipeline/cvm.py --saida data --anos 2020-2025 --cache .cache-cvm
python3 -m http.server 8000
# abra http://localhost:8000
```

Os testes rodam sem internet:

```bash
python3 pipeline/test_cvm.py
node tests/engine.test.js
```

## Plano de contas

As DFPs da CVM usam códigos fixos para empresas comerciais, industriais e de serviços. A rotina converte esses códigos assim:

| CVM | Sistema | CVM | Sistema |
|---|---|---|---|
| 1.01.01 Caixa e equivalentes | AC.DISP | 2.01.02 Fornecedores | PC.FORN |
| 1.01.02 Aplicações financeiras | AC.APLIC | 2.01.04 Empréstimos e financiamentos | PC.EMP |
| 1.01.03 Contas a receber | AC.CLI | demais 2.01.xx | PC.OUT |
| 1.01.04 Estoques | AC.EST | 2.02.01 Empréstimos e financiamentos | PNC.EMP |
| 1.01.07 Despesas antecipadas | AC.DESPANT | demais 2.02.xx | PNC.OUT |
| demais 1.01.xx | AC.OUT | 2.03.01 Capital social | PL.CAP |
| 1.02.01 Realizável a longo prazo | ANC.RLP | 2.03.04 Reservas de lucros | PL.RES |
| 1.02.02 Investimentos | ANC.INV | demais 2.03.xx | PL.OUT |
| 1.02.03 Imobilizado | ANC.IMOB | 3.01 Receita | DRE.RL |
| 1.02.04 Intangível | ANC.INT | 3.02 Custo | DRE.CMV |
| | | 3.11 Lucro/prejuízo do período | DRE.LL |

**Detalhamento.** Contas genéricas são abertas nas subcontas quando a empresa as informa e elas somam o total em todos os anos. Isso vale para "Outras obrigações", "Provisões", "Outros ativos circulantes" e "Realizável a longo prazo". Assim, o texto cita, por exemplo, "Dividendos e JCP a pagar" em vez de "Outras obrigações".

**Diferenças.** Se a soma das contas de um grupo não bater com o total informado, a diferença vira a linha "Outras contas do grupo".

**Sinais.** Custos, despesas e impostos são gravados com sinal positivo.

**Fluxo de caixa.** A rotina lê a DFC pelo método indireto (ou pelo direto, quando é o único publicado) e guarda as linhas-chave usando as contas fixas da CVM:

| CVM | Linha |
|---|---|
| 6.01.01 (primeira subconta) | Ponto de partida: lucro líquido ou lucro antes dos impostos, conforme a empresa |
| 6.01 / 6.02 / 6.03 | Caixa das atividades operacionais, de investimento e de financiamento |
| 6.04 | Variação cambial sobre o caixa |
| 6.05.01 / 6.05.02 | Saldo inicial e saldo final de caixa |

As linhas de depreciação, CAPEX, empréstimos e dividendos são identificadas pelo nome das subcontas.

## Limites conhecidos

- **Bancos e seguradoras** usam outro plano de contas. Eles aparecem na busca, mas ainda não podem ser analisados.
- **Consolidado ou individual:** o sistema usa o consolidado. Nos anos em que a empresa não publicou o consolidado, usa o individual e avisa no texto.
- **Reapresentações:** para cada ano, vale a versão mais recente da DFP daquele ano (coluna "último exercício"). O ano anterior de uma DFP só é usado quando o próprio ano não tem DFP.
- **O texto é gerado por regras.** Ele aponta números e contas corretamente, mas a interpretação final é de quem assina o trabalho.

## Fonte dos dados

CVM, Portal de Dados Abertos: [Cias Abertas: Demonstrações Financeiras Padronizadas (DFP)](https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp). Licença Open Database License (ODbL).
