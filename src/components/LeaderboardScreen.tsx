import { useMemo } from "react";
import { motion } from "framer-motion";
import { Dumbbell, Medal, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import type {
    LeaderboardEntryDto,
    MyLeaderboardRankDto,
} from "../api/client";
import { calculateLevel, getLevelTitle } from "../game/economy";

interface LeaderboardScreenProps {
    currentName: string;
    currentAvatarUrl: string;
    currentTelegramId: number;
    entries: LeaderboardEntryDto[];
    myRank: MyLeaderboardRankDto | null;
}

function athleteName(user: {
    first_name: string | null;
    username: string | null;
    telegram_id: number;
}): string {
    return user.first_name || user.username || `Атлет ${user.telegram_id}`;
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function placeLabel(rank: number): string {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
}

export default function LeaderboardScreen({
    currentName,
    currentAvatarUrl,
    currentTelegramId,
    entries,
    myRank,
}: LeaderboardScreenProps) {
    const currentEntry = useMemo(
        () =>
            entries.find((entry) => entry.telegram_id === currentTelegramId) ??
            (myRank
                ? {
                      ...myRank.user,
                      rank: myRank.rank,
                      is_current_user: true,
                  }
                : null),
        [currentTelegramId, entries, myRank]
    );
    const nextAbove = useMemo(() => {
        if (!currentEntry) return null;
        return [...entries]
            .filter((entry) => entry.rank < currentEntry.rank)
            .sort((a, b) => b.rank - a.rank)[0] ?? null;
    }, [currentEntry, entries]);
    const gapXp =
        currentEntry && nextAbove
            ? Math.max(nextAbove.xp - currentEntry.xp, 0)
            : null;

    return (
        <>
            <header className="screen-header leaderboard-header">
                <span>Лига PULLUP</span>
                <h1>Рейтинг спортсменов</h1>
                <p>
                    {myRank
                        ? `Ты на ${myRank.rank} месте из ${myRank.total_users}`
                        : "Рейтинг строится по подтверждённому XP."}
                </p>
            </header>

            <section className="leaderboard-summary">
                <article>
                    <UsersRound size={19} />
                    <span>Участников</span>
                    <strong>{myRank?.total_users ?? entries.length}</strong>
                </article>
                <article className="leaderboard-summary-rank">
                    <Trophy size={21} />
                    <span>Твоё место</span>
                    <strong>{myRank ? `#${myRank.rank}` : "—"}</strong>
                </article>
                <article>
                    <Medal size={19} />
                    <span>Выше</span>
                    <strong>{myRank?.users_above ?? 0}</strong>
                </article>
            </section>

            {myRank?.total_users === 1 && (
                <div className="leaderboard-gap-card">
                    Ты пока один в рейтинге. Сам себе чемпион, грустно, но зато первое место.
                </div>
            )}

            {myRank && myRank.total_users > 1 && currentEntry?.rank === 1 && (
                <div className="leaderboard-gap-card">
                    Ты сейчас на первом месте 🔥
                </div>
            )}

            {myRank && gapXp !== null && nextAbove && (
                <div className="leaderboard-gap-card">
                    До #{nextAbove.rank} осталось {gapXp.toLocaleString("ru-RU")} XP
                </div>
            )}

            <div className="leaderboard-list leaderboard-list--real">
                {entries.length === 0 && (
                    <div className="weekly-empty-state leaderboard-empty">
                        Рейтинг пока пуст. Стань первым спортсменом.
                    </div>
                )}
                {entries.map((user, index) => {
                    const isCurrent = user.telegram_id === currentTelegramId;
                    const name = isCurrent ? currentName : athleteName(user);
                    const avatarUrl = isCurrent
                        ? currentAvatarUrl
                        : user.avatar_url;
                    const level = calculateLevel(user.xp);
                    return (
                        <motion.article
                            layout
                            key={user.telegram_id}
                            className={
                                isCurrent
                                    ? "leaderboard-row leaderboard-row--real current"
                                    : "leaderboard-row leaderboard-row--real"
                            }
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.035 }}
                        >
                            <span className="leaderboard-place">
                                {placeLabel(user.rank)}
                            </span>
                            <div className="leaderboard-avatar" aria-hidden="true">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" />
                                ) : (
                                    <span>{initials(name)}</span>
                                )}
                            </div>
                            <div className="leaderboard-athlete">
                                <strong>{name}</strong>
                                <span>
                                    Уровень {level} · {getLevelTitle(level)}
                                </span>
                                <small>
                                    {user.xp.toLocaleString("ru-RU")} XP ·{" "}
                                    {user.balance.toLocaleString("ru-RU")} PULLUP ·{" "}
                                    {user.approved_workouts.toLocaleString("ru-RU")} тренировок
                                </small>
                            </div>
                            {isCurrent ? (
                                <b className="leaderboard-current-badge">
                                    <ShieldCheck size={13} />
                                    Это ты
                                </b>
                            ) : (
                                <Dumbbell className="leaderboard-row-icon" size={17} />
                            )}
                        </motion.article>
                    );
                })}
            </div>
        </>
    );
}
