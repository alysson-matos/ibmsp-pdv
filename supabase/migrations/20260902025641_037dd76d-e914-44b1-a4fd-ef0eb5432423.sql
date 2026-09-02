DROP POLICY IF EXISTS "Acesso publico produtos" ON public.products;
DROP POLICY IF EXISTS "Acesso publico vendas" ON public.sales;
DROP POLICY IF EXISTS "Acesso publico itens" ON public.sale_items;
DROP POLICY IF EXISTS "Acesso publico movimentos" ON public.stock_movements;
DROP POLICY IF EXISTS "Acesso publico operadores" ON public.operators;

REVOKE ALL ON public.products FROM anon, authenticated;
REVOKE ALL ON public.sales FROM anon, authenticated;
REVOKE ALL ON public.sale_items FROM anon, authenticated;
REVOKE ALL ON public.stock_movements FROM anon, authenticated;
REVOKE ALL ON public.operators FROM anon, authenticated;

GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.sale_items TO service_role;
GRANT ALL ON public.stock_movements TO service_role;
GRANT ALL ON public.operators TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.checkout_sale(jsonb, text, text, uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_sale(jsonb, text, text, uuid, numeric, numeric) TO service_role;