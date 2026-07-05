import React, { useState } from "react";
import type { ChallengeType } from "../game/progress";

interface UploadChallengeProps {
    selectedType: string;
    onSelectType: (type: string) => void;
    trackerLink: string;
    setTrackerLink: React.Dispatch<React.SetStateAction<string>>;
    onClose: () => void;
    onSubmit: () => void;
    onAddResult?: (type: ChallengeType, value: number) => void;
}

export default function UploadChallenge({
    selectedType,
    onSelectType,
    trackerLink,
    setTrackerLink,
    onClose,
    onSubmit,
    onAddResult,
}: UploadChallengeProps) {
    const [videoFile, setVideoFile] = useState<File | null>(null);

    const submit = () => {
        const mapping: Record<string, ChallengeType> = {
            pullups: "подтягивания",
            pushups: "отжимания",
            plank: "планка",
            run: "бег",
            running: "бег",
            подтягивания: "подтягивания",
            отжимания: "отжимания",
            планка: "планка",
            бег: "бег",
        };
        const challengeType = mapping[selectedType];

        if (!challengeType) {
            alert("Выберите вид тренировки");
            return;
        }
        if (challengeType === "бег" && !trackerLink.trim()) {
            alert("Добавьте ссылку на трекер");
            return;
        }
        if (challengeType !== "бег" && !videoFile) {
            alert("Выберите видео");
            return;
        }

        const answer = window.prompt(
            challengeType === "бег"
                ? "Сколько км засчитать для демо?"
                : "Сколько повторений засчитать для демо?"
        );
        if (answer === null) return;
        const value = Number(answer.replace(",", "."));
        if (!Number.isFinite(value) || value <= 0) {
            alert("Введите число больше нуля");
            return;
        }

        onAddResult?.(challengeType, value);
        onSubmit();
        alert(
            "Заявка отправлена на модерацию. В демо-режиме очки начислены сразу."
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-xl w-80 text-center">
                {!selectedType ? (
                    <>
                        <h2 className="text-xl font-semibold text-white mb-4">Выбери упражнение:</h2>
                        <div className="flex flex-col gap-3">
                            {["подтягивания", "отжимания", "планка", "бег"].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => onSelectType(type)}
                                    className="bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition"
                                >
                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                </button>
                            ))}
                        </div>
                        <button onClick={onClose} className="mt-4 text-gray-400 hover:text-white">
                            ❌ Отмена
                        </button>
                    </>
                ) : (
                    <>
                        <h2 className="text-xl font-semibold text-white mb-4">
                            {selectedType === "бег" ? "Отправь ссылку на трекер" : `Загрузить видео: ${selectedType}`}
                        </h2>

                        {selectedType === "бег" ? (
                            <input
                                type="text"
                                placeholder="Вставь ссылку на Strava / Garmin"
                                value={trackerLink}
                                onChange={(e) => setTrackerLink(e.target.value)}
                                className="w-full p-2 rounded-lg bg-gray-700 text-white mb-4"
                            />
                        ) : (
                            <input
                                type="file"
                                accept="video/*"
                                onChange={(event) =>
                                    setVideoFile(
                                        event.target.files?.[0] ?? null
                                    )
                                }
                                className="w-full p-2 rounded-lg bg-gray-700 text-white mb-4"
                            />
                        )}

                        <div className="flex justify-between">
                            <button onClick={() => onSelectType("")} className="text-gray-400 hover:text-white">
                                ⬅ Назад
                            </button>
                            <button
                                onClick={submit}
                                className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-white font-semibold"
                            >
                                Отправить
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
