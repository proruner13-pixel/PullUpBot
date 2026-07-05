import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertCircle,
    Check,
    ImagePlus,
    Save,
    Upload,
    X,
} from "lucide-react";
import { SPORT_AVATARS } from "../data/avatars";
import { playError, playTap } from "../utils/sound";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

interface AvatarPickerModalProps {
    open: boolean;
    selectedId: string;
    customAvatarUrl: string | null;
    onClose: () => void;
    onSave: (avatarId: string, avatarUrl: string) => void;
    onError?: (message: string) => void;
}

export default function AvatarPickerModal({
    open,
    selectedId,
    customAvatarUrl,
    onClose,
    onSave,
    onError,
}: AvatarPickerModalProps) {
    const [draftId, setDraftId] = useState(selectedId);
    const [customPreview, setCustomPreview] =
        useState<string | null>(customAvatarUrl);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setDraftId(selectedId);
            setCustomPreview(customAvatarUrl);
            setError(null);
        }
    }, [customAvatarUrl, open, selectedId]);

    const selectedReadyAvatar =
        SPORT_AVATARS.find((avatar) => avatar.id === draftId) ??
        SPORT_AVATARS[0];
    const selectedUrl =
        draftId === "custom" && customPreview
            ? customPreview
            : selectedReadyAvatar.url;
    const selectedName =
        draftId === "custom" ? "Своё фото" : selectedReadyAvatar.name;

    const reportError = (message: string) => {
        setError(message);
        playError();
        onError?.(message);
    };

    const handleFile = (file: File | undefined) => {
        setError(null);
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            reportError(
                "Выберите изображение в формате JPG, PNG или WEBP."
            );
            return;
        }

        if (file.size > MAX_AVATAR_SIZE) {
            reportError(
                "Фото слишком большое. Максимальный размер — 2 МБ."
            );
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
            reportError(
                "Не удалось прочитать изображение. Попробуйте другое."
            );
        };
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                reportError(
                    "Не удалось подготовить preview изображения."
                );
                return;
            }
            setCustomPreview(reader.result);
            setDraftId("custom");
        };
        reader.readAsDataURL(file);
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="modal-backdrop avatar-picker-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="avatar-picker-title"
                        className="avatar-picker-modal"
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: "spring", damping: 28, stiffness: 320 }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="avatar-picker-header">
                            <div>
                                <span>Персонализация</span>
                                <h2 id="avatar-picker-title">Смена аватара</h2>
                            </div>
                            <button onClick={onClose} aria-label="Закрыть">
                                <X size={20} />
                            </button>
                        </header>

                        <div className="avatar-picker-preview">
                            <motion.img
                                key={selectedUrl}
                                initial={{ scale: 0.85, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                src={selectedUrl}
                                alt={selectedName}
                            />
                            <div>
                                <strong>{selectedName}</strong>
                                <span>
                                    {draftId === "custom"
                                        ? "Фото готово к сохранению"
                                        : "Боевой образ выбран"}
                                </span>
                            </div>
                        </div>

                        <div className="avatar-gallery">
                            {SPORT_AVATARS.map((avatar) => {
                                const active = avatar.id === draftId;
                                return (
                                    <button
                                        key={avatar.id}
                                        className={active ? "active" : ""}
                                        style={
                                            {
                                                "--avatar-accent": avatar.accent,
                                            } as React.CSSProperties
                                        }
                                        onClick={() => {
                                            playTap();
                                            setDraftId(avatar.id);
                                        }}
                                        aria-label={`Выбрать аватар ${avatar.name}`}
                                    >
                                        <img src={avatar.url} alt="" />
                                        {active && (
                                            <span>
                                                <Check size={13} />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            className={
                                draftId === "custom"
                                    ? "avatar-upload-button active"
                                    : "avatar-upload-button"
                            }
                            onClick={() => {
                                playTap();
                                fileInputRef.current?.click();
                            }}
                        >
                            <ImagePlus size={19} />
                            <span>
                                Загрузить своё фото
                                <small>JPG, PNG, WEBP · до 2 МБ</small>
                            </span>
                            <Upload size={17} />
                        </button>
                        <input
                            ref={fileInputRef}
                            className="avatar-file-input"
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                                handleFile(event.target.files?.[0]);
                                event.target.value = "";
                            }}
                        />

                        <AnimatePresence initial={false}>
                            {error && (
                                <motion.div
                                    className="avatar-upload-error"
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    role="alert"
                                >
                                    <AlertCircle size={17} />
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            className="save-workout avatar-save"
                            disabled={draftId === "custom" && !customPreview}
                            onClick={() => onSave(draftId, selectedUrl)}
                        >
                            <Save size={18} />
                            Сохранить
                        </button>
                    </motion.section>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
