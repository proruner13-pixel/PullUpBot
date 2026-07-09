import type { ChallengeType } from "./progress";

export type EconomyActivity = "pullups" | "pushups" | "plank" | "running";

export const LEVEL_XP_STEP = 1000;

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
    return Math.floor(Math.max(Math.floor(totalXp || 0), 0) / LEVEL_XP_STEP) + 1;
}

export function calculateProgress(totalXp: number) {
    const safeXp = Math.max(Math.floor(totalXp || 0), 0);
    const level = calculateLevel(safeXp);
    const levelStartXp = (level - 1) * LEVEL_XP_STEP;
    const nextLevelXp = level * LEVEL_XP_STEP;
    const currentLevelXp = safeXp - levelStartXp;
    return {
        level,
        levelStartXp,
        nextLevelXp,
        currentLevelXp,
        progressPercent: Math.min(
            100,
            Math.round((currentLevelXp / LEVEL_XP_STEP) * 100)
        ),
        xpToNextLevel: nextLevelXp - safeXp,
    };
}
