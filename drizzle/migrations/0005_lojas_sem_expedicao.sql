-- Lojas "Sem expedição": venda direta, o cliente sai com o produto na mão.
-- Nessas lojas a venda já nasce entregue e nunca entra na fila da Expedição.

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS skip_shipping BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sales_deliver_on_direct_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stores WHERE id = NEW.store_id AND skip_shipping) THEN
    NEW.status := 'entregue';
    NEW.delivered_at := coalesce(NEW.delivered_at, NEW.created_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sales_deliver_on_direct_sale() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_deliver_on_direct_sale ON public.sales;
CREATE TRIGGER sales_deliver_on_direct_sale
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sales_deliver_on_direct_sale();
