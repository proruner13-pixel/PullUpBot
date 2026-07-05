export type TelegramWebApp = NonNullable<
    Window["Telegram"]
>["WebApp"];

export type DetectedAppMode =
    | "telegram"
    | "telegram-error"
    | "demo";

export function getTelegramWebApp(): TelegramWebApp | null {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return null;

    try {
        webApp.ready?.();
    } catch {
        // The SDK may expose a partial object outside Telegram.
    }
    return webApp;
}

export function hasTelegramScript(): boolean {
    return Boolean(
        document.querySelector(
            'script[src*="telegram.org/js/telegram-web-app.js"]'
        )
    );
}

export function getSafeCurrentUrl(): string {
    const url = new URL(window.location.href);
    url.searchParams.delete("tgWebAppData");
    url.hash = "";
    return url.toString();
}

export function isTelegramWebViewPossible(
    webApp: TelegramWebApp | null = getTelegramWebApp()
): boolean {
    const search = new URLSearchParams(window.location.search);
    const hasTelegramQuery = [
        "tgWebAppVersion",
        "tgWebAppPlatform",
        "tgWebAppThemeParams",
        "tgWebAppStartParam",
    ].some((key) => search.has(key));
    const telegramUserAgent = /Telegram/i.test(navigator.userAgent);
    const telegramReferrer = /(^|\.)t\.me|telegram/i.test(
        document.referrer
    );
    const knownPlatform = Boolean(
        webApp?.platform && webApp.platform !== "unknown"
    );

    return Boolean(
        webApp?.initData ||
            webApp?.initDataUnsafe?.user ||
            hasTelegramQuery ||
            telegramUserAgent ||
            telegramReferrer ||
            knownPlatform
    );
}

export function detectAppMode(
    webApp: TelegramWebApp | null = getTelegramWebApp()
): DetectedAppMode {
    if (webApp?.initData?.trim()) return "telegram";
    if (isTelegramWebViewPossible(webApp)) return "telegram-error";
    return "demo";
}

export async function waitForTelegramWebApp(
    timeoutMs = 1_200
): Promise<TelegramWebApp | null> {
    const immediate = getTelegramWebApp();
    if (immediate) return immediate;

    const startedAt = Date.now();
    return new Promise((resolve) => {
        const check = () => {
            const webApp = getTelegramWebApp();
            if (webApp || Date.now() - startedAt >= timeoutMs) {
                resolve(webApp);
                return;
            }
            window.setTimeout(check, 50);
        };
        check();
    });
}
