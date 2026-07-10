import {
    API_URL,
    PullupApiError,
    getApiConfigurationError,
    getApiUrlSource,
} from "./client";

export interface SubmissionResponse {
    id: number;
    user_id: number;
    type: "pullups" | "pushups" | "plank" | "running";
    value: number;
    video_file_id: string | null;
    video_url: string | null;
    status: "pending" | "approved" | "rejected" | "completed";
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
        throw new PullupApiError({
            kind: "config",
            message: `API не настроен: ${configError}`,
            requestUrl: API_URL ? `${API_URL}/submissions` : "/submissions",
            method: "POST",
        });
    }

    if (!API_URL) {
        throw new PullupApiError({
            kind: "config",
            message: "VITE_API_URL не определён. Невозможно отправить видео.",
            requestUrl: "/submissions",
            method: "POST",
        });
    }

    const formData = new FormData();
    formData.append("type", type);
    formData.append("value", String(value));
    formData.append("caption", `${type}: ${value}`);

    // Добавляем видео или ссылку трекера
    if (videoFile) {
        formData.append("video", videoFile);
    } else if (trackerLink) {
        formData.append("video_url", trackerLink);
    }

    const resolvedInitData = initData ?? window.Telegram?.WebApp?.initData;
    const url = `${API_URL}/submissions`;

    console.info("VIDEO_UPLOAD_STARTED", {
        url,
        type,
        value,
        hasVideo: Boolean(videoFile),
        hasTrackerLink: Boolean(trackerLink),
        hasInitData: Boolean(resolvedInitData),
    });

    if (import.meta.env.DEV) {
        console.log("[DEV] submitVideo POST", url);
        console.log("[DEV] submitVideo has initData:", Boolean(resolvedInitData));
        console.log("[DEV] submitVideo type:", type, "value:", value);
        console.log("[DEV] submitVideo videoFile:", videoFile?.name, videoFile?.size, "bytes");
        console.log("[DEV] submitVideo trackerLink:", trackerLink ? trackerLink.substring(0, 50) + "..." : "none");
    }

    if (!resolvedInitData) {
        throw new Error("Для отправки видео нужен Telegram initData. Откройте приложение внутри Telegram.");
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
                    console.info("VIDEO_UPLOAD_SUCCESS", {
                        submissionId: response.id,
                        status: response.status,
                    });
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
                    console.error("VIDEO_UPLOAD_FAILED", {
                        url,
                        method: "POST",
                        status: xhr.status,
                        message: errorMessage,
                    });
                    reject(
                        new PullupApiError({
                            kind:
                                xhr.status === 401 || xhr.status === 403
                                    ? "auth"
                                    : "http",
                            message:
                                xhr.status === 401 || xhr.status === 403
                                    ? `Backend вернул ${xhr.status}: Telegram initData не принят или доступ запрещён. Request: POST ${url}. Detail: ${errorMessage}`
                                    : `Backend вернул ${xhr.status}. Request: POST ${url}. Detail: ${errorMessage}`,
                            requestUrl: url,
                            method: "POST",
                            status: xhr.status,
                        })
                    );
                }
            } catch (error) {
                console.error("VIDEO_UPLOAD_FAILED", {
                    url,
                    method: "POST",
                    message:
                        error instanceof Error
                            ? error.message
                            : "response processing failed",
                    error,
                });
                reject(
                    error instanceof PullupApiError
                        ? error
                        : new PullupApiError({
                              kind: "parse",
                              message:
                                  error instanceof Error
                                      ? error.message
                                      : "Ошибка при обработке ответа сервера",
                              requestUrl: url,
                              method: "POST",
                              status: xhr.status || undefined,
                          })
                );
            }
        });

        xhr.addEventListener("error", (event) => {
            if (import.meta.env.DEV) {
                console.error("[DEV] submitVideo network error event:", event);
                console.error("[DEV] submitVideo request URL:", url);
                console.error("[DEV] submitVideo CORS may be blocked or backend unreachable");
            }
            console.error("VIDEO_UPLOAD_FAILED", {
                url,
                method: "POST",
                status: xhr.status || undefined,
                message: "network error",
                apiBaseUrl: API_URL,
                apiUrlSource: getApiUrlSource(),
            });
            reject(
                new PullupApiError({
                    kind: "network",
                    message:
                        `CORS/network error: backend недоступен или preflight заблокирован. ` +
                        `Request: POST ${url}.`,
                    requestUrl: url,
                    method: "POST",
                    status: xhr.status || undefined,
                })
            );
        });

        xhr.addEventListener("abort", () => {
            if (import.meta.env.DEV) {
                console.warn("[DEV] submitVideo request aborted");
            }
            console.error("VIDEO_UPLOAD_FAILED", {
                message: "aborted",
                url,
                method: "POST",
            });
            reject(
                new PullupApiError({
                    kind: "network",
                    message: `Отправка видео отменена. Request: POST ${url}.`,
                    requestUrl: url,
                    method: "POST",
                })
            );
        });

        // Добавляем токен авторизации
        const headers: Record<string, string> = {};
        if (resolvedInitData) {
            headers["Authorization"] = `tma ${resolvedInitData}`;
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
            console.error("VIDEO_UPLOAD_FAILED", error);
            reject(
                new PullupApiError({
                    kind: "network",
                    message:
                        error instanceof Error
                            ? `Ошибка при инициализации запроса POST ${url}: ${error.message}`
                            : `Не удалось инициализировать отправку видео POST ${url}`,
                    requestUrl: url,
                    method: "POST",
                })
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
    const configError = getApiConfigurationError();
    const url = `${API_URL}/submissions?limit=${limit}&offset=${offset}`;
    if (configError) {
        throw new PullupApiError({
            kind: "config",
            message: configError,
            requestUrl: url,
            method: "GET",
        });
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (initData) {
        headers["Authorization"] = `tma ${initData}`;
    } else if (typeof window !== "undefined" && window.Telegram?.WebApp?.initData) {
        headers["Authorization"] = `tma ${window.Telegram.WebApp.initData}`;
    }

    let response: Response;
    try {
        response = await fetch(
            url,
            {
            method: "GET",
            headers,
            }
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Network request failed";
        console.error("[PULLUP API] submissions fetch failed", {
            url,
            method: "GET",
            message,
            apiBaseUrl: API_URL,
            apiUrlSource: getApiUrlSource(),
        });
        throw new PullupApiError({
            kind: "network",
            message:
                `CORS/network error: backend недоступен или preflight заблокирован. ` +
                `Request: GET ${url}. Detail: ${message}`,
            requestUrl: url,
            method: "GET",
        });
    }

    console.info("[PULLUP API] submissions response", {
        url,
        method: "GET",
        status: response.status,
        ok: response.ok,
    });

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
        throw new PullupApiError({
            kind:
                response.status === 401 || response.status === 403
                    ? "auth"
                    : "http",
            message:
                response.status === 401 || response.status === 403
                    ? `Backend вернул ${response.status}: Telegram initData не принят или доступ запрещён. Request: GET ${url}. Detail: ${errorMessage}`
                    : `Backend вернул ${response.status}. Request: GET ${url}. Detail: ${errorMessage}`,
            requestUrl: url,
            method: "GET",
            status: response.status,
        });
    }

    return (await response.json()) as SubmissionResponse[];
}
