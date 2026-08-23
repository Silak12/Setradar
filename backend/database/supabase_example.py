import json
import os

from dotenv import load_dotenv
from postgrest.exceptions import APIError
from supabase import create_client

load_dotenv()

def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value

def _optional_json_env(name: str):
    raw = os.getenv(name)
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} must contain valid JSON. Received: {raw}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be a JSON object.")
    return payload

supabase = create_client(
    _required_env("SUPABASE_URL"),
    os.getenv("SUPABASE_SECRET_KEY") or _required_env("SUPABASE_SERVICE_ROLE_KEY"),
)

table_name = os.getenv("SUPABASE_TABLE", "items")
insert_payload = _optional_json_env("SUPABASE_INSERT_JSON")

def _log_api_error(prefix: str, exc: APIError) -> None:
    message = getattr(exc, "message", str(exc))
    code = getattr(exc, "code", "unknown")
    print(f"{prefix} (code: {code}): {message}")

if insert_payload is not None:
    try:
        insert_response = supabase.table(table_name).insert(insert_payload).execute()
        print("Insert:", insert_response.data)
    except APIError as exc:
        _log_api_error(f"Insert failed for table '{table_name}'", exc)
        print(
            "Hint: set SUPABASE_INSERT_JSON to match your table schema, "
            "e.g. SUPABASE_INSERT_JSON='{\"column\":\"value\"}'."
        )
else:
    try:
        insert_response = supabase.table(table_name).insert({}).execute()
        print("Insert with defaults:", insert_response.data)
    except APIError as empty_insert_error:
        _log_api_error(
            f"Insert with defaults failed for table '{table_name}'",
            empty_insert_error,
        )
        try:
            sample_response = supabase.table(table_name).select("*").limit(1).execute()
            sample_row = sample_response.data[0] if sample_response.data else None
            if not sample_row:
                print(
                    "Fallback insert not possible because table is empty and "
                    "SUPABASE_INSERT_JSON is not set."
                )
            else:
                excluded_keys = {"id", "created_at", "updated_at"}
                fallback_payload = {
                    key: value
                    for key, value in sample_row.items()
                    if key not in excluded_keys
                }
                if not fallback_payload:
                    print(
                        "Fallback insert not possible: no writable columns found in sample row."
                    )
                else:
                    cloned_insert = supabase.table(table_name).insert(fallback_payload).execute()
                    print("Insert from sample row:", cloned_insert.data)
        except APIError as exc:
            _log_api_error(f"Fallback insert failed for table '{table_name}'", exc)

try:
    select_response = supabase.table(table_name).select("*").limit(5).execute()
    print("Select:", select_response.data)
except APIError as exc:
    message = getattr(exc, "message", str(exc))
    code = getattr(exc, "code", "unknown")
    print(f"Select failed for table '{table_name}' (code: {code}): {message}")
