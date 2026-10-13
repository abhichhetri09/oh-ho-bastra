// Requests that got a 401 while a refresh was in flight wait here and are
// retried (or rejected) once it settles.
type QueueEntry = {
  resolve: () => void;
  reject: (reason: unknown) => void;
};

let isRefreshing = false;
let queue: QueueEntry[] = [];

export function getIsRefreshing(): boolean {
  return isRefreshing;
}

export function setIsRefreshing(value: boolean): void {
  isRefreshing = value;
}

export function waitForRefresh(): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject });
  });
}

export function settleQueue(error: unknown): void {
  const waiting = queue;
  queue = [];
  waiting.forEach((entry) => (error ? entry.reject(error) : entry.resolve()));
}
