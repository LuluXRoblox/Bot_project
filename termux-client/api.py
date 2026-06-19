import requests


class ApiError(Exception):
    pass


class ApiClient:
    def __init__(self, base_url, session_token=None):
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.session_token = session_token

    def _headers(self):
        h = {}
        if self.session_token:
            h["x-session-token"] = self.session_token
        return h

    def _handle(self, resp):
        try:
            data = resp.json()
        except Exception:
            raise ApiError(f"Response bukan JSON valid (HTTP {resp.status_code})")
        if resp.status_code >= 400:
            raise ApiError(data.get("error", f"HTTP {resp.status_code}"))
        return data

    def request_code(self, user_id):
        r = requests.post(f"{self.base_url}/request-code", json={"user_id": user_id}, timeout=15)
        return self._handle(r)

    def verify_code(self, user_id, code):
        r = requests.post(
            f"{self.base_url}/verify-code", json={"user_id": user_id, "code": code}, timeout=15
        )
        return self._handle(r)

    def get_servers(self):
        r = requests.get(f"{self.base_url}/servers", headers=self._headers(), timeout=30)
        return self._handle(r)

    def get_templates(self):
        r = requests.get(f"{self.base_url}/templates", headers=self._headers(), timeout=15)
        return self._handle(r)

    def run_setup(self, guild_id, template_key, mode):
        r = requests.post(
            f"{self.base_url}/setup",
            json={"guild_id": guild_id, "template_key": template_key, "mode": mode},
            headers=self._headers(),
            timeout=90,
        )
        return self._handle(r)

    def get_history(self, guild_id):
        r = requests.get(
            f"{self.base_url}/history",
            params={"guild_id": guild_id},
            headers=self._headers(),
            timeout=15,
        )
        return self._handle(r)

    def leave_guild(self, guild_id):
        r = requests.post(
            f"{self.base_url}/leave-guild",
            json={"guild_id": guild_id},
            headers=self._headers(),
            timeout=15,
        )
        return self._handle(r)
