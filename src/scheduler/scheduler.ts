export interface Scheduler {
  start(): void;
  stop(): void;
}

export class NoopScheduler implements Scheduler {
  start(): void {}
  stop(): void {}
}
