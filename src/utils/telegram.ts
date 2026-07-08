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
        webApp.expand?.();
    } catch {
        // The SDK may expose a partial object outside Telegram.
    }
    return webApp;
}

function logTelegramState(
    label: string,
    webApp: TelegramWebApp | null = window.Telegram?.WebApp ?? null
): void {
    console.info("[TelegramAuth]", label, {
        hasWindowTelegram: Boolean(window.Telegram),
        hasTelegramWebApp: Boolean(window.Telegram?.WebApp),
        initDataLength: webApp?.initData?.length ?? 0,
        hasInitDataUnsafeUser: Boolean(webApp?.initDataUnsafe?.user),
        platform: webApp?.platform ?? null,
        version: webApp?.version ?? null,
    });
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
    timeoutMs = 2_000
): Promise<TelegramWebApp | null> {
    const startedAt = Date.now();
    let attempts = 0;

    return new Promise((resolve) => {
        const check = () => {
            attempts += 1;
            const webApp = getTelegramWebApp();
            const hasInitData = Boolean(webApp?.initData?.trim());

            logTelegramState(`attempt ${attempts}`, webApp);

            if (webApp && hasInitData) {
                resolve(webApp);
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                logTelegramState("timeout", webApp);
                resolve(webApp);
                return;
            }
            window.setTimeout(check, 120);
        };
        check();
    });
}
