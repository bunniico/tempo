const storageKeys = {
  settings: 'tempo:settings',
  stats: 'tempo:stats',
  breakCredit: 'tempo:break-credit',
  completionLog: 'tempo:completion-log'
};

const defaultSettings = {
  focusDuration: 25 * 60,
  breakPerPomodoro: 5 * 60,
  breakCreditRate: 0.2,
  alertSound: 'chime',
  continueAfterTarget: false
};

const defaultStats = {
  pomodoros: 0,
  totalFocusSeconds: 0,
  totalBreakSeconds: 0,
  breakSessions: 0
};

const settings = loadSettings();
const stats = loadStats();
const completionLog = loadCompletionLog();
let breakCreditSeconds = loadBreakCredit();

const MAX_LOG_ITEMS = 12;

const soundProfiles = {
  chime: {
    type: 'triangle',
    gain: 0.1,
    pattern: [
      { freq: 880, duration: 0.25 },
      { freq: 660, duration: 0.32 },
      { freq: 990, duration: 0.2 }
    ]
  },
  bell: {
    type: 'sine',
    gain: 0.1,
    pattern: [
      { freq: 660, duration: 0.2 },
      { freq: 660, duration: 0.15 },
      { freq: 520, duration: 0.35 },
      { freq: 660, duration: 0.2 }
    ]
  },
  pulse: {
    type: 'square',
    gain: 0.1,
    pattern: [
      { freq: 420, duration: 0.4 },
      { freq: 0, duration: 0.12 },
      { freq: 420, duration: 0.4 }
    ]
  }
};

const focusState = {
  remainingSeconds: settings.focusDuration,
  elapsedSeconds: 0,
  running: false,
  timerId: null,
  targetReached: false,
  lastTick: null
};

const breakState = {
  elapsedSeconds: 0,
  running: false,
  timerId: null,
  lastTick: null
};

const focusDisplay = document.getElementById('focus-display');
const focusStatus = document.getElementById('focus-status');
const focusStartBtn = document.getElementById('focus-start');
const focusPauseBtn = document.getElementById('focus-pause');
const focusResetBtn = document.getElementById('focus-reset');

const breakCreditDisplay = document.getElementById('break-credit-display');
const breakDisplay = document.getElementById('break-display');
const breakStatus = document.getElementById('break-status');
const breakStartBtn = document.getElementById('break-start');
const breakPauseBtn = document.getElementById('break-pause');
const breakResetBtn = document.getElementById('break-reset');

const focusHoursInput = document.getElementById('focus-hours');
const focusMinutesInput = document.getElementById('focus-minutes');
const breakHoursInput = document.getElementById('break-hours');
const breakMinutesInput = document.getElementById('break-minutes');
const breakRateInput = document.getElementById('break-credit-rate');
const alertSoundSelect = document.getElementById('alert-sound');
const continueAfterTargetInput = document.getElementById('continue-after-target');
const notificationBtn = document.getElementById('enable-notifications');
const settingsForm = document.getElementById('settings-form');
const resetStatsBtn = document.getElementById('reset-stats');
const logList = document.getElementById('completion-log');
const clearLogBtn = document.getElementById('clear-log');

const statPomodoros = document.getElementById('stat-pomodoros');
const statTotalFocus = document.getElementById('stat-total-focus');
const statAvgFocus = document.getElementById('stat-avg-focus');
const statAvgBreak = document.getElementById('stat-avg-break');

let alertAudioCtx = null;

init();

function init() {
  setTimeInputs(focusHoursInput, focusMinutesInput, settings.focusDuration);
  setTimeInputs(breakHoursInput, breakMinutesInput, settings.breakPerPomodoro);
  breakRateInput.value = settings.breakCreditRate;
  if (continueAfterTargetInput) {
    continueAfterTargetInput.checked = settings.continueAfterTarget;
  }
  if (alertSoundSelect) {
    alertSoundSelect.value = settings.alertSound;
    if (alertSoundSelect.value !== settings.alertSound) {
      alertSoundSelect.value = defaultSettings.alertSound;
      settings.alertSound = defaultSettings.alertSound;
      persistSettings();
    }
  }

  updateFocusDisplay();
  updateBreakDisplay();
  updateBreakCreditDisplay();
  updateStatsDisplay();
  updateCompletionLog();
  updateButtons();

  focusStartBtn.addEventListener('click', startFocusTimer);
  focusPauseBtn.addEventListener('click', handleFocusPauseClick);
  focusResetBtn.addEventListener('click', resetFocusTimer);

  breakStartBtn.addEventListener('click', startBreakTimer);
  breakPauseBtn.addEventListener('click', pauseBreakTimer);
  breakResetBtn.addEventListener('click', resetBreakTimer);

  settingsForm.addEventListener('submit', handleSettingsSubmit);
  resetStatsBtn.addEventListener('click', handleStatsReset);
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', handleClearLog);
  }
  setupNotificationButton();
  document.addEventListener('pointerdown', warmAudioContext, { once: true });
}

function startFocusTimer() {
  if (focusState.running) return;
  if (focusState.elapsedSeconds === 0) {
    focusState.targetReached = false;
  }
  focusState.running = true;
  focusState.lastTick = Date.now();
  focusStatus.textContent = 'Running';
  toggleStatus(focusStatus, true);
  focusStartBtn.disabled = true;
  focusPauseBtn.disabled = false;
  focusState.timerId = setInterval(focusTick, 1000);
  focusTick();
}

function handleFocusPauseClick() {
  pauseFocusTimer();
  if (settings.continueAfterTarget && focusState.targetReached) {
    completePomodoro();
  }
}

function pauseFocusTimer() {
  if (!focusState.running) return;
  applyFocusDelta();
  if (!focusState.running) {
    return;
  }
  stopFocusInterval();
  focusState.running = false;
  focusState.lastTick = null;
  focusStatus.textContent = 'Paused';
  toggleStatus(focusStatus, false);
  focusStartBtn.disabled = false;
  focusPauseBtn.disabled = true;
}

function stopFocusInterval() {
  if (focusState.timerId) {
    clearInterval(focusState.timerId);
    focusState.timerId = null;
  }
  focusState.lastTick = null;
}

function focusTick() {
  if (!focusState.running) return;
  applyFocusDelta();
}

function applyFocusDelta() {
  if (!focusState.running) {
    return 0;
  }
  const now = Date.now();
  const last = focusState.lastTick ?? now;
  let delta = (now - last) / 1000;
  focusState.lastTick = now;
  if (!Number.isFinite(delta) || delta <= 0) {
    return 0;
  }
  focusState.elapsedSeconds += delta;
  focusState.remainingSeconds = settings.focusDuration - focusState.elapsedSeconds;
  addBreakCredit(settings.breakCreditRate * delta);
  if (!focusState.targetReached && focusState.remainingSeconds <= 0) {
    handleFocusTargetReached();
  }
  updateFocusDisplay();
  if (!settings.continueAfterTarget && focusState.targetReached) {
    completePomodoro();
  }
  return delta;
}

function resetFocusTimer() {
  pauseFocusTimer();
  focusState.remainingSeconds = settings.focusDuration;
  focusState.elapsedSeconds = 0;
  focusState.targetReached = false;
  focusState.lastTick = null;
  focusStatus.textContent = 'Idle';
  toggleStatus(focusStatus, false);
  updateFocusDisplay();
  updateButtons();
}

function completePomodoro() {
  stopFocusInterval();
  focusState.running = false;
  const workedSeconds = focusState.elapsedSeconds || settings.focusDuration;
  stats.pomodoros += 1;
  stats.totalFocusSeconds += workedSeconds;
  persistStats();

  addBreakCredit(settings.breakPerPomodoro);
  recordCompletion(workedSeconds);

  focusState.remainingSeconds = settings.focusDuration;
  focusState.elapsedSeconds = 0;
  focusState.targetReached = false;
  focusState.lastTick = null;
  focusStatus.textContent = 'Complete';
  toggleStatus(focusStatus, false);
  updateFocusDisplay();
  updateStatsDisplay();
  updateButtons();
}

function startBreakTimer() {
  if (breakState.running) return;
  breakState.running = true;
  breakState.lastTick = Date.now();
  breakStatus.textContent = 'Running';
  toggleStatus(breakStatus, true);
  breakStartBtn.disabled = true;
  breakPauseBtn.disabled = false;
  breakState.timerId = setInterval(breakTick, 1000);
  breakTick();
}

function pauseBreakTimer() {
  if (!breakState.running) return;
  applyBreakDelta();
  stopBreakInterval();
  breakState.running = false;
  breakState.lastTick = null;
  breakStatus.textContent = 'Paused';
  toggleStatus(breakStatus, false);
  breakStartBtn.disabled = false;
  breakPauseBtn.disabled = true;
  if (breakState.elapsedSeconds > 0) {
    stats.totalBreakSeconds += breakState.elapsedSeconds;
    stats.breakSessions += 1;
    persistStats();
    updateStatsDisplay();
  }
}

function resetBreakCredit() {
  if (!confirm('Reset break credit to zero?')) {
    return;
  }
  breakCreditSeconds = 0;
  persistBreakCredit();
  updateBreakCreditDisplay();
}

function resetBreakTimer() {
  const wasRunning = breakState.running;
  pauseBreakTimer();
  if (wasRunning) {
    // avoid double-counting as pause already recorded stats
    stats.totalBreakSeconds = Math.max(0, stats.totalBreakSeconds - breakState.elapsedSeconds);
    stats.breakSessions = Math.max(0, stats.breakSessions - 1);
    persistStats();
    updateStatsDisplay();
  }
  breakState.elapsedSeconds = 0;
  breakStatus.textContent = 'Idle';
  toggleStatus(breakStatus, false);
  updateBreakDisplay();
  updateButtons();
}

function breakTick() {
  if (!breakState.running) return;
  applyBreakDelta();
}

function applyBreakDelta() {
  if (!breakState.running) {
    return 0;
  }
  const now = Date.now();
  const last = breakState.lastTick ?? now;
  const delta = (now - last) / 1000;
  breakState.lastTick = now;
  if (!Number.isFinite(delta) || delta <= 0) {
    return 0;
  }
  breakState.elapsedSeconds += delta;
  addBreakCredit(-delta);
  updateBreakDisplay();
  updateBreakCreditDisplay();
  return delta;
}

function stopBreakInterval() {
  if (breakState.timerId) {
    clearInterval(breakState.timerId);
    breakState.timerId = null;
  }
  breakState.lastTick = null;
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const focusHours = clampInt(focusHoursInput.value);
  const focusMinutes = clampInt(focusMinutesInput.value);
  const breakHours = clampInt(breakHoursInput.value);
  const breakMinutes = clampInt(breakMinutesInput.value);
  const focusSeconds = hmToSeconds(focusHours, focusMinutes);
  const breakSeconds = hmToSeconds(breakHours, breakMinutes);
  const creditRate = Number(breakRateInput.value);
  const continueAfterTarget = continueAfterTargetInput
    ? continueAfterTargetInput.checked
    : defaultSettings.continueAfterTarget;
  const alertSound = alertSoundSelect ? alertSoundSelect.value : defaultSettings.alertSound;

  if (!isValidMinutes(focusMinutes)) {
    alert('Focus minutes must be between 0 and 59.');
    return;
  }

  if (!isValidMinutes(breakMinutes)) {
    alert('Break minutes must be between 0 and 59.');
    return;
  }

  if (focusSeconds <= 0) {
    alert('Focus duration must be greater than zero.');
    return;
  }

  if (breakSeconds < 0) {
    alert('Break earned per pomodoro must be zero or more.');
    return;
  }

  if (Number.isNaN(creditRate) || creditRate < 0) {
    alert('Break credit per second must be zero or more.');
    return;
  }

  focusHoursInput.value = focusHours;
  focusMinutesInput.value = focusMinutes;
  breakHoursInput.value = breakHours;
  breakMinutesInput.value = breakMinutes;

  settings.focusDuration = focusSeconds;
  settings.breakPerPomodoro = breakSeconds;
  settings.breakCreditRate = creditRate;
  settings.alertSound = alertSound;
  settings.continueAfterTarget = continueAfterTarget;
  persistSettings();

  if (!focusState.running) {
    focusState.remainingSeconds = settings.focusDuration;
    focusState.elapsedSeconds = 0;
    focusState.targetReached = false;
    focusState.lastTick = null;
    updateFocusDisplay();
  }
}

function handleStatsReset() {
  if (!confirm('Reset all stats and break credit?')) {
    return;
  }
  Object.assign(stats, defaultStats);
  persistStats();
  breakCreditSeconds = 0;
  persistBreakCredit();
  updateStatsDisplay();
  updateBreakCreditDisplay();
}

function handleClearLog() {
  if (!confirm('Clear the completion log?')) {
    return;
  }
  completionLog.length = 0;
  persistCompletionLog();
  updateCompletionLog();
}

function updateFocusDisplay() {
  focusDisplay.textContent = formatDuration(focusState.remainingSeconds);
}

function updateBreakDisplay() {
  breakDisplay.textContent = formatDuration(breakState.elapsedSeconds);
}

function updateBreakCreditDisplay() {
  breakCreditDisplay.textContent = formatDuration(breakCreditSeconds);
}

function updateStatsDisplay() {
  statPomodoros.textContent = stats.pomodoros;
  statTotalFocus.textContent = formatDuration(stats.totalFocusSeconds);
  const avgFocus = stats.pomodoros === 0 ? 0 : Math.floor(stats.totalFocusSeconds / stats.pomodoros);
  const avgBreak = stats.breakSessions === 0 ? 0 : Math.floor(stats.totalBreakSeconds / stats.breakSessions);
  statAvgFocus.textContent = formatDuration(avgFocus);
  statAvgBreak.textContent = formatDuration(avgBreak);
}

function updateCompletionLog() {
  if (!logList) return;
  if (completionLog.length === 0) {
    logList.innerHTML = '<li class="empty">No pomodoros logged yet.</li>';
    return;
  }
  const items = completionLog
    .map((entry) => {
      const date = new Date(entry.timestamp);
      const formatted = date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `<li><span>${formatted}</span><span>${formatDuration(entry.duration)}</span></li>`;
    })
    .join('');
  logList.innerHTML = items;
}

function recordCompletion(durationSeconds) {
  completionLog.unshift({
    timestamp: Date.now(),
    duration: durationSeconds
  });
  if (completionLog.length > MAX_LOG_ITEMS) {
    completionLog.length = MAX_LOG_ITEMS;
  }
  persistCompletionLog();
  updateCompletionLog();
}

function updateButtons() {
  focusStartBtn.disabled = focusState.running;
  focusPauseBtn.disabled = !focusState.running;
  breakStartBtn.disabled = breakState.running;
  breakPauseBtn.disabled = !breakState.running;
}

function addBreakCredit(seconds) {
  if (!Number.isFinite(seconds)) {
    return;
  }
  breakCreditSeconds += seconds;
  persistBreakCredit();
  updateBreakCreditDisplay();
}

function handleFocusTargetReached() {
  focusState.targetReached = true;
  focusStatus.textContent = 'Overtime';
  toggleStatus(focusStatus, true);
  triggerFocusCompletionAlerts(focusState.elapsedSeconds);
}

function toggleStatus(node, running) {
  node.classList.toggle('status-running', running);
  node.classList.toggle('status-idle', !running);
}

function setupNotificationButton() {
  if (!notificationBtn) return;
  if (!('Notification' in window)) {
    notificationBtn.disabled = true;
    notificationBtn.textContent = 'Notifications Unavailable';
    return;
  }
  updateNotificationButton(Notification.permission);
  notificationBtn.addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission();
      updateNotificationButton(permission);
    } catch (err) {
      console.warn('Notification permission request failed', err);
    }
  });
}

function updateNotificationButton(permission = 'default') {
  if (!notificationBtn) return;
  if (permission === 'granted') {
    notificationBtn.textContent = 'Notifications Enabled';
    notificationBtn.disabled = true;
    return;
  }
  if (permission === 'denied') {
    notificationBtn.textContent = 'Notifications Blocked';
    notificationBtn.disabled = true;
    return;
  }
  notificationBtn.textContent = 'Enable Notifications';
  notificationBtn.disabled = false;
}

function triggerFocusCompletionAlerts(workedSeconds) {
  playAudioCue();
  showDesktopNotification(workedSeconds);
}

function warmAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

function playAudioCue() {
  if (settings.alertSound === 'mute') {
    return;
  }
  const sound = soundProfiles[settings.alertSound] || soundProfiles.chime;
  const ctx = getAudioContext();
  if (!ctx) return;
  warmAudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const baseGain = sound.gain ?? 0.05;
  oscillator.type = sound.type || 'sine';
  gain.gain.value = baseGain;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  let cursor = ctx.currentTime;
  const now = cursor;
  sound.pattern.forEach((step) => {
    const freq = step.freq === 0 ? 1 : step.freq;
    oscillator.frequency.setValueAtTime(freq, cursor);
    cursor += step.duration;
  });
  const fadeStart = Math.max(now, cursor - 0.08);
  const fadeEnd = cursor + 0.05;
  gain.gain.setValueAtTime(baseGain, fadeStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, fadeEnd);
  oscillator.start();
  oscillator.stop(fadeEnd + 0.01);
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  if (!alertAudioCtx) {
    alertAudioCtx = new AudioContextClass();
  }
  return alertAudioCtx;
}

function showDesktopNotification(workedSeconds) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const body = `Focus block complete: ${formatDuration(workedSeconds)} worked.`;
  try {
    new Notification('Tempo Pomodoro', {
      body,
      tag: 'tempo-focus-complete',
      silent: true
    });
  } catch (err) {
    console.warn('Unable to show notification', err);
  }
}

function loadSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKeys.settings));
    if (!value) {
      return { ...defaultSettings };
    }
    const focusDuration = Number(value.focusDuration);
    const breakPerPomodoro = Number(value.breakPerPomodoro);
    const breakCreditRate = Number(value.breakCreditRate);
    return {
      focusDuration: Number.isFinite(focusDuration) && focusDuration > 0 ? focusDuration : defaultSettings.focusDuration,
      breakPerPomodoro: Number.isFinite(breakPerPomodoro) && breakPerPomodoro >= 0 ? breakPerPomodoro : defaultSettings.breakPerPomodoro,
      breakCreditRate: Number.isFinite(breakCreditRate) && breakCreditRate >= 0 ? breakCreditRate : defaultSettings.breakCreditRate,
      alertSound:
        typeof value.alertSound === 'string' && value.alertSound.length > 0
          ? value.alertSound
          : defaultSettings.alertSound,
      continueAfterTarget: Boolean(value.continueAfterTarget)
    };
  } catch (err) {
    console.warn('Falling back to default settings', err);
    return { ...defaultSettings };
  }
}

function loadStats() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKeys.stats));
    if (!value) {
      return { ...defaultStats };
    }
    return {
      pomodoros: Number(value.pomodoros) || 0,
      totalFocusSeconds: Number(value.totalFocusSeconds) || 0,
      totalBreakSeconds: Number(value.totalBreakSeconds) || 0,
      breakSessions: Number(value.breakSessions) || 0
    };
  } catch (err) {
    console.warn('Falling back to default stats', err);
    return { ...defaultStats };
  }
}

function loadBreakCredit() {
  const value = Number(localStorage.getItem(storageKeys.breakCredit));
  return Number.isFinite(value) ? value : 0;
}

function loadCompletionLog() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKeys.completionLog));
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) => ({
        timestamp: Number(entry.timestamp),
        duration: Number(entry.duration)
      }))
      .filter((entry) => Number.isFinite(entry.timestamp) && Number.isFinite(entry.duration));
  } catch (err) {
    console.warn('Unable to read completion log', err);
    return [];
  }
}

function persistSettings() {
  localStorage.setItem(storageKeys.settings, JSON.stringify(settings));
}

function persistStats() {
  localStorage.setItem(storageKeys.stats, JSON.stringify(stats));
}

function persistBreakCredit() {
  localStorage.setItem(storageKeys.breakCredit, breakCreditSeconds);
}

function persistCompletionLog() {
  localStorage.setItem(storageKeys.completionLog, JSON.stringify(completionLog.slice(0, MAX_LOG_ITEMS)));
}

function setTimeInputs(hoursInput, minutesInput, totalSeconds) {
  if (!hoursInput || !minutesInput) return;
  const { hours, minutes } = secondsToHM(totalSeconds);
  hoursInput.value = hours;
  minutesInput.value = minutes;
}

function secondsToHM(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { hours, minutes };
}

function hmToSeconds(hours, minutes) {
  return hours * 3600 + minutes * 60;
}

function clampInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(0, Math.floor(num));
}

function isValidMinutes(value) {
  return Number.isFinite(value) && value >= 0 && value < 60;
}

function formatDuration(totalSeconds) {
  const sign = totalSeconds < 0 ? '-' : '';
  const seconds = Math.abs(Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${sign}${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}
