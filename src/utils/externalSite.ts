export const FALLBACK_PULLUP_SITE_URL = "https://pullup-sport.vercel.app";

const configuredSiteUrl = (import.meta.env.VITE_PULLUP_SITE_URL ?? "").trim();

export const PULLUP_SITE_URL =
    configuredSiteUrl || FALLBACK_PULLUP_SITE_URL;

export const isPullupSiteUrlFallback = configuredSiteUrl.length === 0;

export type OpenExternalSiteResult =
    | { ok: true; method: "telegram" | "browser" }
    | { ok: false; reason: string };

function isSafeWebUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

export function openPullupSite(): OpenExternalSiteResult {
    if (!isSafeWebUrl(PULLUP_SITE_URL)) {
        return {
            ok: false,
            reason: "URL сайта PULLUP настроен некорректно.",
        };
    }

    try {
        const telegramOpenLink = window.Telegram?.WebApp?.openLink;
        if (typeof telegramOpenLink === "function") {
            window.Telegram!.WebApp.openLink!(PULLUP_SITE_URL);
            return { ok: true, method: "telegram" };
        }

        window.open(
            PULLUP_SITE_URL,
            "_blank",
            "noopener,noreferrer"
        );
        return { ok: true, method: "browser" };
    } catch {
        return {
            ok: false,
            reason: "Не удалось открыть сайт PULLUP.",
        };
    }
}
