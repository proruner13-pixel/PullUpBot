export const badges = [
    {
        id: "pullups10",
        name: "Новичок турника",
        icon: "💪",
        description: "Сделать 10 подтягиваний",
        condition: (stats: any) => stats.maxPullups >= 10
    },
    {
        id: "pullups30",
        name: "Турник-машина",
        icon: "🔥",
        description: "Сделать 30 подтягиваний",
        condition: (stats: any) => stats.maxPullups >= 30
    },
    {
        id: "run5k",
        name: "5K Runner",
        icon: "🏃",
        description: "Пробежать 5 км",
        condition: (stats: any) => stats.maxRun >= 5
    },
    {
        id: "run10k",
        name: "10K Beast",
        icon: "⚡",
        description: "Пробежать 10 км",
        condition: (stats: any) => stats.maxRun >= 10
    }
];