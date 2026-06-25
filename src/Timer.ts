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
      this.repeatWorkSeconds = Math.max(1, config.repeatWorkSeconds);
    }
    if (config.repeatBreakSeconds !== undefined) {
      this.repeatBreakSeconds = Math.max(1, config.repeatBreakSeconds);
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

    switch (this.mode) {
      case 'COUNT_DOWN':
        this.elapsedSeconds += deltaTimeSeconds;
        if (this.elapsedSeconds >= this.durationSeconds) {
          // Adjust overtime starting point
          this.overtimeSeconds = this.elapsedSeconds - this.durationSeconds;
          this.elapsedSeconds = this.durationSeconds;
          this.setState('TIME_UP');
          if (this.timeUpCallback) this.timeUpCallback();
        }
        break;

      case 'COUNT_UP':
        this.elapsedSeconds += deltaTimeSeconds;
        // Hard limit at 199m 59s
        const maxStopwatchSeconds = 199 * 60 + 59;
        if (this.elapsedSeconds >= maxStopwatchSeconds) {
          this.elapsedSeconds = maxStopwatchSeconds;
          this.setState('TIME_UP');
          if (this.timeUpCallback) this.timeUpCallback();
        }
        break;

      case 'REPEAT':
        this.phaseElapsedSeconds += deltaTimeSeconds;
        const currentTarget = this.currentPhase === 'WORK' ? this.repeatWorkSeconds : this.repeatBreakSeconds;
        
        if (this.phaseElapsedSeconds >= currentTarget) {
          // Carry over excess time to the next phase
          let excess = this.phaseElapsedSeconds - currentTarget;
          this.phaseElapsedSeconds = 0;

          if (this.currentPhase === 'WORK') {
            this.currentPhase = 'BREAK';
            if (this.phaseTransitionCallback) {
              this.phaseTransitionCallback(this.currentPhase, this.currentCycle);
            }
            // Tick remainder into break phase
            this.tick(excess);
          } else {
            // Break finished
            if (this.currentCycle < this.repeatCycles) {
              this.currentCycle++;
              this.currentPhase = 'WORK';
              if (this.phaseTransitionCallback) {
                this.phaseTransitionCallback(this.currentPhase, this.currentCycle);
              }
              // Tick remainder into next work cycle
              this.tick(excess);
            } else {
              // Entire Pomodoro repeat sequence finished
              this.setState('TIME_UP');
              if (this.timeUpCallback) this.timeUpCallback();
            }
          }
        }
        break;
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

  /**
   * Calculates which of the 20 segments are lit and their respective colors.
   * Segments are ordered 0 (left/red) to 19 (right/green).
   */
  public getSegments(): Segment[] {
    let litCount = 0;

    if (this.mode === 'COUNT_DOWN') {
      if (this.state === 'IDLE') {
        litCount = this.durationSeconds > 0 ? 20 : 0;
      } else if (this.state === 'TIME_UP') {
        litCount = 0;
      } else {
        const remaining = Math.max(0, this.durationSeconds - this.elapsedSeconds);
        const ratio = this.durationSeconds > 0 ? remaining / this.durationSeconds : 0;
        litCount = Math.max(0, Math.min(20, Math.ceil(ratio * 20)));
      }
    } else if (this.mode === 'COUNT_UP') {
      // 1 segment = 10 minutes = 600 seconds
      litCount = Math.min(20, Math.floor(this.elapsedSeconds / 600));
    } else if (this.mode === 'REPEAT') {
      if (this.state === 'IDLE') {
        litCount = 20;
      } else if (this.state === 'TIME_UP') {
        litCount = 0;
      } else {
        const currentTarget = this.currentPhase === 'WORK' ? this.repeatWorkSeconds : this.repeatBreakSeconds;
        const remaining = Math.max(0, currentTarget - this.phaseElapsedSeconds);
        const ratio = remaining / currentTarget;
        litCount = Math.max(0, Math.min(20, Math.ceil(ratio * 20)));
      }
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

    if (this.mode === 'COUNT_DOWN') {
      if (this.state === 'TIME_UP') {
        secondsToDisplay = this.overtimeSeconds;
        isOvertime = true;
      } else {
        secondsToDisplay = Math.max(0, this.durationSeconds - this.elapsedSeconds);
      }
    } else if (this.mode === 'COUNT_UP') {
      secondsToDisplay = this.elapsedSeconds;
    } else if (this.mode === 'REPEAT') {
      if (this.state === 'TIME_UP') {
        secondsToDisplay = 0;
      } else {
        const currentTarget = this.currentPhase === 'WORK' ? this.repeatWorkSeconds : this.repeatBreakSeconds;
        secondsToDisplay = Math.max(0, currentTarget - this.phaseElapsedSeconds);
      }
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
