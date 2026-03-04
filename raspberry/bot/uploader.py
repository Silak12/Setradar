import os
import logging
import threading
import queue
from pathlib import Path

log = logging.getLogger(__name__)


class DriveUploader:
    def __init__(self, folder_id):
        self.folder_id = folder_id
        self.upload_queue = queue.Queue()
        self.drive = self._init_drive()

        # Upload läuft im Hintergrund-Thread
        self._worker = threading.Thread(
            target=self._upload_worker, daemon=True)
        self._worker.start()

    def _init_drive(self):
        try:
            from pydrive2.auth import GoogleAuth
            from pydrive2.drive import GoogleDrive

            gauth = GoogleAuth()
            # Nutzt gespeicherte credentials.json
            gauth.LoadCredentialsFile("credentials.json")

            if gauth.credentials is None:
                gauth.LocalWebserverAuth()
            elif gauth.access_token_expired:
                gauth.Refresh()
            else:
                gauth.Authorize()

            gauth.SaveCredentialsFile("credentials.json")
            drive = GoogleDrive(gauth)
            log.info("Google Drive verbunden")
            return drive

        except Exception as e:
            log.error(f"Drive-Fehler: {e}")
            return None

    def upload_async(self, filepath, subfolder_name="misc"):
        """Stellt Datei in Upload-Queue."""
        self.upload_queue.put((filepath, subfolder_name))

    def _upload_worker(self):
        """Hintergrund-Thread der die Queue abarbeitet."""
        folder_cache = {}

        while True:
            filepath, subfolder = self.upload_queue.get()

            if not self.drive:
                log.warning("Drive nicht verfügbar, skip upload")
                continue

            try:
                # Unterordner pro Account anlegen/cachen
                if subfolder not in folder_cache:
                    folder_cache[subfolder] = self._get_or_create_folder(
                        subfolder)

                sub_id = folder_cache[subfolder]

                f = self.drive.CreateFile({
                    "title": Path(filepath).name,
                    "parents": [{"id": sub_id}]
                })
                f.SetContentFile(filepath)
                f.Upload()
                log.info(f"Upload OK: {Path(filepath).name}")

            except Exception as e:
                log.error(f"Upload fehlgeschlagen {filepath}: {e}")

            self.upload_queue.task_done()

    def _get_or_create_folder(self, name):
        """Erstellt Unterordner in Drive falls nicht vorhanden."""
        query = (
            f"title='{name}' and "
            f"'{self.folder_id}' in parents and "
            f"mimeType='application/vnd.google-apps.folder' and "
            f"trashed=false"
        )
        results = self.drive.ListFile({"q": query}).GetList()

        if results:
            return results[0]["id"]

        folder = self.drive.CreateFile({
            "title": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [{"id": self.folder_id}]
        })
        folder.Upload()
        log.info(f"Ordner erstellt: {name}")
        return folder["id"]