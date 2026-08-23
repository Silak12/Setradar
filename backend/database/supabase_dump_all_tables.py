import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from postgrest.exceptions import APIError
from supabase import Client, create_client

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
DEFAULT_OUTPUT = Path(__file__).with_name("supabase_all_tables_dump.json")

load_dotenv(ROOT_ENV_FILE)


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _supabase_client() -> Client:
    supabase_url = _required_env("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SECRET_KEY") or _required_env(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    return create_client(supabase_url, supabase_key)


def _list_tables_via_rpc(supabase: Client) -> list[str]:
    try:
        response = supabase.rpc("list_public_tables").execute()
        data = response.data or []
        table_names: list[str] = []
        for row in data:
            if isinstance(row, dict):
                table_name = row.get("table_name")
                if table_name:
                    table_names.append(str(table_name))
        return table_names
    except APIError as exc:
        code = getattr(exc, "code", "unknown")
        if code in {"PGRST202", "42883"}:
            raise RuntimeError(
                "RPC function 'list_public_tables' fehlt. Fuehre in Supabase SQL Editor aus:\n"
                "create or replace function public.list_public_tables()\n"
                "returns table(table_name text)\n"
                "language sql\n"
                "security invoker\n"
                "as $$\n"
                "  select tablename::text\n"
                "  from pg_tables\n"
                "  where schemaname = 'public'\n"
                "  order by tablename;\n"
                "$$;\n"
                "grant execute on function public.list_public_tables() to service_role;"
            ) from exc
        message = getattr(exc, "message", str(exc))
        raise RuntimeError(
            f"Failed to list tables via RPC (code: {code}): {message}"
        ) from exc


def _fetch_table_rows(
    supabase: Client,
    table_name: str,
    page_size: int,
    max_rows: int | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        response = (
            supabase.table(table_name)
            .select("*")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)

        if max_rows is not None and len(rows) >= max_rows:
            return rows[:max_rows]
        if len(batch) < page_size:
            return rows
        offset += page_size


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dump all public Supabase tables (names + rows) into JSON."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output JSON path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=1000,
        help="Rows per page per request (default: 1000).",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=0,
        help="Max rows per table (0 = no explicit max).",
    )
    parser.add_argument(
        "--tables",
        type=str,
        default="",
        help="Optional comma-separated table list (skip RPC discovery).",
    )
    args = parser.parse_args()

    if args.page_size <= 0:
        raise ValueError("--page-size must be > 0")

    max_rows = args.max_rows if args.max_rows > 0 else None
    supabase = _supabase_client()

    try:
        if args.tables.strip():
            table_names = [t.strip() for t in args.tables.split(",") if t.strip()]
        else:
            table_names = _list_tables_via_rpc(supabase)
    except (APIError, RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        raise SystemExit(1) from exc

    if not table_names:
        print("Keine Tabellen gefunden.")
        raise SystemExit(0)

    result: dict[str, Any] = {}
    for table_name in table_names:
        try:
            rows = _fetch_table_rows(
                supabase=supabase,
                table_name=table_name,
                page_size=args.page_size,
                max_rows=max_rows,
            )
            result[table_name] = rows
            print(f"[OK] {table_name}: {len(rows)} rows")
        except APIError as exc:
            code = getattr(exc, "code", "unknown")
            message = getattr(exc, "message", str(exc))
            result[table_name] = {
                "_error": f"Fetch failed (code: {code}): {message}",
            }
            print(f"[WARN] {table_name}: {message} (code: {code})")

    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Dump geschrieben: {args.output}")


if __name__ == "__main__":
    main()
