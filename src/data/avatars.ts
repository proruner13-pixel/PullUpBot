export interface SportAvatar {
    id: string;
    name: string;
    url: string;
    accent: string;
}

function avatarSvg(
    from: string,
    to: string,
    emoji: string,
    mark: string
): string {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop stop-color="${from}"/>
                    <stop offset="1" stop-color="${to}"/>
                </linearGradient>
                <radialGradient id="glow">
                    <stop stop-color="#ffffff" stop-opacity=".24"/>
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <rect width="160" height="160" rx="80" fill="url(#bg)"/>
            <circle cx="80" cy="54" r="31" fill="#171b18"/>
            <path d="M25 150c5-41 23-63 55-63s50 22 55 63" fill="#171b18"/>
            <circle cx="80" cy="48" r="58" fill="url(#glow)"/>
            <text x="80" y="67" text-anchor="middle" font-size="38">${emoji}</text>
            <rect x="52" y="118" width="56" height="22" rx="11" fill="#000" fill-opacity=".42"/>
            <text x="80" y="134" text-anchor="middle" fill="#fff" font-family="Arial" font-size="13" font-weight="700">${mark}</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const SPORT_AVATARS: SportAvatar[] = [
    {
        id: "power",
        name: "Сила",
        accent: "#70e45a",
        url: avatarSvg("#51bd42", "#153817", "💪", "POWER"),
    },
    {
        id: "runner",
        name: "Скорость",
        accent: "#4ca7ff",
        url: avatarSvg("#328ee5", "#102844", "🏃", "RUN"),
    },
    {
        id: "fighter",
        name: "Боец",
        accent: "#ff9146",
        url: avatarSvg("#ee7133", "#441c0e", "🥊", "FIGHT"),
    },
    {
        id: "calisthenics",
        name: "Турник",
        accent: "#c871ff",
        url: avatarSvg("#a94be5", "#2c113d", "🏋️", "BAR"),
    },
    {
        id: "focus",
        name: "Фокус",
        accent: "#f4d45d",
        url: avatarSvg("#c6a72d", "#40350b", "🎯", "FOCUS"),
    },
    {
        id: "endurance",
        name: "Выносливость",
        accent: "#54d7d0",
        url: avatarSvg("#2dbdb6", "#0b3b38", "⚡", "ENDURE"),
    },
    {
        id: "champion",
        name: "Чемпион",
        accent: "#ffcf4d",
        url: avatarSvg("#e4aa27", "#49330a", "🏆", "CHAMP"),
    },
    {
        id: "night",
        name: "Ночной атлет",
        accent: "#7187ff",
        url: avatarSvg("#5369df", "#151b45", "🌙", "NIGHT"),
    },
    {
        id: "fire",
        name: "Огонь",
        accent: "#ff5d52",
        url: avatarSvg("#e83f36", "#46100d", "🔥", "FIRE"),
    },
    {
        id: "steel",
        name: "Сталь",
        accent: "#c6ced0",
        url: avatarSvg("#8a979a", "#242b2d", "🛡️", "STEEL"),
    },
];

