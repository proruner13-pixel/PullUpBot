import {
    CHALLENGE_TO_ACTIVITY,
    calculateLevel,
    calculatePullupReward,
    calculateXp,
} from "./economy";

export type ChallengeType =
    | "подтягивания"
    | "отжимания"
    | "планка"
    | "бег";

export interface Challenge {
    progress: number;
    goal: number;
    level: number;
    xp: number;
    next_level_progress?: number;
    sportScore: number;
    monthlyScore: number;
    totalScore: number;
    bestResult: number;
}

export interface User {
    name: string;
    avatarUrl?: string;
    tokens: number;
    xp: number;
    totalLevel: number;
    streakDays: number;
    achievements: string[];
    challenges: Record<ChallengeType, Challenge>;
}

export interface Achievement {
    id: string;
    title: string;
    icon: string;
    description: string;
    condition: (user: User) => boolean;
}

export interface AddResultOutcome {
    updatedUser: User;
    earnedScore: number;
    earnedXp: number;
    earnedTokens: number;
    levelsGained: number;
    newAchievements: Achievement[];
}

export const USER_STORAGE_KEY = "pullup_user";
export const DEMO_DATA_VERSION_KEY = "pullup_demo_version";
export const DEMO_DATA_VERSION = "clean-v1";

export const initialUser: User = {
    name: "Athlete",
    tokens: 0,
    xp: 0,
    totalLevel: 1,
    streakDays: 0,
    achievements: [],
    challenges: {
        подтягивания: {
            progress: 0,
            goal: 50,
            level: 0,
            xp: 0,
            sportScore: 0,
            monthlyScore: 0,
            totalScore: 0,
            bestResult: 0,
        },
        отжимания: {
            progress: 0,
            goal: 150,
            level: 0,
            xp: 0,
            sportScore: 0,
            monthlyScore: 0,
            totalScore: 0,
            bestResult: 0,
        },
        планка: {
            progress: 0,
            goal: 5,
            level: 0,
            xp: 0,
            sportScore: 0,
            monthlyScore: 0,
            totalScore: 0,
            bestResult: 0,
        },
        бег: {
            progress: 0,
            goal: 10,
            level: 0,
            xp: 0,
            sportScore: 0,
            monthlyScore: 0,
            totalScore: 0,
            bestResult: 0,
        },
    },
};

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: "first_result",
        title: "Первый шаг",
        icon: "🎬",
        description: "Добавить первый результат",
        condition: (user) =>
            Object.values(user.challenges).some(
                (challenge) => challenge.totalScore > 0
            ),
    },
    {
        id: "pullups_30",
        title: "Турник-машина",
        icon: "💪",
        description: "Сделать 30 подтягиваний за раз",
        condition: (user) =>
            user.challenges["подтягивания"].bestResult >= 30,
    },
    {
        id: "pushups_100",
        title: "Сотка",
        icon: "🔥",
        description: "Сделать 100 отжиманий за раз",
        condition: (user) =>
            user.challenges["отжимания"].bestResult >= 100,
    },
    {
        id: "plank_5",
        title: "Стальная планка",
        icon: "🧱",
        description: "Простоять в планке 5 минут",
        condition: (user) => user.challenges["планка"].bestResult >= 5,
    },
    {
        id: "run_5k",
        title: "5K Runner",
        icon: "🏃",
        description: "Пробежать 5 км",
        condition: (user) => user.challenges["бег"].bestResult >= 5,
    },
    {
        id: "run_10k",
        title: "10K Beast",
        icon: "⚡",
        description: "Пробежать 10 км",
        condition: (user) => user.challenges["бег"].bestResult >= 10,
    },
    {
        id: "level_10",
        title: "Не новичок",
        icon: "🏅",
        description: "Получить общий уровень 10",
        condition: (user) => user.totalLevel >= 10,
    },
    {
        id: "token_1000",
        title: "Копилка",
        icon: "/assets/home/pullup-coin.png",
        description: "Накопить 1000 PULLUP",
        condition: (user) => user.tokens >= 1000,
    },
    {
        id: "all_sports",
        title: "Мультиспортсмен",
        icon: "🌍",
        description: "Получить результат во всех 4 видах спорта",
        condition: (user) =>
            Object.values(user.challenges).every(
                (challenge) => challenge.totalScore > 0
            ),
    },
    {
        id: "champion",
        title: "Чемпион",
        icon: "👑",
        description: "Получить общий уровень 20",
        condition: (user) => user.totalLevel >= 20,
    },
];

export const EXERCISE_TO_CHALLENGE: Record<string, ChallengeType> = {
    pullups: "подтягивания",
    pushups: "отжимания",
    plank: "планка",
    running: "бег",
    run: "бег",
};

export const CHALLENGE_TO_EXERCISE: Record<ChallengeType, string> = {
    подтягивания: "pullups",
    отжимания: "pushups",
    планка: "plank",
    бег: "running",
};

export function cloneInitialUser(): User {
    return {
        ...initialUser,
        achievements: [...initialUser.achievements],
        challenges: Object.fromEntries(
            Object.entries(initialUser.challenges).map(([type, challenge]) => [
                type,
                { ...challenge },
            ])
        ) as Record<ChallengeType, Challenge>,
    };
}

function isStoredUser(value: unknown): value is User {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<User>;
    return (
        typeof candidate.name === "string" &&
        typeof candidate.tokens === "number" &&
        typeof candidate.xp === "number" &&
        Array.isArray(candidate.achievements) &&
        Boolean(candidate.challenges) &&
        Object.keys(initialUser.challenges).every((type) =>
            Boolean(candidate.challenges?.[type as ChallengeType])
        )
    );
}

export function loadUser(): User {
    try {
        if (
            window.localStorage.getItem(DEMO_DATA_VERSION_KEY) !==
            DEMO_DATA_VERSION
        ) {
            return cloneInitialUser();
        }
        const stored = window.localStorage.getItem(USER_STORAGE_KEY);
        if (!stored) return cloneInitialUser();
        const parsed: unknown = JSON.parse(stored);
        return isStoredUser(parsed) ? parsed : cloneInitialUser();
    } catch {
        return cloneInitialUser();
    }
}

export function checkAchievements(user: User): {
    updatedUser: User;
    newAchievements: Achievement[];
} {
    const unlocked = new Set(user.achievements);
    const newAchievements = ACHIEVEMENTS.filter(
        (achievement) =>
            !unlocked.has(achievement.id) && achievement.condition(user)
    );

    return {
        updatedUser: {
            ...user,
            achievements: [
                ...user.achievements,
                ...newAchievements.map((achievement) => achievement.id),
            ],
        },
        newAchievements,
    };
}

export function addResultToUser(
    user: User,
    type: ChallengeType,
    value: number
): AddResultOutcome {
    const activity = CHALLENGE_TO_ACTIVITY[type];
    const earnedTokens = calculatePullupReward(activity, value);
    const earnedXp = calculateXp(earnedTokens);
    const earnedScore = earnedTokens;
    const challenge = {
        ...user.challenges[type],
        progress: user.challenges[type].progress + value,
        totalScore: user.challenges[type].totalScore + value,
        sportScore: user.challenges[type].sportScore + earnedScore,
        monthlyScore: user.challenges[type].monthlyScore + earnedScore,
        xp: user.challenges[type].xp + earnedXp,
        bestResult: Math.max(user.challenges[type].bestResult, value),
    };
    const previousTotalLevel = user.totalLevel;

    while (challenge.progress >= challenge.goal) {
        challenge.progress -= challenge.goal;
        challenge.level += 1;
        challenge.goal = Math.ceil(challenge.goal * 1.35);
    }

    const challenges = {
        ...user.challenges,
        [type]: challenge,
    };
    const withResult: User = {
        ...user,
        xp: user.xp + earnedXp,
        tokens: user.tokens + earnedTokens,
        challenges,
        totalLevel: calculateLevel(user.xp + earnedXp),
    };
    const achievementResult = checkAchievements(withResult);

    return {
        updatedUser: achievementResult.updatedUser,
        earnedScore,
        earnedXp,
        earnedTokens,
        levelsGained: achievementResult.updatedUser.totalLevel - previousTotalLevel,
        newAchievements: achievementResult.newAchievements,
    };
}
