// src/global.d.ts
interface Window {
    Telegram?: {
        WebApp: {
            initData: string;
            initDataUnsafe?: {
                user?: {
                    id: number;
                    first_name: string;
                    last_name?: string;
                    username?: string;
                    photo_url?: string;
                };
            };
            ready?: () => void;
            version?: string;
            platform?: string;
            colorScheme?: "light" | "dark";
            onEvent: (event: string, callback: Function) => void;
            sendData: (data: string) => void;
            close: () => void;
            openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
            openTelegramLink?: (url: string) => void;
        };
    };
}
