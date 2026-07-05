import { AnimatePresence, motion } from "framer-motion";
import {
    Award,
    CircleHelp,
    Dumbbell,
    History,
    Info,
    Link,
    LogOut,
    Medal,
    Globe2,
    Settings,
    Trophy,
    UserRound,
    Video,
    X,
} from "lucide-react";

export type SideMenuAction =
    | "profile"
    | "achievements"
    | "leaderboard"
    | "workouts"
    | "videos"
    | "referrals"
    | "settings"
    | "support"
    | "about"
    | "site"
    | "logout";

interface SideMenuProps {
    open: boolean;
    name: string;
    username: string | null;
    avatarUrl: string;
    tokens: number;
    onClose: () => void;
    onNavigate: (action: SideMenuAction) => void;
}

const MENU_GROUPS: Array<
    Array<{
        id: SideMenuAction;
        label: string;
        icon: typeof UserRound;
        accent?: boolean;
    }>
> = [
    [
        { id: "profile", label: "Профиль", icon: UserRound },
        { id: "achievements", label: "Достижения", icon: Award },
        { id: "leaderboard", label: "Рейтинг", icon: Trophy, accent: true },
        { id: "workouts", label: "История тренировок", icon: History },
        { id: "videos", label: "Мои видео", icon: Video },
    ],
    [
        { id: "referrals", label: "Реферальная программа", icon: Link },
        { id: "settings", label: "Настройки", icon: Settings },
        { id: "support", label: "Поддержка", icon: CircleHelp },
        { id: "about", label: "О приложении", icon: Info },
        { id: "site", label: "Сайт PULLUP", icon: Globe2, accent: true },
    ],
    [{ id: "logout", label: "Выйти", icon: LogOut }],
];

export default function SideMenu({
    open,
    name,
    username,
    avatarUrl,
    tokens,
    onClose,
    onNavigate,
}: SideMenuProps) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="side-menu-layer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.aside
                        className="side-menu"
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="side-menu-top">
                            <div className="side-menu-brand">
                                <Medal size={18} />
                                PULLUP
                            </div>
                            <button onClick={onClose} aria-label="Закрыть меню">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="side-menu-user">
                            <img src={avatarUrl} alt="" />
                            <div>
                                <strong>{name}</strong>
                                <span>@{username || "athlete"}</span>
                            </div>
                            <b>{tokens} 🪙</b>
                        </div>

                        <div className="side-menu-motivation">
                            <Dumbbell size={21} />
                            <div>
                                <span>Сегодня — твой день</span>
                                <strong>Стань сильнее, чем вчера</strong>
                            </div>
                        </div>

                        <nav>
                            {MENU_GROUPS.map((group, groupIndex) => (
                                <div className="side-menu-group" key={groupIndex}>
                                    {group.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <button
                                                key={item.id}
                                                className={[
                                                    item.accent ? "accent" : "",
                                                    item.id === "logout" ? "danger" : "",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ")}
                                                onClick={() => onNavigate(item.id)}
                                            >
                                                <span>
                                                    <Icon size={18} />
                                                </span>
                                                {item.label}
                                                {item.id === "achievements" && (
                                                    <b>NEW</b>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </nav>
                    </motion.aside>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
