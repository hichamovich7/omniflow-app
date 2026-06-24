interface PoolResult<T> {
  successes: T[];
  failures: Error[];
}

export async function promisePool<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem, index: number) => Promise<TResult>,
  concurrency: number
): Promise<PoolResult<TResult>> {
  const successes: TResult[] = [];
  const failures: Error[] = [];
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        const result = await fn(items[index], index);
        successes.push(result);
      } catch (err) {
        failures.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);

  return { successes, failures };
}
