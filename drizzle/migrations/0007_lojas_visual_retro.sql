-- Lojas com "Visual retrô": o caixa usa o visual de desktop retrô (janela estilo
-- Windows 95). As outras lojas continuam com o visual padrão.

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS retro_look BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.stores.retro_look IS 'When enabled, the store uses the retro desktop look instead of the default one.';

-- A loja ACAMPA Z já nasce com o visual retrô.
UPDATE public.stores SET retro_look = true WHERE upper(btrim(name)) = 'ACAMPA Z';
