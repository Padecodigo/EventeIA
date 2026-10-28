"""Testes offline do NvidiaImageService (requests mockado)."""

from __future__ import annotations

import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from nvidia_image_service import NvidiaImageService

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nfake-image-bytes").decode("ascii")


class _Response:
    def __init__(self, status_code: int = 200, payload=None, text: str = "", content: bytes = b""):
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.content = content

    def json(self):
        if self._payload is None:
            raise ValueError("sem json")
        return self._payload


class NvidiaImageServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.svc = NvidiaImageService(api_key="test", output_dir=self.dir.name)

    def tearDown(self) -> None:
        self.dir.cleanup()

    def test_artifacts_base64_salva_arquivo(self) -> None:
        with patch("requests.post", return_value=_Response(payload={"artifacts": [{"base64": PNG}]})):
            result = self.svc.gerar_imagem("um buffet")
        self.assertTrue(result["success"])
        self.assertTrue(Path(result["image_data"]["path"]).exists())
        self.assertEqual(result["image_data"]["mime"], "image/png")

    def test_data_uri_decodifica(self) -> None:
        with patch("requests.post", return_value=_Response(payload={"image": f"data:image/jpeg;base64,{PNG}"})):
            result = self.svc.gerar_imagem("um buffet")
        self.assertTrue(result["success"])
        self.assertEqual(result["image_data"]["mime"], "image/jpeg")
        self.assertTrue(result["image_data"]["path"].endswith(".jpg"))

    def test_url_baixa_e_salva(self) -> None:
        with patch("requests.post", return_value=_Response(payload={"url": "https://cdn/x.png"})):
            with patch("requests.get", return_value=_Response(content=b"fake-image-bytes")):
                result = self.svc.gerar_imagem("um buffet")
        self.assertTrue(result["success"])
        self.assertTrue(Path(result["image_data"]["path"]).exists())

    def test_http_error_vira_success_false(self) -> None:
        with patch("requests.post", return_value=_Response(status_code=401, text="unauthorized")):
            result = self.svc.gerar_imagem("um buffet")
        self.assertFalse(result["success"])
        self.assertIsNone(result["image_data"])
        self.assertIn("401", result["error"])

    def test_resposta_sem_imagem(self) -> None:
        with patch("requests.post", return_value=_Response(payload={"ok": True})):
            result = self.svc.gerar_imagem("um buffet")
        self.assertFalse(result["success"])
        self.assertIn("sem imagem", result["error"])

    def test_prompt_vazio(self) -> None:
        result = self.svc.gerar_imagem("   ")
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "Prompt vazio.")

    def test_env_ausente_levanta_value_error(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(ValueError):
                NvidiaImageService()


if __name__ == "__main__":
    unittest.main()
