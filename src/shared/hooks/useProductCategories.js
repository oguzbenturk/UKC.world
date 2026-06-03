// src/shared/hooks/useProductCategories.js
// Loads top-level product categories (built-in + staff-created custom) from the
// backend and merges them with the static built-in constant. Also hydrates the
// module-level registry in productCategories.js so the pure display helpers
// (getCategoryLabel / getCategoryIcon / resolveCategory) resolve custom
// categories everywhere — even in components that don't call this hook.

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi } from '@/shared/services/productApi';
import { CATEGORY_OPTIONS, registerCustomCategories } from '@/shared/constants/productCategories';

export const PRODUCT_CATEGORIES_QUERY_KEY = ['product-categories'];

export function useProductCategories(options = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PRODUCT_CATEGORIES_QUERY_KEY,
    queryFn: () => productApi.getCategories(),
    staleTime: 10 * 60_000,
    ...options,
  });

  const { data } = query;

  // Hydrate the registry whenever fresh data arrives.
  useEffect(() => {
    if (Array.isArray(data)) registerCustomCategories(data);
  }, [data]);

  // Merge built-in constants with DB rows. Built-ins keep their canonical order
  // and position; custom categories append after. The DB row wins for label/icon
  // of any value it provides (built-ins resolve to identical values).
  const categories = useMemo(() => {
    const byValue = new Map(
      CATEGORY_OPTIONS.map((o) => ({ ...o, isBuiltin: true, deletable: false })).map((o) => [o.value, o]),
    );
    for (const c of Array.isArray(data) ? data : []) {
      byValue.set(c.value, {
        value: c.value,
        label: c.display_name || c.label || c.value,
        icon: c.icon || '📦',
        isBuiltin: !!c.is_builtin,
        deletable: !c.is_builtin,
      });
    }
    return [...byValue.values()];
  }, [data]);

  // Invalidate the cached list after a create/delete so the merge re-runs.
  const refresh = () => queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_QUERY_KEY });

  return {
    categories,
    options: categories,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    refresh,
  };
}

export default useProductCategories;
