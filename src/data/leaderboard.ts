export type LeaderboardPeriod = "week" | "month" | "all";
export type LeaderboardScope = "global" | "friends" | "challenge";
export type ChallengeRanking =
    | "overall"
    | "pullups"
    | "pushups"
    | "plank"
    | "running";

export interface LeaderboardUser {
    id: string;
    name: string;
    handle: string;
    avatarId: string;
    isFriend: boolean;
    isCurrentUser?: boolean;
    scores: Record<ChallengeRanking, number>;
}

export const LEADERBOARD_USERS: LeaderboardUser[] = [
    {
        id: "1",
        name: "Алексей Ворон",
        handle: "@voron_power",
        avatarId: "champion",
        isFriend: false,
        scores: {
            overall: 9860,
            pullups: 1470,
            pushups: 3200,
            plank: 86,
            running: 128,
        },
    },
    {
        id: "2",
        name: "Мария Сталь",
        handle: "@maria_steel",
        avatarId: "steel",
        isFriend: true,
        scores: {
            overall: 9130,
            pullups: 780,
            pushups: 2860,
            plank: 112,
            running: 164,
        },
    },
    {
        id: "3",
        name: "Тимур Хан",
        handle: "@khan_fit",
        avatarId: "fighter",
        isFriend: false,
        scores: {
            overall: 8740,
            pullups: 1230,
            pushups: 2980,
            plank: 73,
            running: 96,
        },
    },
    {
        id: "4",
        name: "Елена Рэй",
        handle: "@ray_runner",
        avatarId: "runner",
        isFriend: true,
        scores: {
            overall: 7920,
            pullups: 510,
            pushups: 2110,
            plank: 94,
            running: 212,
        },
    },
    {
        id: "me",
        name: "Athlete",
        handle: "@pullup_athlete",
        avatarId: "power",
        isFriend: true,
        isCurrentUser: true,
        scores: {
            overall: 7410,
            pullups: 610,
            pushups: 1800,
            plank: 66,
            running: 74,
        },
    },
    {
        id: "6",
        name: "Денис Вольт",
        handle: "@volt",
        avatarId: "fire",
        isFriend: true,
        scores: {
            overall: 6980,
            pullups: 890,
            pushups: 1760,
            plank: 58,
            running: 82,
        },
    },
    {
        id: "7",
        name: "Ирина Нова",
        handle: "@nova_fit",
        avatarId: "focus",
        isFriend: false,
        scores: {
            overall: 6550,
            pullups: 430,
            pushups: 1920,
            plank: 78,
            running: 105,
        },
    },
    {
        id: "8",
        name: "Макс Север",
        handle: "@north_max",
        avatarId: "night",
        isFriend: true,
        scores: {
            overall: 6140,
            pullups: 720,
            pushups: 1550,
            plank: 62,
            running: 68,
        },
    },
    {
        id: "9",
        name: "София Лайт",
        handle: "@sofia_light",
        avatarId: "endurance",
        isFriend: false,
        scores: {
            overall: 5770,
            pullups: 350,
            pushups: 1430,
            plank: 71,
            running: 118,
        },
    },
    {
        id: "10",
        name: "Роман Кросс",
        handle: "@cross_roman",
        avatarId: "calisthenics",
        isFriend: false,
        scores: {
            overall: 5320,
            pullups: 680,
            pushups: 1320,
            plank: 49,
            running: 55,
        },
    },
];

export const PERIOD_MULTIPLIER: Record<LeaderboardPeriod, number> = {
    week: 0.18,
    month: 0.54,
    all: 1,
};

