import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock, X } from "lucide-react";
import AchievementCard, {
    type AchievementState,
} from "./AchievementCard";
import type { AchievementDefinition } from "../data/achievements";

export interface AchievementView {
    definition: AchievementDefinition;
    state: AchievementState;
    progress: number;
}

interface AchievementsScreenProps {
    achievements: AchievementView[];
}

type AchievementFilter = "all" | "unlocked" | "locked";

export default function AchievementsScreen({
    achievements,
}: AchievementsScreenProps) {
    const [filter, setFilter] = useState<AchievementFilter>("all");
    const [selected, setSelected] = useState<AchievementView | null>(null);

    const visible = useMemo(
        () =>
            achievements.filter((item) => {
                if (filter === "unlocked") return item.state !== "locked";
                if (filter === "locked") return item.state === "locked";
                return true;
            }),
        [achievements, filter]
    );

    const unlockedCount = achievements.filter(
        (item) => item.state !== "locked"
    ).length;

    return (
        <>
            <header className="screen-header achievements-header">
                <span>Коллекция силы</span>
                <h1>Достижения</h1>
                <p>
                    Открыто {unlockedCount} из {achievements.length}
                </p>
            </header>

            <div className="achievement-summary">
                <div
                    style={
                        {
                            "--summary-progress": `${Math.round(
                                (unlockedCount / achievements.length) * 100
                            )}%`,
                        } as React.CSSProperties
                    }
                >
                    <strong>{unlockedCount}</strong>
                    <span>получено</span>
                </div>
                <p>
                    Каждая тренировка приближает тебя к новой награде.
                    Продолжай собирать коллекцию.
                </p>
            </div>

            <div className="segmented achievements-filter">
                {(
                    [
                        ["all", "Все"],
                        ["unlocked", "Полученные"],
                        ["locked", "Скрытые"],
                    ] as Array<[AchievementFilter, string]>
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

            <motion.div layout className="achievement-catalog-grid">
                <AnimatePresence mode="popLayout">
                    {visible.map((item) => (
                        <motion.div
                            layout
                            key={item.definition.code}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                        >
                            <AchievementCard
                                achievement={item.definition}
                                state={item.state}
                                progress={item.progress}
                                onClick={() => setSelected(item)}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </motion.div>

            <AnimatePresence>
                {selected && (
                    <motion.div
                        className="modal-backdrop achievement-detail-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelected(null)}
                    >
                        <motion.section
                            className={`achievement-detail achievement-detail--${selected.state}`}
                            style={
                                {
                                    "--achievement-accent":
                                        selected.definition.accent,
                                } as React.CSSProperties
                            }
                            initial={{ scale: 0.88, y: 30 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.88, y: 30 }}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                className="achievement-detail-close"
                                onClick={() => setSelected(null)}
                            >
                                <X size={19} />
                            </button>
                            <div className="achievement-detail-icon">
                                {selected.definition.icon.startsWith("/") ? (
                                    <img
                                        src={selected.definition.icon}
                                        alt=""
                                        aria-hidden="true"
                                    />
                                ) : (
                                    selected.definition.icon
                                )}
                            </div>
                            <span>
                                {selected.state === "locked" ? (
                                    <>
                                        <Lock size={13} /> Скрыто
                                    </>
                                ) : (
                                    <>
                                        <Check size={13} /> Получено
                                    </>
                                )}
                            </span>
                            <h2>{selected.definition.title}</h2>
                            <p>{selected.definition.description}</p>
                            <div className="achievement-detail-progress">
                                <div>
                                    <i
                                        style={{
                                            width: `${Math.min(
                                                100,
                                                (selected.progress /
                                                    selected.definition.goal) *
                                                    100
                                            )}%`,
                                        }}
                                    />
                                </div>
                                <strong>
                                    {selected.progress}/{selected.definition.goal}{" "}
                                    {selected.definition.unit || ""}
                                </strong>
                            </div>
                        </motion.section>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
