import { authenticateTelegram } from "../api/auth";
import {
    apiRequest,
    getApiConfigurationError,
    getApiUrl,
    getApiUrlSource,
    isApiEnabled,
    type ProfileDto,
} from "../api/client";
import { DEMO_API_USER, createDemoDashboard } from "../mocks/data";
import {
    detectAppMode,
    waitForTelegramWebApp,
} from "./telegram";

export interface ApiUser {
    telegram_id: number;
    display_name: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    tokens: number;
    balance: number;
    total_xp: number;
    level: number;
    next_level_progress: number;
    streak_days: number;
    referrals_count: number;
}

export interface ApiChallenge {
    exercise: string;
    progress: number;
    goal: number;
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
        balance: profile.balance,
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
        balance: 0,
        total_xp: 0,
        level: 1,
        next_level_progress: 0,
        streak_days: 0,
        referrals_count: 0,
    };
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
        const profile = await authenticateTelegram(telegram.initData);
        authenticatedUser = profileToApiUser(profile);
        options.onBackendProfile?.(authenticatedUser);

        if (import.meta.env.DEV) {
            console.log("[DEV] Telegram initData exists:", Boolean(telegram.initData));
            console.log("[DEV] Telegram user from WebApp:", telegram.user);
            console.log("[DEV] API URL:", getApiUrl());
        }

        const [challenges, achievements] = await Promise.all([
            apiRequest<ApiChallenge[]>(
                "/api/challenges",
                { method: "GET" },
                telegram.initData
            ).catch((err) => {
                if (import.meta.env.DEV) console.warn("[DEV] /api/challenges failed:", err);
                return [] as ApiChallenge[];
            }),
            apiRequest<ApiAchievement[]>(
                "/api/achievements",
                { method: "GET" },
                telegram.initData
            ).catch((err) => {
                if (import.meta.env.DEV) console.warn("[DEV] /api/achievements failed:", err);
                return [] as ApiAchievement[];
            }),
        ]);

        // Fallback: if backend returned empty challenges, use demo set
        const finalChallenges = (challenges && challenges.length > 0)
            ? challenges
            : (import.meta.env.DEV ? [] : undefined) ?? [];

        if ((finalChallenges as ApiChallenge[]).length === 0) {
            // prefer demo challenges when backend empty or failed
            const demo = createDemoDashboard(telegram.user ?? undefined, "telegram");
            return {
                user: authenticatedUser,
                challenges: demo.challenges,
                achievements: achievements && achievements.length > 0 ? achievements : demo.achievements,
                mode: "telegram",
            };
        }

        return {
            user: authenticatedUser,
            challenges: finalChallenges as ApiChallenge[],
            achievements,
            mode: "telegram",
        };
    } catch (reason) {
        const message =
            reason instanceof Error
                ? reason.message
                : "Не удалось подключиться к PULLUP API";
        // Instead of throwing, return demo dashboard with telegram-error mode
        if (import.meta.env.DEV) {
            console.error("[DEV] fetchDashboard error:", reason);
        }
        const demo = createDemoDashboard(telegram.user ?? undefined, "telegram-error");
        return demo;
    }
}
