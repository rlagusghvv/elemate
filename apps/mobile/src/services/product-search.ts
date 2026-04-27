const productSearchBaseUrl =
  process.env.EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL?.replace(/\/$/, '') ?? '';

export type ProductSearchResult = {
  id: string;
  title: string;
  brand: string;
  maker: string;
  mallName: string;
  image: string;
  link: string;
  price: number;
  priceLabel: string;
  categories: string[];
};

export function hasProductSearchProxy() {
  return productSearchBaseUrl.length > 0;
}

export async function searchProducts(query: string) {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  if (!hasProductSearchProxy()) {
    throw new Error('PRODUCT_SEARCH_PROXY_MISSING');
  }

  const response = await fetch(
    `${productSearchBaseUrl}/search/products?q=${encodeURIComponent(trimmedQuery)}`,
  );

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as {
    items?: ProductSearchResult[];
  };

  return payload.items ?? [];
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error ?? `PRODUCT_SEARCH_FAILED_${response.status}`;
  } catch {
    return `PRODUCT_SEARCH_FAILED_${response.status}`;
  }
}
