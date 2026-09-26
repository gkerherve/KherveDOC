/**
 * Talks to the calculation worker (public/kherve-cell/engine-worker.js):
 * KherveSheet's engine running in Pyodide.
 */

/** [sheet id, row, col, text shown] */
export type TextChange = [string | null, number, number, string];

type Operation =
  | 'render_chart'
  | 'fit'
  | 'solve'
  | 'reset'
  | 'set_cells'
  | 'set_formats'
  | 'add_sheet'
  | 'rename_sheet'
  | 'remove_sheet';

interface Reply {
  id?: number;
  type?: 'ready' | 'scipy';
  ok?: boolean;
  result?: unknown;
  error?: string;
}

export class CellEngine {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  /** Serialises requests: each sees the state the previous one left. */
  private queue: Promise<unknown> = Promise.resolve();

  readonly ready: Promise<void>;
  onScienceReady?: () => void;

  constructor(url = '/kherve-cell/engine-worker.js') {
    this.worker = new Worker(url);
    let markReady: () => void = () => undefined;
    this.ready = new Promise((resolve) => (markReady = resolve));
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      if (reply.type === 'ready') {
        markReady();
        return;
      }
      if (reply.type === 'scipy') {
        this.onScienceReady?.();
        return;
      }
      const waiting = reply.id ? this.pending.get(reply.id) : undefined;
      if (!waiting || !reply.id) {
        return;
      }
      this.pending.delete(reply.id);
      if (reply.ok) {
        waiting.resolve(reply.result);
      } else {
        waiting.reject(new Error(reply.error));
      }
    };
  }

  /**
   * Run *op* in the engine. *needs* lists Pyodide packages to load first
   * ("matplotlib", or "pypi:lmfit" from PyPI), once per session.
   */
  call<T>(op: Operation, payload: unknown, needs: string[] = []): Promise<T> {
    const run = () =>
      new Promise<T>((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, {
          resolve: resolve as (v: unknown) => void,
          reject,
        });
        this.worker.postMessage({ id, op, payload, needs });
      });
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  terminate() {
    this.worker.terminate();
  }
}
