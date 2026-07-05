import { useState, useEffect, useMemo } from "react";

interface Challenge {
    progress: number;
    goal: number;
    level: number;
}

interface User {
    name: string;
    avatarUrl?: string;
    challenges: Record<string, Challenge>;
}

interface ProfileCardProps {
    user: User;
    earnedTokens: number;
    tokenGoal: number;
    badges?: string[];
}

const levelTitles: Record<string, string[]> = {
    подтягивания: ["Нубик", "Любитель", "Продвинутый", "Железяка", "Чемпион"],
    отжимания: ["Нубик", "Дилетант", "Атлет", "Силач", "Мастер"],
    планка: ["Нубик", "Любитель", "Стойкий", "Почти Мастер", "Планка-Мастер"],
    бег: ["Нубик", "Любитель Бега", "Стайер", "Марафонец", "Легенда"]
};

const exerciseImages: Record<string, string> = { 
    подтягивания: "https://images.unsplash.com/photo-1605296867424-35fc25c9212a?q=80&w=1200",
    отжимания:"https://images.unsplash.com/photo-1605296867424-35fc25c9212a?q=80&w=1200",
    планка: "https://images.unsplash.com/photo-1605296867424-35fc25c9212a?q=80&w=1200",
    бег: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?q=80&w=1200"
};


export default function ProfileCard({
    user,
    earnedTokens,
    tokenGoal,
    badges = []
}: ProfileCardProps) {

    const [avatar, setAvatar] = useState(user.avatarUrl);

    const [selectedChallenge, setSelectedChallenge] =
        useState<string | null>(null);

    const [showNotification, setShowNotification] =
        useState(false);

    const [showStreak, setShowStreak] =
        useState(false);

    const [completedQuests, setCompletedQuests] =
        useState<number[]>([]);

    const dailyQuests = [
        "Сделать 50 отжиманий",
        "Пробежать 3 км",
        "Планка 2 минуты"
    ];

    const toggleQuest = (index: number) => {
        setCompletedQuests(prev =>
            prev.includes(index)
                ? prev.filter(i => i !== index)
                : [...prev, index]
        );
    };

    // 📊 расчёты
    const totalLevel = useMemo(
        () => Object.values(user.challenges).reduce((acc, ch) => acc + ch.level, 0),
        [user.challenges]
    );

    const tokenPercent = Math.min((earnedTokens / tokenGoal) * 100, 100);
    const levelPercent = Math.min((totalLevel / 20) * 100, 100);

    const challenge = selectedChallenge ? user.challenges[selectedChallenge] : null;

    const nextLevelTitle = challenge
        ? levelTitles[selectedChallenge!][
        Math.min(challenge.level, levelTitles[selectedChallenge!].length - 1)
        ]
        : "";

    // 📸 смена аватара
    const handleChangeAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) {
                setAvatar(ev.target.result as string);
                setShowNotification(true);
            }
        };
        reader.readAsDataURL(file);
    };

    useEffect(() => {
        if (!showNotification) return;
        const timer = setTimeout(() => setShowNotification(false), 2500);
        return () => clearTimeout(timer);
    }, [showNotification]);

    const badgeColor = (badge: string) => {
        if (badge.includes("Legend") || badge.includes("Легенда"))
            return "bg-purple-500";
        if (badge.includes("Master") || badge.includes("Чемпион"))
            return "bg-orange-400";
        return "bg-yellow-400";
    };
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVideoFile(file);
        }
    };

    const handleSubmitVideo = () => {
        if (!videoFile) return;

        setUploading(true);

        setTimeout(() => {
            console.log("Видео отправлено:", videoFile.name);
            setUploading(false);
            setVideoFile(null);
            setSelectedChallenge(null);
            alert("Видео отправлено 💪 Жди проверки");
        }, 1500);
    };
    
    return (
        <div className="relative p-6 rounded-3xl w-full max-w-4xl
        bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-600
        shadow-2xl flex flex-col items-center gap-6">
    

            {/* уведомление */}
            {showNotification && (
                <div className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-xl shadow-lg">
                    Фото обновлено
                </div>
            )}

            {/* верх */}
            <div className="relative flex flex-col items-center gap-3">

                {/* шкала уровня */}
                <div className="absolute -left-10 flex flex-col items-center">
                    <span className="text-xs text-white">LVL</span>

                    <div className="relative w-4 h-32 bg-white/20 rounded-full overflow-hidden">
                        <div
                            className="absolute bottom-0 w-full bg-gradient-to-t from-yellow-400 to-pink-500 transition-all duration-1000"
                            style={{ height: `${levelPercent}%` }}
                        />
                    </div>

                    <span className="text-xs text-white">
                        {Math.round(levelPercent)}%
                    </span>

                    <span className="text-yellow-300 font-bold text-sm">
                        {totalLevel}
                    </span>
                </div>

                {/* аватар */}
                <div className="relative group">
                    <svg className="w-28 h-28 -rotate-90 absolute">
                        <circle cx="56" cy="56" r="50" stroke="rgba(255,255,255,0.2)" strokeWidth="6" fill="none" />
                        <circle
                            cx="56"
                            cy="56"
                            r="50"
                            stroke="yellow"
                            strokeWidth="6"
                            fill="none"
                            strokeDasharray="314"
                            strokeDashoffset={314 - (314 * tokenPercent) / 100}
                        />
                    </svg>

                    <label className="cursor-pointer">
                        <img
                            src={avatar}
                            alt="avatar"
                            className="w-24 h-24 rounded-full object-cover border-4 border-white
                            shadow-xl transition hover:scale-110"
                        />
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleChangeAvatar}
                            className="hidden"
                        />
                    </label>
                </div>
                

                <h2 className="text-2xl font-bold text-white">{user.name}</h2>
                <p className="text-white">Уровень: {totalLevel}</p>
                <p className="text-white opacity-80">
                    {earnedTokens} / {tokenGoal} PULLUP
                </p>

                {/* МЕДАЛИ */}
                <div className="flex gap-4 mt-3 flex-wrap justify-center">

                    {badges.length > 0 ? (
                        badges.map((badge, i) => {

                            const isLegend = badge.includes("Legend") || badge.includes("Легенда");
                            const isMaster = badge.includes("Master") || badge.includes("Чемпион");

                            return (
                                <div key={i} className="flex flex-col items-center group">

                                    {/* Лента */}
                                    <div className="w-2 h-6 bg-gradient-to-b from-yellow-300 to-orange-500 rounded-t-md"></div>

                                    {/* Медаль */}
                                    <div
                                        className={`
                        w-14 h-14 rounded-full flex items-center justify-center
                        text-xs font-bold text-center px-1
                        border-4
                        shadow-lg transition-all duration-300
                        group-hover:scale-110 group-hover:rotate-6

                        ${isLegend && "bg-gradient-to-br from-purple-500 to-pink-500 border-purple-300 shadow-purple-400"}
                        ${isMaster && "bg-gradient-to-br from-orange-400 to-yellow-300 border-yellow-200 shadow-yellow-300"}
                        ${!isLegend && !isMaster && "bg-gradient-to-br from-gray-300 to-gray-100 border-white shadow-white"}
                        `}
                                    >
                                        🏅
                                    </div>

                                    {/* Подпись */}
                                    <span className="text-[10px] text-white mt-1 opacity-90 text-center max-w-[60px]">
                                        {badge}
                                    </span>

                                </div>
                            );

                        })
                    ) : (
                        <span className="text-gray-300 text-sm">
                            Нет ачивок
                        </span>
                    )}

                </div>
                <button
                    onClick={() => setShowStreak(true)}
                    className="mt-2 text-xs text-yellow-300 underline"
                >
                    🔥 Стрик
                </button>
            </div>
            {showStreak && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="streak-title"
                        className="streak-modal w-full max-w-sm text-center text-white"
                    >
                        <h2 id="streak-title" className="text-2xl font-bold">
                            🔥 Тренировочный стрик
                        </h2>
                        <p className="mt-3 text-white/90">
                            Выполняй задания каждый день, чтобы поддерживать серию.
                        </p>
                        <p className="mt-4 text-4xl font-black">
                            {completedQuests.length}/{dailyQuests.length}
                        </p>
                        <p className="text-sm text-white/80">
                            заданий выполнено сегодня
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowStreak(false)}
                            className="mt-6 rounded-xl bg-white/20 px-5 py-2 font-semibold hover:bg-white/30"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            )}
            {/* МОДАЛКА ЧЕЛЛЕНДЖА */}
            {selectedChallenge && challenge && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50">

                    <div className="relative w-[340px] rounded-3xl overflow-hidden shadow-2xl animate-[fadeIn_0.3s_ease]">

                        {/* ФОН */}
                        <img
                            src={exerciseImages[selectedChallenge]}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

                        {/* КОНТЕНТ */}
                        <div className="relative z-10 p-6 text-white">

                            <h2 className="text-2xl font-bold text-center mb-2">
                                {selectedChallenge.toUpperCase()}
                            </h2>

                            {/* уровень */}
                            <p className="text-center text-yellow-300 text-lg mb-2">
                                Уровень: {challenge.level}
                            </p>

                            {/* прогресс */}
                            <div className="mt-4">
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Прогресс</span>
                                    <span>
                                        {Math.round((challenge.progress / challenge.goal) * 100)}%
                                    </span>
                                </div>

                                <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
                                    <div
                                        className="h-3 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full transition-all duration-700"
                                        style={{ width: `${(challenge.progress / challenge.goal) * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* осталось */}
                            <p className="text-center mt-4 text-sm opacity-90">
                                Осталось: {challenge.goal - challenge.progress}
                            </p>

                            {/* награда */}
                            <div className="mt-4 text-center">
                                <p className="text-xs opacity-70">Награда</p>
                                <p className="text-yellow-300 font-bold">+50 XP 🔥</p>
                            </div>
                             
                            {/* 🎥 загрузка видео */}
                            <div className="mt-4">
                                <label className="block cursor-pointer bg-white/10 p-2 rounded-xl text-sm text-center hover:bg-white/20 transition">
                                    📹 Загрузить видео
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={handleVideoUpload}
                                        className="hidden"
                                    />
                                </label>

                                {videoFile && (
                                    <p className="text-xs text-green-400 mt-2 text-center">
                                        {videoFile.name}
                                    </p>
                                )}
                            </div>

                            {/* кнопки */}
                            <div className="flex gap-2 mt-6">

                                <button
                                    onClick={handleSubmitVideo}
                                    disabled={!videoFile || uploading}
                                    className="flex-1 bg-yellow-400 text-black py-2 rounded-xl font-bold 
        hover:scale-105 transition disabled:opacity-50"
                                >
                                    {uploading ? "Отправка..." : "🚀 Выполнить"}
                                </button>

                                <button
                                    onClick={() => {
                                        setSelectedChallenge(null);
                                        setVideoFile(null);
                                    }}
                                    className="flex-1 bg-white/20 py-2 rounded-xl"
                                >
                                    Закрыть
                                </button>

                            </div>

                        </div>
                    </div>
                </div>
            )}
            {/* карточки */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            
                

                {Object.entries(user.challenges).map(([title, ch]) => {
                    const percent = Math.min((ch.progress / ch.goal) * 100, 100);
                    const levelTitle =
                        levelTitles[title]?.[
                        Math.min(ch.level, levelTitles[title].length - 1)
                        ] || "";

                    return (
                        <button
                            key={title}
                            onClick={() => setSelectedChallenge(title)}
                            className="relative group rounded-2xl overflow-hidden p-4 text-white shadow-xl
                            hover:scale-105 transition"
                        >
                            {/* фон */}
                            <img
                                src={exerciseImages[title] || ""}
                                className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition"
                            />

                            <div className="absolute inset-0 bg-black/40"></div>

                            {/* контент */}
                            <div className="relative z-10">
                                <div className="flex justify-between">
                                    <h3 className="font-bold">{title}</h3>
                                    <span className="text-yellow-300">
                                        {levelTitle}
                                    </span>
                                </div>
                                

                                <div className="mt-2 bg-white/20 h-3 rounded-full">
                                    <div
                                        className="h-3 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full"
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                                

                                <p className="text-sm mt-1">
                                    {ch.progress}/{ch.goal} ({Math.round(percent)}%)
                                </p>
                            </div>
                        </button>
                        
                    );
                })}
                
                
            </div>
            <div className="w-full bg-gradient-to-r from-black/40 to-white/10 rounded-3xl p-5 text-white shadow-2xl">

                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">
                        ⚔️ Квесты дня
                    </h3>

                    <div className="text-yellow-300 font-bold animate-pulse">
                        +1000 XP
                    </div>
                </div>

                {dailyQuests.map((quest, i) => {
                    const done = completedQuests.includes(i);

                    return (
                        <div
                            key={i}
                            onClick={() => toggleQuest(i)}
                            className={`
                    relative flex items-center justify-between
                    p-3 mb-2 rounded-2xl cursor-pointer
                    transition-all duration-300
                    border border-white/10
                    ${done ? "bg-green-500/20" : "bg-white/10 hover:bg-white/20"}
                `}
                        >
                            {/* glow если выполнено */}
                            {done && (
                                <div className="absolute inset-0 rounded-2xl bg-green-400/10 blur-xl" />
                            )}

                            <span className={`relative z-10 ${done ? "line-through opacity-60" : ""}`}>
                                {quest}
                            </span>

                            <div className="relative z-10">
                                {done ? "✅" : "⬜"}
                            </div>
                        </div>
                    );
                })}

                {/* прогресс дня */}
                <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1 opacity-70">
                        <span>Прогресс дня</span>
                        <span>
                            {completedQuests.length}/{dailyQuests.length}
                        </span>
                    </div>

                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-2 bg-gradient-to-r from-yellow-400 to-green-400 transition-all"
                            style={{
                                width: `${(completedQuests.length / dailyQuests.length) * 100}%`
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
        
    );
}
