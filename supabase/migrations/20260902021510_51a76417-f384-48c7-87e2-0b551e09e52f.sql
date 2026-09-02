ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

UPDATE public.sales SET status = 'entregue', delivered_at = created_at WHERE delivered_at IS NULL AND status = 'pendente';

CREATE INDEX IF NOT EXISTS sales_status_idx ON public.sales (status, created_at DESC);

DROP FUNCTION IF EXISTS public.checkout_sale(jsonb, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.checkout_sale(_items jsonb, _payment_method text, _customer_name text DEFAULT '', _discount numeric DEFAULT 0, _amount_received numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
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

  INSERT INTO public.sales (subtotal, discount, total, payment_method, amount_received, change_amount, customer_name, status)
  VALUES (_subtotal, _discount, _total, _payment_method,
          CASE WHEN _payment_method = 'dinheiro' THEN _amount_received ELSE NULL END,
          _change, btrim(_customer_name), 'pendente')
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