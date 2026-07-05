import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    Bell,
    BellRing,
    Bike,
    BookOpen,
    Check,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    Clipboard,
    Copy,
    Dumbbell,
    ExternalLink,
    Flame,
    Footprints,
    Gift,
    Image,
    Info,
    LogOut,
    Medal,
    MessageCircle,
    Moon,
    Palette,
    Play,
    RefreshCw,
    RotateCcw,
    Settings,
    Share2,
    ShieldCheck,
    Sparkles,
    Target,
    Trash2,
    Trophy,
    UserRound,
    UsersRound,
    Video,
    Volume2,
    Zap,
} from "lucide-react";
import type { ApiUser, DashboardMode } from "../utils/api";
import {
    EFFECT_STORAGE_KEYS,
    playError,
    playSuccess,
    playTap,
} from "../utils/sound";

export type MenuScreenId =
    | "settings"
    | "about"
    | "referrals"
    | "support"
    | "history"
    | "videos"
    | "logout";

export interface AppSettings {
    theme: "dark" | "neon";
    compact: boolean;
    trainingReminders: boolean;
    achievementNotifications: boolean;
    ratingNotifications: boolean;
    challengeNotifications: boolean;
    animations: boolean;
    sound: boolean;
    achievementSound: boolean;
    haptics: boolean;
    displayName: string;
}

export const SETTINGS_STORAGE_KEY = "pullup:settings";

export const DEFAULT_APP_SETTINGS: AppSettings = {
    theme: "neon",
    compact: false,
    trainingReminders: true,
    achievementNotifications: true,
    ratingNotifications: false,
    challengeNotifications: true,
    animations: true,
    sound: false,
    achievementSound: false,
    haptics: true,
    displayName: "",
};

export function loadAppSettings(): AppSettings {
    try {
        const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        const parsed = {
            ...DEFAULT_APP_SETTINGS,
            ...(stored
                ? (JSON.parse(stored) as Partial<AppSettings>)
                : {}),
        };
        const readEffect = (
            key: string,
            fallback: boolean
        ): boolean => {
            const value = window.localStorage.getItem(key);
            return value === null ? fallback : value === "true";
        };
        return {
            ...parsed,
            sound: readEffect(EFFECT_STORAGE_KEYS.sound, parsed.sound),
            achievementSound: readEffect(
                EFFECT_STORAGE_KEYS.achievementSound,
                parsed.achievementSound
            ),
            haptics: readEffect(
                EFFECT_STORAGE_KEYS.vibration,
                parsed.haptics
            ),
            animations: readEffect(
                EFFECT_STORAGE_KEYS.animations,
                parsed.animations
            ),
        };
    } catch {
        return DEFAULT_APP_SETTINGS;
    }
}

interface MenuScreensProps {
    screen: MenuScreenId;
    user: ApiUser;
    mode: DashboardMode;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onOpenAvatar: () => void;
    onResetProfile: () => void;
    onClearLocalData: () => void;
    onOpenSite: () => void;
    siteUrl: string;
    usesSiteUrlFallback: boolean;
    onBack: () => void;
}

type Toast = {
    text: string;
    tone?: "success" | "warning";
} | null;

function Toggle({
    checked,
    onChange,
    label,
    description,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <label className="settings-toggle-row">
            <span>
                <strong>{label}</strong>
                {description && <small>{description}</small>}
            </span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />
            <i aria-hidden="true" />
        </label>
    );
}

function MenuScreenHeader({
    eyebrow,
    title,
    onBack,
}: {
    eyebrow: string;
    title: string;
    onBack: () => void;
}) {
    return (
        <header className="menu-screen-header">
            <button onClick={onBack}>
                <ArrowLeft size={19} />
            </button>
            <div>
                <span>{eyebrow}</span>
                <h1>{title}</h1>
            </div>
        </header>
    );
}

function SettingsScreen({
    user,
    mode,
    settings,
    onSettingsChange,
    onOpenAvatar,
    onResetProfile,
    onClearLocalData,
    onOpenSite,
    siteUrl,
    usesSiteUrlFallback,
    showToast,
}: Omit<MenuScreensProps, "screen" | "onBack"> & {
    showToast: (toast: NonNullable<Toast>) => void;
}) {
    const update = <K extends keyof AppSettings>(
        key: K,
        value: AppSettings[K]
    ) => {
        onSettingsChange({ ...settings, [key]: value });
        playTap();
    };

    return (
        <div className="menu-screen-sections">
            <section className="settings-section">
                <div className="settings-section-title">
                    <Palette size={17} />
                    <div>
                        <strong>Внешний вид</strong>
                        <span>Выбери комфортный режим</span>
                    </div>
                </div>
                <div className="theme-picker">
                    <button
                        className={settings.theme === "dark" ? "active" : ""}
                        onClick={() => update("theme", "dark")}
                    >
                        <Moon size={18} />
                        Тёмная
                    </button>
                    <button
                        className={settings.theme === "neon" ? "active" : ""}
                        onClick={() => update("theme", "neon")}
                    >
                        <Zap size={18} />
                        Неоновая
                    </button>
                </div>
                <Toggle
                    checked={settings.compact}
                    onChange={(value) => update("compact", value)}
                    label="Компактный режим"
                    description="Больше информации на одном экране"
                />
            </section>

            <section className="settings-section">
                <div className="settings-section-title">
                    <ExternalLink size={17} />
                    <div>
                        <strong>Ссылки проекта</strong>
                        <span>Официальные ресурсы PULLUP</span>
                    </div>
                </div>
                <button className="settings-action" onClick={onOpenSite}>
                    <ExternalLink size={18} />
                    <span>
                        <strong>Сайт PULLUP</strong>
                        <small>{siteUrl}</small>
                    </span>
                    <ChevronRight size={17} />
                </button>
                {usesSiteUrlFallback && (
                    <p className="settings-env-warning">
                        VITE_PULLUP_SITE_URL не задан — используется резервный
                        адрес.
                    </p>
                )}
            </section>

            <section className="settings-section">
                <div className="settings-section-title">
                    <BellRing size={17} />
                    <div>
                        <strong>Уведомления</strong>
                        <span>Только то, что действительно важно</span>
                    </div>
                </div>
                <Toggle
                    checked={settings.trainingReminders}
                    onChange={(value) =>
                        update("trainingReminders", value)
                    }
                    label="Напоминания о тренировках"
                />
                <Toggle
                    checked={settings.achievementNotifications}
                    onChange={(value) =>
                        update("achievementNotifications", value)
                    }
                    label="Новые достижения"
                />
                <Toggle
                    checked={settings.ratingNotifications}
                    onChange={(value) =>
                        update("ratingNotifications", value)
                    }
                    label="Изменения рейтинга"
                />
                <Toggle
                    checked={settings.challengeNotifications}
                    onChange={(value) =>
                        update("challengeNotifications", value)
                    }
                    label="События челленджей"
                />
            </section>

            <section className="settings-section">
                <div className="settings-section-title">
                    <UserRound size={17} />
                    <div>
                        <strong>Профиль</strong>
                        <span>Локальные данные интерфейса</span>
                    </div>
                </div>
                <label className="settings-name-field">
                    <span>Отображаемое имя</span>
                    <input
                        value={settings.displayName}
                        placeholder={user.display_name}
                        maxLength={40}
                        onChange={(event) =>
                            update("displayName", event.target.value)
                        }
                    />
                </label>
                <button className="settings-action" onClick={onOpenAvatar}>
                    <Image size={18} />
                    Изменить аватар
                    <ChevronRight size={17} />
                </button>
                <button
                    className="settings-action"
                    onClick={() => {
                        onResetProfile();
                        showToast({
                            text: "Локальные данные профиля сброшены",
                            tone: "success",
                        });
                    }}
                >
                    <RotateCcw size={18} />
                    Сбросить локальный профиль
                    <ChevronRight size={17} />
                </button>
            </section>

            <section className="settings-section">
                <div className="settings-section-title">
                    <Settings size={17} />
                    <div>
                        <strong>Приложение</strong>
                        <span>Анимации и эффекты</span>
                    </div>
                </div>
                <Toggle
                    checked={settings.animations}
                    onChange={(value) => update("animations", value)}
                    label="Анимации"
                />
                <Toggle
                    checked={settings.sound}
                    onChange={(value) => update("sound", value)}
                    label="Звуки интерфейса"
                />
                <Toggle
                    checked={settings.achievementSound}
                    onChange={(value) =>
                        update("achievementSound", value)
                    }
                    label="Звуки достижений"
                />
                <Toggle
                    checked={settings.haptics}
                    onChange={(value) => update("haptics", value)}
                    label="Вибро-отклик"
                />
                <button
                    className="settings-action settings-action--danger"
                    onClick={() => {
                        onClearLocalData();
                        showToast({
                            text: "Локальные данные очищены",
                            tone: "warning",
                        });
                    }}
                >
                    <Trash2 size={18} />
                    Очистить localStorage PULLUP
                    <ChevronRight size={17} />
                </button>
            </section>

            <section className="security-card">
                <ShieldCheck size={24} />
                <div>
                    <strong>Безопасный вход</strong>
                    <span>
                        {mode === "telegram"
                            ? "Авторизация через Telegram WebApp"
                            : "Демо-режим: используются локальные данные"}
                    </span>
                </div>
                <b className={mode === "telegram" ? "online" : "demo"}>
                    {mode === "telegram" ? "Telegram" : "Demo"}
                </b>
            </section>
        </div>
    );
}

const ABOUT_SECTIONS = [
    {
        icon: Activity,
        title: "Что такое PULLUP",
        text: "Спортивная платформа, где ежедневный прогресс превращается в игру и реальные достижения.",
    },
    {
        icon: Target,
        title: "Как работают челленджи",
        text: "Выбирай цель, выполняй тренировки и постепенно заполняй шкалу прогресса.",
    },
    {
        icon: Gift,
        title: "Как начисляются токены",
        text: "Токены выдаются за подтверждённые активности, челленджи и участие в событиях.",
    },
    {
        icon: Medal,
        title: "Зачем нужны достижения",
        text: "Они отмечают важные этапы и собираются в персональную коллекцию силы.",
    },
    {
        icon: Trophy,
        title: "Как работает рейтинг",
        text: "Рейтинг сравнивает подтверждённые результаты за неделю, месяц или всё время.",
    },
    {
        icon: Video,
        title: "Видеоподтверждение",
        text: "Видео отправляется на модерацию, после чего результат попадает в прогресс.",
    },
    {
        icon: Sparkles,
        title: "Что будет дальше",
        text: "Турниры, команды, новые дисциплины, сезоны и ещё больше способов соревноваться.",
    },
];

function AboutScreen({
    showToast,
}: {
    showToast: (toast: NonNullable<Toast>) => void;
}) {
    return (
        <>
            <section className="about-hero">
                <div>
                    <Dumbbell size={31} />
                </div>
                <span>Спортивная экосистема</span>
                <h2>PULLUP</h2>
                <p>
                    Челленджи, рейтинги, достижения, токены и
                    видеоподтверждение тренировок в одном приложении.
                </p>
            </section>
            <div className="about-list">
                {ABOUT_SECTIONS.map(({ icon: Icon, title, text }) => (
                    <article key={title}>
                        <Icon size={19} />
                        <div>
                            <strong>{title}</strong>
                            <p>{text}</p>
                        </div>
                    </article>
                ))}
            </div>
            <section className="version-card">
                <div>
                    <span>Текущая версия</span>
                    <strong>v0.1.0 alpha</strong>
                </div>
                <button
                    onClick={() =>
                        showToast({
                            text: "У вас установлена последняя версия интерфейса",
                            tone: "success",
                        })
                    }
                >
                    <RefreshCw size={16} />
                    Проверить обновления
                </button>
            </section>
        </>
    );
}

function ReferralScreen({
    user,
    showToast,
}: {
    user: ApiUser;
    showToast: (toast: NonNullable<Toast>) => void;
}) {
    const referralCode = `PULLUP-${user.telegram_id}`;
    const referralLink = `https://t.me/ActiveRunBot?start=ref_${user.telegram_id}`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(referralLink);
            showToast({ text: "Ссылка скопирована", tone: "success" });
        } catch {
            showToast({
                text: "Не удалось скопировать ссылку",
                tone: "warning",
            });
        }
    };

    const share = async () => {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
            referralLink
        )}&text=${encodeURIComponent(
            "Присоединяйся ко мне в PULLUP!"
        )}`;
        const openTelegramLink =
            window.Telegram?.WebApp?.openTelegramLink;

        if (openTelegramLink) {
            openTelegramLink(shareUrl);
            return;
        }

        if (navigator.share) {
            try {
                await navigator.share({
                    title: "PULLUP",
                    text: "Присоединяйся ко мне в PULLUP!",
                    url: referralLink,
                });
                return;
            } catch {
                // User cancellation falls back to copying the link.
            }
        }

        await copy();
    };

    return (
        <>
            <section className="referral-hero-card">
                <div className="referral-gift">
                    <Gift size={35} />
                    <Sparkles size={17} />
                </div>
                <span>Твой бонус</span>
                <strong>0 токенов</strong>
                <p>за каждого активного друга</p>
            </section>

            <section className="referral-link-card">
                <span>Реферальный код</span>
                <strong>{referralCode}</strong>
                <p>{referralLink}</p>
                <div>
                    <button onClick={copy}>
                        <Copy size={17} />
                        Скопировать
                    </button>
                    <button onClick={share}>
                        <Share2 size={17} />
                        Поделиться
                    </button>
                </div>
            </section>

            <div className="referral-stats">
                <article>
                    <UsersRound size={18} />
                    <strong>{user.referrals_count}</strong>
                    <span>приглашено</span>
                </article>
                <article>
                    <Activity size={18} />
                    <strong>0</strong>
                    <span>активных</span>
                </article>
                <article>
                    <Medal size={18} />
                    <strong>0</strong>
                    <span>заработано</span>
                </article>
                <article>
                    <Gift size={18} />
                    <strong>0</strong>
                    <span>следующий бонус</span>
                </article>
            </div>

            <section className="how-it-works">
                <span>Как это работает</span>
                {[
                    "Отправь ссылку другу",
                    "Друг запускает PULLUP через Telegram",
                    "Друг выполняет первый челлендж",
                    "Ты получаешь бонусные токены",
                ].map((item, index) => (
                    <div key={item}>
                        <b>{index + 1}</b>
                        <p>{item}</p>
                    </div>
                ))}
            </section>
        </>
    );
}

const FAQ = [
    {
        question: "Как отправить видео?",
        answer: "Открой раздел тренировок, выбери упражнение и добавь видео перед сохранением активности.",
    },
    {
        question: "Почему видео на модерации?",
        answer: "Результат проверяет модератор, чтобы рейтинги и токены оставались честными.",
    },
    {
        question: "Как получить токены?",
        answer: "Выполняй тренировки и челленджи. После подтверждения результата токены начисляются автоматически.",
    },
    {
        question: "Почему достижение не открылось?",
        answer: "Учитываются только подтверждённые активности. Иногда прогресс обновляется после завершения модерации.",
    },
    {
        question: "Как работает рейтинг?",
        answer: "Он сравнивает подтверждённые результаты пользователей по выбранному периоду и дисциплине.",
    },
];

function SupportScreen({
    showToast,
}: {
    showToast: (toast: NonNullable<Toast>) => void;
}) {
    const [opened, setOpened] = useState<number | null>(0);
    return (
        <>
            <section className="support-hero">
                <CircleHelp size={31} />
                <div>
                    <span>Мы рядом</span>
                    <h2>Чем помочь?</h2>
                    <p>Ответы на частые вопросы о тренировках и прогрессе.</p>
                </div>
            </section>
            <div className="faq-list">
                {FAQ.map((item, index) => (
                    <article
                        className={opened === index ? "open" : ""}
                        key={item.question}
                    >
                        <button
                            onClick={() =>
                                setOpened(opened === index ? null : index)
                            }
                        >
                            {item.question}
                            <ChevronDown size={17} />
                        </button>
                        <AnimatePresence initial={false}>
                            {opened === index && (
                                <motion.p
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                >
                                    {item.answer}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </article>
                ))}
            </div>
            <button
                className="support-button"
                onClick={() =>
                    showToast({
                        text: "Поддержка скоро появится",
                        tone: "warning",
                    })
                }
            >
                <MessageCircle size={18} />
                Написать в поддержку
            </button>
        </>
    );
}

type HistoryFilter = "all" | "strength" | "running" | "challenge";

const TRAINING_HISTORY: Array<{
    title: string;
    value: string;
    date: string;
    type: HistoryFilter;
    icon: typeof Dumbbell;
    color: string;
}> = [];

function HistoryScreen() {
    const [filter, setFilter] = useState<HistoryFilter>("all");
    const visible = TRAINING_HISTORY.filter(
        (item) => filter === "all" || item.type === filter
    );

    return (
        <>
            <div className="history-filters">
                {(
                    [
                        ["all", "Все"],
                        ["strength", "Силовые"],
                        ["running", "Бег"],
                        ["challenge", "Челленджи"],
                    ] as Array<[HistoryFilter, string]>
                ).map(([id, label]) => (
                    <button
                        key={id}
                        className={filter === id ? "active" : ""}
                        onClick={() => setFilter(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <motion.div layout className="history-list">
                <AnimatePresence mode="popLayout">
                    {visible.map((item) => {
                        const Icon = item.icon;
                        return (
                            <motion.article
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                key={item.title}
                            >
                                <span
                                    style={
                                        {
                                            "--history-accent": item.color,
                                        } as React.CSSProperties
                                    }
                                >
                                    <Icon size={19} />
                                </span>
                                <div>
                                    <strong>{item.title}</strong>
                                    <p>{item.value}</p>
                                </div>
                                <time>{item.date}</time>
                            </motion.article>
                        );
                    })}
                </AnimatePresence>
                {!visible.length && (
                    <div className="menu-empty-state">
                        <Dumbbell size={24} />
                        <strong>Тренировок пока нет</strong>
                        <p>Первая подтверждённая активность появится здесь.</p>
                    </div>
                )}
            </motion.div>
        </>
    );
}

const MOCK_VIDEOS: Array<{
    title: string;
    result: string;
    status: "pending" | "approved";
    label: string;
    icon: typeof Dumbbell;
}> = [];

function VideosScreen() {
    return (
        <>
            <section className="videos-summary">
                <div>
                    <Play size={20} />
                    <strong>0</strong>
                    <span>видео</span>
                </div>
                <div>
                    <Clipboard size={20} />
                    <strong>0</strong>
                    <span>на проверке</span>
                </div>
                <div>
                    <Check size={20} />
                    <strong>0</strong>
                    <span>одобрено</span>
                </div>
            </section>
            <div className="videos-list">
                {MOCK_VIDEOS.map(({ icon: Icon, ...video }) => (
                    <article key={video.title}>
                        <div className="video-preview">
                            <Icon size={24} />
                            <Play size={16} />
                        </div>
                        <div>
                            <strong>{video.title}</strong>
                            <p>{video.result}</p>
                            <span className={`video-status ${video.status}`}>
                                {video.status === "pending" && (
                                    <RefreshCw size={11} />
                                )}
                                {video.status === "approved" && (
                                    <Check size={11} />
                                )}
                                {video.label}
                            </span>
                        </div>
                        <ChevronRight size={17} />
                    </article>
                ))}
                {!MOCK_VIDEOS.length && (
                    <div className="menu-empty-state">
                        <Video size={24} />
                        <strong>Видео пока нет</strong>
                        <p>Отправленные доказательства появятся здесь.</p>
                    </div>
                )}
            </div>
        </>
    );
}

function LogoutScreen({
    onClearLocalData,
    onBack,
    showToast,
}: {
    onClearLocalData: () => void;
    onBack: () => void;
    showToast: (toast: NonNullable<Toast>) => void;
}) {
    const [confirmed, setConfirmed] = useState(false);

    if (confirmed) {
        return (
            <section className="logout-success">
                <Check size={32} />
                <h2>Локальные данные очищены</h2>
                <p>Telegram-сессия не затронута. Можно продолжить в demo-режиме.</p>
                <button onClick={onBack}>Вернуться в приложение</button>
            </section>
        );
    }

    return (
        <section className="logout-confirm">
            <div>
                <LogOut size={33} />
            </div>
            <span>Локальный выход</span>
            <h2>Очистить данные?</h2>
            <p>
                Будут удалены настройки, аватар и локальные состояния PULLUP.
                Telegram WebApp продолжит работать.
            </p>
            <div className="logout-actions">
                <button onClick={onBack}>Отмена</button>
                <button
                    onClick={() => {
                        onClearLocalData();
                        setConfirmed(true);
                        showToast({
                            text: "Локальные данные очищены",
                            tone: "success",
                        });
                    }}
                >
                    <Trash2 size={16} />
                    Очистить
                </button>
            </div>
        </section>
    );
}

export default function MenuScreens(props: MenuScreensProps) {
    const [toast, setToast] = useState<Toast>(null);

    const meta = useMemo(() => {
        const values: Record<
            MenuScreenId,
            { eyebrow: string; title: string }
        > = {
            settings: { eyebrow: "Персонализация", title: "Настройки" },
            about: { eyebrow: "Твоя платформа", title: "О приложении" },
            referrals: { eyebrow: "Расти вместе", title: "Реферальная программа" },
            support: { eyebrow: "Центр помощи", title: "Поддержка" },
            history: { eyebrow: "Твой путь", title: "История тренировок" },
            videos: { eyebrow: "Видеоподтверждения", title: "Мои видео" },
            logout: { eyebrow: "Безопасность", title: "Выйти" },
        };
        return values[props.screen];
    }, [props.screen]);

    const showToast = (nextToast: NonNullable<Toast>) => {
        if (nextToast.tone === "warning") {
            playError();
        } else {
            playSuccess();
        }
        setToast(nextToast);
        window.setTimeout(() => setToast(null), 2200);
    };

    return (
        <>
            <MenuScreenHeader
                eyebrow={meta.eyebrow}
                title={meta.title}
                onBack={props.onBack}
            />
            {props.screen === "settings" && (
                <SettingsScreen {...props} showToast={showToast} />
            )}
            {props.screen === "about" && (
                <AboutScreen showToast={showToast} />
            )}
            {props.screen === "referrals" && (
                <ReferralScreen user={props.user} showToast={showToast} />
            )}
            {props.screen === "support" && (
                <SupportScreen showToast={showToast} />
            )}
            {props.screen === "history" && <HistoryScreen />}
            {props.screen === "videos" && <VideosScreen />}
            {props.screen === "logout" && (
                <LogoutScreen
                    onClearLocalData={props.onClearLocalData}
                    onBack={props.onBack}
                    showToast={showToast}
                />
            )}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        className={`app-toast ${toast.tone || "success"}`}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 15, scale: 0.96 }}
                    >
                        {toast.tone === "warning" ? (
                            <AlertTriangle size={17} />
                        ) : (
                            <Check size={17} />
                        )}
                        {toast.text}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
