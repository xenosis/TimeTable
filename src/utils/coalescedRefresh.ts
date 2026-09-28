export function createCoalescedRefresh(refresh: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let refreshAgain = false;
  const run = async (): Promise<void> => {
    do {
      refreshAgain = false;
      await refresh();
    } while (refreshAgain);
  };
  return () => {
    if (running) {
      refreshAgain = true;
      return running;
    }
    running = run().finally(() => { running = null; });
    return running;
  };
}
