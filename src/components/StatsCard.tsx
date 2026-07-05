interface StatsCardProps {
    totalChallenges: number;
    completed: number;
}

export default function StatsCard({ totalChallenges, completed }: StatsCardProps) {
    return (
        <div className="bg-gray-800 p-6 rounded-2xl shadow-md w-full max-w-md text-center">
            <h2 className="text-xl font-semibold text-green-300">Статистика</h2>
            <p className="mt-2">Всего челленджей: {totalChallenges}</p>
            <p className="text-green-400 font-bold">Выполнено: {completed}</p>
        </div>
    );
}
