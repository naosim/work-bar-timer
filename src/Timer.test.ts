import { describe, it, expect, vi } from 'vitest';
import { Timer } from './Timer';

describe('Timer Core Domain Tests', () => {
  it('should initialize with default countdown state', () => {
    const timer = new Timer();
    expect(timer.getState()).toBe('IDLE');
    expect(timer.getMode()).toBe('COUNT_DOWN');
    expect(timer.getElapsedSeconds()).toBe(0);
    expect(timer.getOvertimeSeconds()).toBe(0);
    expect(timer.getDisplayTime().display).toBe('00:00'); // Default 0 mins
    expect(timer.getDisplayTime().isOvertime).toBe(false);
    
    const segments = timer.getSegments();
    expect(segments.length).toBe(20);
    expect(segments.every(s => !s.lit)).toBe(true); // All unlit initially since duration is 0
  });

  it('should allow configuration of settings', () => {
    const timer = new Timer();
    timer.configure({
      mode: 'COUNT_UP',
      durationSeconds: 600,
    });
    expect(timer.getMode()).toBe('COUNT_UP');
    expect(timer.getConfig().durationSeconds).toBe(600);
    expect(timer.getState()).toBe('IDLE');
  });

  describe('Countdown Mode', () => {
    it('should adjust duration while running without resetting elapsed time', () => {
      const timer = new Timer();
      timer.configure({ mode: 'COUNT_DOWN', durationSeconds: 100 });

      const onTick = vi.fn();
      timer.onTick(onTick);

      timer.start();
      timer.tick(30);
      expect(timer.getElapsedSeconds()).toBe(30);
      expect(timer.getDisplayTime().display).toBe('01:10'); // 1:10 remaining
      expect(onTick).toHaveBeenCalledTimes(1);

      // Add 20 seconds while running
      timer.adjustDuration(20);
      expect(timer.getConfig().durationSeconds).toBe(120);
      expect(timer.getElapsedSeconds()).toBe(30); // unchanged
      expect(timer.getDisplayTime().display).toBe('01:30'); // 1:30 remaining
      expect(onTick).toHaveBeenCalledTimes(2); // tick callback fired

      // Subtract 5 seconds
      timer.adjustDuration(-5);
      expect(timer.getConfig().durationSeconds).toBe(115);
      expect(timer.getElapsedSeconds()).toBe(30);
      expect(timer.getDisplayTime().display).toBe('01:25');

      // Paused then adjust
      timer.pause();
      timer.adjustDuration(10);
      expect(timer.getConfig().durationSeconds).toBe(125);
      expect(timer.getElapsedSeconds()).toBe(30);

      // Resume and verify timer still works
      timer.start();
      timer.tick(95);
      expect(timer.getElapsedSeconds()).toBe(125);
      expect(timer.getState()).toBe('TIME_UP');
    });

    it('should not adjust duration in non-countdown modes', () => {
      const timer = new Timer();
      timer.configure({ mode: 'COUNT_UP' });
      timer.start();
      timer.adjustDuration(30);
      expect(timer.getConfig().durationSeconds).toBe(0); // unchanged
    });
    it('should run, update elapsed time, and trigger time-up', () => {
      const timer = new Timer();
      timer.configure({
        mode: 'COUNT_DOWN',
        durationSeconds: 100, // 100 seconds
      });

      const onStateChange = vi.fn();
      const onTimeUp = vi.fn();
      const onTick = vi.fn();

      timer.onStateChange(onStateChange);
      timer.onTimeUp(onTimeUp);
      timer.onTick(onTick);

      timer.start();
      expect(timer.getState()).toBe('RUNNING');
      expect(onStateChange).toHaveBeenCalledWith('RUNNING');

      // Tick 50s (50% remaining)
      timer.tick(50);
      expect(timer.getElapsedSeconds()).toBe(50);
      expect(timer.getDisplayTime().display).toBe('00:50');
      expect(timer.getDisplayTime().isOvertime).toBe(false);
      expect(onTick).toHaveBeenCalled();

      // Check segments (10 segments should be lit)
      const segmentsHalf = timer.getSegments();
      const litHalfCount = segmentsHalf.filter(s => s.lit).length;
      expect(litHalfCount).toBe(10);

      // Tick another 50s (time hits limit)
      timer.tick(50);
      expect(timer.getState()).toBe('TIME_UP');
      expect(onTimeUp).toHaveBeenCalled();
      expect(onStateChange).toHaveBeenCalledWith('TIME_UP');
      expect(timer.getDisplayTime().display).toBe('00:00');
      expect(timer.getDisplayTime().isOvertime).toBe(true);

      const segmentsEnd = timer.getSegments();
      expect(segmentsEnd.filter(s => s.lit).length).toBe(0); // 0 lit when time up

      // Tick while TIME_UP should increase overtime
      timer.tick(15);
      expect(timer.getOvertimeSeconds()).toBe(15);
      expect(timer.getDisplayTime().display).toBe('00:15');
      expect(timer.getDisplayTime().isOvertime).toBe(true);
    });

    it('should properly calculate segments rounding up', () => {
      const timer = new Timer();
      timer.configure({
        mode: 'COUNT_DOWN',
        durationSeconds: 100,
      });

      timer.start();
      // Tick 1s (99s left, 99% -> 19.8 segments. Ceils to 20 segments)
      timer.tick(1);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(20);

      // Tick 6s (94s left, 94% -> 18.8 segments. Ceils to 19 segments)
      timer.tick(5);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(19);

      // Tick to 99s (1s left, 1% -> 0.2 segments. Ceils to 1 segment)
      timer.tick(93);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(1);

      // Complete countdown
      timer.tick(1);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(0);
    });
  });

  describe('Countup Mode', () => {
    it('should count up and light segments every 10 minutes', () => {
      const timer = new Timer();
      timer.configure({ mode: 'COUNT_UP' });

      expect(timer.getSegments().filter(s => s.lit).length).toBe(0); // Starts empty

      timer.start();
      
      // Tick 5 minutes (300 seconds) - Still 0 segments
      timer.tick(300);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(0);
      expect(timer.getDisplayTime().display).toBe('05:00');

      // Tick to 10 minutes (600 seconds) - 1 segment lit
      timer.tick(300);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(1);
      expect(timer.getSegments()[0].color).toBe('red'); // Segment index 0 is red
      expect(timer.getDisplayTime().display).toBe('10:00');

      // Tick to 110 minutes (6600 seconds) - 11 segments lit
      timer.tick(6000);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(11);
      // Segment colors: index 0-4 (red), 5-9 (orange), 10-14 (yellow)
      const segments = timer.getSegments();
      expect(segments[0].color).toBe('red');
      expect(segments[5].color).toBe('orange');
      expect(segments[10].color).toBe('yellow');
      expect(segments[15].color).toBe('green');
      expect(segments[10].lit).toBe(true);
      expect(segments[11].lit).toBe(false);
      expect(timer.getDisplayTime().display).toBe('01:50:00'); // 1h 50m
    });
  });

  describe('Repeat (Pomodoro) Mode', () => {
    it('should transition through cycles and phase shifts', () => {
      const timer = new Timer();
      timer.configure({
        mode: 'REPEAT',
        repeatWorkSeconds: 10,
        repeatBreakSeconds: 5,
        repeatCycles: 2,
      });

      const onPhaseTransition = vi.fn();
      const onTimeUp = vi.fn();

      timer.onPhaseTransition(onPhaseTransition);
      timer.onTimeUp(onTimeUp);

      timer.start();
      expect(timer.getCurrentCycle()).toBe(1);
      expect(timer.getCurrentPhase()).toBe('WORK');

      // Tick 5s into cycle 1 Work
      timer.tick(5);
      expect(timer.getSegments().filter(s => s.lit).length).toBe(10); // 5/10 remaining -> 50% = 10 bars

      // Tick another 5s -> complete cycle 1 Work, transition to break
      timer.tick(5);
      expect(timer.getCurrentCycle()).toBe(1);
      expect(timer.getCurrentPhase()).toBe('BREAK');
      expect(onPhaseTransition).toHaveBeenCalledWith('BREAK', 1);

      // Tick 5s -> complete cycle 1 Break, transition to cycle 2 Work
      timer.tick(5);
      expect(timer.getCurrentCycle()).toBe(2);
      expect(timer.getCurrentPhase()).toBe('WORK');
      expect(onPhaseTransition).toHaveBeenCalledWith('WORK', 2);

      // Tick 10s -> complete cycle 2 Work, transition to cycle 2 Break
      timer.tick(10);
      expect(timer.getCurrentCycle()).toBe(2);
      expect(timer.getCurrentPhase()).toBe('BREAK');
      expect(onPhaseTransition).toHaveBeenCalledWith('BREAK', 2);

      // Tick 5s -> complete cycle 2 Break (final), trigger time-up
      timer.tick(5);
      expect(timer.getState()).toBe('TIME_UP');
      expect(onTimeUp).toHaveBeenCalled();
    });

    it('should pause and resume countdown correctly', () => {
    const timer = new Timer();
    timer.configure({ mode: 'COUNT_DOWN', durationSeconds: 100 });

    const onTick = vi.fn();
    timer.onTick(onTick);

    timer.start();
    expect(timer.getState()).toBe('RUNNING');

    timer.tick(30);
    expect(timer.getElapsedSeconds()).toBe(30);
    expect(onTick).toHaveBeenCalledTimes(1);

    // Pause
    timer.pause();
    expect(timer.getState()).toBe('PAUSED');

    // Tick does nothing while paused
    timer.tick(30);
    expect(timer.getElapsedSeconds()).toBe(30); // Not advanced
    expect(onTick).toHaveBeenCalledTimes(1); // No extra tick

    // Resume
    timer.start();
    expect(timer.getState()).toBe('RUNNING');

    timer.tick(50);
    expect(timer.getElapsedSeconds()).toBe(80);
  });

  it('should correctly toggle start/pause via start method', () => {
    const timer = new Timer();
    timer.configure({ mode: 'COUNT_DOWN', durationSeconds: 100 });

    timer.start();
    expect(timer.getState()).toBe('RUNNING');

    timer.pause();
    expect(timer.getState()).toBe('PAUSED');

    // start() with PAUSED state should resume (not reset)
    timer.start();
    expect(timer.getState()).toBe('RUNNING');

    timer.pause();
    expect(timer.getState()).toBe('PAUSED');

    // pause() with non-RUNNING state should be no-op
    timer.pause();
    expect(timer.getState()).toBe('PAUSED');
  });

  it('should carry over excess tick time to next phase', () => {
      const timer = new Timer();
      timer.configure({
        mode: 'REPEAT',
        repeatWorkSeconds: 10,
        repeatBreakSeconds: 5,
        repeatCycles: 2,
      });

      timer.start();
      // Tick 12s -> 2s overflow into Break
      timer.tick(12);
      expect(timer.getCurrentCycle()).toBe(1);
      expect(timer.getCurrentPhase()).toBe('BREAK');
      expect(timer.getPhaseElapsedSeconds()).toBe(2);
      expect(timer.getDisplayTime().display).toBe('00:03'); // 5s break - 2s elapsed = 3s remaining
    });
  });
});
