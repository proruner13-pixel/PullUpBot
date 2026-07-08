import { useCallback, useEffect, useMemo,useRef, useState } from "react";
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
import { createDemoDashboard } from "./mocks/data";
import { resetDemoProgress as resetStoredDemoProgress } from "./api/client";
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
    tokens: number;
    xp: number;
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
        next_level_progress: challenge.xp % 100,
    }));
}

type ChallengeVisual = {
    label: string;
    shortLabel: string;
    color: string;
    icon: string;
    reward: number;
};

const CHALLENGE_VISUALS: Record<string, ChallengeVisual> = {
    pullups: {
        label: "Ежедневный воркаут",
        shortLabel: "Подтягивания",
        color: "#71e45b",
        icon: "🏋️",
        reward: 200,
    },
    pushups: {
        label: "Отжимания мастер",
        shortLabel: "Отжимания",
        color: "#55a8ff",
        icon: "💪",
        reward: 400,
    },
    plank: {
        label: "Планка про",
        shortLabel: "Планка",
        color: "#d86cff",
        icon: "🧘",
        reward: 300,
    },
    running: {
        label: "Сила недели",
        shortLabel: "Бег",
        color: "#ff9e45",
        icon: "🏃",
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

const NAV_ITEMS: Array<{
    id: Tab;
    label: string;
    icon: typeof Home;
}> = [
    { id: "home", label: "Главная", icon: Home },
    { id: "challenges", label: "Челленджи", icon: Trophy },
    { id: "workouts", label: "Тренировки", icon: Dumbbell },
    { id: "achievements", label: "Достижения", icon: Award },
    { id: "profile", label: "Профиль", icon: UserRound },
];

function percent(challenge: ApiChallenge): number {
    if (challenge.goal <= 0) return 0;
    return Math.min(100, Math.round((challenge.progress / challenge.goal) * 100));
}

function levelProgress(xp: number): number {
    return Math.max(0, xp % 100);
}

function apiLevelProgress(value: number | undefined, xp: number): number {
    return value ?? levelProgress(xp);
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

function formatFullDate(date: Date): string {
    return `${formatShortDate(date)}.${date.getFullYear()}`;
}

function normalizeWorkoutType(type: string): WorkoutType | null {
    const normalized: Record<string, WorkoutType> = {
        pullup: "pullup",
        pullups: "pullup",
        pushup: "pushup",
        pushups: "pushup",
        run: "run",
        running: "run",
        plank: "plank",
    };
    return normalized[type] ?? null;
}

function calculateWorkoutTokens(type: WorkoutType, value: number): number {
    const safeValue = Math.max(Number.isFinite(value) ? value : 0, 0);
    if (type === "run") return Math.floor(safeValue * 10);
    if (type === "plank") return Math.floor(safeValue / 10);
    return Math.floor(safeValue);
}

function calculateWorkoutXp(type: WorkoutType, tokens: number, value: number): number {
    if (type === "pullup") return tokens * 2;
    if (type === "pushup") return tokens;
    if (type === "run") return Math.floor(Math.max(value, 0) * 10);
    return Math.floor(Math.max(value, 0) / 10);
}

function submissionToWorkout(submission: SubmissionResponse): WorkoutEntry | null {
    if (submission.status !== "approved") return null;
    const type = normalizeWorkoutType(submission.type);
    if (!type) return null;
    const tokens = calculateWorkoutTokens(type, submission.value);
    return {
        type,
        date: submission.reviewed_at ?? submission.created_at,
        tokens,
        xp: calculateWorkoutXp(type, tokens, submission.value),
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
                typeof candidate.tokens === "number" &&
                typeof candidate.xp === "number" &&
                Boolean(candidate.type && WORKOUT_TYPE_META[candidate.type])
            );
        });
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
                <span>{visual.icon}</span>
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
                    <span className="reward">+{visual.reward} 🪙</span>
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
                        Уровень {challenge.level} · {apiLevelProgress(challenge.next_level_progress, challenge.xp)} / 100 XP
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
    gameUser,
    avatarUrl,
    challenges,
    onOpenChallenges,
    onOpenWorkouts,
    onOpenLeaderboard,
    onOpenAvatar,
    onOpenMenu,
    onOpenNotifications,
    onOpenChallenge,
    onOpenSite,
}: {
    user: ApiUser;
    gameUser: GameUser;
    avatarUrl: string;
    challenges: ApiChallenge[];
    onOpenChallenges: () => void;
    onOpenWorkouts: () => void;
    onOpenLeaderboard: () => void;
    onOpenAvatar: () => void;
    onOpenMenu: () => void;
    onOpenNotifications: () => void;
    onOpenChallenge: (challenge: ApiChallenge) => void;
    onOpenSite: () => void;
}) {
    const overall = challenges.length
        ? Math.round(
              challenges.reduce((sum, item) => sum + percent(item), 0) /
                  challenges.length
          )
        : 0;
    const nearest =
        [...challenges]
            .filter((item) => percent(item) < 100)
            .sort((a, b) => percent(b) - percent(a))[0] ?? challenges[0];

    return (
        <>
            <div className="topbar">
                <button
                    className="icon-button"
                    aria-label="Меню"
                    onClick={onOpenMenu}
                >
                    <Menu size={20} />
                </button>
                <span className="brand">PULLUP</span>
                <button
                    className="icon-button"
                    aria-label="Уведомления"
                    onClick={onOpenNotifications}
                >
                    <Zap size={19} />
                </button>
            </div>

            <section className="hero-profile">
                <button
                    className="avatar avatar-button"
                    onClick={onOpenAvatar}
                    aria-label="Сменить аватар"
                >
                    <img src={avatarUrl} alt="" />
                    <span className="avatar-edit-dot">
                        <Plus size={12} />
                    </span>
                </button>
                <div className="hero-copy">
                    <span>Уровень спортсмена</span>
                    <strong>{gameUser.totalLevel}</strong>
                    <small>общий уровень</small>
                </div>
                <div className="streak">
                    <Flame size={22} fill="currentColor" />
                    <div>
                        <strong>
                            {
                                challenges.filter(
                                    (challenge) => challenge.progress > 0
                                ).length
                            }
                        </strong>
                        <span>активности</span>
                    </div>
                </div>
            </section>

            <section className="game-economy" aria-label="Игровой прогресс">
                <div>
                    <span>Спорт-рейтинг</span>
                    <strong>
                        {Object.values(gameUser.challenges)
                            .reduce(
                                (sum, challenge) =>
                                    sum + challenge.monthlyScore,
                                0
                            )
                            .toLocaleString("ru-RU")}
                    </strong>
                </div>
                <div>
                    <span>Опыт</span>
                    <strong>{user.total_xp.toLocaleString("ru-RU")} XP</strong>
                </div>
                <div>
                    <span>Баланс</span>
                    <strong>
                        <AnimatedNumber value={user.tokens} /> PULLUP
                    </strong>
                </div>
            </section>

            <section className="panel progress-panel">
                <div>
                    <span className="section-kicker">Прогресс дня</span>
                    <h2>Ты движешься к цели</h2>
                    <p>Ещё немного — и новый уровень твой.</p>
                </div>
                <ProgressRing value={overall} />
            </section>

            {nearest && (
                <section>
                    <div className="section-title">
                        <div>
                            <span>Следующая цель</span>
                            <h2>Ближайший челлендж</h2>
                        </div>
                        <button onClick={onOpenChallenges}>
                            Все <ChevronRight size={16} />
                        </button>
                    </div>
                    <ChallengeCard
                        challenge={nearest}
                        compact
                        onClick={() => onOpenChallenge(nearest)}
                    />
                </section>
            )}

            <section className="quick-grid">
                <button onClick={onOpenChallenges}>
                    <Target />
                    <span>Челленджи</span>
                    <strong>{challenges.length}</strong>
                </button>
                <button onClick={onOpenWorkouts}>
                    <Activity />
                    <span>Тренировки</span>
                    <strong>{challenges.reduce((sum, c) => sum + (c.progress > 0 ? 1 : 0), 0)}</strong>
                </button>
                <button onClick={onOpenLeaderboard}>
                    <Medal />
                    <span>Рейтинг</span>
                    <strong>TOP</strong>
                </button>
            </section>

            <button className="project-site-card" onClick={onOpenSite}>
                <span className="project-site-card__icon">
                    <Globe2 size={21} />
                </span>
                <span>
                    <small>Официальный ресурс</small>
                    <strong>Сайт проекта PULLUP</strong>
                </span>
                <ChevronRight size={18} />
            </button>
        </>
    );
}

function ChallengesScreen({
    challenges,
    onOpenChallenge,
}: {
    challenges: ApiChallenge[];
    onOpenChallenge: (challenge: ApiChallenge) => void;
}) {
    const [filter, setFilter] = useState<"active" | "done">("active");
    const visible = challenges.filter((item) =>
        filter === "done" ? percent(item) >= 100 : percent(item) < 100
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
                {visible.length ? (
                    visible.map((item) => (
                        <ChallengeCard
                            key={item.exercise}
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
    onAdd,
}: {
    challenges: ApiChallenge[];
    workouts: WorkoutEntry[];
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

    return (
        <>
            <ScreenHeader title="Тренировки" eyebrow="История прогресса" />
            <div className="workout-list">
                {challenges
                    .filter((challenge) => challenge.progress > 0)
                    .map((challenge, index) => {
                        const visual =
                            CHALLENGE_VISUALS[challenge.exercise] ??
                            CHALLENGE_VISUALS.pullups;
                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.06 }}
                                className="workout-row"
                                key={challenge.exercise}
                            >
                                <span
                                    className="workout-icon"
                                    style={{ color: visual.color }}
                                >
                                    {visual.icon}
                                </span>
                                <div>
                                    <strong>{visual.shortLabel}</strong>
                                    <span>Текущий подтверждённый прогресс</span>
                                </div>
                                <b>+{challenge.progress}</b>
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
    gameUser,
    badges,
    avatarUrl,
    onOpenAvatar,
    onOpenSettings,
}: {
    user: ApiUser;
    gameUser: GameUser;
    badges: string[];
    avatarUrl: string;
    onOpenAvatar: () => void;
    onOpenSettings: () => void;
}) {
    const referralLink = `https://t.me/ActiveRunBot?start=${user.telegram_id}`;
    const [copied, setCopied] = useState(false);

    const copyReferral = async () => {
        await navigator.clipboard.writeText(referralLink);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <>
            <ScreenHeader title="Профиль" eyebrow="Твой прогресс" />
            <section className="profile-card">
                <button
                    className="avatar avatar--large avatar-button"
                    onClick={onOpenAvatar}
                >
                    <img src={avatarUrl} alt="" />
                    <span className="avatar-edit-dot">
                        <Plus size={12} />
                    </span>
                </button>
                <h2>
                    {user.display_name ||
                        user.first_name ||
                        user.username ||
                        `Telegram ${user.telegram_id}`}
                </h2>
                <span>
                    {user.username
                        ? `@${user.username}`
                        : `Telegram ID ${user.telegram_id}`}
                </span>
                <small>Telegram ID: {user.telegram_id}</small>
                <div className="level-line">
                    <div
                        style={{
                            width: `${Math.min(
                                100,
                                apiLevelProgress(
                                    user.next_level_progress,
                                    user.total_xp
                                )
                            )}%`,
                        }}
                    />
                </div>
                <small>
                    Общий уровень {user.level} · до следующего уровня{" "}
                    {100 -
                        apiLevelProgress(
                            user.next_level_progress,
                            user.total_xp
                        )} XP
                </small>
            </section>
            <div className="profile-stats">
                <div>
                    <span>Токены</span>
                    <strong>🪙 {user.tokens}</strong>
                </div>
                <div>
                    <span>Опыт</span>
                    <strong>{user.total_xp} XP</strong>
                </div>
            </div>
            <section className="panel profile-achievements">
                <span className="section-kicker">Ачивки</span>
                <div>
                    {badges.length ? (
                        badges.map((badge) => <b key={badge}>{badge}</b>)
                    ) : (
                        <p>Нет ачивок</p>
                    )}
                </div>
            </section>
            <section className="panel referral">
                <div>
                    <span className="section-kicker">Реферальная ссылка</span>
                    <p>{referralLink}</p>
                </div>
                <button onClick={copyReferral} aria-label="Копировать ссылку">
                    {copied ? <Check size={19} /> : <Copy size={19} />}
                </button>
            </section>
            <div className="settings-list">
                <button onClick={onOpenSettings}>
                    <Settings size={19} />
                    Настройки
                    <ChevronRight size={18} />
                </button>
                <button onClick={onOpenSettings}>
                    <ShieldCheck size={19} />
                    Конфиденциальность
                    <ChevronRight size={18} />
                </button>
            </div>
        </>
    );
}

function EmptyState({
    icon: Icon,
    title,
    text,
}: {
    icon: typeof Award;
    title: string;
    text: string;
}) {
    return (
        <div className="empty-state">
            <Icon size={28} />
            <strong>{title}</strong>
            <p>{text}</p>
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
                <div className="challenge-detail-emblem">{visual.icon}</div>
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
                                <span>{visual.icon}</span>
                                {visual.shortLabel}
                            </button>
                        );
                    })}
                </div>
                <label className="amount-field">
                    <span>Количество</span>
                    <div>
                        <button onClick={() => setAmount(Math.max(1, amount - 5))}>
                            −
                        </button>
                        <strong>{amount}</strong>
                        <button onClick={() => setAmount(amount + 5)}>+</button>
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

export default function App() {
    const [activeView, setActiveView] = useState<AppView>("home");
    const [user, setUser] = useState<ApiUser | null>(null);
    const [gameUser, setGameUser] = useState<GameUser>(loadUser);
    const [weeklyWorkouts, setWeeklyWorkouts] =
        useState<WorkoutEntry[]>(readDemoWorkouts);
    const [apiChallenges, setApiChallenges] = useState<ApiChallenge[]>([]);
    const [achievements, setAchievements] = useState<ApiAchievement[]>([]);
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
    const [authRetryNonce, setAuthRetryNonce] = useState(0);
    const [error, setError] = useState<string | null>(null);
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
                setDashboardMode(data.mode);
                if (data.mode === "telegram") {
                    if (telegram.initData) {
                        try {
                            const submissions = await getMySubmissions(
                                100,
                                0,
                                telegram.initData
                            );
                            loadedWorkouts.push(
                                ...submissions
                                    .map(submissionToWorkout)
                                    .filter(
                                        (
                                            workout
                                        ): workout is WorkoutEntry =>
                                            Boolean(workout)
                                    )
                            );
                        } catch (workoutReason) {
                            if (import.meta.env.DEV) {
                                console.warn(
                                    "[DEV] /submissions history failed:",
                                    workoutReason
                                );
                            }
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
                    // Instead of clearing challenges on error, fallback to demo set
                    const demo = createDemoDashboard(failureUser ?? undefined, reason.mode);
                    setApiChallenges(demo.challenges);
                    setAchievements(demo.achievements);
                    setDashboardMode(reason.mode);
                    setWeeklyWorkouts(readDemoWorkouts());
                } else {
                    setUser((current) => current);
                    setBackendProfile(null);
                    setProfileSource("none");
                    setAuthStatus("backend-error");
                    setDashboardMode("api-error");
                    setWeeklyWorkouts(readDemoWorkouts());
                    // fallback
                    const demo = createDemoDashboard(undefined, "api-error");
                    setApiChallenges(demo.challenges);
                    setAchievements(demo.achievements);
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
                    `${achievement.icon} ${achievement.title}`
            ),
        [viewGameUser.achievements]
    );
    const leaderboardScores = useMemo(() => {
        const pullups =
            viewGameUser.challenges["подтягивания"].monthlyScore;
        const pushups =
            viewGameUser.challenges["отжимания"].monthlyScore;
        const plank = viewGameUser.challenges["планка"].monthlyScore;
        const running = viewGameUser.challenges["бег"].monthlyScore;
        return {
            overall: pullups + pushups + plank + running,
            pullups,
            pushups,
            plank,
            running,
        };
    }, [viewGameUser.challenges]);

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
            const challenge = result.updatedUser.challenges[type];

            if (
                result.newAchievements.length &&
                result.levelsGained > 0
            ) {
                playAchievement();
                setNotification({
                    type: "achievement",
                    text: `🏆 Новая ачивка: ${result.newAchievements
                        .map((achievement) => achievement.title)
                        .join(", ")} · 🎉 ${type} — уровень ${challenge.level}`,
                });
            } else if (result.newAchievements.length) {
                playAchievement();
                setNotification({
                    type: "achievement",
                    text: `🏆 Новая ачивка: ${result.newAchievements
                        .map((achievement) => achievement.title)
                        .join(", ")}`,
                });
            } else if (result.levelsGained > 0) {
                playToken();
                setNotification({
                    type: "success",
                    text: `🎉 Новый уровень! ${type[0].toUpperCase()}${type.slice(
                        1
                    )} теперь уровень ${challenge.level}`,
                });
            } else {
                playToken();
                setNotification({
                    type: "token",
                    text: `+${result.earnedTokens} PULLUP · +${result.earnedXp} XP · +${result.earnedScore} очков`,
                });
            }

            setWeeklyWorkouts((currentWorkouts) => [
                ...currentWorkouts,
                {
                    type: challengeTypeToWorkoutType(type),
                    date: new Date().toISOString(),
                    tokens: result.earnedTokens,
                    xp: result.earnedXp,
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
                        gameUser={viewGameUser}
                        avatarUrl={avatarUrl}
                        challenges={challenges}
                        onOpenChallenges={() => setActiveView("challenges")}
                        onOpenWorkouts={() => setActiveView("workouts")}
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
                        onOpenSite={handleOpenSite}
                    />
                );
            case "challenges":
                return (
                    <ChallengesScreen
                        challenges={challenges}
                        onOpenChallenge={setSelectedChallenge}
                    />
                );
            case "workouts":
                return (
                    <WorkoutsScreen
                        challenges={challenges}
                        workouts={weeklyWorkouts}
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
                        gameUser={viewGameUser}
                        badges={gameBadges}
                        avatarUrl={avatarUrl}
                        onOpenAvatar={() => setShowAvatarPicker(true)}
                        onOpenSettings={() => openMenuScreen("settings")}
                    />
                );
            case "leaderboard":
                return (
                    <LeaderboardScreen
                        currentName={displayUser.display_name}
                        currentAvatarUrl={avatarUrl}
                        currentScores={leaderboardScores}
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
        achievementViews,
        appSettings,
        avatarUrl,
        challenges,
        dashboardMode,
        displayUser,
        gameBadges,
        leaderboardScores,
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
        return (
            <div className="app-state">
                <div className="loader" />
                <strong>Собираем твой прогресс</strong>
            </div>
        );
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
        return (
            <div className="app-state">
                <div className="loader" />
                <strong>Открываем PULLUP</strong>
            </div>
        );
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
                            <Icon size={20} />
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
