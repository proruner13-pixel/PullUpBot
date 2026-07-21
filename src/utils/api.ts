import { authenticateTelegram } from "../api/auth";
import {
    apiRequest,
    getApiConfigurationError,
    getApiUrl,
    getApiUrlSource,
    isApiEnabled,
    PullupApiError,
    getLeaderboardAroundMe,
    getMyLeaderboardRank,
    type ProfileDto,
    type LeaderboardAroundEntryDto,
    type MyLeaderboardRankDto,
} from "../api/client";
import { DEMO_API_USER, createDemoDashboard } from "../mocks/data";
import {
    detectAppMode,
    waitForTelegramWebApp,
} from "./telegram";
import { normalizeExerciseType } from "../config/exerciseTypes";

export interface ApiUser {
    telegram_id: number;
    display_name: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    tokens: number;
    total_xp: number;
    level: number;
    next_level_progress: number;
    streak_days: number;
    referrals_count: number;
}

export interface ApiChallenge {
    id?: number;
    slug?: string;
    title?: string;
    description?: string | null;
    exercise: string;
    progress: number;
    goal: number;
    reward_tokens?: number;
    is_active?: boolean;
    status?: "active" | "completed" | "inactive" | string;
    completed?: boolean;
    userCompleted?: boolean;
    xp: number;
    level: number;
    next_level_progress: number;
}

export interface ApiAchievement {
    code: string;
    title: string;
    icon: string;
}

export type DashboardMode =
    | "telegram"
    | "telegram-error"
    | "demo"
    | "api-error";

export interface DashboardData {
    user: ApiUser;
    challenges: ApiChallenge[];
    achievements: ApiAchievement[];
    leaderboard: LeaderboardAroundEntryDto[];
    myLeaderboardRank: MyLeaderboardRankDto | null;
    mode: DashboardMode;
}

export interface TelegramWebAppData {
    initData: string | null;
    user: ApiUser | null;
    mode: DashboardMode;
    isTelegramContext: boolean;
}

export class TelegramApiError extends Error {
    readonly telegramUser: ApiUser | null;
    readonly backendUser: ApiUser | null;
    readonly mode: "telegram-error" | "api-error";

    constructor(
        message: string,
        telegramUser: ApiUser | null,
        mode: "telegram-error" | "api-error",
        backendUser: ApiUser | null = null
    ) {
        super(message);
        this.name = "TelegramApiError";
        this.telegramUser = telegramUser;
        this.mode = mode;
        this.backendUser = backendUser;
    }
}

export function isTelegramApiError(
    reason: unknown
): reason is TelegramApiError {
    return reason instanceof TelegramApiError;
}

function profileToApiUser(profile: ProfileDto): ApiUser {
    const telegramName = [profile.first_name, profile.last_name]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" ");

    return {
        telegram_id: profile.telegram_id,
        display_name:
            telegramName ||
            profile.username ||
            `Telegram ${profile.telegram_id}`,
        username: profile.username,
        first_name: profile.first_name,
        last_name: profile.last_name,
        photo_url: profile.avatar_url,
        tokens: profile.tokens,
        total_xp: profile.xp,
        level: profile.level,
        next_level_progress: profile.next_level_progress,
        streak_days: profile.streak_days,
        referrals_count: 0,
    };
}

function telegramUserToApiUser(
    telegramUser: NonNullable<
        NonNullable<Window["Telegram"]>["WebApp"]["initDataUnsafe"]
    >["user"]
): ApiUser | null {
    if (!telegramUser) return null;

    return {
        telegram_id: telegramUser.id,
        display_name: [telegramUser.first_name, telegramUser.last_name]
            .filter(Boolean)
            .join(" "),
        username: telegramUser.username ?? null,
        first_name: telegramUser.first_name ?? null,
        last_name: telegramUser.last_name ?? null,
        photo_url: telegramUser.photo_url ?? null,
        tokens: 0,
        total_xp: 0,
        level: 1,
        next_level_progress: 0,
        streak_days: 0,
        referrals_count: 0,
    };
}

function numberFrom(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function stringFrom(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function boolFrom(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function recordFrom(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
}

export function normalizeChallenge(raw: unknown): ApiChallenge {
    const record = recordFrom(raw);
    const isActive = boolFrom(record.is_active ?? record.active, true);
    const completed = boolFrom(
        record.user_completed ?? record.completed,
        false
    );
    const status = stringFrom(
        record.status,
        isActive ? "active" : "inactive"
    );
    const exercise = normalizeExerciseType(stringFrom(
        record.exercise ??
            record.exercise_type ??
            record.exerciseType ??
            record.type ??
            record.slug,
        ""
    ));

    return {
        id: record.id === undefined ? undefined : numberFrom(record.id),
        slug: stringFrom(record.slug, exercise),
        title: stringFrom(record.title ?? record.name, exercise),
        description:
            typeof record.description === "string"
                ? record.description
                : null,
        exercise,
        progress: numberFrom(
            record.progress ??
                record.current_progress ??
                record.user_progress,
            0
        ),
        goal: numberFrom(
            record.goal ??
                record.target ??
                record.target_value ??
                record.targetValue,
            0
        ),
        reward_tokens: numberFrom(
            record.reward_tokens ?? record.rewardTokens,
            0
        ),
        is_active: isActive,
        status: completed ? "completed" : status,
        completed,
        userCompleted: completed,
        xp: numberFrom(record.xp, 0),
        level: numberFrom(record.level, 1),
        next_level_progress: numberFrom(
            record.next_level_progress ?? record.nextLevelProgress,
            0
        ),
    };
}

function normalizeChallenges(raw: unknown): ApiChallenge[] {
    return Array.isArray(raw) ? raw.map(normalizeChallenge) : [];
}

export async function getTelegramWebAppData(): Promise<TelegramWebAppData> {
    const webApp = await waitForTelegramWebApp();
    const telegramUser = webApp?.initDataUnsafe?.user;
    const initData =
        webApp?.initData ||
        (import.meta.env.DEV
            ? import.meta.env.VITE_TELEGRAM_INIT_DATA
            : "") ||
        null;
    console.info("[TelegramAuth] resolved WebApp data", {
        hasWindowTelegram: Boolean(window.Telegram),
        hasTelegramWebApp: Boolean(window.Telegram?.WebApp),
        initDataLength: initData?.length ?? 0,
        hasInitDataUnsafeUser: Boolean(telegramUser),
        detectedMode: initData
            ? "telegram"
            : telegramUser
              ? "telegram-error"
              : detectAppMode(webApp),
    });
    const detectedMode = initData
        ? "telegram"
        : telegramUser
          ? "telegram-error"
          : detectAppMode(webApp);

    if (detectedMode === "telegram" && initData) {
        return {
            initData,
            user: telegramUserToApiUser(telegramUser),
            mode: "telegram",
            isTelegramContext: true,
        };
    }

    if (detectedMode === "telegram-error") {
        return {
            initData: null,
            user: telegramUserToApiUser(telegramUser),
            mode: "telegram-error",
            isTelegramContext: true,
        };
    }

    return {
        initData: null,
        user: DEMO_API_USER,
        mode: "demo",
        isTelegramContext: false,
    };
}

export function getFrontendApiUrl(): string {
    return getApiUrl();
}

export function getFrontendApiUrlSource():
    | "env"
    | "fallback"
    | "localhost" {
    return getApiUrlSource();
}

export function getFrontendApiConfigurationError(): string | null {
    return getApiConfigurationError();
}

export interface FetchDashboardOptions {
    onBackendProfile?: (user: ApiUser) => void;
}

export async function fetchDashboard(
    options: FetchDashboardOptions = {}
): Promise<DashboardData> {
    const telegram = await getTelegramWebAppData();

    if (!telegram.isTelegramContext) {
        return createDemoDashboard(telegram.user ?? DEMO_API_USER, "demo");
    }

    if (!telegram.initData) {
        console.warn("[TelegramAuth] initData missing after WebApp wait", {
            hasUser: Boolean(telegram.user),
            mode: telegram.mode,
        });
        throw new TelegramApiError(
            "Telegram не передал подписанный initData. Закройте приложение и откройте его снова из меню бота.",
            telegram.user,
            "telegram-error"
        );
    }

    const apiConfigurationError = getApiConfigurationError();
    if (!isApiEnabled() || apiConfigurationError) {
        throw new TelegramApiError(
            apiConfigurationError ||
                "API_URL не настроен. Невозможно подключиться к серверу.",
            telegram.user,
            "api-error"
        );
    }

    let authenticatedUser: ApiUser | null = null;
    try {
        console.info("[TelegramAuth] authenticating with backend", {
            initDataLength: telegram.initData.length,
            hasTelegramUser: Boolean(telegram.user),
            apiUrl: getApiUrl(),
        });
        const profile = await authenticateTelegram(telegram.initData);
        authenticatedUser = profileToApiUser(profile);
        console.info("[TelegramAuth] backend profile response", {
            telegram_id: authenticatedUser.telegram_id,
            username: authenticatedUser.username,
            tokens: authenticatedUser.tokens,
            level: authenticatedUser.level,
        });
        options.onBackendProfile?.(authenticatedUser);

        if (import.meta.env.DEV) {
            console.log("[DEV] Telegram initData exists:", Boolean(telegram.initData));
            console.log("[DEV] Telegram user from WebApp:", telegram.user);
            console.log("[DEV] API URL:", getApiUrl());
        }
        console.log("[API] base URL:", getApiUrl());
        console.log("[CHALLENGES] auth user:", authenticatedUser);

        const [
            rawChallenges,
            achievements,
            leaderboardAround,
            myLeaderboardRank,
        ] = await Promise.all([
            apiRequest<unknown>(
                "/api/challenges",
                { method: "GET" },
                telegram.initData
            ),
            apiRequest<ApiAchievement[]>(
                "/api/achievements",
                { method: "GET" },
                telegram.initData
            ).catch((err) => {
                if (import.meta.env.DEV) console.warn("[DEV] /api/achievements failed:", err);
                return [] as ApiAchievement[];
            }),
            getLeaderboardAroundMe(telegram.initData, 3).catch((err) => {
                if (import.meta.env.DEV) console.warn("[DEV] /api/leaderboard/around-me failed:", err);
                return { rank: 0, total_users: 0, items: [] };
            }),
            getMyLeaderboardRank(telegram.initData).catch((err) => {
                if (import.meta.env.DEV) console.warn("[DEV] /api/leaderboard/me failed:", err);
                return null as MyLeaderboardRankDto | null;
            }),
        ]);
        console.log(
            "[CHALLENGES] raw count:",
            Array.isArray(rawChallenges) ? rawChallenges.length : 0
        );
        console.log("[CHALLENGES] raw:", rawChallenges);
        const challenges = normalizeChallenges(rawChallenges);
        const activeChallenges = challenges.filter(
            (challenge) =>
                challenge.is_active !== false &&
                !Boolean(challenge.userCompleted ?? challenge.completed)
        );
        const completedChallenges = challenges.filter(
            (challenge) => Boolean(challenge.userCompleted)
        );
        console.log("[CHALLENGES] normalized count:", challenges.length);
        console.log("[CHALLENGES] normalized:", challenges);
        console.log("[REAL USER] challenges raw:", rawChallenges);
        console.log("[REAL USER] challenges normalized:", challenges);
        console.log("[REAL USER] active challenges:", activeChallenges);
        console.log("[CHALLENGES] rendered active:", activeChallenges);
        console.log("[REAL USER] active challenges count:", activeChallenges.length);
        console.log("[CHALLENGES] completed:", completedChallenges);
        console.info("[TelegramAuth] backend dashboard response", {
            challenges: challenges.length,
            achievements: achievements.length,
        });

        return {
            user: authenticatedUser,
            challenges,
            achievements,
            leaderboard: leaderboardAround.items,
            myLeaderboardRank,
            mode: "telegram",
        };
    } catch (reason) {
        let message =
            reason instanceof Error
                ? reason.message
                : "Не удалось подключиться к PULLUP API";
        if (reason instanceof PullupApiError) {
            if (reason.kind === "network") {
                message = `Backend недоступен или CORS/preflight заблокирован. ${reason.method} ${reason.requestUrl}. ${reason.message}`;
            } else if (reason.kind === "auth") {
                message = `Backend вернул ${reason.status}: Telegram initData не принят или доступ запрещён. ${reason.method} ${reason.requestUrl}.`;
            } else if (reason.kind === "config") {
                message = reason.message;
            } else if (reason.status) {
                message = `Backend вернул ${reason.status}. ${reason.method} ${reason.requestUrl}.`;
            }
        }
        console.error("[TelegramAuth] backend auth/dashboard failed", {
            message,
            reason,
        });
        throw new TelegramApiError(
            message,
            telegram.user,
            "api-error",
            authenticatedUser
        );
    }
}
