# PDV com Controle de Inventário

Aplicação de ponto de venda para guichê: leitura de código de barras, carrinho na tela, escolha da forma de pagamento e baixa automática de estoque. Dados salvos no Lovable Cloud (banco de dados integrado).

## Telas

### 1. PDV (`/`) — tela principal do guichê
- Campo de leitura sempre focado: o leitor de código de barras digita o código e envia (Enter). O produto entra no carrinho automaticamente.
- Busca manual por nome/código, para quando o código não lê.
- Lista do carrinho: produto, preço unitário, quantidade (+/−), subtotal, remover item.
- Painel de total: subtotal, desconto opcional, total em destaque.
- Formas de pagamento: Dinheiro, Débito, Crédito, Pix (apenas registro, sem integração).
- Para Dinheiro: campo "valor recebido" e cálculo do troco.
- Botão Finalizar venda → grava a venda, baixa o estoque e mostra o comprovante na tela com opção de nova venda.
- Avisos de produto sem estoque ou código não encontrado.

### 2. Inventário (`/inventario`)
- Tabela de produtos: código de barras, nome, preço, estoque, status.
- Criar, editar e desativar produto.
- Ajuste rápido de estoque (entrada/saída) com motivo.
- Destaque para itens com estoque baixo ou zerado.

### 3. Histórico (`/historico`)
- Lista das vendas: data/hora, itens, total, forma de pagamento.
- Filtro por data e por forma de pagamento.
- Resumo do dia: número de vendas, faturamento total e total por forma de pagamento.
- Detalhe da venda ao clicar na linha.

## Banco de dados (Lovable Cloud)

- `products`: id, barcode (único), name, price, stock, active, timestamps.
- `sales`: id, total, discount, payment_method (dinheiro | debito | credito | pix), amount_received, change_amount, created_at.
- `sale_items`: id, sale_id, product_id, product_name, unit_price, quantity, subtotal (nome e preço copiados para preservar o histórico).
- `stock_movements`: id, product_id, delta, reason, created_at.

Finalização de venda em uma função no servidor, dentro de uma transação: valida estoque, cria a venda e os itens, e desconta o estoque. Assim duas vendas simultâneas não vendem o mesmo item.

Serão inseridos alguns produtos de exemplo com códigos de barras para você já conseguir testar a leitura.

## Detalhes técnicos

- TanStack Start + TanStack Query; leitura via `ensureQueryData` no loader e `useSuspenseQuery` no componente.
- Escritas por `createServerFn` (finalizar venda, CRUD de produtos, ajuste de estoque) com validação Zod.
- Tabelas em `public` com GRANTs e RLS habilitado. Como não haverá login nesta versão, as políticas permitirão acesso ao papel anônimo — o app é pensado para uso interno no guichê. Se depois você quiser login de operador, adicionamos autenticação e restringimos as políticas.
- Layout com navegação entre PDV, Inventário e Histórico; PDV otimizado para teclado (atalhos e foco automático no campo do leitor).
- Valores em BRL, formatados em pt-BR.

## Fora do escopo

- Integração real com adquirente/Pix.
- Impressão fiscal / NFC-e.
- Login e permissões de usuário.
