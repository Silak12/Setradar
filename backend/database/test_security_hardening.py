from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260823010000_database_security_hardening.sql"
)


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_all_public_stat_views_are_security_invoker() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    public_views = (
        "act_rating_stats",
        "event_act_highlights",
        "event_hype_totals",
        "events_with_hype",
        "event_mood_current",
        "event_presence_current",
        "queue_reports_mapped",
        "event_queue_current",
        "event_queue_buckets",
        "event_queue_timeline",
    )

    for view in public_views:
        definition = f"create view public.{view}\nwith (security_invoker = true)"
        assert definition in sql


def test_bootstrap_sql_does_not_restore_anonymous_catalog_writes() -> None:
    for relative_path in (
        "backend/database/lineup_init.sql",
        "backend/database/create_schema_from_json.py",
    ):
        source = _read(relative_path).lower()
        assert 'create policy "anon can insert' not in source
        assert 'create policy "anon can update' not in source
        assert "grant select, insert, update on table cities" not in source


def test_public_frontend_reads_sanitized_ratings() -> None:
    home = _read("frontend/js/home.js")
    past_event = _read("frontend/js/past-event-modal.js")
    profile = _read("frontend/js/profile.js")

    assert "pubClient.from('act_ratings_public')" in home
    assert "_pub.from('act_ratings_public')" in past_event
    assert "rpc('get_my_act_recommendations')" in profile
    assert ".select('user_id, act_id, rating')" not in profile


def test_backend_imports_require_a_privileged_key() -> None:
    lineup_seed = _read("backend/database/supabase_seed_lineup.py")
    client_block = lineup_seed.split("def _supabase_client()", 1)[1].split(
        "def _load_json", 1
    )[0]

    assert '"SUPABASE_SECRET_KEY"' in client_block
    assert '"SUPABASE_SERVICE_ROLE_KEY"' in client_block
    assert '"SUPABASE_PUBLISHABLE_KEY"' not in client_block
    assert '"SUPABASE_ANON_KEY"' not in client_block
