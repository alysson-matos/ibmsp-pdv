import { queryOptions } from "@tanstack/react-query";

import { listCustomers } from "@/lib/customers.functions";
import { listOperators, listProducts } from "@/lib/pos.functions";

/** Queries of the PDV screen, shared by its default and retro versions. */
export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () => listProducts(),
});

export const operatorsQuery = queryOptions({
  queryKey: ["operators"],
  queryFn: () => listOperators(),
});

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () => listCustomers(),
});

export const OPERATOR_STORAGE_KEY = "pdv:operator-id";
