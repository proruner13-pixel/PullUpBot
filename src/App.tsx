import { useCallback, useEffect, useMemo,useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Activity,
    Award,
    CalendarDays,
    Check,
    ChevronRight,
    Copy,
    Dumbbell,
    Flame,
    Globe2,
    Home,
    Medal,
    Menu,
    Plus,
    Settings,
    ShieldCheck,
    Target,
    Trophy,
    Upload,
    UserRound,
    Video,
    X,
    Zap,
} from "lucide-react";
import {
    fetchDashboard,
    getFrontendApiConfigurationError,
    getFrontendApiUrl,
    getFrontendApiUrlSource,
    getTelegramWebAppData,
    isTelegramApiError,
    type ApiAchievement,
    type ApiChallenge,
    type ApiUser,
    type DashboardMode,
} from "./utils/api";
import {
    checkApiHealth,
    type ApiHealthResponse,
} from "./api/health";
import {
    detectAppMode,
    getSafeCurrentUrl,
    getTelegramWebApp,
    hasTelegramScript,
    isTelegramWebViewPossible,
} from "./utils/telegram";
import { updateProfileAvatar } from "./api/profile";
import {
    getMySubmissions,
    submitVideo,
    type SubmissionResponse,
} from "./api/submissions";
import AvatarPickerModal from "./components/AvatarPickerModal";
import SideMenu, {
    type SideMenuAction,
} from "./components/SideMenu";
import AchievementsCatalogScreen, {
    type AchievementView,
} from "./components/AchievementsScreen";
import LeaderboardScreen from "./components/LeaderboardScreen";
import PlaceholderScreen from "./components/PlaceholderScreen";
import MenuScreens, {
    DEFAULT_APP_SETTINGS,
    SETTINGS_STORAGE_KEY,
    loadAppSettings,
    type AppSettings,
    type MenuScreenId,
} from "./components/MenuScreens";
import { SPORT_AVATARS } from "./data/avatars";
import {
    ACHIEVEMENT_CATALOG,
    type AchievementDefinition,
} from "./data/achievements";
import {
    ACHIEVEMENTS as GAME_ACHIEVEMENTS,
    CHALLENGE_TO_EXERCISE,
    DEMO_DATA_VERSION,
    DEMO_DATA_VERSION_KEY,
    EXERCISE_TO_CHALLENGE,
    USER_STORAGE_KEY,
    addResultToUser,
    cloneInitialUser,
    loadUser,
    type ChallengeType,
    type User as GameUser,
} from "./game/progress";
import {
    EXERCISE_TYPES,
    normalizeExerciseType,
} from "./config/exerciseTypes";
import {
    XP_PER_LEVEL,
    calculateLevel,
    calculateProgress,
    calculatePullupReward,
    calculateXp,
    getLevelTitle,
    normalizeEconomyActivity,
} from "./game/economy";
import {
    resetDemoProgress as resetStoredDemoProgress,
    type LeaderboardEntryDto,
    type MyLeaderboardRankDto,
} from "./api/client";
import {
    EFFECT_STORAGE_KEYS,
    animationsEnabled,
    playAchievement,
    playError,
    playOpen,
    playSuccess,
    playTap,
    playToken,
} from "./utils/sound";
import {
    PULLUP_SITE_URL,
    isPullupSiteUrlFallback,
    openPullupSite,
} from "./utils/externalSite";

type Tab = "home" | "challenges" | "workouts" | "achievements" | "profile";
type AppView = Tab | "leaderboard" | "placeholder" | "menu";
type ProfileSource =
    | "backend"
    | "telegram"
    | "localStorage"
    | "demo"
    | "none";
type AuthStatus =
    | "loading"
    | "authenticating"
    | "authenticated"
    | "backend-error"
    | "telegram-error"
    | "demo";
type ApiHealthStatus =
    | "not-checked"
    | "checking"
    | "ok"
    | "backend-error";

const AVATAR_STORAGE_KEY = "pullup:selectedAvatar";
const CUSTOM_AVATAR_STORAGE_KEY = "pullup:customAvatar";
const SEEN_ACHIEVEMENTS_KEY = "pullup:seenAchievements";
const DEMO_WORKOUTS_STORAGE_KEY = "pullup:weeklyWorkouts";

type WorkoutType = "pullup" | "pushup" | "run" | "plank";

interface WorkoutEntry {
    type: WorkoutType;
    date: string;
    value: number;
    tokens: number;
    xp: number;
    status: "pending" | "approved" | "rejected" | "completed";
}

interface WorkoutTypeSummary {
    type: WorkoutType;
    tokens: number;
    xp: number;
}

interface WeeklyWorkoutDay {
    key: string;
    date: Date;
    label: string;
    tokens: number;
    xp: number;
    segments: WorkoutTypeSummary[];
}

type ToastType =
    | "success"
    | "error"
    | "info"
    | "achievement"
    | "token";

interface GameNotification {
    type: ToastType;
    text: string;
}

function gameChallengesToApi(user: GameUser): ApiChallenge[] {
    return Object.entries(user.challenges).map(([type, challenge]) => ({
        exercise: CHALLENGE_TO_EXERCISE[type as ChallengeType],
        progress: challenge.progress,
        goal: challenge.goal,
        xp: challenge.xp,
        level: challenge.level,
        next_level_progress: challenge.xp % XP_PER_LEVEL,
    }));
}

type ChallengeVisual = {
    label: string;
    shortLabel: string;
    color: string;
    image: string;
    reward: number;
};

const CHALLENGE_VISUALS: Record<string, ChallengeVisual> = {
    pullups: {
        label: "Ежедневный воркаут",
        shortLabel: "Подтягивания",
        color: "#71e45b",
        image: "/assets/workouts/pullups.png",
        reward: 200,
    },
    pushups: {
        label: "Отжимания мастер",
        shortLabel: "Отжимания",
        color: "#55a8ff",
        image: "/assets/workouts/pushups.png",
        reward: 400,
    },
    plank: {
        label: "Планка про",
        shortLabel: "Планка",
        color: "#d86cff",
        image: "/assets/workouts/plank.png",
        reward: 300,
    },
    running: {
        label: "Сила недели",
        shortLabel: "Бег",
        color: "#ff9e45",
        image: "/assets/workouts/running.png",
        reward: 500,
    },
};

const WORKOUT_TYPE_META: Record<
    WorkoutType,
    { label: string; color: string }
> = {
    pullup: { label: "Подтягивания", color: "#71e45b" },
    pushup: { label: "Отжимания", color: "#55a8ff" },
    run: { label: "Бег", color: "#ff9e45" },
    plank: { label: "Планка", color: "#d86cff" },
};

function visualForWorkoutType(type: WorkoutType): ChallengeVisual {
    if (type === "run") return CHALLENGE_VISUALS.running;
    if (type === "plank") return CHALLENGE_VISUALS.plank;
    if (type === "pushup") return CHALLENGE_VISUALS.pushups;
    return CHALLENGE_VISUALS.pullups;
}

function WorkoutImage({
    visual,
    className = "",
}: {
    visual: ChallengeVisual;
    className?: string;
}) {
    return (
        <img
            className={`workout-image ${className}`.trim()}
            src={visual.image}
            alt={visual.shortLabel}
            loading="lazy"
        />
    );
}

const NAV_ITEMS: Array<{
    id: Tab;
    label: string;
    icon: typeof Home;
}> = [
    { id: "home", label: "Главная", icon: Home },
    { id: "challenges", label: "Челленджи", icon: Trophy },
    { id: "workouts", label: "Тренировки", icon: Dumbbell },
    { id: "achievements", label: "Достижения", icon: Medal },
    { id: "profile", label: "Профиль", icon: UserRound },
];

function percent(challenge: ApiChallenge): number {
    if (challenge.goal <= 0) return 0;
    return Math.min(100, Math.round((challenge.progress / challenge.goal) * 100));
}

function levelProgress(xp: number): number {
    return Math.max(0, xp % XP_PER_LEVEL);
}

function apiLevelProgress(value: number | undefined, xp: number): number {
    return value ?? levelProgress(xp);
}

const PROFILE_LEVEL_MILESTONES = Array.from(
    { length: 7 },
    (_, index) => (index + 1) * XP_PER_LEVEL
);

function profileChallengeValue(
    challenges: ApiChallenge[],
    exercise: string
): number {
    return Math.max(
        0,
        Math.round(
            challenges.find((challenge) => challenge.exercise === exercise)
                ?.progress ?? 0
        )
    );
}

function formatCompactDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) return `${hours} ч ${minutes} мин`;
    if (minutes > 0) return `${minutes} мин`;
    return `${seconds} сек`;
}

function formatDistance(value: number): string {
    return `${Math.max(0, value).toLocaleString("ru-RU")} км`;
}

function formatWorkoutValue(type: WorkoutType, value: number): string {
    const safeValue = Math.max(Number.isFinite(value) ? value : 0, 0);
    if (type === "run") {
        return `${safeValue.toLocaleString("ru-RU")} км`;
    }
    if (type === "plank") {
        return formatCompactDuration(safeValue);
    }
    return `${Math.floor(safeValue).toLocaleString("ru-RU")} раз`;
}

function workoutStatusLabel(status: WorkoutEntry["status"]): string {
    if (status === "approved" || status === "completed") return "Одобрено";
    if (status === "rejected") return "Отклонено";
    return "На проверке";
}

function userGreetingName(user: ApiUser | null): string {
    if (!user) return "спортсмен";
    return (
        user.first_name ||
        user.display_name?.split(" ")[0] ||
        user.username ||
        "спортсмен"
    );
}

function toDayKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date): string {
    return `${String(date.getDate()).padStart(2, "0")}.${String(
        date.getMonth() + 1
    ).padStart(2, "0")}`;
}

function formatRelativeWorkoutDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 60) return `${Math.max(diffMinutes, 1)} мин назад`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} ч назад`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Вчера";
    return `${diffDays} дн назад`;
}

function formatFullDate(date: Date): string {
    return `${formatShortDate(date)}.${date.getFullYear()}`;
}

function normalizeWorkoutType(type: string): WorkoutType | null {
    const normalized: Record<string, WorkoutType> = {
        pullups: "pullup",
        pushups: "pushup",
        running: "run",
        plank: "plank",
    };
    return normalized[normalizeExerciseType(type)] ?? null;
}

function calculateWorkoutTokens(type: WorkoutType, value: number): number {
    return calculatePullupReward(normalizeEconomyActivity(type), value);
}

function calculateWorkoutXp(tokens: number): number {
    return calculateXp(tokens);
}

function workoutRecord(raw: unknown): Record<string, unknown> {
    return raw && typeof raw === "object" ? Object(raw) : {};
}

function normalizeWorkout(raw: SubmissionResponse | Record<string, unknown>): WorkoutEntry | null {
    const record = workoutRecord(raw);
    const rawType =
        record.exercise_type ??
        record.type ??
        record.workout_type;
    const type = typeof rawType === "string" ? normalizeWorkoutType(rawType) : null;
    if (!type) return null;
    const rawValue =
        record.value ??
        record.count ??
        record.amount ??
        record.distance ??
        record.duration;
    const value = Number(rawValue ?? 0);
    const safeValue = Number.isFinite(value) ? value : 0;
    const rawStatus = record.status;
    const status =
        rawStatus === "pending" ||
        rawStatus === "approved" ||
        rawStatus === "rejected" ||
        rawStatus === "completed"
            ? rawStatus
            : "approved";
    const createdAt =
        record.created_at ??
        record.completed_at ??
        record.date;
    const tokens = calculateWorkoutTokens(type, safeValue);
    return {
        type,
        date:
            typeof createdAt === "string"
                ? createdAt
                : new Date().toISOString(),
        value: safeValue,
        tokens,
        xp: calculateWorkoutXp(tokens),
        status,
    };
}

function challengeTypeToWorkoutType(type: ChallengeType): WorkoutType {
    const map: Record<ChallengeType, WorkoutType> = {
        подтягивания: "pullup",
        отжимания: "pushup",
        планка: "plank",
        бег: "run",
    };
    return map[type];
}

function readDemoWorkouts(): WorkoutEntry[] {
    try {
        const raw = window.localStorage.getItem(DEMO_WORKOUTS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is WorkoutEntry => {
            if (typeof item !== "object" || item === null) return false;
            const candidate = item as Partial<WorkoutEntry>;
            return (
                typeof candidate.date === "string" &&
                typeof candidate.value === "number" &&
                typeof candidate.tokens === "number" &&
                typeof candidate.xp === "number" &&
                (candidate.status === "pending" ||
                    candidate.status === "approved" ||
                    candidate.status === "rejected" ||
                    candidate.status === undefined) &&
                Boolean(candidate.type && WORKOUT_TYPE_META[candidate.type])
            );
        }).map((item) => ({
            ...item,
            status: item.status ?? "approved",
        }));
    } catch {
        return [];
    }
}

function buildWeeklyWorkoutDays(workouts: WorkoutEntry[]): WeeklyWorkoutDay[] {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setHours(0, 0, 0, 0);
        date.setDate(today.getDate() - (6 - index));
        return date;
    });

    const byDay = new Map<string, Map<WorkoutType, WorkoutTypeSummary>>();
    for (const day of days) {
        byDay.set(toDayKey(day), new Map<WorkoutType, WorkoutTypeSummary>());
    }

    for (const workout of workouts) {
        if (workout.status !== "approved") continue;
        const date = new Date(workout.date);
        if (Number.isNaN(date.getTime())) continue;
        const key = toDayKey(date);
        const day = byDay.get(key);
        if (!day) continue;
        const current =
            day.get(workout.type) ?? {
                type: workout.type,
                tokens: 0,
                xp: 0,
            };
        current.tokens += workout.tokens;
        current.xp += workout.xp;
        day.set(workout.type, current);
    }

    const typeOrder: WorkoutType[] = ["pullup", "pushup", "run", "plank"];
    return days.map((date) => {
        const key = toDayKey(date);
        const segments = typeOrder
            .map((type) => byDay.get(key)?.get(type))
            .filter((segment): segment is WorkoutTypeSummary => Boolean(segment));
        return {
            key,
            date,
            label: formatShortDate(date),
            tokens: segments.reduce((sum, segment) => sum + segment.tokens, 0),
            xp: segments.reduce((sum, segment) => sum + segment.xp, 0),
            segments,
        };
    });
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function AnimatedNumber({ value }: { value: number }) {
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
        if (
            !animationsEnabled() ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            setDisplayValue(value);
            return;
        }

        const from = displayValue;
        const startedAt = performance.now();
        const duration = 420;
        let frame = 0;
        const animate = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.round(from + (value - from) * eased));
            if (progress < 1) {
                frame = window.requestAnimationFrame(animate);
            }
        };
        frame = window.requestAnimationFrame(animate);
        return () => window.cancelAnimationFrame(frame);
    }, [value]);

    return <>{displayValue.toLocaleString("ru-RU")}</>;
}

function achievementProgress(
    achievement: AchievementDefinition,
    user: ApiUser,
    challenges: ApiChallenge[]
): number {
    const challengeProgress = Object.fromEntries(
        challenges.map((challenge) => [
            challenge.exercise,
            challenge.progress,
        ])
    );

    switch (achievement.metric) {
        case "pullups":
        case "pushups":
        case "plank":
        case "running":
            return (
                challengeProgress[achievement.metric] ?? 0
            );
        case "tokens":
            return user.tokens;
        case "referrals":
            return user.referrals_count;
        case "workouts":
            return Math.max(
                challenges.filter((challenge) => challenge.progress > 0).length
            );
        case "activities":
            return Math.max(
                challenges.reduce(
                    (sum, challenge) =>
                        sum + (challenge.progress > 0 ? 1 : 0),
                    0
                )
            );
        case "streak":
        case "special":
            return 0;
    }
}

function ChallengeCard({
    challenge,
    compact = false,
    onClick,
}: {
    challenge: ApiChallenge;
    compact?: boolean;
    onClick?: () => void;
}) {
    const visual = CHALLENGE_VISUALS[challenge.exercise] ??
        CHALLENGE_VISUALS.pullups;
    const value = percent(challenge);

    return (
        <motion.button
            type="button"
            layout
            whileTap={{ scale: 0.985 }}
            className={`challenge-card ${compact ? "challenge-card--compact" : ""}`}
            style={{ "--accent": visual.color } as React.CSSProperties}
            onClick={onClick}
        >
            <div className="challenge-emblem" aria-hidden="true">
                <WorkoutImage visual={visual} />
            </div>
            <div className="challenge-body">
                <div className="challenge-heading">
                    <div>
                        <h3>{visual.label}</h3>
                        <p className="text-sm text-muted">
                            {challenge.progress} / {challenge.goal} {" "}
                            {challenge.exercise === "running"
                                ? "км"
                                : challenge.exercise === "plank"
                                  ? "мин"
                                  : "раз"}
                        </p>
                    </div>
                    <span className="reward">
                        +{visual.reward}
                        <img
                            className="pullup-coin-icon"
                            src="/assets/home/pullup-coin.png"
                            alt=""
                            aria-hidden="true"
                        />
                    </span>
                </div>
                <div className="progress-track">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                    />
                </div>
                <div className="challenge-meta">
                    <span className="text-xs text-muted">{value}% выполнено</span>
                    <span className="text-xs text-muted">
                        Уровень {challenge.level} · {apiLevelProgress(challenge.next_level_progress, challenge.xp)} / {XP_PER_LEVEL} XP
                    </span>
                </div>
            </div>
        </motion.button>
    );
}

function ProgressRing({ value }: { value: number }) {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div className="progress-ring">
            <svg viewBox="0 0 120 120" aria-label={`Прогресс ${value}%`}>
                <circle className="ring-bg" cx="60" cy="60" r={radius} />
                <motion.circle
                    className="ring-value"
                    cx="60"
                    cy="60"
                    r={radius}
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                />
            </svg>
            <strong>{value}%</strong>
        </div>
    );
}

function ScreenHeader({
    title,
    eyebrow,
}: {
    title: string;
    eyebrow?: string;
}) {
    return (
        <header className="screen-header">
            {eyebrow && <span>{eyebrow}</span>}
            <h1>{title}</h1>
        </header>
    );
}

function Dashboard({
    user,
    avatarUrl,
    challenges,
    achievementsCount,
    ratingPlace,
    recentWorkouts,
    onOpenChallenges,
    onOpenLeaderboard,
    onOpenAvatar,
    onOpenMenu,
    onOpenNotifications,
    onOpenChallenge,
    onAddWorkout,
    onOpenSite,
    onStreakClick,
}: {
    user: ApiUser;
    avatarUrl: string;
    challenges: ApiChallenge[];
    achievementsCount: number;
    ratingPlace: number | null;
    recentWorkouts: WorkoutEntry[];
    onOpenChallenges: () => void;
    onOpenLeaderboard: () => void;
    onOpenAvatar: () => void;
    onOpenMenu: () => void;
    onOpenNotifications: () => void;
    onOpenChallenge: (challenge: ApiChallenge) => void;
    onAddWorkout: () => void;
    onOpenSite: () => void;
    onStreakClick: () => void;
}) {
    const firstName =
        user.first_name ||
        user.display_name.split(" ")[0] ||
        user.username ||
        "Атлет";
    const currentXp = Math.max(user.total_xp, 0);
    const levelState = calculateProgress(currentXp);
    const stats = {
        pullups:
            challenges.find((challenge) => challenge.exercise === "pullups")
                ?.progress ?? 0,
        pushups:
            challenges.find((challenge) => challenge.exercise === "pushups")
                ?.progress ?? 0,
        plank:
            challenges.find((challenge) => challenge.exercise === "plank")
                ?.progress ?? 0,
        running:
            challenges.find((challenge) => challenge.exercise === "running")
                ?.progress ?? 0,
    };
    const todayTokens = recentWorkouts
        .filter(
            (workout) =>
                workout.status === "approved" &&
                toDayKey(new Date(workout.date)) === toDayKey(new Date())
        )
        .reduce((sum, workout) => sum + workout.tokens, 0);
    return (
        <>
            <div className="topbar home-topbar">
                <button
                    className="icon-button"
                    aria-label="Меню"
                    onClick={onOpenMenu}
                >
                    <Menu size={20} />
                </button>
                <span className="brand home-brand">PULLUP</span>
                <button
                    className="icon-button home-alert"
                    aria-label="Уведомления"
                    onClick={onOpenNotifications}
                >
                    <Zap size={19} />
                    <span />
                </button>
            </div>

            <section className="home-profile-card">
                <button
                    className="avatar avatar-button home-avatar"
                    onClick={onOpenAvatar}
                    aria-label="Сменить аватар"
                >
                    <img src={avatarUrl} alt="" />
                    <span className="home-level-badge">{levelState.level}</span>
                </button>
                <div className="home-profile-main">
                    <h1>Привет, {firstName}! 👋</h1>
                    <span>
                        Уровень {levelState.level} · {getLevelTitle(levelState.level)}
                    </span>
                    <div className="home-xp-line">
                        <strong>{currentXp.toLocaleString("ru-RU")}</strong>
                        <span>/ {levelState.nextLevelXp.toLocaleString("ru-RU")} XP</span>
                    </div>
                    <div className="home-xp-progress">
                        <div style={{ width: `${levelState.progressPercent}%` }} />
                    </div>
                    <small>
                        До уровня {levelState.level + 1} осталось{" "}
                        {levelState.xpToNextLevel.toLocaleString("ru-RU")} XP
                    </small>
                </div>
                <img
                    className="home-hero-runner"
                    src="/assets/home/hero-runner.png"
                    alt=""
                    aria-hidden="true"
                />
            </section>

            <section
                className="pullup-balance-card"
                aria-label={`Баланс PULLUP: ${user.tokens.toLocaleString("ru-RU")}`}
            >
                <img
                    className="pullup-balance-coin"
                    src="/assets/home/pullup-coin.png"
                    alt=""
                    aria-hidden="true"
                />
                <div className="pullup-balance-copy">
                    <span>Баланс</span>
                    <strong>
                        {user.tokens.toLocaleString("ru-RU")}
                        <small>PULLUP</small>
                    </strong>
                    <div className="pullup-balance-today">
                        <span>Получено сегодня</span>
                        <b>{todayTokens.toLocaleString("ru-RU")} PULLUP</b>
                    </div>
                </div>
            </section>

            <section className="home-quick-stats">
                <motion.button
                    type="button"
                    className="home-quick-card home-quick-card--streak streak-trigger"
                    onClick={onStreakClick}
                    whileTap={{ scale: 0.97 }}
                    aria-label={`Показать текущую серию: ${user.streak_days} дней`}
                >
                    <img src="/assets/home/streak-runner.png" alt="" />
                    <Flame size={23} />
                    <span>Серия</span>
                    <strong>{user.streak_days}</strong>
                    <small>дней</small>
                </motion.button>
                <button
                    className="home-quick-card home-quick-card--rating"
                    onClick={onOpenLeaderboard}
                >
                    <img src="/assets/home/rating-trophy.png" alt="" />
                    <Trophy size={23} />
                    <span>Рейтинг</span>
                    <strong>{ratingPlace ? `#${ratingPlace}` : "—"}</strong>
                    <small>в общем зачёте</small>
                </button>
            </section>

            <section className="home-total-stats panel">
                <h2>Твоя статистика</h2>
                <div>
                    <article>
                        <WorkoutImage visual={CHALLENGE_VISUALS.pullups} />
                        <strong>{stats.pullups.toLocaleString("ru-RU")}</strong>
                        <small>Подтягивания</small>
                    </article>
                    <article>
                        <WorkoutImage visual={CHALLENGE_VISUALS.pushups} />
                        <strong>{stats.pushups.toLocaleString("ru-RU")}</strong>
                        <small>Отжимания</small>
                    </article>
                    <article>
                        <WorkoutImage visual={CHALLENGE_VISUALS.plank} />
                        <strong>{stats.plank.toLocaleString("ru-RU")} сек</strong>
                        <small>Планка</small>
                    </article>
                    <article>
                        <WorkoutImage visual={CHALLENGE_VISUALS.running} />
                        <strong>{stats.running.toLocaleString("ru-RU")} км</strong>
                        <small>Бег</small>
                    </article>
                </div>
            </section>

            <button className="home-action-button" onClick={onAddWorkout}>
                <Video size={30} fill="currentColor" />
                <span>
                    <strong>Добавить тренировку</strong>
                    <small>Загрузи видео и получи PULLUP</small>
                </span>
                <ChevronRight size={24} />
            </button>

            <button className="project-site-card home-site-card" onClick={onOpenSite}>
                <span className="project-site-card__icon" aria-hidden="true">
                    🌐
                </span>
                <span>
                    <strong>Официальный сайт PULLUP</strong>
                    <small>Новости, рейтинг, статистика и развитие проекта</small>
                </span>
                <ChevronRight size={22} />
            </button>
        </>
    );
}

function ChallengesScreen({
    challenges,
    loading,
    error,
    onRetry,
    onOpenChallenge,
}: {
    challenges: ApiChallenge[];
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    onOpenChallenge: (challenge: ApiChallenge) => void;
}) {
    const [filter, setFilter] = useState<"active" | "done">("active");
    const visible = challenges.filter((item) =>
        filter === "done"
            ? Boolean(item.userCompleted ?? item.completed)
            : item.is_active !== false &&
              !Boolean(item.userCompleted ?? item.completed)
    );

    return (
        <>
            <ScreenHeader title="Челленджи" eyebrow="Твои цели" />
            <div className="segmented">
                <button
                    className={filter === "active" ? "active" : ""}
                    onClick={() => setFilter("active")}
                >
                    Активные
                </button>
                <button
                    className={filter === "done" ? "active" : ""}
                    onClick={() => setFilter("done")}
                >
                    Завершённые
                </button>
            </div>
            <div className="card-list">
                {loading ? (
                    <div className="startup-loader">
                        <i />
                    </div>
                ) : error ? (
                    <EmptyState
                        icon={ShieldCheck}
                        title="Не удалось загрузить данные"
                        text={error}
                    >
                        <button className="primary-action" onClick={onRetry}>
                            Повторить
                        </button>
                    </EmptyState>
                ) : visible.length ? (
                    visible.map((item) => (
                        <ChallengeCard
                            key={item.id ?? item.exercise}
                            challenge={item}
                            onClick={() => onOpenChallenge(item)}
                        />
                    ))
                ) : (
                    <EmptyState
                        icon={Check}
                        title="Здесь пока пусто"
                        text={
                            filter === "done"
                                ? "Завершённые челленджи появятся после первой большой победы."
                                : "Все активные челленджи выполнены."
                        }
                    />
                )}
            </div>
        </>
    );
}

function WorkoutsScreen({
    challenges,
    workouts,
    loading,
    error,
    onRetry,
    onAdd,
}: {
    challenges: ApiChallenge[];
    workouts: WorkoutEntry[];
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    onAdd: () => void;
}) {
    const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
    const weeklyDays = useMemo(
        () => buildWeeklyWorkoutDays(workouts),
        [workouts]
    );
    const maxTokens = Math.max(
        1,
        ...weeklyDays.map((day) => day.tokens)
    );
    const hasWeekData = weeklyDays.some((day) => day.tokens > 0);
    const selectedDay = weeklyDays.find((day) => day.key === selectedDayKey);
    const workoutSummary = useMemo(
        () => EXERCISE_TYPES.map((config) => {
            const challenge = challenges.find(
                (item) => normalizeExerciseType(item.exercise) === config.type
            );
            const approvedSubmissions = workouts.filter(
                (item) =>
                    normalizeExerciseType(item.type) === config.type &&
                    (item.status === "approved" || item.status === "completed")
            );
            const confirmedFromSubmissions = approvedSubmissions.reduce(
                (total, item) => total + item.value,
                0
            );
            return {
                ...config,
                value: challenge?.progress ?? confirmedFromSubmissions ?? 0,
            };
        }),
        [challenges, workouts]
    );

    useEffect(() => {
        console.log("[REAL USER] workout summary:", workoutSummary);
        console.log("[REAL USER] workout summary count:", workoutSummary.length);
    }, [workoutSummary]);

    return (
        <>
            <ScreenHeader title="Тренировки" eyebrow="История прогресса" />
            {loading ? (
                <div className="startup-loader">
                    <i />
                </div>
            ) : error ? (
                <EmptyState
                    icon={ShieldCheck}
                    title="Не удалось загрузить данные"
                    text={error}
                >
                    <button className="primary-action" onClick={onRetry}>
                        Повторить
                    </button>
                </EmptyState>
            ) : null}
            <div className="workout-list">
                {!loading && !error && workoutSummary
                    .map((summary, index) => {
                        const visual =
                            CHALLENGE_VISUALS[summary.type] ??
                            CHALLENGE_VISUALS.pullups;
                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.06 }}
                                className="workout-row"
                                key={summary.type}
                            >
                                <span
                                    className="workout-icon"
                                    style={{ color: visual.color }}
                                >
                                    <WorkoutImage visual={visual} />
                                </span>
                                <div>
                                    <strong>{summary.title}</strong>
                                    <span>Текущий подтверждённый прогресс</span>
                                </div>
                                <b>+{summary.value} {summary.unit}</b>
                            </motion.div>
                        );
                    })}
            </div>
            <button className="primary-action" onClick={onAdd}>
                <Plus size={18} /> Добавить тренировку
            </button>
            <section className="panel chart-panel">
                <div className="section-title">
                    <div>
                        <span>За неделю</span>
                        <h2>Динамика</h2>
                    </div>
                    <Activity size={19} />
                </div>
                {hasWeekData ? (
                    <div
                        className="bars workout-dynamics"
                        aria-label="Динамика тренировок за неделю"
                    >
                        {weeklyDays.map((day, index) => {
                            const height = Math.max(
                                8,
                                Math.round((day.tokens / maxTokens) * 100)
                            );
                            const isSelected = selectedDayKey === day.key;
                            return (
                                <div className="dynamic-day" key={day.key}>
                                    <span className="dynamic-day-total">
                                        {day.tokens > 0 ? `+${day.tokens}` : ""}
                                    </span>
                                    <button
                                        type="button"
                                        className={
                                            isSelected
                                                ? "dynamic-bar active"
                                                : "dynamic-bar"
                                        }
                                        style={
                                            {
                                                "--bar-height": `${height}%`,
                                            } as React.CSSProperties
                                        }
                                        onClick={() =>
                                            setSelectedDayKey((current) =>
                                                current === day.key
                                                    ? null
                                                    : day.key
                                            )
                                        }
                                        disabled={day.tokens === 0}
                                        aria-label={`${day.label}: ${day.tokens} токенов`}
                                    >
                                        <motion.span
                                            className="dynamic-bar-stack"
                                            initial={{ height: 0 }}
                                            animate={{
                                                height:
                                                    day.tokens > 0
                                                        ? "var(--bar-height)"
                                                        : "8%",
                                            }}
                                            transition={{ delay: index * 0.04 }}
                                        >
                                            {day.segments.map((segment) => (
                                                <i
                                                    key={segment.type}
                                                    style={
                                                        {
                                                            "--segment-color":
                                                                WORKOUT_TYPE_META[
                                                                    segment.type
                                                                ].color,
                                                            "--segment-share": `${Math.max(
                                                                8,
                                                                (segment.tokens /
                                                                    day.tokens) *
                                                                    100
                                                            )}%`,
                                                        } as React.CSSProperties
                                                    }
                                                />
                                            ))}
                                        </motion.span>
                                    </button>
                                    <time>{day.label}</time>
                                </div>
                            );
                        })}
                        <AnimatePresence>
                            {selectedDay && selectedDay.tokens > 0 && (
                                <motion.div
                                    className="dynamic-tooltip"
                                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                                >
                                    <strong>{formatFullDate(selectedDay.date)}</strong>
                                    {selectedDay.segments.map((segment) => (
                                        <div key={segment.type}>
                                            <span
                                                style={{
                                                    color: WORKOUT_TYPE_META[
                                                        segment.type
                                                    ].color,
                                                }}
                                            >
                                                {
                                                    WORKOUT_TYPE_META[
                                                        segment.type
                                                    ].label
                                                }
                                            </span>
                                            <b>
                                                +{segment.tokens} ток. · +
                                                {segment.xp} XP
                                            </b>
                                        </div>
                                    ))}
                                    <small>
                                        Итого: +{selectedDay.tokens} токенов · +
                                        {selectedDay.xp} XP
                                    </small>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="weekly-empty-state">
                        <Activity size={24} />
                        <strong>Пока нет тренировок за неделю</strong>
                    </div>
                )}
            </section>
        </>
    );
}

function ProfileScreen({
    user,
    badges,
    challenges,
    achievements,
    workouts,
    ratingPlace,
    avatarUrl,
    onOpenAvatar,
    onOpenSettings,
    onOpenAchievements,
    onOpenLeaderboard,
    onOpenReferrals,
    onOpenLogout,
    onStreakClick,
}: {
    user: ApiUser;
    badges: string[];
    challenges: ApiChallenge[];
    achievements: ApiAchievement[];
    workouts: WorkoutEntry[];
    ratingPlace: number | null;
    avatarUrl: string;
    onOpenAvatar: () => void;
    onOpenSettings: () => void;
    onOpenAchievements: () => void;
    onOpenLeaderboard: () => void;
    onOpenReferrals: () => void;
    onOpenLogout: () => void;
    onStreakClick: () => void;
}) {
    const referralLink = `https://t.me/ActiveRunBot?start=${user.telegram_id}`;
    const [copied, setCopied] = useState(false);
    const displayName =
        user.display_name ||
        user.first_name ||
        user.username ||
        `Telegram ${user.telegram_id}`;
    const levelState = calculateProgress(user.total_xp);
    const title = getLevelTitle(levelState.level);
    const progress = levelState.progressPercent;
    const xpToNext = levelState.xpToNextLevel;
    const pullups = profileChallengeValue(challenges, "pullups");
    const pushups = profileChallengeValue(challenges, "pushups");
    const plankSeconds = profileChallengeValue(challenges, "plank");
    const runningKm = profileChallengeValue(challenges, "running");
    const activeWorkoutDays = new Set(
        workouts.map((workout) => toDayKey(new Date(workout.date)))
    ).size;
    const approvedWorkoutCount = workouts.filter(
        (workout) => workout.status === "approved"
    ).length;
    const approvalRate = workouts.length
        ? Math.round((approvedWorkoutCount / workouts.length) * 100)
        : 0;
    const monthXp = workouts.reduce((sum, workout) => sum + workout.xp, 0);
    const monthTokens = workouts.reduce((sum, workout) => sum + workout.tokens, 0);
    const activityValues = [
        {
            label: "Подтягивания",
            value: pullups,
            color: CHALLENGE_VISUALS.pullups.color,
        },
        {
            label: "Отжимания",
            value: pushups,
            color: CHALLENGE_VISUALS.pushups.color,
        },
        {
            label: "Планка",
            value: plankSeconds,
            color: CHALLENGE_VISUALS.plank.color,
        },
        {
            label: "Бег",
            value: runningKm,
            color: CHALLENGE_VISUALS.running.color,
        },
    ];
    const activityTotal = activityValues.reduce(
        (sum, item) => sum + item.value,
        0
    );
    const pullupShare = activityTotal ? (pullups / activityTotal) * 100 : 25;
    const pushupShare = activityTotal ? pullupShare + (pushups / activityTotal) * 100 : 50;
    const plankShare = activityTotal ? pushupShare + (plankSeconds / activityTotal) * 100 : 75;
    const unlockedAchievements = achievements.length
        ? achievements
        : badges.map((badge) => ({
              code: badge,
              title: badge,
              icon: "🏆",
          }));
    const recordCards = [
        {
            label: "подтягиваний",
            value: pullups ? Math.min(pullups, 50).toLocaleString("ru-RU") : "0",
            color: CHALLENGE_VISUALS.pullups.color,
            visual: CHALLENGE_VISUALS.pullups,
        },
        {
            label: "отжиманий",
            value: pushups ? Math.min(pushups, 100).toLocaleString("ru-RU") : "0",
            color: CHALLENGE_VISUALS.pushups.color,
            visual: CHALLENGE_VISUALS.pushups,
        },
        {
            label: "планка",
            value: formatCompactDuration(plankSeconds),
            color: CHALLENGE_VISUALS.plank.color,
            visual: CHALLENGE_VISUALS.plank,
        },
        {
            label: "бег",
            value: formatDistance(runningKm),
            color: CHALLENGE_VISUALS.running.color,
            visual: CHALLENGE_VISUALS.running,
        },
    ];
    const frameCards = [
        { label: "Базовая", unlocked: true, accent: "#71e45b" },
        { label: "Атлет", unlocked: levelState.level >= 5, accent: "#d86cff" },
        { label: "Мастер", unlocked: levelState.level >= 10, accent: "#ffd84f" },
        { label: "Чемпион", unlocked: levelState.level >= 15, accent: "#ff6f55" },
        { label: "Легенда", unlocked: levelState.level >= 20, accent: "#55d7ff" },
    ];
    const careerRows = [
        ["Тренировок", workouts.length.toLocaleString("ru-RU")],
        ["Всего подтягиваний", pullups.toLocaleString("ru-RU")],
        ["Серия", `${user.streak_days.toLocaleString("ru-RU")} дней`],
        ["Получено XP", user.total_xp.toLocaleString("ru-RU")],
        ["Заработано PULLUP", user.tokens.toLocaleString("ru-RU")],
        ["В приложении", `${activeWorkoutDays || user.streak_days} дня`],
        ["Одобрено тренировок", `${approvalRate}%`],
    ];

    const copyReferral = async () => {
        await navigator.clipboard.writeText(referralLink);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <>
            <div className="profile-mobile-topbar">
                <span className="brand profile-mobile-brand">PULLUP<span>⚡</span></span>
                <div className="profile-mobile-actions">
                    <span className="profile-mobile-balance">
                        <img
                            className="pullup-coin-icon"
                            src="/assets/home/pullup-coin.png"
                            alt=""
                            aria-hidden="true"
                        />
                        <b>{user.tokens.toLocaleString("ru-RU")}</b>
                        <small>PULLUP</small>
                    </span>
                    <button type="button" onClick={onOpenSettings} aria-label="Меню">
                        <Menu size={22} />
                    </button>
                </div>
            </div>

            <section className="profile-hero-card">
                <button
                    className="avatar avatar--large avatar-button profile-hero-avatar"
                    onClick={onOpenAvatar}
                >
                    <img src={avatarUrl} alt="" />
                    <span className="avatar-edit-dot">
                        <Plus size={12} />
                    </span>
                </button>
                <div className="profile-hero-main">
                    <h2>{displayName}</h2>
                    <strong>
                        Уровень {levelState.level} · {title}
                    </strong>
                    <div className="profile-xp-row">
                        <b>{user.total_xp.toLocaleString("ru-RU")}</b>
                        <span>/ {levelState.nextLevelXp.toLocaleString("ru-RU")} XP</span>
                    </div>
                    <div className="level-line profile-level-line">
                        <div style={{ width: `${progress}%` }} />
                    </div>
                    <small>
                        До уровня {levelState.level + 1}:{" "}
                        {xpToNext.toLocaleString("ru-RU")} XP
                    </small>
                </div>
                <div className="profile-hero-insights">
                    <button type="button" onClick={onOpenLeaderboard}>
                        <Trophy size={25} />
                        <strong>ТОП</strong>
                        <span>{ratingPlace ? `#${ratingPlace}` : "#1"} в рейтинге</span>
                    </button>
                    <motion.button
                        type="button"
                        className="streak-trigger"
                        onClick={onStreakClick}
                        whileTap={{ scale: 0.97 }}
                        aria-label={`Показать текущую серию: ${user.streak_days} дней`}
                    >
                        <Flame size={25} />
                        <span>Серия</span>
                        <strong>{user.streak_days} дней</strong>
                        <ChevronRight size={17} />
                    </motion.button>
                </div>
            </section>

            <section className="profile-total-stats">
                <article>
                    <WorkoutImage visual={CHALLENGE_VISUALS.pullups} />
                    <strong>{pullups.toLocaleString("ru-RU")}</strong>
                    <small>Подтягиваний</small>
                </article>
                <article>
                    <WorkoutImage visual={CHALLENGE_VISUALS.pushups} />
                    <strong>{pushups.toLocaleString("ru-RU")}</strong>
                    <small>Отжиманий</small>
                </article>
                <article>
                    <WorkoutImage visual={CHALLENGE_VISUALS.plank} />
                    <strong>{formatCompactDuration(plankSeconds)}</strong>
                    <small>Планка</small>
                </article>
                <article>
                    <WorkoutImage visual={CHALLENGE_VISUALS.running} />
                    <strong>{formatDistance(runningKm)}</strong>
                    <small>Бег</small>
                </article>
            </section>

            <section className="panel profile-records-panel">
                <div className="section-row">
                    <span className="section-kicker">Личные рекорды</span>
                    <button type="button" onClick={onOpenSettings}>
                        Все рекорды <ChevronRight size={14} />
                    </button>
                </div>
                <div className="profile-records-grid">
                    {recordCards.map((record) => (
                        <article
                            key={record.label}
                            style={{ "--accent": record.color } as CSSProperties}
                        >
                            <WorkoutImage visual={record.visual} />
                            <strong>{record.value}</strong>
                            <small>{record.label}</small>
                        </article>
                    ))}
                </div>
            </section>

            <section className="panel athlete-path-panel">
                <div className="section-row">
                    <span className="section-kicker">Путь спортсмена</span>
                    <button type="button" onClick={onOpenSettings}>
                        История уровней <ChevronRight size={14} />
                    </button>
                </div>
                <div className="athlete-path-line">
                    {PROFILE_LEVEL_MILESTONES.slice(0, 5).map((xp, index) => {
                        const level = index + 1;
                        const active = user.total_xp >= xp || levelState.level >= level;
                        const current =
                            user.total_xp < xp &&
                            (index === 0 ||
                                user.total_xp >= PROFILE_LEVEL_MILESTONES[index - 1]);

                        return (
                            <div
                                key={xp}
                                className={[
                                    "athlete-path-step",
                                    active ? "is-active" : "",
                                    current ? "is-current" : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            >
                                <b>{level}</b>
                                <span>{xp} XP</span>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="panel referral profile-referral">
                <div>
                    <span className="section-kicker">Пригласи друзей</span>
                    <strong>+500 PULLUP</strong>
                    <p>{referralLink}</p>
                </div>
                <button onClick={copyReferral}>
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                    {copied ? "Скопировано" : "Скопировать ссылку"}
                </button>
            </section>

            <section className="profile-settings-grid">
                <button onClick={onOpenSettings}>
                    <UserRound size={18} />
                    Редактировать профиль
                    <ChevronRight size={17} />
                </button>
                <button onClick={onOpenSettings}>
                    <Zap size={18} />
                    Уведомления
                    <ChevronRight size={17} />
                </button>
                <button onClick={onOpenAchievements}>
                    <ShieldCheck size={18} />
                    Достижения
                    <ChevronRight size={17} />
                </button>
                <button onClick={onOpenSettings}>
                    <Globe2 size={18} />
                    Язык
                    <span>Русский</span>
                </button>
                <button onClick={onOpenReferrals}>
                    <Copy size={18} />
                    Реферальная программа
                    <ChevronRight size={17} />
                </button>
                <button className="danger" onClick={onOpenLogout}>
                    <X size={18} />
                    Выйти из аккаунта
                    <ChevronRight size={17} />
                </button>
            </section>

            <section className="panel profile-career-panel">
                <span className="section-kicker">Карьера спортсмена</span>
                <div>
                    {careerRows.map(([label, value]) => (
                        <p key={label}>
                            <span>{label}</span>
                            <strong>{value}</strong>
                        </p>
                    ))}
                </div>
            </section>
        </>
    );
}

function EmptyState({
    icon: Icon,
    title,
    text,
    children,
}: {
    icon: typeof Award;
    title: string;
    text: string;
    children?: ReactNode;
}) {
    return (
        <div className="empty-state">
            <Icon size={28} />
            <strong>{title}</strong>
            <p>{text}</p>
            {children}
        </div>
    );
}

function ChallengeDetailModal({
    challenge,
    onClose,
    onAddWorkout,
}: {
    challenge: ApiChallenge;
    onClose: () => void;
    onAddWorkout: () => void;
}) {
    const visual =
        CHALLENGE_VISUALS[challenge.exercise] ?? CHALLENGE_VISUALS.pullups;
    const value = percent(challenge);

    return (
        <motion.div
            className="modal-backdrop challenge-detail-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.section
                className="challenge-detail-modal"
                style={{ "--accent": visual.color } as React.CSSProperties}
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    className="challenge-detail-close"
                    onClick={onClose}
                    aria-label="Закрыть"
                >
                    <X size={20} />
                </button>
                <div className="challenge-detail-emblem">
                    <WorkoutImage visual={visual} />
                </div>
                <span>Активный челлендж</span>
                <h2>{visual.label}</h2>
                <p>
                    Продолжай тренироваться — результат уже заметен. Каждое
                    подтверждённое видео увеличивает прогресс.
                </p>
                <div className="challenge-detail-numbers">
                    <div>
                        <span>Прогресс</span>
                        <strong>{value}%</strong>
                    </div>
                    <div>
                        <span>Уровень</span>
                        <strong>{challenge.level}</strong>
                    </div>
                    <div>
                        <span>XP</span>
                        <strong>{challenge.xp}</strong>
                    </div>
                    <div>
                        <span>Награда</span>
                        <strong>+{visual.reward}</strong>
                    </div>
                </div>
                <div className="progress-track">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                    />
                </div>
                <button
                    className="save-workout"
                    onClick={() => {
                        onClose();
                        onAddWorkout();
                    }}
                >
                    <Video size={18} />
                    Добавить видео
                </button>
            </motion.section>
        </motion.div>
    );
}

function AddWorkoutModal({
    challenges,
    onClose,
    onSubmit,
    mode,
    onError,
}: {
    challenges: ApiChallenge[];
    onClose: () => void;
    onSubmit: (type: ChallengeType, value: number) => void;
    mode: DashboardMode;
    onError: (message: string) => void;
}) {
    const [selected, setSelected] = useState(challenges[0]?.exercise ?? "pullups");
    const [amount, setAmount] = useState(10);
    const [videoName, setVideoName] = useState("");
    const [trackerLink, setTrackerLink] = useState("");
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const amountStep = selected === "running" ? 0.1 : selected === "plank" ? 30 : 1;
    const amountUnit =
        selected === "running"
            ? "км"
            : selected === "plank"
              ? "сек"
              : "раз";

    const save = async () => {
        const challengeType = EXERCISE_TO_CHALLENGE[selected];
        if (!challengeType) {
            onError("Выберите вид тренировки");
            return;
        }
        if (challengeType === "бег" && !trackerLink.trim()) {
            onError("Добавьте ссылку на трекер");
            return;
        }
        if (challengeType !== "бег" && !videoFile) {
            onError("Добавьте видео тренировки");
            return;
        }

        const isTelegramContext = Boolean(window.Telegram?.WebApp?.initData);
        const shouldUseDemoSubmission =
            mode === "demo" ||
            mode === "telegram-error" ||
            mode === "api-error" ||
            !isTelegramContext ||
            !window.Telegram?.WebApp?.initData;

        if (shouldUseDemoSubmission) {
            const value = Number(amount);
            if (!Number.isFinite(value) || value <= 0) {
                onError("Введите число больше нуля");
                return;
            }

            onSubmit(challengeType, value);
            onClose();
            return;
        }

        // В режиме Telegram реально отправляем видео
        setIsLoading(true);
        setUploadProgress(0);
        try {
            const initData = window.Telegram?.WebApp?.initData;

            if (import.meta.env.DEV) {
                console.log("[DEV] AddWorkoutModal.save: starting video submission");
                console.log("[DEV] AddWorkoutModal.save: initData exists:", Boolean(initData));
            }

            const response = await submitVideo(
                selected as "pullups" | "pushups" | "plank" | "running",
                amount,
                videoFile,
                challengeType === "бег" ? trackerLink : null,
                initData,
                (progress) => {
                    setUploadProgress(progress);
                    if (import.meta.env.DEV && progress % 25 === 0) {
                        console.log("[DEV] Upload progress:", progress + "%");
                    }
                }
            );

            if (!response) {
                throw new Error("Не удалось получить ответ от сервера");
            }

            onClose();
            onError(`✅ Видео отправлено на модерацию! Номер заявки: #${response.id}`);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Неизвестная ошибка при отправке видео";
            if (import.meta.env.DEV) {
                console.error("[DEV] AddWorkoutModal.save error:", error);
            }
            onError(message);
            playError();
        } finally {
            setIsLoading(false);
            setUploadProgress(0);
        }
    };

    return (
        <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                className="workout-modal"
                initial={{ y: 80 }}
                animate={{ y: 0 }}
                exit={{ y: 80 }}
            >
                <div className="modal-title">
                    <div>
                        <span>Новая активность</span>
                        <h2>Добавить тренировку</h2>
                    </div>
                    <button onClick={onClose} aria-label="Закрыть">
                        <X />
                    </button>
                </div>
                <div className="exercise-picker">
                    {challenges.map((challenge) => {
                        const visual =
                            CHALLENGE_VISUALS[challenge.exercise] ??
                            CHALLENGE_VISUALS.pullups;
                        return (
                            <button
                                key={challenge.exercise}
                                className={
                                    selected === challenge.exercise ? "active" : ""
                                }
                                onClick={() => setSelected(challenge.exercise)}
                            >
                                <WorkoutImage visual={visual} />
                                {visual.shortLabel}
                            </button>
                        );
                    })}
                </div>
                <label className="amount-field">
                    <span>Количество</span>
                    <div>
                        <button
                            type="button"
                            onClick={() =>
                                setAmount(
                                    Math.max(
                                        amountStep,
                                        Number((amount - amountStep).toFixed(1))
                                    )
                                )
                            }
                        >
                            −
                        </button>
                        <input
                            type="number"
                            min={amountStep}
                            step={amountStep}
                            value={amount}
                            onChange={(event) =>
                                setAmount(Number(event.target.value))
                            }
                            disabled={isLoading}
                            aria-label="Количество"
                        />
                        <small>{amountUnit}</small>
                        <button
                            type="button"
                            onClick={() =>
                                setAmount(Number((amount + amountStep).toFixed(1)))
                            }
                        >
                            +
                        </button>
                    </div>
                </label>
                <label className="date-field">
                    <CalendarDays size={19} />
                    <span>Сегодня</span>
                </label>
                {selected === "running" ? (
                    <label className="tracker-link-field">
                        <Activity size={19} />
                        <input
                            type="url"
                            value={trackerLink}
                            placeholder="Ссылка Strava / Garmin"
                            onChange={(event) =>
                                setTrackerLink(event.target.value)
                            }
                            disabled={isLoading}
                        />
                    </label>
                ) : (
                    <label className="video-upload-field">
                        <Video size={19} />
                        <span>
                            {videoName || "Добавить видео"}
                            <small>
                                {videoName
                                    ? "Файл готов к отправке"
                                    : "До 100 МБ"}
                            </small>
                        </span>
                        <Upload size={18} />
                        <input
                            type="file"
                            accept="video/*"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                    setVideoFile(file);
                                    setVideoName(file.name);
                                }
                            }}
                            disabled={isLoading}
                        />
                    </label>
                )}
                {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="upload-progress">
                        <div className="progress-bar">
                            <motion.div
                                className="progress-fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                        <small>{Math.round(uploadProgress)}% загружено</small>
                    </div>
                )}
                <button 
                    className="save-workout" 
                    onClick={save}
                    disabled={isLoading}
                >
                    {isLoading ? "Отправляется..." : "Сохранить"}
                </button>
            </motion.div>
        </motion.div>
    );
}

function StartupGreeting({
    user,
    mode,
}: {
    user: ApiUser | null;
    mode: "loading" | "welcome";
}) {
    const name = userGreetingName(user);
    const isWelcome = mode === "welcome" && user;

    return (
        <div className="startup-greeting">
            <motion.div
                className="startup-greeting-card"
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.42, ease: "easeOut" }}
            >
                <div className="startup-brand-orbit" aria-hidden="true">
                    <span />
                    <Dumbbell size={34} />
                </div>
                <span className="startup-kicker">PULLUP</span>
                <h1>
                    {isWelcome
                        ? `Привет, ${name}!`
                        : "Открываем твою арену"}
                </h1>
                <p>
                    {isWelcome
                        ? "Рады видеть тебя снова. Прогресс уже на месте."
                        : "Собираем прогресс, тренировки и достижения."}
                </p>
                {isWelcome ? (
                    <div className="startup-user-stats">
                        <div>
                            <Trophy size={18} />
                            <strong>Уровень {calculateLevel(user.total_xp)}</strong>
                            <span>{getLevelTitle(calculateLevel(user.total_xp))}</span>
                        </div>
                        <div>
                            <img
                                className="pullup-coin-icon"
                                src="/assets/home/pullup-coin.png"
                                alt=""
                                aria-hidden="true"
                            />
                            <strong>{user.tokens.toLocaleString("ru-RU")}</strong>
                            <span>PULLUP</span>
                        </div>
                    </div>
                ) : (
                    <div className="startup-loader">
                        <i />
                    </div>
                )}
            </motion.div>
        </div>
    );
}

export default function App() {
    const [activeView, setActiveView] = useState<AppView>("home");
    const [user, setUser] = useState<ApiUser | null>(null);
    const [gameUser, setGameUser] = useState<GameUser>(loadUser);
    const [weeklyWorkouts, setWeeklyWorkouts] =
        useState<WorkoutEntry[]>(readDemoWorkouts);
    const [apiChallenges, setApiChallenges] = useState<ApiChallenge[]>([]);
    const [achievements, setAchievements] = useState<ApiAchievement[]>([]);
    const [leaderboardEntries, setLeaderboardEntries] = useState<
        LeaderboardEntryDto[]
    >([]);
    const [myLeaderboardRank, setMyLeaderboardRank] =
        useState<MyLeaderboardRankDto | null>(null);
    const [dashboardMode, setDashboardMode] = useState<DashboardMode>(() =>
        detectAppMode(getTelegramWebApp())
    );
    const [profileSource, setProfileSource] =
        useState<ProfileSource>("none");
    const [authStatus, setAuthStatus] =
        useState<AuthStatus>("loading");
    const [backendProfile, setBackendProfile] =
        useState<ApiUser | null>(null);
    const [apiHealthStatus, setApiHealthStatus] =
        useState<ApiHealthStatus>("not-checked");
    const [apiHealthError, setApiHealthError] =
        useState<string | null>(null);
    const [apiHealthResponse, setApiHealthResponse] =
        useState<ApiHealthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [showStartupGreeting, setShowStartupGreeting] = useState(true);
    const [authRetryNonce, setAuthRetryNonce] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [workoutsError, setWorkoutsError] = useState<string | null>(null);
    const [showWorkoutModal, setShowWorkoutModal] = useState(false);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [showSideMenu, setShowSideMenu] = useState(false);
    const [menuScreen, setMenuScreen] =
        useState<MenuScreenId>("settings");
    const [appSettings, setAppSettings] =
        useState<AppSettings>(loadAppSettings);
    const [selectedChallenge, setSelectedChallenge] =
        useState<ApiChallenge | null>(null);
    const [newlyUnlockedCodes, setNewlyUnlockedCodes] = useState<string[]>([]);
    const [notification, setNotification] =
        useState<GameNotification | null>(null);
    const [showStreakToast, setShowStreakToast] = useState(false);
    const streakToastTimerRef = useRef<number | null>(null);
    const [avatarSavedFlash, setAvatarSavedFlash] = useState(false);
    const [selectedAvatarId, setSelectedAvatarId] = useState(() => {
        try {
            const customAvatar = window.localStorage.getItem(
                CUSTOM_AVATAR_STORAGE_KEY
            );
            if (customAvatar) return "custom";
            return window.localStorage.getItem(AVATAR_STORAGE_KEY) ?? "";
        } catch {
            return "";
        }
    });
    const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(
        () => {
            try {
                return window.localStorage.getItem(
                    CUSTOM_AVATAR_STORAGE_KEY
                );
            } catch {
                return null;
            }
        }
    );
    const [placeholder, setPlaceholder] = useState({
        title: "",
        description: "",
    });

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const loadedWorkouts: WorkoutEntry[] = [];
                setError(null);
                setWorkoutsError(null);
                console.info("[TelegramAuth] app auth load started", {
                    attempt: authRetryNonce + 1,
                    hasWindowTelegram: Boolean(window.Telegram),
                    hasTelegramWebApp: Boolean(window.Telegram?.WebApp),
                    initDataLength: window.Telegram?.WebApp?.initData?.length ?? 0,
                    hasInitDataUnsafeUser: Boolean(
                        window.Telegram?.WebApp?.initDataUnsafe?.user
                    ),
                });
                const telegram = await getTelegramWebAppData();
                if (!active) return;
                console.info("[TelegramAuth] app received Telegram data", {
                    mode: telegram.mode,
                    isTelegramContext: telegram.isTelegramContext,
                    initDataLength: telegram.initData?.length ?? 0,
                    hasUser: Boolean(telegram.user),
                });

                if (telegram.isTelegramContext) {
                    setDashboardMode(telegram.mode);
                    setProfileSource(
                        telegram.user ? "telegram" : "none"
                    );
                    setAuthStatus(
                        telegram.initData
                            ? "authenticating"
                            : "telegram-error"
                    );
                    if (telegram.user && !telegram.initData) {
                        setUser(telegram.user);
                        setLoading(false);
                    }

                    if (telegram.initData) {
                        setApiHealthStatus("checking");
                        setApiHealthError(null);
                        setApiHealthResponse(null);
                        try {
                            const health = await checkApiHealth();
                            if (!active) return;
                            console.info("[TelegramAuth] backend health response", health);
                            setApiHealthResponse(health);
                            setApiHealthStatus(
                                health.status === "ok"
                                    ? "ok"
                                    : "backend-error"
                            );
                        } catch (healthReason) {
                            if (!active) return;
                            console.warn("[TelegramAuth] backend health failed", {
                                reason: healthReason,
                            });
                            setApiHealthStatus("backend-error");
                            setApiHealthError(
                                healthReason instanceof Error
                                    ? healthReason.message
                                    : "Backend healthcheck недоступен"
                            );
                        }
                    }
                } else {
                    setApiHealthStatus("not-checked");
                    setApiHealthError(null);
                    setApiHealthResponse(null);
                }

                const data = await fetchDashboard({
                    onBackendProfile: (backendUser) => {
                        if (!active) return;
                        setBackendProfile(backendUser);
                        setUser(backendUser);
                        setProfileSource("backend");
                        setAuthStatus("authenticated");
                    },
                });
                if (!active) return;
                console.info("[TelegramAuth] dashboard loaded", {
                    mode: data.mode,
                    userId: data.user.telegram_id,
                    challenges: data.challenges.length,
                    achievements: data.achievements.length,
                });
                setUser(data.user);
                setApiChallenges(data.challenges);
                setAchievements(data.achievements);
                setLeaderboardEntries(data.leaderboard);
                setMyLeaderboardRank(data.myLeaderboardRank);
                setDashboardMode(data.mode);
                if (data.mode === "telegram") {
                    if (telegram.initData) {
                        try {
                            const submissions = await getMySubmissions(
                                100,
                                0,
                                telegram.initData
                            );
                            console.log("[WORKOUTS] raw response:", submissions);
                            console.log("[REAL USER] submissions:", submissions);
                            loadedWorkouts.push(
                                ...submissions
                                    .map(normalizeWorkout)
                                    .filter(
                                        (
                                            workout
                                        ): workout is WorkoutEntry =>
                                            Boolean(workout)
                                    )
                            );
                            const currentWeekItems =
                                buildWeeklyWorkoutDays(loadedWorkouts)
                                    .flatMap((day) =>
                                        day.segments.map((segment) => ({
                                            day: day.key,
                                            ...segment,
                                        }))
                                    );
                            const groupedWorkouts = loadedWorkouts.reduce<
                                Record<string, WorkoutEntry[]>
                            >((groups, workout) => {
                                groups[workout.type] = [
                                    ...(groups[workout.type] ?? []),
                                    workout,
                                ];
                                return groups;
                            }, {});
                            console.log("[WORKOUTS] normalized items:", loadedWorkouts);
                            console.log("[WORKOUTS] current week:", currentWeekItems);
                            console.log("[WORKOUTS] grouped by type:", groupedWorkouts);
                        } catch (workoutReason) {
                            console.warn(
                                "[WORKOUTS] /submissions history failed:",
                                workoutReason
                            );
                            setWorkoutsError(
                                workoutReason instanceof Error
                                    ? workoutReason.message
                                    : "Не удалось загрузить историю тренировок"
                            );
                        }
                    }
                    setWeeklyWorkouts(loadedWorkouts);
                    setBackendProfile(data.user);
                    setProfileSource("backend");
                    setAuthStatus("authenticated");
                } else {
                    setWeeklyWorkouts(readDemoWorkouts());
                    setBackendProfile(null);
                    setProfileSource((currentSource) => {
                        if (
                            currentSource === "localStorage" ||
                            currentSource === "demo"
                        ) {
                            return currentSource;
                        }
                        try {
                            return window.localStorage.getItem(
                                USER_STORAGE_KEY
                            )
                                ? "localStorage"
                                : "demo";
                        } catch {
                            return "demo";
                        }
                    });
                    setAuthStatus("demo");
                }
                setError(null);
            } catch (reason) {
                if (!active) return;
                console.error("[TelegramAuth] app auth load failed", reason);
                if (isTelegramApiError(reason)) {
                    const failureUser =
                        reason.backendUser ?? reason.telegramUser;
                    setUser((current) => failureUser ?? current);
                    setBackendProfile(reason.backendUser);
                    setProfileSource(
                        reason.backendUser
                            ? "backend"
                            : reason.telegramUser
                              ? "telegram"
                              : "none"
                    );
                    setAuthStatus(
                        reason.mode === "telegram-error"
                            ? "telegram-error"
                            : "backend-error"
                    );
                    setApiChallenges([]);
                    setAchievements([]);
                    setLeaderboardEntries([]);
                    setMyLeaderboardRank(null);
                    setDashboardMode(reason.mode);
                    setWeeklyWorkouts([]);
                    setWorkoutsError(
                        reason instanceof Error
                            ? reason.message
                            : "Не удалось загрузить историю тренировок"
                    );
                } else {
                    setUser((current) => current);
                    setBackendProfile(null);
                    setProfileSource("none");
                    setAuthStatus("backend-error");
                    setDashboardMode("api-error");
                    setWeeklyWorkouts([]);
                    setApiChallenges([]);
                    setAchievements([]);
                    setLeaderboardEntries([]);
                    setMyLeaderboardRank(null);
                    setWorkoutsError("Не удалось загрузить историю тренировок");
                }
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "Не удалось загрузить профиль"
                );
            } finally {
                if (active) setLoading(false);
            }
        };

        void load();
        const timer = window.setInterval(load, 10_000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [authRetryNonce]);

    useEffect(() => {
        if (loading || !user) return;
        if (
            dashboardMode === "api-error" ||
            dashboardMode === "telegram-error"
        ) {
            return;
        }

        const timer = window.setTimeout(
            () => setShowStartupGreeting(false),
            1450
        );
        return () => window.clearTimeout(timer);
    }, [dashboardMode, loading, user]);

    const challenges = useMemo(
        () =>
            dashboardMode === "telegram"
                ? apiChallenges
                : gameChallengesToApi(gameUser),
        [apiChallenges, dashboardMode, gameUser]
    );

    useEffect(() => {
        if (dashboardMode !== "demo") return;
        try {
            window.localStorage.setItem(
                USER_STORAGE_KEY,
                JSON.stringify(gameUser)
            );
            window.localStorage.setItem(
                DEMO_WORKOUTS_STORAGE_KEY,
                JSON.stringify(weeklyWorkouts)
            );
            window.localStorage.setItem(
                DEMO_DATA_VERSION_KEY,
                DEMO_DATA_VERSION
            );
        } catch {
            // Progress remains available for the current session.
        }
    }, [dashboardMode, gameUser, weeklyWorkouts]);

    useEffect(() => {
        if (!notification) return;
        const timer = window.setTimeout(() => setNotification(null), 2500);
        return () => window.clearTimeout(timer);
    }, [notification]);

    const handleStreakClick = useCallback(() => {
        setShowStreakToast(true);
        if (streakToastTimerRef.current !== null) {
            window.clearTimeout(streakToastTimerRef.current);
        }
        streakToastTimerRef.current = window.setTimeout(() => {
            setShowStreakToast(false);
            streakToastTimerRef.current = null;
        }, 2500);
    }, []);

    useEffect(() => () => {
        if (streakToastTimerRef.current !== null) {
            window.clearTimeout(streakToastTimerRef.current);
        }
    }, []);

    const selectedAvatar = useMemo(
        () =>
            SPORT_AVATARS.find(
                (avatar) => avatar.id === selectedAvatarId
            ),
        [selectedAvatarId]
    );
    const avatarUrl =
        dashboardMode !== "demo"
            ? user?.photo_url || SPORT_AVATARS[0].url
            : (selectedAvatarId === "custom" ? customAvatarUrl : null) ||
              selectedAvatar?.url ||
              gameUser.avatarUrl ||
              SPORT_AVATARS[0].url;
    const displayUser = useMemo(
        () =>
            user
                ? {
                      ...user,
                      display_name:
                          dashboardMode !== "demo"
                              ? user.display_name
                              : appSettings.displayName.trim() ||
                                gameUser.name,
                      tokens:
                          dashboardMode !== "demo"
                              ? user.tokens
                              : gameUser.tokens,
                  }
                : null,
        [
            appSettings.displayName,
            dashboardMode,
            gameUser.name,
            gameUser.tokens,
            user,
        ]
    );
    const viewGameUser = useMemo<GameUser>(() => {
        if (dashboardMode !== "telegram" || !user) return gameUser;

        const base = cloneInitialUser();
        for (const challenge of apiChallenges) {
            const type = EXERCISE_TO_CHALLENGE[challenge.exercise];
            if (!type) continue;
            base.challenges[type] = {
                ...base.challenges[type],
                progress: challenge.progress,
                goal: challenge.goal,
                level: challenge.level,
                xp: challenge.xp,
                next_level_progress: challenge.next_level_progress,
                totalScore: challenge.progress,
                sportScore: challenge.progress,
                monthlyScore: challenge.progress,
                bestResult: challenge.progress,
            };
        }
        return {
            ...base,
            name: user.display_name,
            avatarUrl: user.photo_url ?? undefined,
            tokens: user.tokens,
            xp: user.total_xp,
            totalLevel: user.level,
            streakDays: user.streak_days,
            achievements: achievements.map(
                (achievement) => achievement.code
            ),
        };
    }, [achievements, apiChallenges, dashboardMode, gameUser, user]);
    const gameBadges = useMemo(
        () =>
            GAME_ACHIEVEMENTS.filter((achievement) =>
                viewGameUser.achievements.includes(achievement.id)
            ).map(
                (achievement) =>
                    achievement.icon.startsWith("/")
                        ? achievement.title
                        : `${achievement.icon} ${achievement.title}`
            ),
        [viewGameUser.achievements]
    );
    const ratingPlace = myLeaderboardRank?.rank ?? null;
    const baseAchievementViews = useMemo<AchievementView[]>(() => {
        if (!user) return [];
        const apiUnlocked = new Set(
            achievements.map((achievement) => achievement.code)
        );
        const gameUnlocked = new Set(viewGameUser.achievements);

        const catalogViews: AchievementView[] = ACHIEVEMENT_CATALOG.map((definition) => {
            const progress = achievementProgress(
                definition,
                user,
                challenges
            );
            const unlocked =
                apiUnlocked.has(definition.code) ||
                gameUnlocked.has(definition.code) ||
                progress >= definition.goal;
            return {
                definition,
                progress: Math.min(progress, definition.goal),
                state: unlocked ? "unlocked" : "locked",
            };
        });
        const catalogCodes = new Set(
            ACHIEVEMENT_CATALOG.map((definition) => definition.code)
        );
        const gameViews: AchievementView[] = GAME_ACHIEVEMENTS.filter(
            (achievement) => !catalogCodes.has(achievement.id)
        ).map((achievement) => {
            const unlocked = gameUnlocked.has(achievement.id);
            return {
                definition: {
                    code: achievement.id,
                    title: achievement.title,
                    description: achievement.description,
                    icon: achievement.icon,
                    accent: "#71e45b",
                    metric: "special",
                    goal: 1,
                    mockProgress: 0,
                },
                progress: unlocked ? 1 : 0,
                state: unlocked ? "unlocked" : "locked",
            };
        });

        return [...catalogViews, ...gameViews];
    }, [achievements, challenges, user, viewGameUser.achievements]);

    const unlockedKey = useMemo(
        () =>
            baseAchievementViews
                .filter((item) => item.state !== "locked")
                .map((item) => item.definition.code)
                .sort()
                .join("|"),
        [baseAchievementViews]
    );

    useEffect(() => {
        if (
            activeView !== "achievements" ||
            !unlockedKey
        ) {
            return;
        }

        let seen: string[] = [];
        try {
            seen = JSON.parse(
                window.localStorage.getItem(SEEN_ACHIEVEMENTS_KEY) || "[]"
            );
        } catch {
            seen = [];
        }

        const unlocked = unlockedKey.split("|");
        const unseen = unlocked.filter((code) => !seen.includes(code));
        if (!unseen.length) return;

        const nextSeen = Array.from(new Set([...seen, ...unseen]));
        window.localStorage.setItem(
            SEEN_ACHIEVEMENTS_KEY,
            JSON.stringify(nextSeen)
        );
        setNewlyUnlockedCodes(unseen);
        const timer = window.setTimeout(() => {
            setNewlyUnlockedCodes([]);
        }, 1800);

        return () => {
            window.clearTimeout(timer);
            setNewlyUnlockedCodes([]);
        };
    }, [activeView, unlockedKey]);

    const achievementViews = useMemo<AchievementView[]>(
        () =>
            baseAchievementViews.map((item) => ({
                ...item,
                state:
                    item.state !== "locked" &&
                    newlyUnlockedCodes.includes(item.definition.code)
                        ? "newlyUnlocked"
                        : item.state,
            })),
        [baseAchievementViews, newlyUnlockedCodes]
    );

    const openPlaceholder = (title: string, description: string) => {
        setPlaceholder({ title, description });
        setActiveView("placeholder");
    };

    const openMenuScreen = (screen: MenuScreenId) => {
        setMenuScreen(screen);
        setActiveView("menu");
    };

    const handleSettingsChange = (nextSettings: AppSettings) => {
        setAppSettings(nextSettings);
        try {
            window.localStorage.setItem(
                SETTINGS_STORAGE_KEY,
                JSON.stringify(nextSettings)
            );
            window.localStorage.setItem(
                EFFECT_STORAGE_KEYS.sound,
                String(nextSettings.sound)
            );
            window.localStorage.setItem(
                EFFECT_STORAGE_KEYS.achievementSound,
                String(nextSettings.achievementSound)
            );
            window.localStorage.setItem(
                EFFECT_STORAGE_KEYS.vibration,
                String(nextSettings.haptics)
            );
            window.localStorage.setItem(
                EFFECT_STORAGE_KEYS.animations,
                String(nextSettings.animations)
            );
        } catch {
            // Keep settings for the current session if storage is unavailable.
        }
    };

    const resetLocalProfile = () => {
        setSelectedAvatarId("");
        setCustomAvatarUrl(null);
        const nextSettings = { ...appSettings, displayName: "" };
        setAppSettings(nextSettings);
        try {
            window.localStorage.removeItem(AVATAR_STORAGE_KEY);
            window.localStorage.removeItem(CUSTOM_AVATAR_STORAGE_KEY);
            window.localStorage.setItem(
                SETTINGS_STORAGE_KEY,
                JSON.stringify(nextSettings)
            );
        } catch {
            // Local state has already been reset for the current session.
        }
    };

    const addResult = (type: ChallengeType, value: number): void => {
        setSelectedChallenge(null);
        setGameUser((currentUser) => {
            const result = addResultToUser(currentUser, type, value);

            if (
                result.newAchievements.length &&
                result.levelsGained > 0
            ) {
                playAchievement();
                setNotification({
                    type: "achievement",
                    text: `Новая ачивка: ${result.newAchievements
                        .map((achievement) => achievement.title)
                        .join(", ")} · новый уровень ${calculateLevel(
                        result.updatedUser.xp
                    )}`,
                });
            } else if (result.newAchievements.length) {
                playAchievement();
                setNotification({
                    type: "achievement",
                    text: `Новая ачивка: ${result.newAchievements
                        .map((achievement) => achievement.title)
                        .join(", ")}`,
                });
            } else if (result.levelsGained > 0) {
                playToken();
                setNotification({
                    type: "success",
                    text: `Новый уровень! Теперь уровень ${calculateLevel(
                        result.updatedUser.xp
                    )}`,
                });
            } else {
                playToken();
                setNotification({
                    type: "token",
                    text: `+${result.earnedTokens} PULLUP · +${result.earnedXp} XP`,
                });
            }

            setWeeklyWorkouts((currentWorkouts) => [
                ...currentWorkouts,
                {
                    type: challengeTypeToWorkoutType(type),
                    date: new Date().toISOString(),
                    value,
                    tokens: result.earnedTokens,
                    xp: result.earnedXp,
                    status: "approved",
                },
            ]);

            return result.updatedUser;
        });
    };

    const resetDemoProgress = async () => {
        playSuccess();
        try {
            await resetStoredDemoProgress();
        } catch {
            // Reset the in-memory state even when storage is unavailable.
        }
        setGameUser(cloneInitialUser());
        setWeeklyWorkouts([]);
        setNotification({
            type: "info",
            text: "Демо-прогресс сброшен",
        });
        setSelectedAvatarId("");
        setCustomAvatarUrl(null);
        setNewlyUnlockedCodes([]);
        setAppSettings(DEFAULT_APP_SETTINGS);
    };

    const clearLocalData = () => {
        try {
            Object.keys(window.localStorage)
                .filter(
                    (key) =>
                        key.startsWith("pullup:") ||
                        key.startsWith("pullup_")
                )
                .forEach((key) => window.localStorage.removeItem(key));
        } catch {
            // Continue with in-memory cleanup.
        }
        setSelectedAvatarId("");
        setCustomAvatarUrl(null);
        setNewlyUnlockedCodes([]);
        setAppSettings(DEFAULT_APP_SETTINGS);
        setGameUser(cloneInitialUser());
        setWeeklyWorkouts([]);
    };

    const showAvatarSaved = () => {
        playSuccess();
        setNotification({
            type: "success",
            text: "Аватар сохранён",
        });
        setAvatarSavedFlash(true);
        window.setTimeout(() => setAvatarSavedFlash(false), 1100);
    };

    const handleOpenSite = () => {
        playOpen();
        const result = openPullupSite();
        if (!result.ok) {
            playError();
            setNotification({ type: "error", text: result.reason });
        }
    };

    const retryTelegramConnection = useCallback(() => {
        console.info("[TelegramAuth] retry requested", {
            hasWindowTelegram: Boolean(window.Telegram),
            hasTelegramWebApp: Boolean(window.Telegram?.WebApp),
            initDataLength: window.Telegram?.WebApp?.initData?.length ?? 0,
            hasInitDataUnsafeUser: Boolean(
                window.Telegram?.WebApp?.initDataUnsafe?.user
            ),
        });
        setLoading(true);
        setShowStartupGreeting(true);
        setError(null);
        setAuthStatus("loading");
        setApiHealthStatus("not-checked");
        setApiHealthError(null);
        setApiHealthResponse(null);
        setAuthRetryNonce((current) => current + 1);
    }, []);

    const handleMenuNavigation = (action: SideMenuAction) => {
        if (action === "leaderboard") {
            playOpen();
        } else {
            playTap();
        }
        setShowSideMenu(false);
        if (action === "site") {
            handleOpenSite();
            return;
        }
        const directViews: Partial<Record<SideMenuAction, AppView>> = {
            profile: "profile",
            achievements: "achievements",
            leaderboard: "leaderboard",
        };
        const directView = directViews[action];
        if (directView) {
            setActiveView(directView);
            return;
        }

        const menuScreens: Record<
            Exclude<
                SideMenuAction,
                "profile" | "achievements" | "leaderboard" | "site"
            >,
            MenuScreenId
        > = {
            workouts: "history",
            videos: "videos",
            referrals: "referrals",
            settings: "settings",
            support: "support",
            about: "about",
            logout: "logout",
        };
        openMenuScreen(
            menuScreens[action as keyof typeof menuScreens]
        );
    };

    const content = useMemo(() => {
        if (!displayUser) return null;
        switch (activeView) {
            case "home":
                return (
                    <Dashboard
                        user={displayUser}
                        avatarUrl={avatarUrl}
                        challenges={challenges}
                        achievementsCount={achievements.length}
                        ratingPlace={ratingPlace}
                        recentWorkouts={weeklyWorkouts}
                        onOpenChallenges={() => setActiveView("challenges")}
                        onOpenLeaderboard={() => {
                            playOpen();
                            setActiveView("leaderboard");
                        }}
                        onOpenAvatar={() => setShowAvatarPicker(true)}
                        onOpenMenu={() => {
                            playOpen();
                            setShowSideMenu(true);
                        }}
                        onOpenNotifications={() =>
                            openPlaceholder(
                                "Уведомления",
                                "Новые награды, результаты модерации и события появятся здесь."
                            )
                        }
                        onOpenChallenge={setSelectedChallenge}
                        onAddWorkout={() => setShowWorkoutModal(true)}
                        onOpenSite={handleOpenSite}
                        onStreakClick={handleStreakClick}
                    />
                );
            case "challenges":
                return (
                    <ChallengesScreen
                        challenges={challenges}
                        loading={loading}
                        error={
                            dashboardMode === "telegram" ||
                            dashboardMode === "api-error"
                                ? error
                                : null
                        }
                        onRetry={() => setAuthRetryNonce((value) => value + 1)}
                        onOpenChallenge={setSelectedChallenge}
                    />
                );
            case "workouts":
                return (
                    <WorkoutsScreen
                        challenges={challenges}
                        workouts={weeklyWorkouts}
                        loading={loading}
                        error={
                            dashboardMode === "telegram" ||
                            dashboardMode === "api-error"
                                ? workoutsError
                                : null
                        }
                        onRetry={() => setAuthRetryNonce((value) => value + 1)}
                        onAdd={() => setShowWorkoutModal(true)}
                    />
                );
            case "achievements":
                return (
                    <AchievementsCatalogScreen
                        achievements={achievementViews}
                    />
                );
            case "profile":
                return (
                    <ProfileScreen
                        user={displayUser}
                        badges={gameBadges}
                        challenges={challenges}
                        achievements={achievements}
                        workouts={weeklyWorkouts}
                        ratingPlace={ratingPlace}
                        avatarUrl={avatarUrl}
                        onOpenAvatar={() => setShowAvatarPicker(true)}
                        onOpenSettings={() => openMenuScreen("settings")}
                        onOpenAchievements={() => setActiveView("achievements")}
                        onOpenLeaderboard={() => setActiveView("leaderboard")}
                        onOpenReferrals={() => openMenuScreen("referrals")}
                        onOpenLogout={() => openMenuScreen("logout")}
                        onStreakClick={handleStreakClick}
                    />
                );
            case "leaderboard":
                return (
                    <LeaderboardScreen
                        currentName={displayUser.display_name}
                        currentAvatarUrl={avatarUrl}
                        currentTelegramId={displayUser.telegram_id}
                        entries={leaderboardEntries}
                        myRank={myLeaderboardRank}
                    />
                );
            case "placeholder":
                return (
                    <PlaceholderScreen
                        title={placeholder.title}
                        description={placeholder.description}
                        onBack={() => setActiveView("home")}
                    />
                );
            case "menu":
                return (
                    <MenuScreens
                        screen={menuScreen}
                        user={displayUser}
                        mode={dashboardMode}
                        settings={appSettings}
                        onSettingsChange={handleSettingsChange}
                        onOpenAvatar={() => setShowAvatarPicker(true)}
                        onResetProfile={resetLocalProfile}
                        onClearLocalData={clearLocalData}
                        onOpenSite={handleOpenSite}
                        siteUrl={PULLUP_SITE_URL}
                        usesSiteUrlFallback={isPullupSiteUrlFallback}
                        onBack={() => setActiveView("home")}
                    />
                );
        }
    }, [
        activeView,
        achievements,
        achievementViews,
        appSettings,
        avatarUrl,
        challenges,
        dashboardMode,
        displayUser,
        gameBadges,
        leaderboardEntries,
        myLeaderboardRank,
        ratingPlace,
        menuScreen,
        placeholder.description,
        placeholder.title,
        viewGameUser,
        weeklyWorkouts,
        handleOpenSite,
    ]);

    const webApp = getTelegramWebApp();
    const apiConfigurationError =
        getFrontendApiConfigurationError();
    const telegramDebugUser = webApp?.initDataUnsafe?.user;
    const displayedUser = displayUser
        ? `${displayUser.telegram_id} · @${displayUser.username || "без username"}`
        : "нет";
    const backendUser =
        backendProfile
            ? `${backendProfile.telegram_id} · @${backendProfile.username || "без username"}`
            : "нет";
    const authDebug = {
        mode: dashboardMode,
        profileSource,
        authStatus,
        hasWindowTelegram: Boolean(window.Telegram),
        hasTelegramWebApp: Boolean(window.Telegram?.WebApp),
        currentUrl: getSafeCurrentUrl(),
        userAgent: navigator.userAgent,
        isTelegramWebViewPossible: isTelegramWebViewPossible(webApp),
        hasTelegramScript: hasTelegramScript(),
        windowTelegramType: typeof window.Telegram,
        webAppVersion: webApp?.version || "не определена",
        platform: webApp?.platform || "не определена",
        colorScheme: webApp?.colorScheme || "не определена",
        hasInitData: Boolean(webApp?.initData),
        initDataLength: webApp?.initData?.length ?? 0,
        hasInitDataUnsafeUser: Boolean(telegramDebugUser),
        telegramUserId: telegramDebugUser?.id ?? null,
        telegramUsername: telegramDebugUser?.username ?? null,
        backendTelegramId: backendProfile?.telegram_id ?? null,
        backendUsername: backendProfile?.username ?? null,
        displayedTelegramId: displayUser?.telegram_id ?? null,
        displayedUsername: displayUser?.username ?? null,
        apiBaseUrl: getFrontendApiUrl() || "не настроен",
        apiUrlSource: getFrontendApiUrlSource(),
        apiConfigurationError,
        apiHealthStatus,
        apiHealthError,
        apiHealthResponse: apiHealthResponse
            ? JSON.stringify(apiHealthResponse)
            : null,
        backendUser,
        displayedUser,
        telegramId: user?.telegram_id ?? null,
        username: user?.username ?? null,
        firstName: user?.first_name ?? null,
        tokens: user?.tokens ?? null,
        level: user?.level ?? null,
        lastAuthError: error,
    };
    const [showAuthDebug, setShowAuthDebug] = useState(false);
    const [authDebugTapCount, setAuthDebugTapCount] = useState(0);
    const lastAuthDebugTapRef = useRef(0);

    const handlePullupLogoClick = () => {
        const now = Date.now();

        if (now - lastAuthDebugTapRef.current > 2000) {
            setAuthDebugTapCount(1);
            lastAuthDebugTapRef.current = now;
            return;
        }

        setAuthDebugTapCount((prev) => {
            const next = prev + 1;

            if (next >= 7) {
                setShowAuthDebug((current) => !current);
                return 0;
            }

            return next;
        });

        lastAuthDebugTapRef.current = now;
    };
    const authDebugPanel = showAuthDebug ? (
        <div className="auth-debug-panel">
            <b>AUTH DEBUG · {authDebug.mode}</b>
            <span>profileSource: {authDebug.profileSource}</span>
            <span>authStatus: {authDebug.authStatus}</span>
            <span>currentUrl: {authDebug.currentUrl}</span>
            <span>userAgent: {authDebug.userAgent}</span>
            <span>isTelegramWebViewPossible: {String(authDebug.isTelegramWebViewPossible)}</span>
            <span>hasTelegramScript: {String(authDebug.hasTelegramScript)}</span>
            <span>windowTelegramType: {authDebug.windowTelegramType}</span>
            <span>webAppVersion: {authDebug.webAppVersion}</span>
            <span>platform: {authDebug.platform}</span>
            <span>colorScheme: {authDebug.colorScheme}</span>
            <span>hasWindowTelegram: {String(authDebug.hasWindowTelegram)}</span>
            <span>hasTelegramWebApp: {String(authDebug.hasTelegramWebApp)}</span>
            <span>hasInitData: {String(authDebug.hasInitData)}</span>
            <span>initDataLength: {authDebug.initDataLength}</span>
            <span>hasInitDataUnsafeUser: {String(authDebug.hasInitDataUnsafeUser)}</span>
            <span>telegramUser.id: {authDebug.telegramUserId ?? "не получен"}</span>
            <span>telegramUser.username: @{authDebug.telegramUsername || "не получен"}</span>
            <span>backendUser.telegram_id: {authDebug.backendTelegramId ?? "не получен"}</span>
            <span>backendUser.username: @{authDebug.backendUsername || "не получен"}</span>
            <span>displayedUser.telegram_id: {authDebug.displayedTelegramId ?? "не получен"}</span>
            <span>displayedUser.username: @{authDebug.displayedUsername || "не получен"}</span>
            <span>VITE_API_URL: {authDebug.apiBaseUrl}</span>
            <span>apiUrlSource: {authDebug.apiUrlSource}</span>
            <span>apiUrlError: {authDebug.apiConfigurationError || "нет"}</span>
            <span>apiHealthStatus: {authDebug.apiHealthStatus}</span>
            <span>apiHealthError: {authDebug.apiHealthError || "нет"}</span>
            <span>apiHealthResponse: {authDebug.apiHealthResponse || "нет"}</span>
            <span>backendUser: {authDebug.backendUser}</span>
            <span>displayedUser: {authDebug.displayedUser}</span>
            <span>telegram_id: {authDebug.telegramId ?? "не получен"}</span>
            <span>username: @{authDebug.username || "не получен"}</span>
            <span>first_name: {authDebug.firstName || "не получен"}</span>
            <span>tokens: {authDebug.tokens ?? "не получены"}</span>
            <span>level: {authDebug.level ?? "не получен"}</span>
            <span>lastAuthError: {authDebug.lastAuthError || "нет"}</span>

            {!authDebug.hasTelegramWebApp && (
                <span>
                    Telegram WebApp объект не найден. Проверь, что приложение открыто через
                    InlineKeyboardButton(web_app=WebAppInfo(...)), а не через обычную url-кнопку.
                </span>
            )}
        </div>
    ) : null;

    if (loading) {
        return <StartupGreeting user={user ?? backendProfile} mode="loading" />;
    }

    if (
        dashboardMode === "api-error" ||
        dashboardMode === "telegram-error"
    ) {
        return (
            <div className="app-state api-error-state">
                <ShieldCheck size={34} />
                <strong>
                    {dashboardMode === "telegram-error"
                        ? "Не удалось получить данные Telegram"
                        : "Не удалось подключиться к PULLUP"}
                </strong>
                <p>
                    {error ||
                        (dashboardMode === "telegram-error"
                            ? "Открой приложение через WebApp-кнопку бота."
                            : "Telegram-профиль не был загружен с сервера.")}
                </p>
                {authDebugPanel}
                <button onClick={retryTelegramConnection}>
                    Повторить подключение
                </button>
            </div>
        );
    }

    if (!user) {
        return <StartupGreeting user={null} mode="loading" />;
    }

    if (showStartupGreeting) {
        return <StartupGreeting user={user} mode="welcome" />;
    }

    return (
        <div
            className={[
                "app-shell",
                `theme-${appSettings.theme}`,
                appSettings.compact ? "compact-mode" : "",
                appSettings.animations ? "" : "reduce-motion",
                avatarSavedFlash ? "avatar-success-flash" : "",
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {dashboardMode === "demo" && (
                <div
                    className="telegram-context-warning"
                    role="status"
                >
                    Приложение открыто не через Telegram WebApp.
                </div>
            )}
            <AnimatePresence>
                {showStreakToast && displayUser && (
                    <motion.div
                        className="streak-toast"
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, y: -30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.96 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                        <motion.span
                            className="streak-toast__icon"
                            aria-hidden="true"
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                        >
                            🔥
                        </motion.span>
                        <div className="streak-toast__copy">
                            <strong>
                                {displayUser.streak_days === 0
                                    ? "Начни серию сегодня"
                                    : displayUser.streak_days === 1
                                      ? "Первый день серии!"
                                      : `${displayUser.streak_days} дней подряд!`}
                            </strong>
                            <span>Продолжай тренироваться каждый день</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {notification && (
                    <motion.div
                        className={`game-notification ${notification.type}`}
                        role="status"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                    >
                        {notification.text}
                    </motion.div>
                )}
            </AnimatePresence>
            <main className="app-content">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeView}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.18 }}
                    >
                        {content}
                    </motion.div>
                </AnimatePresence>
            </main>
            {dashboardMode === "demo" && (
                <button
                    type="button"
                    className="reset-demo-progress"
                    onClick={resetDemoProgress}
                >
                    Сбросить демо-прогресс
                </button>
            )}
            {authDebugPanel}
            <nav className="bottom-nav">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            className={activeView === item.id ? "active" : ""}
                            onClick={() => {
                                playTap();
                                setActiveView(item.id);
                            }}
                        >
                            <Icon size={28} strokeWidth={2.35} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
            <AnimatePresence>
                {showWorkoutModal && (
                    <AddWorkoutModal
                        challenges={challenges}
                        onClose={() => setShowWorkoutModal(false)}
                        onSubmit={addResult}
                        mode={dashboardMode}
                        onError={(message) =>
                            setNotification({ type: "info", text: message })
                        }
                    />
                )}
                {selectedChallenge && (
                    <ChallengeDetailModal
                        challenge={selectedChallenge}
                        onClose={() => setSelectedChallenge(null)}
                        onAddWorkout={() => {
                            setSelectedChallenge(null);
                            setShowWorkoutModal(true);
                        }}
                    />
                )}
            </AnimatePresence>
            <AvatarPickerModal
                open={showAvatarPicker}
                selectedId={selectedAvatarId || SPORT_AVATARS[0].id}
                customAvatarUrl={customAvatarUrl}
                onClose={() => setShowAvatarPicker(false)}
                onError={(message) =>
                    setNotification({ type: "error", text: message })
                }
                onSave={async (avatarId, selectedUrl) => {
                    if (dashboardMode === "telegram") {
                        const initData =
                            window.Telegram?.WebApp?.initData || "";
                        try {
                            const profile = await updateProfileAvatar(
                                initData,
                                selectedUrl
                            );
                            setUser((current) =>
                                current
                                    ? {
                                          ...current,
                                          photo_url: profile.avatar_url,
                                      }
                                    : current
                            );
                            showAvatarSaved();
                            setShowAvatarPicker(false);
                        } catch (reason) {
                            const message =
                                reason instanceof Error
                                    ? reason.message
                                    : "Не удалось сохранить аватар";
                            playError();
                            setNotification({
                                type: "error",
                                text: message,
                            });
                        }
                        return;
                    }
                    setSelectedAvatarId(avatarId);
                    try {
                        window.localStorage.setItem(
                            AVATAR_STORAGE_KEY,
                            avatarId
                        );
                        if (avatarId === "custom") {
                            window.localStorage.setItem(
                                CUSTOM_AVATAR_STORAGE_KEY,
                                selectedUrl
                            );
                            setCustomAvatarUrl(selectedUrl);
                        } else {
                            window.localStorage.removeItem(
                                CUSTOM_AVATAR_STORAGE_KEY
                            );
                            setCustomAvatarUrl(null);
                        }
                    } catch {
                        // Keep the avatar for this session if storage is full.
                        if (avatarId === "custom") {
                            setCustomAvatarUrl(selectedUrl);
                        }
                    }
                    showAvatarSaved();
                    setShowAvatarPicker(false);
                }}
            />
            <SideMenu
                open={showSideMenu}
                name={displayUser?.display_name || user.display_name}
                username={displayUser?.username || user.username}
                avatarUrl={avatarUrl}
                tokens={displayUser?.tokens ?? user.tokens}
                onClose={() => setShowSideMenu(false)}
                onNavigate={handleMenuNavigation}
            />
        </div>
    );
}
