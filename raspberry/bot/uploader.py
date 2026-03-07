import os
import logging
import threading
import queue
from pathlib import Path
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account

log = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive"]


class DriveUploader:
    def __init__(self, folder_id):
        self.folder_id = folder_id
        self.upload_queue = queue.Queue()
        self.service = self._init_drive()

        self._worker = threading.Thread(target=self._upload_worker, daemon=True)
        self._worker.start()

    def _init_drive(self):
        try:
            # Service Account JSON aus Root
            sa_path = Path(__file__).parent.parent.parent / "service_account.json"
            creds = service_account.Credentials.from_service_account_file(
                str(sa_path), scopes=SCOPES
            )
            service = build("drive", "v3", credentials=creds)
            log.info("Google Drive via Service Account verbunden")
            return service
        except Exception as e:
            log.error(f"Drive-Fehler: {e}")
            return None

    def upload_async(self, filepath, subfolder_name="misc"):
        self.upload_queue.put((filepath, subfolder_name))

    def _upload_worker(self):
        folder_cache = {}

        while True:
            filepath, subfolder = self.upload_queue.get()

            if not self.service:
                log.warning("Drive nicht verfügbar, skip upload")
                continue

            try:
                if subfolder not in folder_cache:
                    folder_cache[subfolder] = self._get_or_create_folder(subfolder)

                sub_id = folder_cache[subfolder]

                file_metadata = {
                    "name": Path(filepath).name,
                    "parents": [sub_id]
                }
                media = MediaFileUpload(filepath, mimetype="image/png")
                self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields="id"
                ).execute()

                log.info(f"Upload OK: {Path(filepath).name}")

            except Exception as e:
                log.error(f"Upload fehlgeschlagen {filepath}: {e}")

            self.upload_queue.task_done()

    def _get_or_create_folder(self, name):
        query = (
            f"name='{name}' and "
            f"'{self.folder_id}' in parents and "
            f"mimeType='application/vnd.google-apps.folder' and "
            f"trashed=false"
        )
        results = self.service.files().list(q=query, fields="files(id)").execute()
        files = results.get("files", [])

        if files:
            return files[0]["id"]

        folder_metadata = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [self.folder_id]
        }
        folder = self.service.files().create(
            body=folder_metadata, fields="id"
        ).execute()
        log.info(f"Ordner erstellt: {name}")
        return folder["id"]