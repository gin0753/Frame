export function paginationItems(current: number, total: number, radius = 2) {
  if (total <= 1 || current < 1 || current > total) return [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [
    ...new Set([
      1,
      total,
      ...Array.from(
        { length: radius * 2 + 1 },
        (_, i) => current - radius + i,
      ).filter((page) => page >= 1 && page <= total),
    ]),
  ].sort((a, b) => a - b);
  return pages.flatMap<number | 'ellipsis'>((page, i) => {
    const gap = i ? page - pages[i - 1] : 0;
    return gap === 2 ? [page - 1, page] : gap > 2 ? ['ellipsis', page] : [page];
  });
}
