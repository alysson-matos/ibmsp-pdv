-- Icone do produto no visual retro (cantina): chocolate, bala, pirulito, salgadinho...
-- Vazio = o caixa escolhe pelo nome do produto.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS icon TEXT;
COMMENT ON COLUMN public.products.icon IS 'Pixel-art icon of the product in the retro look (e.g. chocolate, bala). NULL = guessed from the name.';
