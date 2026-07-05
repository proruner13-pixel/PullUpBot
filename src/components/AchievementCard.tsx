import { motion } from "framer-motion";
import { Lock, Sparkles } from "lucide-react";
import type { AchievementDefinition } from "../data/achievements";
import { playAchievement, playTap } from "../utils/sound";

export type AchievementState = "locked" | "unlocked" | "newlyUnlocked";

interface AchievementCardProps {
    achievement: AchievementDefinition;
    state: AchievementState;
    progress: number;
    onClick: () => void;
}

export default function AchievementCard({
    achievement,
    state,
    progress,
    onClick,
}: AchievementCardProps) {
    const progressPercent = Math.min(
        100,
        Math.round((progress / achievement.goal) * 100)
    );

    return (
        <motion.button
            layout
            whileTap={{ scale: 0.97 }}
            className={`achievement-card achievement-card--${state}`}
            style={
                {
                    "--achievement-accent": achievement.accent,
                } as React.CSSProperties
            }
            onClick={() => {
                if (state === "newlyUnlocked") {
                    playAchievement();
                } else {
                    playTap();
                }
                onClick();
            }}
        >
            <div className="achievement-card-medal">
                <span>{achievement.icon}</span>
                {state === "locked" ? (
                    <Lock className="achievement-state-icon" size={14} />
                ) : state === "newlyUnlocked" ? (
                    <Sparkles className="achievement-state-icon" size={15} />
                ) : null}
            </div>
            <strong>{achievement.title}</strong>
            <p>{achievement.description}</p>
            {state === "locked" ? (
                <div className="achievement-progress">
                    <div>
                        <i style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span>
                        {progress}/{achievement.goal} {achievement.unit || ""}
                    </span>
                </div>
            ) : (
                <span className="achievement-unlocked-label">
                    {state === "newlyUnlocked" ? "Новое!" : "Получено"}
                </span>
            )}
        </motion.button>
    );
}
