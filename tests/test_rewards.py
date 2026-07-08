import unittest

from app.services.rewards import (
    calculate_level,
    calculate_pullup_reward,
    calculate_xp,
    calculate_xp_reward,
)


class RewardCalculationTests(unittest.TestCase):
    def test_pullups_reward_and_xp(self) -> None:
        pullup_earned = calculate_pullup_reward("pullups", {"reps": 10})
        self.assertEqual(pullup_earned, 10)
        self.assertEqual(calculate_xp_reward("pullups", pullup_earned), 20)

    def test_pushups_reward_and_xp(self) -> None:
        pullup_earned = calculate_pullup_reward("pushups", {"reps": 30})
        self.assertEqual(pullup_earned, 30)
        self.assertEqual(calculate_xp_reward("pushups", pullup_earned), 30)

    def test_running_reward_and_xp(self) -> None:
        payload = {"distance_km": 5}
        pullup_earned = calculate_pullup_reward("running", payload)
        self.assertEqual(pullup_earned, 50)
        self.assertEqual(calculate_xp("run", 0, payload), 50)

    def test_plank_sixty_seconds_reward_and_xp(self) -> None:
        pullup_earned = calculate_pullup_reward("plank", {"seconds": 60})
        self.assertEqual(pullup_earned, 6)
        self.assertEqual(calculate_xp_reward("plank", pullup_earned), 6)

    def test_plank_ninety_five_seconds_reward_and_xp(self) -> None:
        pullup_earned = calculate_pullup_reward("plank", {"seconds": 95})
        self.assertEqual(pullup_earned, 9)
        self.assertEqual(calculate_xp_reward("plank", pullup_earned), 9)

    def test_level_starts_at_one(self) -> None:
        self.assertEqual(calculate_level(0), 1)

    def test_level_at_exact_boundary(self) -> None:
        self.assertEqual(calculate_level(100), 2)

    def test_level_truncates_partial_hundreds(self) -> None:
        self.assertEqual(calculate_level(250), 3)

    def test_level_uses_extended_scale(self) -> None:
        self.assertEqual(calculate_level(500), 6)
        self.assertEqual(calculate_level(999), 10)
        self.assertEqual(calculate_level(1000), 11)


if __name__ == "__main__":
    unittest.main()
