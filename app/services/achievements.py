from collections.abc import Iterable
from typing import Any


ACHIEVEMENTS = (
    {
        "code": "running_5",
        "title": "5K Runner",
        "icon": "🏃",
        "exercise": "running",
        "threshold": 5,
    },
    {
        "code": "running_10",
        "title": "10K Runner",
        "icon": "🚀",
        "exercise": "running",
        "threshold": 10,
    },
    {
        "code": "pullups_30",
        "title": "30 Pullups",
        "icon": "💪",
        "exercise": "pullups",
        "threshold": 30,
    },
    {
        "code": "pullups_50",
        "title": "Pullup Master",
        "icon": "🏆",
        "exercise": "pullups",
        "threshold": 50,
    },
    {
        "code": "pushups_100",
        "title": "100 Pushups",
        "icon": "🔥",
        "exercise": "pushups",
        "threshold": 100,
    },
    {
        "code": "plank_3",
        "title": "Plank Core",
        "icon": "🧘",
        "exercise": "plank",
        "threshold": 3,
    },
)


def earned_achievements(
    challenges: Iterable[Any],
) -> list[dict[str, str]]:
    progress = {
        challenge["exercise"]: challenge["progress"]
        for challenge in challenges
    }
    return [
        {
            "code": achievement["code"],
            "title": achievement["title"],
            "icon": achievement["icon"],
        }
        for achievement in ACHIEVEMENTS
        if progress.get(achievement["exercise"], 0)
        >= achievement["threshold"]
    ]
