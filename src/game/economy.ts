import type { ChallengeType } from "./progress";

export type EconomyActivity = "pullups" | "pushups" | "plank" | "running";

export const XP_PER_LEVEL = 1000;
export const LEVEL_TITLES = [
    "Новичок",
    "Начинающий",
    "Любитель",
    "Упорный",
    "Атлет",
    "Силач",
    "Профи",
    "Мастер",
    "Элита",
    "Легенда",
    "Титан",
    "Босс турника",
    "Железный чемпион",
    "Монстр формы",
    "Легенда PULLUP",
] as const;

export const CHALLENGE_TO_ACTIVITY: Record<ChallengeType, EconomyActivity> = {
    подтягивания: "pullups",
    отжимания: "pushups",
    планка: "plank",
    бег: "running",
};

export function normalizeEconomyActivity(value: string): EconomyActivity {
    const normalized: Record<string, EconomyActivity> = {
        pullup: "pullups",
        pullups: "pullups",
        pushup: "pushups",
        pushups: "pushups",
        plank: "plank",
        run: "running",
        running: "running",
    };
    const activity = normalized[value];
    if (!activity) {
        throw new Error(`Unsupported activity: ${value}`);
    }
    return activity;
}

export function calculatePullupReward(
    activity: EconomyActivity | string,
    value: number
): number {
    const safeValue = Math.max(Number.isFinite(value) ? value : 0, 0);
    switch (normalizeEconomyActivity(activity)) {
        case "pullups":
            return Math.floor(safeValue) * 5;
        case "pushups":
            return Math.floor(safeValue);
        case "running":
            return Math.floor(safeValue * 10);
        case "plank":
            return Math.floor(safeValue / 6);
    }
}

export function calculateXp(earnedPullup: number): number {
    return Math.max(Math.floor(earnedPullup || 0), 0);
}

export function calculateLevel(totalXp: number): number {
    return getLevelFromXp(totalXp);
}

export function calculateProgress(totalXp: number) {
    const safeXp = Math.max(Math.floor(totalXp || 0), 0);
    const level = getLevelFromXp(safeXp);
    const levelStartXp = (level - 1) * XP_PER_LEVEL;
    const nextLevelXp = level * XP_PER_LEVEL;
    const currentLevelXp = safeXp - levelStartXp;
    return {
        level,
        levelStartXp,
        nextLevelXp,
        currentLevelXp,
        progressInLevel: currentLevelXp,
        progressPercent: Math.min(
            100,
            Math.round((currentLevelXp / XP_PER_LEVEL) * 100)
        ),
        xpToNextLevel: nextLevelXp - safeXp,
    };
}

export function getLevelFromXp(xp: number): number {
    return Math.floor(Math.max(Math.floor(xp || 0), 0) / XP_PER_LEVEL) + 1;
}

export function getXpProgressInLevel(xp: number): number {
    return Math.max(Math.floor(xp || 0), 0) % XP_PER_LEVEL;
}

export function getXpToNextLevel(xp: number): number {
    return XP_PER_LEVEL - getXpProgressInLevel(xp);
}

export function getLevelTitle(level: number): string {
    const safeLevel = Math.max(Math.floor(level || 1), 1);
    return LEVEL_TITLES[
        Math.min(safeLevel, LEVEL_TITLES.length) - 1
    ];
}
