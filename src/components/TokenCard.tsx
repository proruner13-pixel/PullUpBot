import { useState } from "react";

interface TokenCardProps {
    earnedTokens: number;
    tokenGoal: number;
}

export default function TokenCard({ earnedTokens, tokenGoal }: TokenCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const percent = Math.min((earnedTokens / tokenGoal) * 100, 100);

    const handleOpen = () => setIsModalOpen(true);
    const handleClose = () => setIsModalOpen(false);

    return (
        <>
            {/* Карточка токенов */}
            <div
                onClick={handleOpen}
                className="bg-gradient-to-r from-purple-700 to-indigo-600 p-4 rounded-2xl shadow-md w-full max-w-4xl flex flex-col items-center gap-2 cursor-pointer hover:scale-105 transform transition"
            >
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <img
                        className="pullup-coin-icon"
                        src="/assets/home/pullup-coin.png"
                        alt=""
                        aria-hidden="true"
                    />
                    Твои токены
                </h2>
                <div className="w-full bg-gray-600 rounded-full h-4 mb-2">
                    <div
                        className="bg-purple-400 h-4 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                    />
                </div>
                <p className="text-white">{earnedTokens} / {tokenGoal}</p>
            </div>

            {/* Модальное окно */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
                    <div className="bg-gray-800 p-6 rounded-2xl shadow-xl w-96 text-center">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center justify-center gap-2">
                            <img
                                className="pullup-coin-icon"
                                src="/assets/home/pullup-coin.png"
                                alt=""
                                aria-hidden="true"
                            />
                            PULLUP Токены
                        </h2>
                        <p className="text-white mb-2">
                            Попавшие в топ за месяц по своим видам спорта (подтягивания, отжимания, планка, бег)
                            получают PULLUP токены на свой Telegram-кошелек.
                        </p>
                        <p className="text-white mb-2">
                            Токены можно обменять на <span className="font-semibold text-yellow-300">USDT</span>
                            или копить для будущих дропов.
                        </p>
                        <p className="text-white mb-4">
                            По мере развития приложения топ пользователей будет расширяться: сначала топ 3, потом топ 10, а затем топ 100 и более.
                        </p>
                        <p className="text-yellow-300 font-semibold mb-4">
                            Благодаря приложению вы станете не только сильнее, но и богаче!
                        </p>
                        <button
                            onClick={handleClose}
                            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-white font-semibold"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
