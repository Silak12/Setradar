import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_ANON_KEY")

supabase = create_client(url, key)

# Insert
insert_response = supabase.table("items").insert({
    "name": "test",
    "value": 42
}).execute()

print("Insert:", insert_response.data)

# Select
select_response = supabase.table("items").select("*").execute()
print("Select:", select_response.data)