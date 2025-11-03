const EventEmitter = require('events');

class TimerService extends EventEmitter {
  constructor() {
    super();
    this.currentTime = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.targetEndTime = 0;
    this.interval = null;
  }

  _tick() {
    const remaining = Math.max(0, this.targetEndTime - Date.now());
    this.currentTime = remaining;
    this.emit('timer-update', this.currentTime);

    if (remaining === 0) {
      this.stop();
    }
  }

  start(durationMs) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.targetEndTime = Date.now() + durationMs;
    this.currentTime = durationMs;
    this.interval = setInterval(() => this._tick(), 100);
    this.emit('timer-start', this.currentTime);
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    clearInterval(this.interval);
    this.currentTime = Math.max(0, this.targetEndTime - Date.now());
    this.emit('timer-pause', this.currentTime);
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.targetEndTime = Date.now() + this.currentTime;
    this.interval = setInterval(() => this._tick(), 100);
    this.emit('timer-resume', this.currentTime);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.isPaused = false;
    clearInterval(this.interval);
    this.currentTime = 0;
    this.targetEndTime = 0;
    this.emit('timer-stop');
  }

  addTime(ms) {
    if (!this.isRunning) return;
    this.targetEndTime += ms;
    this.emit('time-added', { amount: ms });
    this._tick(); // Update immediately
  }

  subtractTime(ms) {
    if (!this.isRunning) return;
    const previousTarget = this.targetEndTime;
    this.targetEndTime = Math.max(Date.now(), this.targetEndTime - ms);
    const actualAmountSubtracted = previousTarget - this.targetEndTime;
    this.emit('time-subtracted', { amount: actualAmountSubtracted });
    this._tick(); // Update immediately
  }
}

module.exports = new TimerService();
