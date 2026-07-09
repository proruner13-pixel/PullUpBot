import re
import unittest
from pathlib import Path

from app.migrate import available_migrations


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MIGRATION_001 = (
    PROJECT_ROOT / "migrations" / "001_create_challenges.up.sql"
)
MIGRATION_002 = (
    PROJECT_ROOT / "migrations" / "002_shared_product_schema.up.sql"
)
SCHEMA_SNAPSHOT = PROJECT_ROOT / "sql" / "schema.sql"
MIGRATION_005 = (
    PROJECT_ROOT / "migrations" / "005_xp_rewards.up.sql"
)


def sql_without_comments(path: Path) -> str:
    return "\n".join(
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("--")
    ).strip()


class MigrationChainTests(unittest.TestCase):
    def test_migrations_are_available_in_numeric_order(self) -> None:
        self.assertEqual(
            [version for version, _ in available_migrations()],
            ["001", "002", "003", "004", "005", "006", "007"],
        )

    def test_001_bootstraps_legacy_tables(self) -> None:
        sql = MIGRATION_001.read_text(encoding="utf-8")
        users_position = sql.index(
            "CREATE TABLE IF NOT EXISTS public.users"
        )
        pullups_position = sql.index(
            "CREATE TABLE IF NOT EXISTS public.pullups"
        )
        challenges_position = sql.index(
            "CREATE TABLE IF NOT EXISTS public.challenges"
        )
        self.assertLess(users_position, challenges_position)
        self.assertLess(pullups_position, challenges_position)

    def test_002_matches_schema_snapshot(self) -> None:
        self.assertEqual(
            sql_without_comments(MIGRATION_002),
            sql_without_comments(SCHEMA_SNAPSHOT),
        )

    def test_002_has_no_destructive_user_operations(self) -> None:
        sql = MIGRATION_002.read_text(encoding="utf-8").upper()
        forbidden = (
            r"DROP\s+DATABASE",
            r"DROP\s+TABLE\s+(IF\s+EXISTS\s+)?PUBLIC\.USERS",
            r"DELETE\s+FROM\s+PUBLIC\.USERS",
            r"TRUNCATE\s+(TABLE\s+)?PUBLIC\.USERS",
        )
        for pattern in forbidden:
            self.assertIsNone(re.search(pattern, sql), pattern)

    def test_005_adds_xp_without_balance(self) -> None:
        sql = MIGRATION_005.read_text(encoding="utf-8").upper()
        self.assertIn("ADD COLUMN IF NOT EXISTS XP", sql)
        self.assertIn("ADD COLUMN IF NOT EXISTS TOTAL_XP", sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS PUBLIC.XP_TRANSACTIONS", sql)
        self.assertIn("FIRST_PULLUP_SUBMISSION", sql)
        self.assertNotIn("BALANCE", sql)


if __name__ == "__main__":
    unittest.main()
