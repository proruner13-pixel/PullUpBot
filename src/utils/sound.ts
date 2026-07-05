export const EFFECT_STORAGE_KEYS = {
    sound: "pullup_settings_sound_enabled",
    achievementSound: "pullup_settings_achievement_sound_enabled",
    vibration: "pullup_settings_vibration_enabled",
    animations: "pullup_settings_animations_enabled",
} as const;

type Tone = {
    frequency: number;
    duration: number;
    delay?: number;
    type?: OscillatorType;
    volume?: number;
};

let audioContext: AudioContext | null = null;

function storedBoolean(key: string, fallback: boolean): boolean {
    try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value === "true";
    } catch {
        return fallback;
    }
}

function soundEnabled(): boolean {
    return storedBoolean(EFFECT_STORAGE_KEYS.sound, false);
}

function achievementSoundEnabled(): boolean {
    return storedBoolean(EFFECT_STORAGE_KEYS.achievementSound, false);
}

function vibrationEnabled(): boolean {
    return storedBoolean(EFFECT_STORAGE_KEYS.vibration, true);
}

export function animationsEnabled(): boolean {
    return storedBoolean(EFFECT_STORAGE_KEYS.animations, true);
}

function playTones(tones: Tone[]): void {
    try {
        const AudioContextClass = window.AudioContext;
        audioContext ??= new AudioContextClass();
        if (audioContext.state === "suspended") {
            void audioContext.resume();
        }
        const start = audioContext.currentTime;

        for (const tone of tones) {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const toneStart = start + (tone.delay ?? 0);
            const toneEnd = toneStart + tone.duration;

            oscillator.type = tone.type ?? "sine";
            oscillator.frequency.setValueAtTime(
                tone.frequency,
                toneStart
            );
            gain.gain.setValueAtTime(0.0001, toneStart);
            gain.gain.exponentialRampToValueAtTime(
                tone.volume ?? 0.045,
                toneStart + 0.012
            );
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                toneEnd
            );
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(toneStart);
            oscillator.stop(toneEnd + 0.01);
        }
    } catch {
        // Audio is optional and may be blocked by the browser.
    }
}

function vibrate(pattern: number | number[]): void {
    if (!vibrationEnabled() || !("vibrate" in navigator)) return;
    try {
        navigator.vibrate(pattern);
    } catch {
        // Vibration is optional and unsupported on some devices.
    }
}

export function playTap(): void {
    if (soundEnabled()) {
        playTones([
            {
                frequency: 330,
                duration: 0.075,
                type: "triangle",
                volume: 0.025,
            },
        ]);
    }
    vibrate(12);
}

export function playSuccess(): void {
    if (soundEnabled()) {
        playTones([
            { frequency: 520, duration: 0.12, volume: 0.035 },
            { frequency: 720, duration: 0.16, delay: 0.09, volume: 0.04 },
        ]);
    }
    vibrate(50);
}

export function playAchievement(): void {
    if (achievementSoundEnabled()) {
        playTones([
            { frequency: 440, duration: 0.16, volume: 0.04 },
            { frequency: 660, duration: 0.2, delay: 0.12, volume: 0.045 },
            { frequency: 880, duration: 0.28, delay: 0.26, volume: 0.05 },
        ]);
    }
    vibrate([50, 30, 80]);
}

export function playToken(): void {
    if (soundEnabled()) {
        playTones([
            {
                frequency: 920,
                duration: 0.09,
                type: "triangle",
                volume: 0.035,
            },
            {
                frequency: 1240,
                duration: 0.14,
                delay: 0.07,
                type: "triangle",
                volume: 0.04,
            },
        ]);
    }
    vibrate(42);
}

export function playError(): void {
    if (soundEnabled()) {
        playTones([
            {
                frequency: 190,
                duration: 0.15,
                type: "sawtooth",
                volume: 0.025,
            },
            {
                frequency: 145,
                duration: 0.18,
                delay: 0.1,
                type: "sawtooth",
                volume: 0.02,
            },
        ]);
    }
    vibrate([40, 40, 40]);
}

export function playOpen(): void {
    if (soundEnabled()) {
        playTones([
            {
                frequency: 280,
                duration: 0.1,
                type: "triangle",
                volume: 0.02,
            },
            {
                frequency: 390,
                duration: 0.14,
                delay: 0.06,
                type: "triangle",
                volume: 0.025,
            },
        ]);
    }
    vibrate(16);
}
