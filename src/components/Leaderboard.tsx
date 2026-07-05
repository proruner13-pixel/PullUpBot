interface LeaderboardProps {
    title: string;
    data: { name: string; score: number; avatarUrl?: string }[];
}

export default function Leaderboard({ title, data }: LeaderboardProps) {
    return (
        <div className="bg-gray-700 p-4 rounded-2xl shadow-md w-full">
            <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
            <ul className="flex flex-col gap-2">
                {data.map((user, index) => (
                    <li key={index} className="flex items-center gap-2">
                        <span className="text-yellow-300 font-bold">{index + 1}.</span>
                        <img src={user.avatarUrl} className="w-8 h-8 rounded-full object-cover" />
                        <span className="text-white">{user.name}</span>
                        <span className="ml-auto text-white font-semibold">{user.score}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
