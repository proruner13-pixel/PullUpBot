import type {
    ApiAchievement,
    ApiChallenge,
    ApiUser,
    DashboardData,
    DashboardMode,
} from "../utils/api";

export const DEMO_TELEGRAM_ID = 123456789;

export const DEMO_API_USER: ApiUser = {
    telegram_id: DEMO_TELEGRAM_ID,
    display_name: "Athlete",
    username: "demo_user",
    first_name: "Athlete",
    last_name: null,
    photo_url: null,
    tokens: 0,
    total_xp: 0,
    level: 1,
    next_level_progress: 0,
    streak_days: 0,
    referrals_count: 0,
};

export const EMPTY_DEMO_CHALLENGES: ApiChallenge[] = [
    { exercise: "pullups", progress: 0, goal: 50, xp: 0, level: 1, next_level_progress: 0 },
    { exercise: "pushups", progress: 0, goal: 150, xp: 0, level: 1, next_level_progress: 0 },
    { exercise: "plank", progress: 0, goal: 5, xp: 0, level: 1, next_level_progress: 0 },
    { exercise: "running", progress: 0, goal: 10, xp: 0, level: 1, next_level_progress: 0 },
];

export const EMPTY_DEMO_ACHIEVEMENTS: ApiAchievement[] = [];

export function createDemoDashboard(
    user: ApiUser = DEMO_API_USER,
    mode: DashboardMode = "demo"
): DashboardData {
    const isDefaultDemoUser = user.telegram_id === DEMO_TELEGRAM_ID;
    return {
        user: {
            ...user,
            tokens: isDefaultDemoUser ? 0 : user.tokens,
            total_xp: isDefaultDemoUser ? 0 : user.total_xp,
            next_level_progress: isDefaultDemoUser
                ? 0
                : user.next_level_progress,
            referrals_count: 0,
        },
        mode,
        challenges: EMPTY_DEMO_CHALLENGES.map((challenge) => ({
            ...challenge,
        })),
        achievements: [...EMPTY_DEMO_ACHIEVEMENTS],
        leaderboard: [],
        myLeaderboardRank: null,
    };
}
