# Analisador de Demonstrações

Página web que analisa o balanço patrimonial e a DRE de companhias abertas com os 17 índices da disciplina *Demonstrativos Financeiros*. Para cada índice, o sistema:

1. calcula os valores de cada período;
2. diz se houve melhora, piora ou estabilidade;
3. decompõe a variação no numerador e no denominador;
4. aponta as contas que explicam o movimento;
5. redige o parágrafo interpretativo, cruzando o índice com as contas do balanço, a DRE e a DFC.

A pessoa escolhe a empresa em **Trocar empresa**, numa lista com todas as companhias abertas da CVM, e define o intervalo de anos ao lado do nome da empresa. Também dá para digitar ou importar os dados de qualquer empresa (menu **⋯**).

Abas da página:

| Aba | O que mostra |
|---|---|
| Análise | Ficha da empresa, os 17 índices, a evolução de cada um, o parágrafo interpretativo e a conclusão integrada |
| Estruturas | Balanço, DRE e fluxo de caixa lado a lado, com as três ligações entre eles conferidas (lucro → PL, ponto de partida da DFC, saldo final → caixa) |
| Demonstrações | Balanço ativo e passivo, DRE e DFC conta a conta, com os códigos da CVM, no formato do RAD |
| AV e AH | Análise vertical e horizontal de todas as contas |
| Dados e Parâmetros | Edição dos dados do caso e regras configuráveis |

Em todas as abas, os valores sublinhados mostram a fórmula e o cálculo. No computador, passar o mouse mostra um resumo e clicar abre a lista completa das contas; no celular, o toque abre um painel na parte de baixo da tela.

A página abre com a WEG (últimos três exercícios) na primeira visita e depois lembra a última empresa consultada. No menu **Exportar**, **PDF**, **Word** e **CSV** geram o arquivo da aba que estiver aberta; **Imprimir** usa a impressão do navegador. O PDF é montado no próprio navegador com as bibliotecas jsPDF e AutoTable, carregadas só quando o botão é usado.

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
| `index.html`, `app.js` | Interface: busca de empresas, períodos, abas, dicas de cálculo e exportação |
| `porta.js` | Tela de senha, usada só quando o site é publicado com senha |
| `engine.js` | Motor: índices, decomposição, seleção de contas, textos, AV/AH e conclusão integrada |
| `pipeline/cvm.py` | Rotina que baixa e processa os arquivos da CVM (só biblioteca padrão do Python) |
| `pipeline/test_cvm.py` | Teste da rotina com arquivos montados no layout da CVM |
| `pipeline/proteger.js` | Criptografa o código do site com as senhas dos Secrets (etapa opcional do workflow) |
| `tests/cia-grega.json` | Gabarito de um caso didático (Cia Grega), conferido a cada atualização |
| `tests/weg-digitada.json` | WEG digitada a partir dos PDFs, usada para conferir a rotina da CVM |
| `tests/engine.test.js` | Testes do motor (gabarito da Cia Grega, coerência CVM × WEG digitada, DFC e detalhe dos cálculos) |
| `tests/proteger.test.js` | Teste da proteção com senha |
| `.github/workflows/publicar.yml` | Roda os testes, atualiza os dados e publica o site |

## Como o texto de cada índice é montado

O texto segue o roteiro índice → fórmula → balanço → explicação. Todas as regras valem para qualquer empresa, porque usam o código de cada conta no plano do sistema, o nome da conta e as taxas de crescimento; nada é específico de uma companhia.

1. **Valores e evolução:** os valores de cada ano, a variação no período e a variação ano a ano.
2. **Fórmula:** se o numerador ou o denominador explica o movimento, e em que proporção.
3. **Contas do balanço:** as contas que mais variaram em cada lado, em reais, marcando contas que surgiram, zeraram ou mais que dobraram.
4. **Natureza das contas:** o que cada conta citada significa (dívida com juros, adiantamento de clientes, dividendos a pagar, fornecedores, estoques…), explicada uma única vez na análise.
5. **Cruzamentos próprios de cada índice:**

| Índice | Cruzamento |
|---|---|
| LI | Fontes e usos de caixa pela DFC: operação, investimentos, aquisições, dividendos e empréstimos |
| LC, LS | Estoques × custo das vendas e clientes × receita |
| PCT, CE | Quanto do aumento das dívidas tem juros e quanto não tem |
| IPL | Crescimento do imobilizado e do intangível × compras de ativos e aquisições de empresas na DFC |
| PCT, IPL, RPL | Capital social × reservas de lucros (incorporação de reservas ao capital) |
| RA | Margem × giro (RA = ML × GA) |
| RPL | Rentabilidade do ativo × alavancagem (ativo ÷ PL) e lucro × variação do PL × dividendos pagos |
| PMRE, PMRV, PMPC | Estoques, clientes e fornecedores × CMV e receita, com o giro em vezes por ano |
| CF | Necessidade de capital de giro (clientes + estoques − fornecedores) × capital circulante líquido |
| Todos (3 anos ou mais) | Causa do último ano quando ela é diferente da causa do período todo |

6. **Julgamento e leitura do índice.**

Abaixo de cada parágrafo, o quadro **Conferir no balanço** lista as contas e séries citadas, com os valores de cada ano e a variação, para que o texto possa ser conferido ao lado das demonstrações. A análise abre com a ficha da empresa e um parágrafo de apresentação (constituição, sede, setor da CVM, controle, listagem na B3, período, receita, ativo e lucro).

**Ficha da empresa.** Vem do cadastro de companhias (`cad_cia_aberta.csv`) e do formulário cadastral (FCA) da CVM: razão social, setor, data de constituição, sede, controle acionário, segmento de listagem e códigos na B3, registro na CVM, auditor independente e site. Missão, visão, valores e histórico não fazem parte dos dados abertos da CVM; ficam no site de relações com investidores de cada empresa.

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

## Acesso com senha (opcional)

Sem configuração, o site fica aberto. Para exigir senha, crie dois Secrets no repositório (**Settings → Secrets and variables → Actions → New repository secret**) e rode o workflow de novo:

| Secret | Quem usa | O que libera |
|---|---|---|
| `SENHA_ADMIN` | Você | Tudo: trocar empresa e período, abas Dados e Parâmetros, importar, gerar links de leitura |
| `SENHA_LEITURA` | O grupo (opcional) | Só a análise que você fixou: abas Análise, Estruturas, Demonstrações e AV e AH, com exportação |

Como fixar a análise do grupo: entre com a senha de administrador, escolha a empresa, o período e os parâmetros, abra o menu **⋯** e use **Copiar link de leitura**. Quem abrir esse link com a senha de leitura vê exatamente essa análise e não consegue trocar de empresa. O navegador lembra o último link válido.

Como funciona: o workflow junta `engine.js` e `app.js` e os criptografa (AES-GCM, chave derivada da senha com PBKDF2). O site publicado só tem `porta.js` e o código cifrado; sem senha, a página não funciona. Para trocar a senha, edite o Secret e rode o workflow; quem tinha marcado "Lembrar neste navegador" precisa digitar a senha nova.

Limites:
- Os dados da CVM (`data/`) continuam públicos, como já são no portal da CVM.
- O modo leitura esconde as abas de edição, mas quem entende de programação e tem a senha de leitura consegue reabilitá-las no próprio navegador. É uma barreira para colegas, não um cofre.
- Com o repositório público, o código-fonte fica visível no GitHub. Para escondê-lo, deixe o repositório privado: o GitHub Pages em repositório privado exige GitHub Pro, que é gratuito para estudantes pelo GitHub Student Developer Pack. O site continua no mesmo endereço.

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
node tests/proteger.test.js
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
