export const EXERCISE_TYPES = [
    {
        type: "pullups",
        title: "Подтягивания",
        unit: "раз",
        image: "/assets/workouts/pullups.png",
    },
    {
        type: "pushups",
        title: "Отжимания",
        unit: "раз",
        image: "/assets/workouts/pushups.png",
    },
    {
        type: "plank",
        title: "Планка",
        unit: "сек",
        image: "/assets/workouts/plank.png",
    },
    {
        type: "running",
        title: "Бег",
        unit: "км",
        image: "/assets/workouts/running.png",
    },
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number]["type"];

const EXERCISE_ALIASES: Record<string, ExerciseType> = {
    pullup: "pullups",
    pullups: "pullups",
    pull_ups: "pullups",
    pushup: "pushups",
    pushups: "pushups",
    push_ups: "pushups",
    plank: "plank",
    plank_seconds: "plank",
    run: "running",
    running: "running",
    running_km: "running",
    distance: "running",
};

export function normalizeExerciseType(value?: string): string {
    const normalized = String(value ?? "").trim().toLowerCase();
    return EXERCISE_ALIASES[normalized] ?? normalized;
}
