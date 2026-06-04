/** Supabase/PostgREST default page size — queries without range() cap at this many rows. */
export const SUPABASE_PAGE_SIZE = 1000;

/** Safe batch size for `.in('id', ids)` filters (URL length limits). */
export const IN_QUERY_BATCH_SIZE = 150;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function fetchAllPaginated<T>(
  fetchPage: (
    offset: number,
    limit: number
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await fetchPage(offset, SUPABASE_PAGE_SIZE);
    if (error) throw new Error(error.message);
    const page = data || [];
    all.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
  }

  return all;
}
