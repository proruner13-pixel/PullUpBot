import {
    ACHIEVEMENTS,
    CHALLENGE_TO_EXERCISE,
    DEMO_DATA_VERSION,
    DEMO_DATA_VERSION_KEY,
    USER_STORAGE_KEY,
    cloneInitialUser,
    loadUser,
    type ChallengeType,
} from "../game/progress";
import { XP_PER_LEVEL, calculateLevel } from "../game/economy";
import {
    DEMO_API_USER,
    DEMO_TELEGRAM_ID,
} from "../mocks/data";

export interface ProfileDto {
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    tokens: number;
    xp: number;
    total_xp: number;
    level: number;
    next_level_progress: number;
    streak_days: number;
    ref_code: string | null;
    referred_by: number | null;
}

export interface ChallengeDto {
    id: number;
    slug: string;
    title: string;
    description: string | null;
    type: string;
    goal: number;
    reward_tokens: number;
    is_active: boolean;
    progress: number;
    xp: number;
    level: number;
    next_level_progress: number;
    completed: boolean;
}

export interface AchievementDto {
    id: number;
    slug: string;
    title: string;
    description: string;
    category: string;
    icon: string;
    requirement_type: string;
    requirement_value: number;
    reward_tokens: number;
    is_active: boolean;
    unlocked: boolean;
}

export interface LeaderboardUserDto {
    id: number;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    avatar_url: string | null;
    xp: number;
    level: number;
    balance: number;
    approved_workouts: number;
}

export interface LeaderboardEntryDto extends LeaderboardUserDto {
    rank: number;
}

export interface LeaderboardAroundEntryDto extends LeaderboardEntryDto {
    is_current_user: boolean;
}

export interface MyLeaderboardRankDto {
    rank: number;
    total_users: number;
    users_above: number;
    users_below: number;
    user: LeaderboardUserDto;
}

export interface LeaderboardListDto {
    total_users: number;
    items: LeaderboardEntryDto[];
}

export interface LeaderboardAroundMeDto {
    rank: number;
    total_users: number;
    items: LeaderboardAroundEntryDto[];
}

export type ApiFailureKind =
    | "config"
    | "network"
    | "auth"
    | "http"
    | "parse";

export class PullupApiError extends Error {
    readonly kind: ApiFailureKind;
    readonly requestUrl: string;
    readonly method: string;
    readonly status?: number;

    constructor({
        kind,
        message,
        requestUrl,
        method,
        status,
    }: {
        kind: ApiFailureKind;
        message: string;
        requestUrl: string;
        method: string;
        status?: number;
    }) {
        super(message);
        this.name = "PullupApiError";
        this.kind = kind;
        this.requestUrl = requestUrl;
        this.method = method;
        this.status = status;
    }
}

const CONFIGURED_API_URL = (import.meta.env.VITE_API_URL ?? "")
    .trim()
    .replace(/\/$/, "");
const DEV_API_FALLBACK = "https://pullup-backend-dtxl.onrender.com";

function isLocalApiUrl(url: string): boolean {
    if (!url) return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return (
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1"
        );
    } catch {
        return false;
    }
}

const configuredApiIsLocal = isLocalApiUrl(CONFIGURED_API_URL);

export const API_URL =
    import.meta.env.PROD && configuredApiIsLocal
        ? ""
        : CONFIGURED_API_URL ||
          (import.meta.env.DEV ? DEV_API_FALLBACK : "");

export function isApiEnabled(): boolean {
    return Boolean(API_URL);
}

export function getApiUrl(): string {
    return API_URL;
}

export function getApiUrlSource(): "env" | "fallback" | "localhost" {
    if (configuredApiIsLocal) return "localhost";
    return CONFIGURED_API_URL ? "env" : "fallback";
}

export function getApiConfigurationError(): string | null {
    if (import.meta.env.PROD && configuredApiIsLocal) {
        return `Ошибка: VITE_API_URL указывает на localhost (${CONFIGURED_API_URL}). Для Telegram нужен публичный HTTPS backend.`;
    }
    if (!API_URL) {
        return "VITE_API_URL не настроен. Укажите https://pullup-backend-dtxl.onrender.com в Vercel Environment Variables.";
    }
    if (import.meta.env.PROD && !API_URL.startsWith("https://")) {
        return `Ошибка: VITE_API_URL должен быть публичным HTTPS backend. Сейчас используется: ${API_URL}`;
    }
    return null;
}

function authHeaders(initData?: string): HeadersInit {
    const telegramInitData =
        initData ?? window.Telegram?.WebApp?.initData;
    return {
        "Content-Type": "application/json",
        ...(telegramInitData
            ? { Authorization: `tma ${telegramInitData}` }
            : {}),
    };
}

export async function apiRequest<T>(
    path: string,
    init?: RequestInit,
    initData?: string
): Promise<T> {
    const method = init?.method ?? "GET";
    const configurationError = getApiConfigurationError();
    if (configurationError) {
        throw new PullupApiError({
            kind: "config",
            message: configurationError,
            requestUrl: API_URL ? `${API_URL}${path}` : path,
            method,
        });
    }

    const url = `${API_URL}${path}`;
    const headers = {
        ...authHeaders(initData),
        ...init?.headers,
    } as Record<string, string>;

    if (import.meta.env.DEV) {
        console.log("[DEV] apiRequest ->", method, url);
        console.log("[DEV] apiRequest headers include Authorization:", Boolean(headers.Authorization));
    }

    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            headers,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Network request failed";
        console.error("[PULLUP API] fetch failed", {
            url,
            method,
            message,
            apiBaseUrl: API_URL,
            apiUrlSource: getApiUrlSource(),
        });
        throw new PullupApiError({
            kind: "network",
            message:
                `CORS/network error: backend недоступен или preflight заблокирован. ` +
                `Request: ${method} ${url}. Detail: ${message}`,
            requestUrl: url,
            method,
        });
    }

    console.info("[PULLUP API] response", {
        url,
        method,
        status: response.status,
        ok: response.ok,
    });

    if (import.meta.env.DEV) {
        console.log("[DEV] apiRequest response status:", response.status, response.statusText);
        try {
            const text = await response.clone().text();
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch {
                parsed = text;
            }
            console.log("[DEV] apiRequest response body:", parsed);
        } catch (err) {
            console.warn("[DEV] apiRequest failed to read response body", err);
        }
    }

    if (!response.ok) {
        let detail = `PULLUP API error: ${response.status}`;
        try {
            const body = (await response.json()) as { detail?: unknown };
            if (typeof body.detail === "string") detail = body.detail;
        } catch {
            // Keep the HTTP status when the response is not JSON.
        }
        const kind: ApiFailureKind =
            response.status === 401 || response.status === 403
                ? "auth"
                : "http";
        const message =
            kind === "auth"
                ? `Backend вернул ${response.status}: Telegram initData не принят или доступ запрещён. Request: ${method} ${url}. Detail: ${detail}`
                : `Backend вернул ${response.status}. Request: ${method} ${url}. Detail: ${detail}`;
        console.error("[PULLUP API] error response", {
            url,
            method,
            status: response.status,
            message,
        });
        throw new PullupApiError({
            kind,
            message,
            requestUrl: url,
            method,
            status: response.status,
        });
    }
    try {
        return (await response.json()) as T;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Invalid JSON response";
        console.error("[PULLUP API] response parse failed", {
            url,
            method,
            status: response.status,
            message,
        });
        throw new PullupApiError({
            kind: "parse",
            message: `Backend ответил некорректным JSON. Request: ${method} ${url}. Detail: ${message}`,
            requestUrl: url,
            method,
            status: response.status,
        });
    }
}

function localProfile(): ProfileDto {
    const user = loadUser();
    return {
        telegram_id: DEMO_TELEGRAM_ID,
        username: DEMO_API_USER.username,
        first_name: user.name,
        last_name: null,
        avatar_url: user.avatarUrl ?? null,
        tokens: user.tokens,
        xp: user.xp,
        total_xp: user.xp,
        level: calculateLevel(user.xp),
        next_level_progress: user.xp % XP_PER_LEVEL,
        streak_days: user.streakDays,
        ref_code: "PULLUP-DEMO-123",
        referred_by: null,
    };
}

export async function getProfile(): Promise<ProfileDto> {
    return isApiEnabled()
        ? apiRequest<ProfileDto>("/profile/me")
        : localProfile();
}

export async function getAchievements(): Promise<AchievementDto[]> {
    if (isApiEnabled()) {
        return apiRequest<AchievementDto[]>("/api/achievements");
    }
    const user = loadUser();
    return ACHIEVEMENTS.map((achievement, index) => ({
        id: index + 1,
        slug: achievement.id,
        title: achievement.title,
        description: achievement.description,
        category: "sport",
        icon: achievement.icon,
        requirement_type: achievement.id,
        requirement_value: 1,
        reward_tokens: 0,
        is_active: true,
        unlocked: user.achievements.includes(achievement.id),
    }));
}

export async function getChallenges(initData?: string): Promise<ChallengeDto[]> {
    if (isApiEnabled()) {
        return apiRequest<ChallengeDto[]>("/api/challenges", undefined, initData);
    }
    const user = loadUser();
    return (
        Object.entries(user.challenges) as Array<
            [ChallengeType, (typeof user.challenges)[ChallengeType]]
        >
    ).map(([type, challenge], index) => ({
        id: index + 1,
        slug: CHALLENGE_TO_EXERCISE[type],
        title: type[0].toUpperCase() + type.slice(1),
        description: null,
        type: CHALLENGE_TO_EXERCISE[type],
        goal: challenge.goal,
        reward_tokens: 0,
        is_active: true,
        progress: challenge.progress,
        xp: challenge.xp,
        level: challenge.level,
        next_level_progress: challenge.xp % XP_PER_LEVEL,
        completed: false,
    }));
}

export async function getLeaderboard(
    initData?: string,
    limit = 50,
    offset = 0
): Promise<LeaderboardListDto> {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
    });
    return isApiEnabled()
        ? apiRequest<LeaderboardListDto>(
              `/api/leaderboard?${params.toString()}`,
              undefined,
              initData
          )
        : { total_users: 0, items: [] };
}

export async function getMyLeaderboardRank(
    initData?: string
): Promise<MyLeaderboardRankDto | null> {
    return isApiEnabled()
        ? apiRequest<MyLeaderboardRankDto>("/api/leaderboard/me", undefined, initData)
        : null;
}

export async function getLeaderboardAroundMe(
    initData?: string,
    radius = 3
): Promise<LeaderboardAroundMeDto> {
    const params = new URLSearchParams({
        radius: String(radius),
    });
    return isApiEnabled()
        ? apiRequest<LeaderboardAroundMeDto>(
              `/api/leaderboard/around-me?${params.toString()}`,
              undefined,
              initData
          )
        : { rank: 0, total_users: 0, items: [] };
}

export async function updateAvatar(avatarUrl: string): Promise<ProfileDto> {
    if (isApiEnabled()) {
        return apiRequest<ProfileDto>("/profile/me/avatar", {
            method: "PATCH",
            body: JSON.stringify({ avatar_url: avatarUrl }),
        });
    }
    window.localStorage.setItem("pullup:customAvatar", avatarUrl);
    window.localStorage.setItem("pullup:selectedAvatar", "custom");
    return { ...localProfile(), avatar_url: avatarUrl };
}

export async function resetDemoProgress(): Promise<ProfileDto> {
    Object.keys(window.localStorage)
        .filter(
            (key) =>
                key.startsWith("pullup:") || key.startsWith("pullup_")
        )
        .forEach((key) => window.localStorage.removeItem(key));

    const user = cloneInitialUser();
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    window.localStorage.setItem(
        DEMO_DATA_VERSION_KEY,
        DEMO_DATA_VERSION
    );
    return localProfile();
}
