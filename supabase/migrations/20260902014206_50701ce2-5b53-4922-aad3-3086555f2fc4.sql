CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('dinheiro','debito','credito','pix')),
  amount_received NUMERIC(10,2),
  change_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  barcode TEXT,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'ajuste',
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX idx_sales_created ON public.sales(created_at DESC);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.sale_items TO service_role;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso publico produtos" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso publico vendas" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso publico itens" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso publico movimentos" ON public.stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.checkout_sale(
  _items JSONB,
  _payment_method TEXT,
  _discount NUMERIC DEFAULT 0,
  _amount_received NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.sales (subtotal, discount, total, payment_method, amount_received, change_amount)
  VALUES (_subtotal, _discount, _total, _payment_method,
          CASE WHEN _payment_method = 'dinheiro' THEN _amount_received ELSE NULL END,
          _change)
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
$$;

GRANT EXECUTE ON FUNCTION public.checkout_sale(JSONB, TEXT, NUMERIC, NUMERIC) TO anon, authenticated, service_role;

INSERT INTO public.products (barcode, name, price, stock, min_stock) VALUES
  ('7891000100103', 'Água Mineral 500ml', 4.00, 48, 10),
  ('7894900011517', 'Refrigerante Lata 350ml', 6.50, 36, 10),
  ('7622300807771', 'Chocolate ao Leite 90g', 8.90, 24, 6),
  ('7891910000197', 'Café Expresso', 7.00, 100, 20),
  ('7896004400112', 'Salgado Assado', 9.50, 30, 8),
  ('7891234567895', 'Sanduíche Natural', 15.00, 12, 4),
  ('7896102500110', 'Barra de Cereal', 5.50, 40, 10),
  ('7891000053508', 'Biscoito Recheado', 4.75, 25, 8);