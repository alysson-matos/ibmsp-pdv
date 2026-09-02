CREATE TABLE public.operators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operators TO anon, authenticated;
GRANT ALL ON public.operators TO service_role;

ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso publico operadores" ON public.operators FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_operators_updated_at
BEFORE UPDATE ON public.operators
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.operators (name) VALUES ('Ana Souza'), ('Bruno Lima'), ('Carla Mendes');

ALTER TABLE public.sales ADD COLUMN operator_id UUID REFERENCES public.operators(id),
                        ADD COLUMN operator_name TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_sales_operator ON public.sales (operator_id, created_at DESC);

DROP FUNCTION IF EXISTS public.checkout_sale(jsonb, text, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.checkout_sale(_items jsonb, _payment_method text, _customer_name text DEFAULT ''::text, _operator_id uuid DEFAULT NULL, _discount numeric DEFAULT 0, _amount_received numeric DEFAULT NULL::numeric)
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

  SELECT * INTO _operator FROM public.operators WHERE id = _operator_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador nao encontrado ou inativo';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::INTEGER;
    IF _qty IS NULL OR _qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade invalida';
    END IF;

    SELECT * INTO _product FROM public.products
    WHERE id = (_item->>'product_id')::UUID FOR UPDATE;

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

  INSERT INTO public.sales (subtotal, discount, total, payment_method, amount_received, change_amount, customer_name, status, operator_id, operator_name)
  VALUES (_subtotal, _discount, _total, _payment_method,
          CASE WHEN _payment_method = 'dinheiro' THEN _amount_received ELSE NULL END,
          _change, btrim(_customer_name), 'pendente', _operator.id, _operator.name)
  RETURNING id INTO _sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::INTEGER;
    SELECT * INTO _product FROM public.products WHERE id = (_item->>'product_id')::UUID;

    INSERT INTO public.sale_items (sale_id, product_id, product_name, barcode, unit_price, quantity, subtotal)
    VALUES (_sale_id, _product.id, _product.name, _product.barcode, _product.price, _qty, _product.price * _qty);

    UPDATE public.products SET stock = stock - _qty WHERE id = _product.id;

    INSERT INTO public.stock_movements (product_id, delta, reason, sale_id)
    VALUES (_product.id, -_qty, 'venda', _sale_id);
  END LOOP;

  RETURN _sale_id;
END;
$function$;