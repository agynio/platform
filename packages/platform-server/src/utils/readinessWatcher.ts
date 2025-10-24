export class ReadinessWatcher {
  private started = false;
  private finished = false;
  start() { this.started = true; }
  finish() { this.finished = true; }
  isStarted() { return this.started; }
  isFinished() { return this.finished; }
}

