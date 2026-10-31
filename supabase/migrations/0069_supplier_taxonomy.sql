-- 0069 — Taxonomia de fornecedor: tags de "inclui" e capacidade do espaço (aditiva).
--
-- O fornecedor passa a declarar, no próprio cadastro, o que o seu serviço inclui
-- (ex.: buffet completo = comida + serviço + louça + bebidas; buffet simples = só
-- comida). O agente usa essas tags para avisar o cliente quando uma necessidade
-- fica de fora e precisa ser buscada à parte.
--
-- Espaços declaram a capacidade máxima de convidados e o tipo de espaço para o
-- agente comparar com o número de convidados do evento.
--
-- Nada aqui altera nem apaga dados existentes: as colunas nascem com default vazio
-- (tags) ou nulo (capacidade/tipo).

alter table public.suppliers
  add column if not exists inclui text[] not null default '{}'::text[],
  add column if not exists capacidade integer,
  add column if not exists tipo_espaco text;

alter table public.suppliers
  add constraint suppliers_capacidade_check
  check (capacidade is null or capacidade > 0) not valid;

comment on column public.suppliers.inclui is
  'Tags do que o serviço inclui (comida, servico, louca, bebidas, som, barman, banda, cantor_cerimonia, ...).';
comment on column public.suppliers.capacidade is
  'Capacidade máxima de convidados (só faz sentido para espaço/local).';
comment on column public.suppliers.tipo_espaco is
  'Tipo de espaço: salao, chacara, sitio, jardim, praia, hotel, clube, outro.';
