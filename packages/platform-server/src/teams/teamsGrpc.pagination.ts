export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGES = 50;

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: bigint;
};

export const listAllPages = async <T>(
  fetchPage: (page: number, perPage: number) => Promise<PaginatedResponse<T>>,
): Promise<T[]> => {
  const items: T[] = [];
  let page = 1;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const response = await fetchPage(page, DEFAULT_PAGE_SIZE);
    const pageItems = response.items;
    items.push(...pageItems);
    const perPage = response.perPage;
    if (perPage === 0) {
      throw new Error('teams_pagination_per_page_zero');
    }
    const total = Number(response.total);
    const reachedEnd = response.page * perPage >= total;
    if (reachedEnd) break;
    if (pageItems.length === 0) break;
    page = response.page + 1;
  }
  return items;
};

export const readString = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
