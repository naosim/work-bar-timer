export type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'TIME_UP';
export type TimerMode = 'COUNT_DOWN' | 'COUNT_UP' | 'REPEAT';
export type RepeatPhase = 'WORK' | 'BREAK';

export interface TimerConfig {
  mode: TimerMode;
  durationSeconds: number;       // Countdown target duration
  repeatWorkSeconds: number;     // Pomodoro work duration
  repeatBreakSeconds: number;    // Pomodoro break duration
  repeatCycles: number;          // Total repetitions (1 to 99)
}

export interface Segment {
  index: number; // 0 to 19
  lit: boolean;
  color: 'red' | 'orange' | 'yellow' | 'green';
}

export class Timer {
  private state: TimerState = 'IDLE';
  private mode: TimerMode = 'COUNT_DOWN';

  // Config parameters
  private durationSeconds = 0; // default 0 minutes
  private repeatWorkSeconds = 1500; // default 25 minutes
  private repeatBreakSeconds = 300; // default 5 minutes
  private repeatCycles = 4; // default 4 cycles

  // Running states
  private elapsedSeconds = 0;
  private overtimeSeconds = 0;

  // Repeat specific states
  private currentCycle = 1;
  private currentPhase: RepeatPhase = 'WORK';
  private phaseElapsedSeconds = 0;

  // Callbacks
  private stateChangeCallback: ((state: TimerState) => void) | null = null;
  private timeUpCallback: (() => void) | null = null;
  private phaseTransitionCallback: ((phase: RepeatPhase, cycle: number) => void) | null = null;
  private tickCallback: (() => void) | null = null;

  constructor() {
    this.reset();
  }

  // --- Configuration ---
  public configure(config: Partial<TimerConfig>): void {
    if (config.mode !== undefined) {
      this.mode = config.mode;
    }
    if (config.durationSeconds !== undefined) {
      this.durationSeconds = Math.max(0, config.durationSeconds);
    }
    if (config.repeatWorkSeconds !== undefined) {
      this.repeatWorkSeconds = Math.max(0, config.repeatWorkSeconds);
    }
    if (config.repeatBreakSeconds !== undefined) {
      this.repeatBreakSeconds = Math.max(0, config.repeatBreakSeconds);
    }
    if (config.repeatCycles !== undefined) {
      this.repeatCycles = Math.max(1, Math.min(99, config.repeatCycles));
    }
    this.reset();
  }

  public getConfig(): TimerConfig {
    return {
      mode: this.mode,
      durationSeconds: this.durationSeconds,
      repeatWorkSeconds: this.repeatWorkSeconds,
      repeatBreakSeconds: this.repeatBreakSeconds,
      repeatCycles: this.repeatCycles,
    };
  }

  // --- Control APIs ---
  public start(): void {
    if (this.state === 'IDLE' || this.state === 'PAUSED') {
      this.setState('RUNNING');
    }
  }

  public pause(): void {
    if (this.state === 'RUNNING') {
      this.setState('PAUSED');
    }
  }

  /**
   * Adjusts the countdown duration by delta seconds without resetting elapsed time.
   * Only works in COUNT_DOWN mode. Clamps to [10, 199m50s].
   */
  public adjustDuration(deltaSeconds: number): void {
    if (this.mode !== 'COUNT_DOWN') return;

    const maxLimit = 199 * 60 + 50;
    this.durationSeconds = Math.max(10, Math.min(maxLimit, this.durationSeconds + deltaSeconds));
    this.triggerTick();
  }

  public reset(): void {
    this.setState('IDLE');
    this.elapsedSeconds = 0;
    this.overtimeSeconds = 0;
    this.currentCycle = 1;
    this.currentPhase = 'WORK';
    this.phaseElapsedSeconds = 0;
    this.triggerTick();
  }

  // --- Ticking ---
  public tick(deltaTimeSeconds: number): void {
    if (deltaTimeSeconds <= 0) return;

    if (this.state === 'TIME_UP') {
      if (this.mode === 'COUNT_DOWN') {
        this.overtimeSeconds += deltaTimeSeconds;
        this.triggerTick();
      }
      return;
    }

    if (this.state !== 'RUNNING') {
      return;
    }

    if (this.mode === 'COUNT_UP') {
      this.elapsedSeconds += deltaTimeSeconds;
      const maxStopwatchSeconds = 199 * 60 + 59;
      if (this.elapsedSeconds >= maxStopwatchSeconds) {
        this.elapsedSeconds = maxStopwatchSeconds;
        this.setState('TIME_UP');
        if (this.timeUpCallback) this.timeUpCallback();
      }
      this.triggerTick();
      return;
    }

    // COUNT_DOWN and REPEAT: advance current elapsed
    if (this.mode === 'COUNT_DOWN') {
      this.elapsedSeconds += deltaTimeSeconds;
    } else {
      this.phaseElapsedSeconds += deltaTimeSeconds;
    }

    const target = this.getCurrentTarget();
    const elapsed = this.getCurrentElapsed();

    if (elapsed >= target) {
      if (this.mode === 'COUNT_DOWN') {
        this.overtimeSeconds = elapsed - target;
        this.elapsedSeconds = target;
        this.setState('TIME_UP');
        if (this.timeUpCallback) this.timeUpCallback();
      } else {
        // REPEAT phase transition
        const excess = elapsed - target;
        this.phaseElapsedSeconds = 0;

        if (this.currentPhase === 'WORK') {
          this.currentPhase = 'BREAK';
          if (this.phaseTransitionCallback) {
            this.phaseTransitionCallback(this.currentPhase, this.currentCycle);
          }
          this.tick(excess);
        } else if (this.currentCycle < this.repeatCycles) {
          this.currentCycle++;
          this.currentPhase = 'WORK';
          if (this.phaseTransitionCallback) {
            this.phaseTransitionCallback(this.currentPhase, this.currentCycle);
          }
          this.tick(excess);
        } else {
          this.setState('TIME_UP');
          if (this.timeUpCallback) this.timeUpCallback();
        }
      }
    }

    this.triggerTick();
  }

  // --- Getters for UI Rendering ---
  public getState(): TimerState {
    return this.state;
  }

  public getMode(): TimerMode {
    return this.mode;
  }

  public getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  public getOvertimeSeconds(): number {
    return this.overtimeSeconds;
  }

  public getCurrentCycle(): number {
    return this.currentCycle;
  }

  public getCurrentPhase(): RepeatPhase {
    return this.currentPhase;
  }

  public getPhaseElapsedSeconds(): number {
    return this.phaseElapsedSeconds;
  }

  /** Current countdown target in seconds (0 for COUNT_UP). */
  private getCurrentTarget(): number {
    if (this.mode === 'COUNT_DOWN') return this.durationSeconds;
    if (this.mode === 'REPEAT')
      return this.currentPhase === 'WORK' ? this.repeatWorkSeconds : this.repeatBreakSeconds;
    return 0;
  }

  /** Current countdown elapsed in seconds (0 for COUNT_UP). */
  private getCurrentElapsed(): number {
    if (this.mode === 'REPEAT') return this.phaseElapsedSeconds;
    if (this.mode === 'COUNT_DOWN') return this.elapsedSeconds;
    return 0;
  }

  /**
   * Remaining seconds for COUNT_DOWN and REPEAT modes.
   * Returns 0 for TIME_UP and COUNT_UP.
   */
  public getRemainingSeconds(): number {
    if (this.mode === 'COUNT_UP' || this.state === 'TIME_UP') return 0;
    return Math.max(0, Math.ceil(this.getCurrentTarget() - this.getCurrentElapsed()));
  }

  /**
   * Returns the total remaining time across all remaining pomodoro phases.
   */
  public getTotalRemainingSeconds(): number {
    if (this.mode !== 'REPEAT') return 0;
    if (this.state === 'TIME_UP') return 0;
    if (this.state === 'IDLE') {
      return this.repeatCycles * (this.repeatWorkSeconds + this.repeatBreakSeconds);
    }

    let total = this.getRemainingSeconds();

    if (this.currentPhase === 'WORK') {
      total += this.repeatBreakSeconds;
    }

    total += (this.repeatCycles - this.currentCycle) * (this.repeatWorkSeconds + this.repeatBreakSeconds);

    return total;
  }

  /**
   * Calculates which of the 20 segments are lit and their respective colors.
   * Segments are ordered 0 (left/red) to 19 (right/green).
   */
  public getSegments(): Segment[] {
    let litCount = 0;

    if (this.mode === 'COUNT_UP') {
      // 1 segment = 10 minutes = 600 seconds
      litCount = Math.min(20, Math.floor(this.elapsedSeconds / 600));
    } else if (this.state === 'TIME_UP') {
      litCount = 0;
    } else if (this.state === 'IDLE') {
      litCount = this.mode === 'COUNT_DOWN' && this.durationSeconds === 0 ? 0 : 20;
    } else {
      const total = this.getCurrentTarget();
      const ratio = total > 0 ? this.getRemainingSeconds() / total : 0;
      litCount = Math.max(0, Math.min(20, Math.ceil(ratio * 20)));
    }

    const segments: Segment[] = [];
    for (let i = 0; i < 20; i++) {
      // Color determined by position (VBT20: Left/bottom are red, right/top are green)
      // i = 0..4 (Red), 5..9 (Orange), 10..14 (Yellow), 15..19 (Green)
      let color: 'red' | 'orange' | 'yellow' | 'green' = 'green';
      if (i < 5) {
        color = 'red';
      } else if (i < 10) {
        color = 'orange';
      } else if (i < 15) {
        color = 'yellow';
      }

      segments.push({
        index: i,
        lit: i < litCount,
        color
      });
    }

    return segments;
  }

  /**
   * Returns display string for digital clock (MM:SS) or (HH:MM:SS) if > 1 hour
   */
  public getDisplayTime(): { display: string; isOvertime: boolean } {
    let secondsToDisplay = 0;
    let isOvertime = false;

    if (this.mode === 'COUNT_DOWN' && this.state === 'TIME_UP') {
      secondsToDisplay = this.overtimeSeconds;
      isOvertime = true;
    } else if (this.mode === 'COUNT_UP') {
      secondsToDisplay = this.elapsedSeconds;
    } else {
      secondsToDisplay = this.getRemainingSeconds();
    }

    // Round up or down? Standard timers round down (floor), except that we want to show 
    // the exact seconds. So we do Math.floor.
    const roundedSeconds = Math.floor(secondsToDisplay);
    const hrs = Math.floor(roundedSeconds / 3600);
    const mins = Math.floor((roundedSeconds % 3600) / 60);
    const secs = roundedSeconds % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');

    if (hrs > 0) {
      return {
        display: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
        isOvertime
      };
    } else {
      return {
        display: `${pad(mins)}:${pad(secs)}`,
        isOvertime
      };
    }
  }

  // --- Callbacks registration ---
  public onStateChange(callback: (state: TimerState) => void): void {
    this.stateChangeCallback = callback;
  }

  public onTimeUp(callback: () => void): void {
    this.timeUpCallback = callback;
  }

  public onPhaseTransition(callback: (phase: RepeatPhase, cycle: number) => void): void {
    this.phaseTransitionCallback = callback;
  }

  public onTick(callback: () => void): void {
    this.tickCallback = callback;
  }

  // --- Internals ---
  private setState(state: TimerState): void {
    if (this.state !== state) {
      this.state = state;
      if (this.stateChangeCallback) {
        this.stateChangeCallback(state);
      }
    }
  }

  private triggerTick(): void {
    if (this.tickCallback) {
      this.tickCallback();
    }
  }
}
