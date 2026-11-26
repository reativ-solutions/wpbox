const IDLE_WAIT_MS = 25;

export async function processQueue<Worker, Item>(
  workers: Worker[],
  queue: Item[],
  handle: (worker: Worker, item: Item) => Promise<void>,
): Promise<void> {
  let failure: unknown = null;
  let busy = 0;

  const drain = async (worker: Worker) => {
    while (failure === null && (queue.length > 0 || busy > 0)) {
      const item = queue.shift();
      if (item === undefined) {
        await sleep(IDLE_WAIT_MS);
        continue;
      }

      busy++;
      try {
        await handle(worker, item);
      } catch (error) {
        failure = error;
      } finally {
        busy--;
      }
    }
  };

  await Promise.all(workers.map(drain));
  if (failure !== null) throw failure;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
