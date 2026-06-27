import { Timer, TimerMode, TimerConfig, TimerState } from './Timer';

// --- Global App Context ---
const timer = new Timer();
let lastTimestamp = performance.now();
let wakeLock: WakeLockSentinel | null = null;
let alarmInterval: any = null;
let lastBeepSecond = -1;

// --- DOM Elements ---
const digitalClock = document.getElementById('digital-clock') as HTMLDivElement;
const barDisplay = document.getElementById('bar-display') as HTMLDivElement;
const btnStartPause = document.getElementById('btn-start-pause') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const btnFullscreen = document.getElementById('btn-fullscreen') as HTMLButtonElement;
const btnPin = document.getElementById('btn-pin') as HTMLButtonElement;
const btnMinimize = document.getElementById('btn-minimize') as HTMLButtonElement;
const btnClose = document.getElementById('btn-close') as HTMLButtonElement;

// Badges
const badgeMode = document.getElementById('badge-mode') as HTMLSpanElement;
const badgeCycle = document.getElementById('badge-cycle') as HTMLSpanElement;
const badgePhase = document.getElementById('badge-phase') as HTMLSpanElement;

// Modal Elements
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
const modalClose = document.getElementById('modal-close') as HTMLButtonElement;

// Preferences Checkboxes
const prefMute = document.getElementById('pref-mute') as HTMLInputElement;
const prefFlash = document.getElementById('pref-flash') as HTMLInputElement;
const prefNotification = document.getElementById('pref-notification') as HTMLInputElement;
const prefWakelock = document.getElementById('pref-wakelock') as HTMLInputElement;

// Pomodoro Inline Controls
const pomodoroAdjustersGroup = document.querySelector('.pomodoro-adjusters-group') as HTMLDivElement;
const pomoCurrentValue = document.getElementById('pomo-current-value') as HTMLSpanElement;
const pomoRadioBtns = document.querySelectorAll('.pomo-radio');

let pomoSelectedTarget: 'work' | 'break' | 'cycles' = 'work';

// --- 20 Segments Initialization ---
let segmentElements: HTMLDivElement[] = [];

function initializeBarSegments() {
  barDisplay.innerHTML = '';
  segmentElements = [];
  for (let i = 0; i < 20; i++) {
    const seg = document.createElement('div');
    seg.classList.add('bar-segment');
    seg.dataset.index = i.toString();
    barDisplay.appendChild(seg);
    segmentElements.push(seg);
  }
}

// --- Audio Synthesizer (Web Audio API) ---
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playSound(frequency: number, type: OscillatorType, duration: number, volume: number = 0.1) {
  if (prefMute.checked) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio execution failed:', e);
  }
}

function playTransitionSound(type: 'start' | 'pause' | 'reset' | 'phase') {
  switch (type) {
    case 'start':
      playSound(880, 'sine', 0.1, 0.08); // High beep
      break;
    case 'pause':
      playSound(440, 'sine', 0.1, 0.08); // Lower beep
      break;
    case 'reset':
      playSound(587.33, 'sine', 0.15, 0.06); // Quick chord note
      break;
    case 'phase':
      // Short upward chime
      playSound(523.25, 'triangle', 0.12, 0.1); // C5
      setTimeout(() => playSound(659.25, 'triangle', 0.12, 0.1), 80); // E5
      setTimeout(() => playSound(783.99, 'triangle', 0.2, 0.1), 160); // G5
      break;
  }
}

function startAlarm() {
  stopAlarm();
  
  if (prefFlash.checked) {
    const flashOverlay = document.getElementById('flash-overlay');
    if (flashOverlay) {
      flashOverlay.classList.remove('hidden');
      flashOverlay.classList.add('flash-active');
    }
  }

  let counter = 0;
  alarmInterval = setInterval(() => {
    counter++;
    if (counter >= 15) { // Auto terminate alarm after 30 seconds
      stopAlarm();
    }
  }, 2000);
}

function stopAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  const flashOverlay = document.getElementById('flash-overlay');
  if (flashOverlay) {
    flashOverlay.classList.add('hidden');
    flashOverlay.classList.remove('flash-active');
  }
}

// --- OS / Desktop notifications ---
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

async function showNotification(title: string, message: string) {
  if (!prefNotification.checked) return;

  if (typeof Neutralino !== 'undefined') {
    try {
      await Neutralino.os.showNotification(title, message, 'INFO');
    } catch (e) {
      console.error('Neutralino notification failed:', e);
    }
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: message });
  }
}

// --- Screen Wake Lock (Browser) ---
async function requestWakeLock() {
  if (!prefWakelock.checked || !('wakeLock' in navigator)) return;
  try {
    if (!wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.warn('Wake Lock could not be acquired:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
    });
  }
}

// Handle document visibility change for wake lock
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
});

// --- Settings Modal ---
function openSettingsModal() {
  timer.pause();
  settingsModal.classList.remove('hidden');
  requestNotificationPermission();
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
}

// --- Time adjustment via Wheel Scroll (Dial simulation) ---
function handleTimeAdjustmentWheel(e: WheelEvent) {
  // Only countdown mode
  if (timer.getMode() !== 'COUNT_DOWN') return;

  const state = timer.getState();
  if (state !== 'IDLE' && state !== 'RUNNING' && state !== 'PAUSED') return;

  e.preventDefault();
  const delta = Math.sign(e.deltaY) * -1; // scroll up = increment, down = decrement

  // Choose step (Shift key = 10 seconds, else 60 seconds / 1 minute)
  const step = e.shiftKey ? 10 : 60;
  const adjustAmount = delta * step;

  if (state === 'IDLE') {
    const currentDuration = timer.getConfig().durationSeconds;
    const maxLimit = 199 * 60 + 50;
    const newDuration = Math.max(10, Math.min(maxLimit, currentDuration + adjustAmount));
    timer.configure({ durationSeconds: newDuration });
  } else {
    timer.adjustDuration(adjustAmount);
  }

  // Soft tick sound to represent physical dial ticks
  playSound(600, 'sine', 0.03, 0.04);
}

// --- UI Sync (Renderer) ---
function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updatePomodoroUI() {
  const config = timer.getConfig();
  if (pomoSelectedTarget === 'work') {
    pomoCurrentValue.textContent = formatMinutes(config.repeatWorkSeconds);
  } else if (pomoSelectedTarget === 'break') {
    pomoCurrentValue.textContent = formatMinutes(config.repeatBreakSeconds);
  } else {
    pomoCurrentValue.textContent = config.repeatCycles.toString();
  }

  pomoRadioBtns.forEach((btn) => {
    const htmlBtn = btn as HTMLButtonElement;
    const target = htmlBtn.dataset.pomoTarget as string;
    htmlBtn.classList.toggle('active', target === pomoSelectedTarget);
  });
}

function updatePauseButton(state: TimerState): void {
  if (state === 'RUNNING') {
    btnStartPause.classList.add('running-active');
    btnStartPause.innerHTML = '<span class="btn-icon">⏸</span>';
  } else {
    btnStartPause.classList.remove('running-active');
    btnStartPause.innerHTML = '<span class="btn-icon">▶</span>';
  }
}

function renderUI() {
  const state = timer.getState();
  const mode = timer.getMode();

  // 1. Digital Display
  const timeInfo = timer.getDisplayTime();
  digitalClock.textContent = (timeInfo.isOvertime ? '+' : '') + timeInfo.display;

  if (timeInfo.isOvertime) {
    digitalClock.classList.add('overtime-active');
  } else {
    digitalClock.classList.remove('overtime-active');
  }

  // 3. Status badges
  badgeMode.textContent = mode;
  if (mode === 'REPEAT') {
    badgeCycle.classList.remove('hidden');
    badgePhase.classList.remove('hidden');
    
    badgeCycle.textContent = `CYCLE ${timer.getCurrentCycle()}/${timer.getConfig().repeatCycles}`;
    
    const phase = timer.getCurrentPhase();
    badgePhase.textContent = phase;
    if (phase === 'WORK') {
      badgePhase.className = 'status-badge work-active';
    } else {
      badgePhase.className = 'status-badge break-active';
    }
  } else {
    badgeCycle.classList.add('hidden');
    badgePhase.classList.add('hidden');
  }

  // 4. Render 20 segments
  const segments = timer.getSegments();
  let litCount = segments.filter(s => s.lit).length;

  for (let i = 0; i < 20; i++) {
    const segEl = segmentElements[i];
    const segInfo = segments[i];

    // Clear classes
    segEl.className = 'bar-segment';

    if (segInfo.lit) {
      segEl.classList.add('lit', `color-${segInfo.color}`);
      
      // Pulse animation on the leading segment edge if running
      if (state === 'RUNNING' && i === litCount - 1) {
        segEl.classList.add('active-pulse');
      }
    }
  }

  // 5. Update mode selector active state
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    const htmlBtn = btn as HTMLButtonElement;
    if (htmlBtn.dataset.mode === mode) {
      htmlBtn.classList.add('active');
    } else {
      htmlBtn.classList.remove('active');
    }
  });

  // 6. Show/hide time adjuster buttons (COUNT_DOWN) and pomodoro adjusters (REPEAT)
  const adjustersGroup = document.querySelector('.time-adjusters-group');
  if (adjustersGroup) {
    if (mode === 'COUNT_DOWN') {
      adjustersGroup.classList.remove('mode-hidden');
    } else {
      adjustersGroup.classList.add('mode-hidden');
    }
  }
  if (pomodoroAdjustersGroup) {
    if (mode === 'REPEAT') {
      pomodoroAdjustersGroup.classList.remove('mode-hidden');
    } else {
      pomodoroAdjustersGroup.classList.add('mode-hidden');
    }
  }

  // Sync pomodoro inline display when in REPEAT mode
  if (mode === 'REPEAT') {
    updatePomodoroUI();
  }
}

// --- App Action Commands ---
function toggleStartPause() {
  const state = timer.getState();
  if (state === 'RUNNING') {
    timer.pause();
    playTransitionSound('pause');
    releaseWakeLock();
  } else {
    stopAlarm(); // stop alarm if playing
    timer.start();
    playTransitionSound('start');
    requestWakeLock();
  }
}

function handleReset() {
  stopAlarm();
  if (timer.getMode() === 'COUNT_DOWN') {
    timer.configure({ durationSeconds: 0 });
  } else {
    timer.reset();
  }
  playTransitionSound('reset');
  releaseWakeLock();
}

// --- Keyboard listeners ---
function handleKeyDown(e: KeyboardEvent) {
  // Prevent capturing key events when in form inputs or modals
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
    return;
  }

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    toggleStartPause();
  } else if (e.key === 'Escape' || e.code === 'Escape') {
    e.preventDefault();
    handleReset();
  }
}

// --- Browser Fullscreen mode ---
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error(`全画面表示エラー: ${err.message}`);
    });
    btnFullscreen.innerHTML = '<span class="btn-icon">🗗</span>';
  } else {
    document.exitFullscreen();
    btnFullscreen.innerHTML = '<span class="btn-icon">⛶</span>';
  }
}

// --- Desktop Mode (Neutralino API Interface) ---
let isAlwaysOnTop = true;

async function setupDesktopFeatures() {
  const isNeutralino = typeof Neutralino !== 'undefined' && typeof window.NL_PORT !== 'undefined';
  console.log('[VBT] Neutralino available:', isNeutralino);
  if (!isNeutralino) {
    console.warn('[VBT] Neutralino not found - desktop native features disabled');
    return;
  }

  // Apply desktop styling
  document.body.classList.add('is-desktop');
  const titlebarEl = document.getElementById('custom-titlebar');
  if (titlebarEl) titlebarEl.style.display = 'flex';

  try {
    // Initialize Neutralino
    await Neutralino.init();

    // Custom Drag Region (exclude titlebar controls from drag)
    await Neutralino.window.setDraggableRegion('custom-titlebar', {
      exclude: ['titlebar-controls']
    });

    // Titlebar Buttons Binding
    btnMinimize.addEventListener('click', async () => {
      await Neutralino.window.minimize();
    });

    btnClose.addEventListener('click', async () => {
      await Neutralino.app.exit();
    });

    btnPin.addEventListener('click', async () => {
      isAlwaysOnTop = !isAlwaysOnTop;
      await Neutralino.window.setAlwaysOnTop(isAlwaysOnTop);
      if (isAlwaysOnTop) {
        btnPin.classList.add('pin-active');
      } else {
        btnPin.classList.remove('pin-active');
      }
    });

    // Default always on top from config
    await Neutralino.window.setAlwaysOnTop(isAlwaysOnTop);

    // Register event for application close (optional cleanup)
    Neutralino.events.on('windowClose', () => {
      Neutralino.app.exit();
    });

  } catch (e) {
    console.warn('Desktop environment initialization failed:', e);
    alert('[Work Bar Timer] Desktop初期化エラー:\n' + (e instanceof Error ? e.message : String(e)));
  }
}

// --- Callback wiring from Domain Timer ---
timer.onStateChange(async (state) => {
  renderUI();
  updatePauseButton(state);
  
  if (state === 'TIME_UP') {
    // 0-second beep
    playSound(880, 'sine', 0.06, 0.08);
    lastBeepSecond = -1;

    startAlarm();
    showNotification('タイムアップ！', '設定されたタイマー時間が終了しました。');

    // Desktop taskbar attention (focus the window)
    if (typeof Neutralino !== 'undefined') {
      try {
        await Neutralino.window.focus();
      } catch (_e) { /* ignore */ }
    }
  }

  if (state === 'IDLE') {
    lastBeepSecond = -1;
  }
});

timer.onPhaseTransition((phase, cycle) => {
  renderUI();
  playTransitionSound('phase');
  
  const phaseLabel = phase === 'WORK' ? '作業時間' : '休憩時間';
  showNotification(
    `フェーズ移行: ${phaseLabel}`, 
    `サイクル ${cycle} の ${phaseLabel} を開始します。`
  );
  
  // Refresh wake lock in browser for continuous action
  requestWakeLock();
});

timer.onTick(() => {
  renderUI();

  // End beeps (3, 2, 1 seconds) for COUNT_DOWN and REPEAT
  const mode = timer.getMode();
  const state = timer.getState();
  if (state === 'RUNNING') {
    let remaining = -1;
    if (mode === 'COUNT_DOWN') {
      remaining = timer.getConfig().durationSeconds - timer.getElapsedSeconds();
    } else if (mode === 'REPEAT') {
      const target = timer.getCurrentPhase() === 'WORK'
        ? timer.getConfig().repeatWorkSeconds
        : timer.getConfig().repeatBreakSeconds;
      remaining = target - timer.getPhaseElapsedSeconds();
    }

    if (remaining > 0) {
      const nextSecond = Math.ceil(remaining);

      // Remaining increased (user added time / phase transition) → reset
      if (lastBeepSecond !== -1 && nextSecond > lastBeepSecond) {
        lastBeepSecond = -1;
      }

      if (nextSecond <= 3 && nextSecond !== lastBeepSecond) {
        lastBeepSecond = nextSecond;
        playSound(880, 'sine', 0.06, 0.08);
      }
    }
  }
});

// --- App Event Handlers ---
function setupEventListeners() {
  // Core actions
  btnStartPause.addEventListener('click', toggleStartPause);
  btnReset.addEventListener('click', handleReset);
  btnSettings.addEventListener('click', openSettingsModal);
  btnFullscreen.addEventListener('click', toggleFullscreen);

  // Mode selector buttons
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const mode = target.dataset.mode as TimerMode;
      stopAlarm();
      const config: Partial<TimerConfig> = { mode };
      if (mode === 'COUNT_DOWN' && timer.getConfig().durationSeconds === 0) {
        config.durationSeconds = 300;
      }
      timer.configure(config);
      renderUI();
    });
  });

  // Time adjustment buttons
  document.querySelectorAll('.adjust-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (timer.getMode() !== 'COUNT_DOWN') return;

      const state = timer.getState();
      if (state !== 'IDLE' && state !== 'RUNNING' && state !== 'PAUSED') return;

      const target = e.currentTarget as HTMLButtonElement;
      const adjustSeconds = parseInt(target.dataset.adjust || '0', 10);

      if (state === 'IDLE') {
        const currentDuration = timer.getConfig().durationSeconds;
        const maxLimit = 199 * 60 + 50;
        const newDuration = Math.max(10, Math.min(maxLimit, currentDuration + adjustSeconds));
        timer.configure({ durationSeconds: newDuration });
      } else {
        timer.adjustDuration(adjustSeconds);
      }

      playSound(600, 'sine', 0.03, 0.04);
    });
  });

  // Pomo radio toggle
  document.querySelectorAll('.pomo-radio').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      pomoSelectedTarget = target.dataset.pomoTarget as 'work' | 'break' | 'cycles';
      updatePomodoroUI();
    });
  });

  // Pomo adjust buttons (unified: work/break/cycles)
  document.querySelectorAll('[data-pomo-adjust]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (timer.getMode() !== 'REPEAT') return;
      const target = e.currentTarget as HTMLButtonElement;
      const delta = parseInt(target.dataset.pomoAdjust || '0', 10);
      const config = timer.getConfig();
      const update: Partial<TimerConfig> = {};

      if (pomoSelectedTarget === 'work') {
        const newVal = Math.max(0, Math.min(199 * 60 + 59, config.repeatWorkSeconds + delta));
        update.repeatWorkSeconds = newVal;
      } else if (pomoSelectedTarget === 'break') {
        const newVal = Math.max(0, Math.min(199 * 60 + 59, config.repeatBreakSeconds + delta));
        update.repeatBreakSeconds = newVal;
      } else {
        const newVal = Math.max(1, Math.min(99, config.repeatCycles + Math.sign(delta)));
        update.repeatCycles = newVal;
      }

      timer.configure(update);
      renderUI();
      playSound(600, 'sine', 0.03, 0.04);
    });
  });

  // Modal actions
  modalClose.addEventListener('click', closeSettingsModal);
  // Wheel scrolling (simulating dials)
  digitalClock.addEventListener('wheel', handleTimeAdjustmentWheel, { passive: false });
  barDisplay.addEventListener('wheel', handleTimeAdjustmentWheel, { passive: false });

  // Key shortcuts
  document.addEventListener('keydown', handleKeyDown);

  // Click on background in settings to dismiss modal
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
}

// --- Precise Loop (Delta Injector) ---
function mainLoop(timestamp: number) {
  const deltaTime = (timestamp - lastTimestamp) / 1000;
  
  // Avoid massive delta jumps if the tab/app goes backgrounded
  // If the user resumes, we catch up using normal ticks
  timer.tick(deltaTime);
  
  lastTimestamp = timestamp;
  requestAnimationFrame(mainLoop);
}

// --- Initialization Entry Point ---
window.addEventListener('DOMContentLoaded', async () => {
  initializeBarSegments();
  setupEventListeners();
  renderUI();
  updatePauseButton(timer.getState());
  
  // Desktop configuration check
  await setupDesktopFeatures();

  // Kick off precision ticks
  requestAnimationFrame((t) => {
    lastTimestamp = t;
    requestAnimationFrame(mainLoop);
  });
});
