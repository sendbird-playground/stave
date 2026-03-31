export const NOTIFICATION_SOUND_PRESETS = ["chime", "bell", "pulse", "bright"] as const;
export type NotificationSoundPreset = (typeof NOTIFICATION_SOUND_PRESETS)[number];

export const DEFAULT_NOTIFICATION_SOUND_PRESET: NotificationSoundPreset = "chime";
export const DEFAULT_NOTIFICATION_SOUND_VOLUME = 0.5;
export const NOTIFICATION_SOUND_COOLDOWN_MS = 500;

interface NotificationAudioParamLike {
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

interface NotificationGainNodeLike {
  gain: NotificationAudioParamLike;
  connect(destination: unknown): unknown;
}

interface NotificationOscillatorNodeLike {
  type: OscillatorType;
  frequency: NotificationAudioParamLike;
  detune?: NotificationAudioParamLike;
  connect(destination: unknown): unknown;
  start(when?: number): unknown;
  stop(when?: number): unknown;
}

interface NotificationAudioContextLike {
  currentTime: number;
  state?: string;
  destination: unknown;
  createGain(): NotificationGainNodeLike;
  createOscillator(): NotificationOscillatorNodeLike;
  resume?(): PromiseLike<void> | void;
}

interface NotificationSoundNote {
  frequency: number;
  waveform: OscillatorType;
  startOffsetMs: number;
  durationMs: number;
  gain: number;
  attackMs?: number;
  detuneCents?: number;
}

const PRESET_NOTES: Record<NotificationSoundPreset, NotificationSoundNote[]> = {
  chime: [
    { frequency: 523.25, waveform: "sine", startOffsetMs: 0, durationMs: 320, gain: 0.28, attackMs: 12 },
    { frequency: 659.25, waveform: "sine", startOffsetMs: 80, durationMs: 260, gain: 0.22, attackMs: 10 },
  ],
  bell: [
    { frequency: 880, waveform: "sine", startOffsetMs: 0, durationMs: 380, gain: 0.28, attackMs: 8, detuneCents: 4 },
  ],
  pulse: [
    { frequency: 220, waveform: "triangle", startOffsetMs: 0, durationMs: 240, gain: 0.2, attackMs: 8 },
  ],
  bright: [
    { frequency: 1046.5, waveform: "square", startOffsetMs: 0, durationMs: 180, gain: 0.16, attackMs: 4 },
    { frequency: 1318.51, waveform: "square", startOffsetMs: 20, durationMs: 160, gain: 0.12, attackMs: 4 },
  ],
};

let sharedAudioContext: NotificationAudioContextLike | null = null;

function getAudioContextConstructor():
  | (new () => NotificationAudioContextLike)
  | null {
  const globalAudio = globalThis as typeof globalThis & {
    webkitAudioContext?: new () => NotificationAudioContextLike;
  };

  if (typeof globalAudio.AudioContext === "function") {
    return globalAudio.AudioContext as new () => NotificationAudioContextLike;
  }
  if (typeof globalAudio.webkitAudioContext === "function") {
    return globalAudio.webkitAudioContext;
  }
  return null;
}

function getSharedAudioContext() {
  if (sharedAudioContext) {
    return sharedAudioContext;
  }

  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    return null;
  }

  try {
    sharedAudioContext = new AudioContextCtor();
  } catch {
    sharedAudioContext = null;
  }

  return sharedAudioContext;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isNotificationSoundPreset(value: unknown): value is NotificationSoundPreset {
  return typeof value === "string" && NOTIFICATION_SOUND_PRESETS.includes(value as NotificationSoundPreset);
}

export function normalizeNotificationSoundPreset(value: unknown): NotificationSoundPreset {
  return isNotificationSoundPreset(value)
    ? value
    : DEFAULT_NOTIFICATION_SOUND_PRESET;
}

export function normalizeNotificationSoundVolume(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATION_SOUND_VOLUME;
  }
  return clamp(value, 0, 1);
}

function scheduleNote(args: {
  audioContext: NotificationAudioContextLike;
  destination: NotificationGainNodeLike;
  startTime: number;
  note: NotificationSoundNote;
}) {
  const oscillator = args.audioContext.createOscillator();
  const gainNode = args.audioContext.createGain();
  const noteStartTime = args.startTime + (args.note.startOffsetMs / 1000);
  const noteAttackTime = noteStartTime + ((args.note.attackMs ?? 12) / 1000);
  const noteReleaseTime = noteStartTime + (args.note.durationMs / 1000);

  oscillator.type = args.note.waveform;
  oscillator.frequency.setValueAtTime(args.note.frequency, noteStartTime);
  oscillator.detune?.setValueAtTime(args.note.detuneCents ?? 0, noteStartTime);

  gainNode.gain.setValueAtTime(0.0001, noteStartTime);
  gainNode.gain.linearRampToValueAtTime(args.note.gain, noteAttackTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, noteReleaseTime);

  oscillator.connect(gainNode);
  gainNode.connect(args.destination);
  oscillator.start(noteStartTime);
  oscillator.stop(noteReleaseTime + 0.05);
}

function schedulePreset(args: {
  audioContext: NotificationAudioContextLike;
  preset: NotificationSoundPreset;
  volume: number;
}) {
  const startTime = args.audioContext.currentTime + 0.01;
  const masterGain = args.audioContext.createGain();
  masterGain.gain.setValueAtTime(args.volume, startTime);
  masterGain.connect(args.audioContext.destination);

  for (const note of PRESET_NOTES[args.preset]) {
    scheduleNote({
      audioContext: args.audioContext,
      destination: masterGain,
      startTime,
      note,
    });
  }
}

export function createNotificationSoundPlayer(args?: {
  getNow?: () => number;
  getAudioContext?: () => NotificationAudioContextLike | null;
}) {
  let lastPlayedAt = -Infinity;
  const getNow = args?.getNow ?? (() => Date.now());
  const getAudioContext = args?.getAudioContext ?? getSharedAudioContext;

  return (options: { preset: NotificationSoundPreset; volume: number }) => {
    const preset = normalizeNotificationSoundPreset(options.preset);
    const volume = normalizeNotificationSoundVolume(options.volume);
    if (volume <= 0) {
      return false;
    }

    const now = getNow();
    if (now - lastPlayedAt < NOTIFICATION_SOUND_COOLDOWN_MS) {
      return false;
    }

    const audioContext = getAudioContext();
    if (!audioContext) {
      return false;
    }

    lastPlayedAt = now;

    if (audioContext.state === "suspended") {
      try {
        void audioContext.resume?.();
      } catch {
        // Ignore resume failures and still attempt to schedule the sound.
      }
    }

    schedulePreset({
      audioContext,
      preset,
      volume,
    });
    return true;
  };
}

export const playNotificationSound = createNotificationSoundPlayer();
