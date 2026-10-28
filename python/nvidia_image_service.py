"""Geração de imagens na NVIDIA Build (NIM GenAI) via `requests`.

Uso:
    from nvidia_image_service import NvidiaImageService

    svc = NvidiaImageService()  # lê NVIDIA_API_KEY
    res = svc.gerar_imagem("buffet elegante para casamento, luz natural")
    if res["success"]:
        print(res["image_data"]["path"])

Contrato de retorno:
    {"success": bool, "image_data": {...} | None, "error": str | None}

`image_data` traz `path` (arquivo salvo), `url` (quando o provedor devolve URL),
`base64` (quando devolve Base64) e `mime`.
"""

from __future__ import annotations

import base64
import binascii
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

# Base do NIM GenAI; o caminho final é /{model}.
NVIDIA_GENAI_BASE = "https://ai.api.nvidia.com/v1/genai"
DEFAULT_MODEL = "black-forest-labs/flux-3-image-klein"
DEFAULT_TIMEOUT_SECONDS = 120

_DATA_URI = re.compile(r"^data:(?P<mime>image/[\w.+-]+);base64,(?P<data>.+)$", re.DOTALL)
_EXT_BY_MIME = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}

# Assinaturas dos formatos mais comuns (a API nem sempre informa o MIME).
_MAGIC = [
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF8", "image/gif"),
]


class NvidiaImageService:
    """Cliente de geração de imagem da NVIDIA Build."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = NVIDIA_GENAI_BASE,
        output_dir: str | Path = "artifacts",
    ) -> None:
        """Inicializa o serviço.

        Args:
            api_key: chave da NVIDIA; se omitida usa ``NVIDIA_API_KEY``.
            base_url: base do NIM GenAI (permite trocar por outro host/modelo).
            output_dir: pasta onde as imagens são salvas.

        Raises:
            ValueError: quando a chave não está configurada.
        """
        resolved = api_key or os.environ.get("NVIDIA_API_KEY")
        if not resolved:
            raise ValueError("NVIDIA_API_KEY não configurada (env ou parâmetro).")

        self.api_key = resolved
        self.base_url = base_url.rstrip("/")
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # API principal
    # ------------------------------------------------------------------ #
    def gerar_imagem(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        mode: str | None = "t2i",
        **params: Any,
    ) -> dict[str, Any]:
        """Gera uma imagem a partir do prompt.

        Args:
            prompt: descrição da imagem.
            model: id do modelo no NIM (ex.: black-forest-labs/flux-3-image-klein).
            mode: modo do NIM ("t2i" texto→imagem, "i2i" imagem→imagem); None omite.
            **params: parâmetros específicos do modelo (cfg_scale, aspect_ratio,
                seed, steps, ...).

        Returns:
            dict com ``success``, ``image_data`` (ou None) e ``error``.
            Nunca levanta exceção — falha vira ``success=False``.
        """
        if not prompt or not prompt.strip():
            return {"success": False, "image_data": None, "error": "Prompt vazio."}

        payload: dict[str, Any] = {"prompt": prompt, **params}
        if mode is not None:
            payload["mode"] = mode

        url = f"{self.base_url}/{model.lstrip('/')}"
        try:
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=DEFAULT_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            logger.warning("Falha de rede ao chamar a NVIDIA: %s", exc)
            return {"success": False, "image_data": None, "error": f"Falha de rede: {exc}"}

        if response.status_code != 200:
            return {
                "success": False,
                "image_data": None,
                "error": f"HTTP {response.status_code}: {response.text[:300]}",
            }

        try:
            body = response.json()
        except ValueError:
            return {"success": False, "image_data": None, "error": "Resposta não é JSON."}

        extracted = self._extract_image(body)
        if extracted is None:
            return {"success": False, "image_data": None, "error": "Resposta sem imagem reconhecível."}

        raw_b64 = extracted.get("base64")
        url_out = extracted.get("url")

        if raw_b64 is None and url_out is not None:
            downloaded = self._download(url_out)
            if downloaded is None:
                return {"success": False, "image_data": None, "error": "Falha ao baixar a URL da arte."}
            raw_b64 = downloaded

        if raw_b64 is None:
            return {"success": False, "image_data": None, "error": "Resposta sem Base64 nem URL."}

        try:
            data = self._decode_b64(raw_b64)
        except (binascii.Error, ValueError) as exc:
            return {"success": False, "image_data": None, "error": f"Base64 inválido: {exc}"}

        mime = extracted.get("mime") or self._sniff_mime(data) or "image/png"
        path = self._save(data, mime)
        logger.info("Imagem salva em %s (%d bytes)", path, len(data))
        return {
            "success": True,
            "image_data": {
                "path": str(path),
                "mime": mime,
                "bytes": len(data),
                "base64": raw_b64,
                "url": url_out,
            },
            "error": None,
        }

    # ------------------------------------------------------------------ #
    # Internos
    # ------------------------------------------------------------------ #
    @staticmethod
    def _extract_image(body: Any) -> dict[str, Any] | None:
        """Normaliza as formas de resposta do NIM (artifacts, data URI, url...)."""
        if not isinstance(body, dict):
            return None

        artifacts = body.get("artifacts")
        if isinstance(artifacts, list) and artifacts:
            first = artifacts[0]
            if isinstance(first, dict):
                for key in ("base64", "b64_json", "image"):
                    value = first.get(key)
                    if isinstance(value, str) and value:
                        return NvidiaImageService._normalize_str(value)
                for key in ("url", "uri"):
                    value = first.get(key)
                    if isinstance(value, str) and value:
                        return {"base64": None, "url": value, "mime": None}

        for key in ("image", "image_url", "url", "b64_json", "base64"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return NvidiaImageService._normalize_str(value)

        data = body.get("data")
        if isinstance(data, list) and data and isinstance(data[0], dict):
            first = data[0]
            for key in ("b64_json", "base64", "url"):
                value = first.get(key)
                if isinstance(value, str) and value:
                    return NvidiaImageService._normalize_str(value)

        return None

    @staticmethod
    def _normalize_str(value: str) -> dict[str, Any]:
        """Converte data URI / URL / Base64 puro no formato interno."""
        match = _DATA_URI.match(value.strip())
        if match is not None:
            return {"base64": match.group("data"), "url": None, "mime": match.group("mime")}
        if value.startswith("http://") or value.startswith("https://"):
            return {"base64": None, "url": value, "mime": None}
        return {"base64": value, "url": None, "mime": None}

    @staticmethod
    def _sniff_mime(data: bytes) -> str | None:
        """Descobre o formato pelos bytes mágicos (JPEG/PNG/GIF/WebP)."""
        for signature, mime in _MAGIC:
            if data.startswith(signature):
                return mime
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        return None

    @staticmethod
    def _decode_b64(raw: str) -> bytes:
        """Decodifica Base64 tolerando espaços e padding ausente."""
        cleaned = "".join(raw.split())
        cleaned += "=" * (-len(cleaned) % 4)
        return base64.b64decode(cleaned, validate=True)

    @staticmethod
    def _download(url: str) -> str | None:
        """Baixa a arte de uma URL e devolve Base64; None em falha."""
        try:
            response = requests.get(url, timeout=DEFAULT_TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            logger.warning("Falha ao baixar a arte: %s", exc)
            return None
        if response.status_code != 200:
            return None
        return base64.b64encode(response.content).decode("ascii")

    def _save(self, data: bytes, mime: str) -> Path:
        """Grava o arquivo com extensão coerente com o MIME."""
        extension = _EXT_BY_MIME.get(mime, ".bin")
        path = self.output_dir / f"{uuid.uuid4().hex}{extension}"
        path.write_bytes(data)
        return path


if __name__ == "__main__":
    # Simulação: python nvidia_image_service.py "seu prompt"
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    texto = " ".join(sys.argv[1:]) or "Buffet elegante para casamento, luz natural, estilo editorial"
    resultado = NvidiaImageService().gerar_imagem(texto)
    print({k: v for k, v in resultado.items() if k != "image_data"})
    if resultado["success"]:
        print("arquivo:", resultado["image_data"]["path"])
