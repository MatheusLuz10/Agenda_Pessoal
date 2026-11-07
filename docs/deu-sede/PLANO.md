# DEU SEDE! — Sistema de Gestão de Compras

Seção **DEU SEDE!** da Agenda Pessoal (`/deu-sede`), com o mesmo visual do app inteiro: verde #1E2A24, amarelo #E2A31A, off-white #F2E8D5, marrom #8B5A2B e laranja ouro #F0B43C.

Foco: **quanto custa comprar, de quem comprar, quanto foi comprado e quanto efetivamente foi recebido.** Fora do escopo desta versão: estoque (saldo, saídas), vendas, caixa e financeiro completo.

**Situação: as 7 etapas estão implementadas e testadas** (ver "Testes" no fim).

---

## 1. Arquitetura

| Camada | Escolha |
|---|---|
| App | O mesmo da Agenda (React 19 + TypeScript + Vite), um deploy só |
| Visual | Tailwind 4 com as cores da marca; layout comum em `src/components/layout/Shell.tsx` (menu lateral verde no computador, barra inferior no celular) |
| Login | O da Agenda (Supabase Auth). Ter login **não** dá acesso ao DEU SEDE!: é preciso perfil em `deusede.perfis` |
| Banco | Mesmo projeto Supabase da Agenda, esquema próprio **`deusede`** (nada da Agenda é tocado) |
| Regras | No banco: gatilhos (travas, histórico, auditoria) + funções RPC que recebem e devolvem JSON. A tela só chama essas funções |
| Teste local | Sem `.env.local`: **Postgres no navegador (PGlite)** com as mesmas migrações — sem login, dados salvos no navegador |
| Relatórios | jsPDF + AutoTable (PDF) e ExcelJS (Excel), carregados só ao exportar |

Como o app e o modo local usam as **mesmas funções SQL**, cada regra é escrita uma vez e testada de verdade no computador antes de ir para o Supabase.

```
src/modules/deu-sede/
  routes.tsx            rotas /deu-sede/*
  data/                 cliente (Supabase ou banco local), banco local, tipos, ganchos
  domain/               regras puras + testes: status, comparação, formatos, WhatsApp, colar lista, período
  components/           layout da seção, colar lista, gráfico de preços, componentes visuais
  pages/                painel, produtos, fornecedores, cotações, comparação, pedidos, recebimentos, relatórios, configurações
  exportar.ts           PDF e Excel
supabase/deu-sede/
  0001_estrutura_inicial.sql   tabelas, relações, travas, auditoria, RLS
  0002_cadastros.sql           funções de cadastro, preço atual → histórico
  0003_cotacoes.sql            cotações, histórico de preços pela cotação
  0004_comparacao.sql          ofertas para comparar
  0005_pedidos.sql             montar pedido (1 por fornecedor), status
  0006_recebimentos.sql        conferência, parcial, preço da nota
  0007_relatorios.sql          painel e relatórios
  teste-banco.mjs              npm run test:deu-sede
```

---

## 2. Telas

| Menu | O que tem |
|---|---|
| Painel inicial | Total comprado/recebido, pedidos, valor médio, fretes, descontos, orçamentos recebidos, fornecedores ativos; "Para fazer"; fornecedor de maior volume; produtos mais comprados; maiores altas e quedas de preço; compras por mês (gráfico + tabela); filtro de período |
| Produtos | Lista com busca, categoria e situação · cadastro/edição · ficha: fornecedores e preço atual (menor preço destacado), histórico de preços (gráfico + tabela), cotações e pedidos com o produto · ativar/desativar |
| Fornecedores | Lista · cadastro (CNPJ e WhatsApp validados) · ficha: contato, WhatsApp, produtos e preço atual, cotações, pedidos, total comprado, última compra |
| Cotações | Lista com filtros (status, fornecedor, vencidas) · nova/editar com cálculo ao vivo e **Colar lista** · confirmação quando o preço mudou · ficha: status, duplicar, excluir rascunho, gerar pedido, histórico |
| Comparação | Produtos e quantidades · fornecedores lado a lado por preço/unidade, embalagens necessárias, diferença · alternativas: melhor combinação (com frete), tudo de um fornecedor, minha escolha · levar para o Montar Pedido |
| Pedidos | Lista · **Montar pedido** (opção de compra por produto, **Colar lista**, conferência por fornecedor, frete/condições) · ficha: WhatsApp, status, cancelar com motivo, previsão, recebimentos, histórico |
| Recebimentos | Aguardando entrega · histórico · conferência com **Colar lista da nota**, "tudo chegou", avarias, preço da nota, concluir com pendência |
| Relatórios | Financeiro, Fornecedores, Produtos, Pedidos · filtros de período, fornecedor, produto, categoria, status e nº do pedido · PDF e Excel |
| Configurações | Dados da empresa (PDF/WhatsApp), categorias, nível de acesso, apagar dados de teste (modo local) |

---

## 3. Fluxo

```
Produtos + Fornecedores → Cotação (recebida) → Comparação → Montar pedido
→ conferência por fornecedor → 1 pedido por fornecedor (Aprovado)
→ WhatsApp → "Você enviou?" → Enviado → Confirmado / Em transporte
→ Recebimento (parcial … completo) → Recebido → Painel e Relatórios
```

---

## 4. Banco de dados (esquema `deusede`)

| Tabela | Para que serve |
|---|---|
| `perfis` | Quem acessa e com qual nível (admin, comprador, conferente, consulta) |
| `categorias`, `produtos`, `fornecedores` | Cadastros |
| `fornecedor_produtos` | O que cada fornecedor vende + preço atual (origem: manual, cotação ou nota) |
| `cotacoes`, `cotacao_itens` | Orçamentos, com cópia do produto e dos preços |
| `pedidos`, `pedido_itens` | Pedidos, com cópia do fornecedor, do produto e do preço negociado |
| `recebimentos`, `recebimento_itens` | Conferência de cada entrega |
| `historico_precos` | Histórico permanente (não se altera nem apaga) |
| `eventos` | Auditoria de status, recebimentos e conclusões |
| `configuracoes_empresa` | Cabeçalho de relatórios e mensagens |

Relações: categoria → produtos; fornecedor → cotações → itens; fornecedor → pedidos → itens → recebimentos; item de cotação → item de pedido (de onde veio o preço). Chaves com `restrict`: nada usado é apagado.

---

## 5. Regras de negócio

- **Compra realizada** = pedido enviado ao fornecedor ou depois, não cancelado. Cotação nunca é compra.
- **Cópia de preços**: cotações e pedidos guardam produto, embalagem e preço; mudar o cadastro ou o preço atual não muda o passado.
- **Cotação**: editável até ser recebida; depois, "Duplicar". Recebida → preços entram no histórico e viram o preço atual do fornecedor (uma cotação mais antiga não sobrescreve um preço mais novo).
- **Comparação**: mesmo produto pelo preço por unidade (com desconto do item); quantidade convertida em embalagens de cada fornecedor (arredonda para cima); frete e desconto geral uma vez por fornecedor; vencidas fora, a menos que pedidas; nada estimado.
- **Montar pedido**: itens de fornecedores diferentes → pedidos separados numa transação; preço vindo da cotação é buscado pelo próprio banco; clique repetido não duplica (lote).
- **WhatsApp**: abre a mensagem pronta; só vira "Enviado" depois que você confirma.
- **Recebimento**: aceito = recebido − avariado; não aceita mais que o pendente; tudo recebido conclui o pedido; concluir com pendência exige justificativa.
- **Colar lista** (cotação, montar pedido, recebimento): reconhece o produto pelo código ou pelo nome, converte UN → embalagem, mostra a conferência e **exige confirmação quando o preço mudou**. No recebimento, o preço da nota confirmado pode atualizar o preço atual do fornecedor (o pedido mantém o preço negociado e a divergência fica registrada).
- **Acesso**: sem login nada; login sem perfil, nada; usuário mais antigo do projeto vira admin.

> **Antes de dar login a funcionários:** as tabelas da Agenda liberam tudo para qualquer usuário logado. Restrinja-as ao seu usuário antes de criar login para outra pessoa.

---

## 6. Testes

| Comando | O que verifica |
|---|---|
| `npm run test:deu-sede` | 148 verificações no Postgres local: integridade, travas, permissões, convivência com a Agenda e o roteiro de aceitação (#1 a #13) pelas funções do banco |
| `npm test` | 40 testes das regras da tela (status, comparação, formatos, WhatsApp, colar lista) |
| Teste no navegador (Playwright) | Roteiro completo no modo local: cadastros, cotação por lista colada, comparação, 2 pedidos separados, WhatsApp, recebimento parcial e total, nota com preço novo, histórico intacto, relatórios, PDF, Excel e 11 telas no celular |

O critério #14 (alterar num aparelho e ver no outro) depende do Supabase: com o banco real, cada tela recarrega os dados ao voltar para a aba.

---

## 7. Ativar o banco real

1. Supabase da Agenda → **SQL Editor** → rode, em ordem, os arquivos `supabase/deu-sede/0001…0007`.
2. **Project Settings → Data API → Exposed schemas**: adicione `deusede`.
3. Crie o `.env.local` da Agenda com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Seu usuário (o mais antigo do projeto) já é admin do DEU SEDE!.

Sem o `.env.local`, tudo funciona em modo de teste local, sem login.

## 8. Próximos passos possíveis

- **Estoque** (fora desta versão, como pedido na especificação): os recebimentos já registram tudo o que entrou e podem alimentar um saldo quando o controle de saídas for criado.
- Tela de usuários e níveis de acesso (hoje feito por SQL).
