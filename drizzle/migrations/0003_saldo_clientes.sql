-- Venda com saldo do cliente: cada loja pode ativar a opção e cadastrar clientes
-- com saldo antecipado. A venda com "saldo" desconta do cliente e nunca deixa o
-- saldo negativo (checado na função e garantido pela restrição da tabela).

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS customer_balance BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_balance_not_negative CHECK (balance >= 0)
);
CREATE INDEX IF NOT EXISTS idx_customers_store ON public.customers (store_id, name);

DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.customer_balance_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  delta NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL DEFAULT 'credito',
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_movements_customer
  ON public.customer_balance_movements (customer_id, created_at DESC);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('dinheiro','debito','credito','pix','saldo'));

REVOKE ALL ON public.customers FROM anon, authenticated;
REVOKE ALL ON public.customer_balance_movements FROM anon, authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.customer_balance_movements TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_balance_movements ENABLE ROW LEVEL SECURITY;

-- Credita (delta > 0) ou debita (delta < 0) o saldo, registrando no extrato.
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(_store_id uuid, _customer_id uuid, _delta numeric, _reason text DEFAULT 'credito')
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _balance NUMERIC(10,2);
BEGIN
  IF _delta IS NULL OR _delta = 0 THEN
    RAISE EXCEPTION 'Informe um valor';
  END IF;
  SELECT balance INTO _balance FROM public.customers
  WHERE id = _customer_id AND store_id = _store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado';
  END IF;
  IF _balance + _delta < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente: o cliente tem R$ %', to_char(_balance, 'FM999999990.00');
  END IF;
  UPDATE public.customers SET balance = balance + _delta WHERE id = _customer_id
  RETURNING balance INTO _balance;
  INSERT INTO public.customer_balance_movements (customer_id, delta, balance_after, reason)
  VALUES (_customer_id, _delta, _balance, coalesce(nullif(btrim(_reason), ''), 'credito'));
  RETURN _balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_customer_balance(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_customer_balance(uuid, uuid, numeric, text) TO service_role;

DROP FUNCTION IF EXISTS public.checkout_sale(uuid, jsonb, text, text, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION public.checkout_sale(_store_id uuid, _items jsonb, _payment_method text, _customer_name text DEFAULT ''::text, _operator_id uuid DEFAULT NULL, _discount numeric DEFAULT 0, _amount_received numeric DEFAULT NULL::numeric, _customer_id uuid DEFAULT NULL)
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
  _customer public.customers%ROWTYPE;
  _balance NUMERIC(10,2);
BEGIN
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Loja nao informada';
  END IF;
  IF _payment_method NOT IN ('dinheiro','debito','credito','pix','saldo') THEN
    RAISE EXCEPTION 'Forma de pagamento invalida';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;
  IF _operator_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o operador da venda';
  END IF;
  SELECT * INTO _operator FROM public.operators WHERE id = _operator_id AND store_id = _store_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador nao encontrado ou inativo';
  END IF;

  IF _payment_method = 'saldo' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = _store_id AND customer_balance) THEN
      RAISE EXCEPTION 'Esta loja nao aceita pagamento com saldo';
    END IF;
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'Selecione o cliente para pagar com saldo';
    END IF;
    -- Locks the customer so two simultaneous sales can't spend the same balance.
    SELECT * INTO _customer FROM public.customers
    WHERE id = _customer_id AND store_id = _store_id AND active FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente nao encontrado ou inativo';
    END IF;
    _customer_name := _customer.name;
  ELSE
    _customer_id := NULL;
  END IF;

  IF _customer_name IS NULL OR btrim(_customer_name) = '' THEN
    RAISE EXCEPTION 'Informe o nome do comprador';
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
  IF _payment_method = 'saldo' AND _customer.balance < _total THEN
    RAISE EXCEPTION 'Saldo insuficiente: % tem R$ % e a compra custa R$ %',
      _customer.name, to_char(_customer.balance, 'FM999999990.00'), to_char(_total, 'FM999999990.00');
  END IF;

  INSERT INTO public.sales (store_id, subtotal, discount, total, payment_method, amount_received, change_amount, customer_name, customer_id, status, operator_id, operator_name)
  VALUES (_store_id, _subtotal, _discount, _total, _payment_method,
          CASE WHEN _payment_method = 'dinheiro' THEN _amount_received ELSE NULL END,
          _change, btrim(_customer_name), _customer_id, 'pendente', _operator.id, _operator.name)
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

  IF _payment_method = 'saldo' AND _total > 0 THEN
    UPDATE public.customers SET balance = balance - _total WHERE id = _customer_id
    RETURNING balance INTO _balance;
    INSERT INTO public.customer_balance_movements (customer_id, delta, balance_after, reason, sale_id)
    VALUES (_customer_id, -_total, _balance, 'venda', _sale_id);
  END IF;
  RETURN _sale_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.checkout_sale(uuid, jsonb, text, text, uuid, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_sale(uuid, jsonb, text, text, uuid, numeric, numeric, uuid) TO service_role;
