import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    ChevronDown,
    Crown,
    Medal,
    ShieldCheck,
    Trophy,
    UsersRound,
} from "lucide-react";
import {
    LEADERBOARD_USERS,
    PERIOD_MULTIPLIER,
    type ChallengeRanking,
    type LeaderboardPeriod,
    type LeaderboardScope,
} from "../data/leaderboard";
import { SPORT_AVATARS } from "../data/avatars";

interface LeaderboardScreenProps {
    currentName: string;
    currentAvatarUrl: string;
    currentScores: Record<ChallengeRanking, number>;
}

const CHALLENGE_LABELS: Record<ChallengeRanking, string> = {
    overall: "Общий спорт",
    pullups: "Подтягивания",
    pushups: "Отжимания",
    plank: "Планка",
    running: "Бег",
};

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
    week: "Неделя",
    month: "Месяц",
    all: "Всё время",
};

export default function LeaderboardScreen({
    currentName,
    currentAvatarUrl,
    currentScores,
}: LeaderboardScreenProps) {
    const [scope, setScope] = useState<LeaderboardScope>("global");
    const [period, setPeriod] = useState<LeaderboardPeriod>("month");
    const [challenge, setChallenge] =
        useState<ChallengeRanking>("overall");

    const ranking = useMemo(() => {
        const users =
            scope === "friends"
                ? LEADERBOARD_USERS.filter(
                      (user) => user.isFriend || user.isCurrentUser
                  )
                : LEADERBOARD_USERS;
        const multiplier = PERIOD_MULTIPLIER[period];
        return users
            .map((user) => ({
                ...user,
                score: user.isCurrentUser
                    ? Math.round(
                          currentScores[challenge] *
                              (period === "week"
                                  ? 0.25
                                  : period === "month"
                                    ? 1
                                    : 1.5)
                      )
                    : Math.round(user.scores[challenge] * multiplier),
            }))
            .sort((a, b) => b.score - a.score);
    }, [challenge, currentScores, period, scope]);

    return (
        <>
            <header className="screen-header leaderboard-header">
                <span>Лига PULLUP</span>
                <h1>Рейтинг</h1>
                <p>Соревнуйся, прогрессируй, поднимайся выше.</p>
            </header>

            <div className="leaderboard-scope">
                {(
                    [
                        ["global", "Общий", Trophy],
                        ["friends", "Друзья", UsersRound],
                        ["challenge", "Челленджи", Medal],
                    ] as Array<
                        [LeaderboardScope, string, typeof Trophy]
                    >
                ).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        className={scope === id ? "active" : ""}
                        onClick={() => setScope(id)}
                    >
                        <Icon size={16} />
                        {label}
                    </button>
                ))}
            </div>

            <div className="leaderboard-controls">
                <label>
                    <span>Период</span>
                    <select
                        value={period}
                        onChange={(event) =>
                            setPeriod(event.target.value as LeaderboardPeriod)
                        }
                    >
                        {Object.entries(PERIOD_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={15} />
                </label>
                <label>
                    <span>Дисциплина</span>
                    <select
                        value={challenge}
                        onChange={(event) =>
                            setChallenge(
                                event.target.value as ChallengeRanking
                            )
                        }
                    >
                        {Object.entries(CHALLENGE_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={15} />
                </label>
            </div>

            <div className="leaderboard-podium">
                {ranking.slice(0, 3).map((user, index) => {
                    const avatar =
                        SPORT_AVATARS.find(
                            (item) => item.id === user.avatarId
                        ) ?? SPORT_AVATARS[0];
                    const avatarUrl = user.isCurrentUser
                        ? currentAvatarUrl
                        : avatar.url;
                    return (
                        <motion.div
                            key={user.id}
                            className={`podium-user podium-user--${index + 1}`}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.08 }}
                        >
                            {index === 0 && <Crown size={22} />}
                            <img src={avatarUrl} alt="" />
                            <strong>
                                {user.isCurrentUser ? currentName : user.name}
                            </strong>
                            <span>{user.score.toLocaleString("ru-RU")}</span>
                            <b>{index + 1}</b>
                        </motion.div>
                    );
                })}
            </div>

            <div className="leaderboard-list">
                {ranking.map((user, index) => {
                    const avatar =
                        SPORT_AVATARS.find(
                            (item) => item.id === user.avatarId
                        ) ?? SPORT_AVATARS[0];
                    return (
                        <motion.div
                            layout
                            key={user.id}
                            className={
                                user.isCurrentUser
                                    ? "leaderboard-row current"
                                    : "leaderboard-row"
                            }
                        >
                            <span className="leaderboard-place">{index + 1}</span>
                            <img
                                src={
                                    user.isCurrentUser
                                        ? currentAvatarUrl
                                        : avatar.url
                                }
                                alt=""
                            />
                            <div>
                                <strong>
                                    {user.isCurrentUser
                                        ? currentName
                                        : user.name}
                                </strong>
                                <span>{user.handle}</span>
                            </div>
                            <b>{user.score.toLocaleString("ru-RU")}</b>
                            {user.isCurrentUser && (
                                <ShieldCheck size={16} />
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </>
    );
}
