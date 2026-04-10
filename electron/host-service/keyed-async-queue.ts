export function createKeyedAsyncQueue<TKey>() {
  const tails = new Map<TKey, Promise<void>>();

  return {
    enqueue<TResult>(key: TKey, task: () => Promise<TResult>) {
      let resolveResult: (value: TResult) => void = () => undefined;
      let rejectResult: (reason?: unknown) => void = () => undefined;
      const result = new Promise<TResult>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      const previous = tails.get(key) ?? Promise.resolve();
      const run = previous
        .catch(() => undefined)
        .then(async () => {
          const value = await task();
          resolveResult(value);
        })
        .catch((error) => {
          rejectResult(error);
          throw error;
        });

      const tail = run
        .catch(() => undefined)
        .finally(() => {
          if (tails.get(key) === tail) {
            tails.delete(key);
          }
        });

      tails.set(key, tail);
      return result;
    },
  };
}
