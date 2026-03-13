export const DEFAULT_PAGE_SIZE = 20;
export const MAX_VISIBLE_PAGES = 7;
export const EDGE_OFFSET = 3;

type PaginationMetaInput = {
  page: number;
  pageSize: number;
  totalCount: number;
  itemsCount: number;
};

export type PaginationMeta = {
  pageCount: number;
  safePage: number;
  rangeStart: number;
  rangeEnd: number;
};

export function getPaginationMeta({ page, pageSize, totalCount, itemsCount }: PaginationMetaInput): PaginationMeta {
  const pageCount = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const safePage = pageCount === 0 ? 1 : Math.min(Math.max(1, page), pageCount);
  const startIndex = totalCount === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = totalCount === 0 ? 0 : Math.min(startIndex + itemsCount, totalCount);
  const rangeStart = totalCount === 0 || itemsCount === 0 ? 0 : startIndex + 1;
  const rangeEnd = totalCount === 0 || itemsCount === 0 ? 0 : endIndex;

  return { pageCount, safePage, rangeStart, rangeEnd };
}

export function computePaginationWindow(page: number, pageCount: number) {
  if (pageCount <= MAX_VISIBLE_PAGES) {
    return { start: 1, end: pageCount };
  }
  if (page <= EDGE_OFFSET + 1) {
    return { start: 1, end: MAX_VISIBLE_PAGES };
  }
  if (page >= pageCount - EDGE_OFFSET) {
    const start = Math.max(pageCount - MAX_VISIBLE_PAGES + 1, 1);
    return { start, end: pageCount };
  }
  return { start: page - EDGE_OFFSET, end: page + EDGE_OFFSET };
}
