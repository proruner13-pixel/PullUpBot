import { apiRequest, type ProfileDto } from "./client";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
    return typeof value === "object" && value !== null
        ? (value as UnknownRecord)
        : null;
}

function unwrapProfile(payload: unknown, depth = 0): UnknownRecord | null {
    if (depth > 4) return null;
    const record = asRecord(payload);
    if (!record) return null;
    if ("telegram_id" in record) return record;

    for (const key of ["user", "profile", "data"] as const) {
        const nested = unwrapProfile(record[key], depth + 1);
        if (nested) return nested;
    }
    return null;
}

function nullableString(value: unknown): string | null {
    return typeof value === "string" && value.trim()
        ? value
        : null;
}

function numberValue(value: unknown, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeProfileResponse(payload: unknown): ProfileDto {
    const profile = unwrapProfile(payload);
    if (!profile) {
        throw new Error("Backend вернул профиль неизвестного формата");
    }

    const telegramId = numberValue(profile.telegram_id, 0);
    if (!telegramId) {
        throw new Error("Backend не вернул telegram_id");
    }

    return {
        telegram_id: telegramId,
        username: nullableString(profile.username),
        first_name: nullableString(profile.first_name),
        last_name: nullableString(profile.last_name),
        avatar_url: nullableString(
            profile.avatar_url ?? profile.photo_url
        ),
        tokens: numberValue(profile.tokens, 0),
        level: numberValue(profile.level, 1),
        streak_days: numberValue(profile.streak_days, 0),
        ref_code: nullableString(profile.ref_code),
        referred_by:
            profile.referred_by === null ||
            profile.referred_by === undefined
                ? null
                : numberValue(profile.referred_by, 0) || null,
    };
}

export async function authenticateTelegram(
    initData: string
): Promise<ProfileDto> {
    if (!initData) {
        throw new Error("Telegram initData отсутствует");
    }
    const response = await apiRequest<unknown>("/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ initData }),
    }, initData);
    return normalizeProfileResponse(response);
}
