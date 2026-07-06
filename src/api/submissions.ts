import { API_URL, getApiConfigurationError } from "./client";

export interface SubmissionResponse {
    id: number;
    user_id: number;
    type: "pullups" | "pushups" | "plank" | "running";
    value: number;
    video_file_id: string | null;
    video_url: string | null;
    status: "pending" | "approved" | "rejected";
    moderator_comment: string | null;
    created_at: string;
    reviewed_at: string | null;
}

/**
 * Отправляет видео на модерацию с прогрессом загрузки
 */
export async function submitVideo(
    type: "pullups" | "pushups" | "plank" | "running",
    value: number,
    videoFile: File | null,
    trackerLink: string | null,
    initData?: string,
    onProgress?: (progress: number) => void
): Promise<SubmissionResponse> {
    // Проверка конфигурации API
    const configError = getApiConfigurationError();
    if (configError) {
        throw new Error(`API не настроен: ${configError}`);
    }

    if (!API_URL) {
        throw new Error("API_URL не определён. Невозможно отправить видео.");
    }

    const formData = new FormData();
    formData.append("type", type);
    formData.append("value", String(value));

    // Добавляем видео или ссылку трекера
    if (videoFile) {
        formData.append("video", videoFile);
    } else if (trackerLink) {
        formData.append("video_url", trackerLink);
    }

    const url = `${API_URL}/submissions`;

    if (import.meta.env.DEV) {
        console.log("[DEV] submitVideo POST", url);
        console.log("[DEV] submitVideo has initData:", Boolean(initData || window.Telegram?.WebApp?.initData));
        console.log("[DEV] submitVideo type:", type, "value:", value);
        console.log("[DEV] submitVideo videoFile:", videoFile?.name, videoFile?.size, "bytes");
        console.log("[DEV] submitVideo trackerLink:", trackerLink ? trackerLink.substring(0, 50) + "..." : "none");
    }

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Обработка прогресса загрузки
        if (onProgress) {
            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    onProgress(percentComplete);
                }
            });
        }

        xhr.addEventListener("load", () => {
            try {
                if (import.meta.env.DEV) {
                    console.log("[DEV] submitVideo response status:", xhr.status);
                    console.log("[DEV] submitVideo response body:", xhr.responseText.substring(0, 200));
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText) as SubmissionResponse;
                    resolve(response);
                } else {
                    let errorMessage = `Ошибка сервера: ${xhr.status}`;
                    try {
                        const error = JSON.parse(xhr.responseText) as {
                            detail?: unknown;
                        };
                        if (typeof error.detail === "string") {
                            errorMessage = error.detail;
                        }
                    } catch {
                        // Используем стандартное сообщение об ошибке
                    }
                    if (import.meta.env.DEV) {
                        console.error("[DEV] submitVideo error message:", errorMessage);
                    }
                    reject(new Error(errorMessage));
                }
            } catch (error) {
                reject(
                    new Error(
                        error instanceof Error
                            ? error.message
                            : "Ошибка при обработке ответа сервера"
                    )
                );
            }
        });

        xhr.addEventListener("error", (event) => {
            if (import.meta.env.DEV) {
                console.error("[DEV] submitVideo network error event:", event);
                console.error("[DEV] submitVideo request URL:", url);
                console.error("[DEV] submitVideo CORS may be blocked or backend unreachable");
            }
            reject(new Error("Ошибка сети при отправке видео. Проверьте подключение и попробуйте снова."));
        });

        xhr.addEventListener("abort", () => {
            if (import.meta.env.DEV) {
                console.warn("[DEV] submitVideo request aborted");
            }
            reject(new Error("Отправка видео отменена"));
        });

        // Добавляем токен авторизации
        const headers: Record<string, string> = {};
        if (initData) {
            headers["Authorization"] = `tma ${initData}`;
        } else if (typeof window !== "undefined" && window.Telegram?.WebApp?.initData) {
            headers["Authorization"] = `tma ${window.Telegram.WebApp.initData}`;
        }

        try {
            xhr.open("POST", url);
            Object.entries(headers).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
            });
            xhr.send(formData);
        } catch (error) {
            if (import.meta.env.DEV) {
                console.error("[DEV] submitVideo xhr.open/send error:", error);
            }
            reject(
                new Error(
                    error instanceof Error
                        ? `Ошибка при инициализации запроса: ${error.message}`
                        : "Не удалось инициализировать отправку видео"
                )
            );
        }
    });
}

/**
 * Получает список собственных заявок
 */
export async function getMySubmissions(
    limit: number = 50,
    offset: number = 0,
    initData?: string
): Promise<SubmissionResponse[]> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (initData) {
        headers["Authorization"] = `tma ${initData}`;
    } else if (typeof window !== "undefined" && window.Telegram?.WebApp?.initData) {
        headers["Authorization"] = `tma ${window.Telegram.WebApp.initData}`;
    }

    const response = await fetch(
        `${API_URL}/submissions?limit=${limit}&offset=${offset}`,
        {
            method: "GET",
            headers,
        }
    );

    if (!response.ok) {
        let errorMessage = `Ошибка сервера: ${response.status}`;
        try {
            const error = (await response.json()) as { detail?: unknown };
            if (typeof error.detail === "string") {
                errorMessage = error.detail;
            }
        } catch {
            // Используем стандартное сообщение об ошибке
        }
        throw new Error(errorMessage);
    }

    return (await response.json()) as SubmissionResponse[];
}
