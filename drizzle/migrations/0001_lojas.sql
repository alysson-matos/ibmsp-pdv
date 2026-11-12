-- Lojas (departamentos/eventos), usuários com senha própria e acessos por loja.
-- Todos os dados do PDV (produtos, operadores, vendas) passam a pertencer a uma loja.
-- Os dados existentes vão para a loja "IBMemorial", criada aqui.

CREATE TABLE IF NOT EXISTS public.stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64a99c' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  font TEXT NOT NULL DEFAULT 'space-grotesk',
  logo TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL CHECK (username = lower(username)),
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_key ON public.app_users (lower(username));

CREATE TABLE IF NOT EXISTS public.store_members (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operacao' CHECK (role IN ('operacao', 'gerente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);
CREATE INDEX IF NOT EXISTS store_members_user_idx ON public.store_members (user_id);

DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;
CREATE TRIGGER update_stores_updated_at
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_users_updated_at ON public.app_users;
CREATE TRIGGER update_app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fechadas ao navegador, como as demais tabelas: só o servidor (service_role) acessa.
REVOKE ALL ON public.stores FROM anon, authenticated;
REVOKE ALL ON public.app_users FROM anon, authenticated;
REVOKE ALL ON public.store_members FROM anon, authenticated;
GRANT ALL ON public.stores TO service_role;
GRANT ALL ON public.app_users TO service_role;
GRANT ALL ON public.store_members TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

-- Loja inicial com os dados que já existem.
INSERT INTO public.stores (id, name, color)
SELECT '00000000-0000-0000-0000-000000000001', 'IBMemorial', '#64a99c'
WHERE NOT EXISTS (SELECT 1 FROM public.stores);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);
ALTER TABLE public.operators ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);

UPDATE public.products SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;
UPDATE public.operators SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;
UPDATE public.sales SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;

ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.operators ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN store_id SET NOT NULL;

-- O mesmo código de barras pode existir em lojas diferentes.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_store_barcode_key ON public.products (store_id, barcode);

CREATE INDEX IF NOT EXISTS idx_operators_store ON public.operators (store_id, name);
CREATE INDEX IF NOT EXISTS idx_sales_store_created ON public.sales (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_store_status ON public.sales (store_id, status, created_at DESC);

-- Venda passa a receber a loja; produtos e operador precisam ser dessa loja.
DROP FUNCTION IF EXISTS public.checkout_sale(jsonb, text, text, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION public.checkout_sale(_store_id uuid, _items jsonb, _payment_method text, _customer_name text DEFAULT ''::text, _operator_id uuid DEFAULT NULL, _discount numeric DEFAULT 0, _amount_received numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _item JSONB;
  _product public.products%ROWTYPE;
  _qty INTEGER;
  _subtotal NUMERIC(10,2) := 0;
  _total NUMERIC(10,2);
  _change NUMERIC(10,2) := 0;
  _sale_id UUID;
  _operator public.operators%ROWTYPE;
BEGIN
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Loja nao informada';
  END IF;
  IF _payment_method NOT IN ('dinheiro','debito','credito','pix') THEN
    RAISE EXCEPTION 'Forma de pagamento invalida';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;
  IF _customer_name IS NULL OR btrim(_customer_name) = '' THEN
    RAISE EXCEPTION 'Informe o nome do comprador';
  END IF;
  IF _operator_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o operador da venda';
  END IF;
  SELECT * INTO _operator FROM public.operators WHERE id = _operator_id AND store_id = _store_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador nao encontrado ou inativo';
  END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::INTEGER;
    IF _qty IS NULL OR _qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade invalida';
    END IF;
    SELECT * INTO _product FROM public.products
    WHERE id = (_item->>'product_id')::UUID AND store_id = _store_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto nao encontrado';
    END IF;
    IF _product.stock < _qty THEN
      RAISE EXCEPTION 'Estoque insuficiente para %: restam %', _product.name, _product.stock;
    END IF;
    _subtotal := _subtotal + (_product.price * _qty);
  END LOOP;
  IF _discount IS NULL OR _discount < 0 THEN
    _discount := 0;
  END IF;
  IF _discount > _subtotal THEN
    RAISE EXCEPTION 'Desconto maior que o subtotal';
  END IF;
  _total := _subtotal - _discount;
  IF _payment_method = 'dinheiro' AND _amount_received IS NOT NULL THEN
    IF _amount_received < _total THEN
      RAISE EXCEPTION 'Valor recebido menor que o total';
    END IF;
    _change := _amount_received - _total;
  END IF;
  INSERT INTO public.sales (store_id, subtotal, discount, total, payment_method, amount_received, change_amount, customer_name, status, operator_id, operator_name)
  VALUES (_store_id, _subtotal, _discount, _total, _payment_method,
          CASE WHEN _payment_method = 'dinheiro' THEN _amount_received ELSE NULL END,
          _change, btrim(_customer_name), 'pendente', _operator.id, _operator.name)
  RETURNING id INTO _sale_id;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::INTEGER;
    SELECT * INTO _product FROM public.products WHERE id = (_item->>'product_id')::UUID;
    INSERT INTO public.sale_items (sale_id, product_id, product_name, barcode, unit_price, unit_cost, quantity, subtotal)
    VALUES (_sale_id, _product.id, _product.name, _product.barcode, _product.price, NULLIF(_product.cost, 0), _qty, _product.price * _qty);
    UPDATE public.products SET stock = stock - _qty WHERE id = _product.id;
    INSERT INTO public.stock_movements (product_id, delta, reason, sale_id)
    VALUES (_product.id, -_qty, 'venda', _sale_id);
  END LOOP;
  RETURN _sale_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.checkout_sale(uuid, jsonb, text, text, uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_sale(uuid, jsonb, text, text, uuid, numeric, numeric) TO service_role;
