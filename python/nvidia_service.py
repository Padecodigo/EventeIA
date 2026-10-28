"""Integração com a NVIDIA Build API (compatível com OpenAI).

Uso básico:
    from nvidia_service import NvidiaService

    service = NvidiaService()                       # lê NVIDIA_API_KEY
    result = service.gerar_resposta("Resuma o texto: ...")
    if result["success"]:
        print(result["data"])
    else:
        print(result["error"])

Retorno sempre no formato {"success": bool, "data": str | None, "error": str | None},
pronto para serializar direto em rotas FastAPI/Flask.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from openai import OpenAI, OpenAIError

logger = logging.getLogger(__name__)

# Endpoint oficial da NVIDIA Build (OpenAI-compatible).
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "google/diffusiongemma-26b-a4b-it"
DEFAULT_TIMEOUT_SECONDS = 60.0


class NvidiaService:
    """Cliente de alto nível para a NVIDIA Build API."""

    def __init__(self, api_key: str | None = None) -> None:
        """Inicializa o cliente.

        Args:
            api_key: chave da NVIDIA. Se omitida, usa a variável de ambiente
                ``NVIDIA_API_KEY``.

        Raises:
            ValueError: quando nenhuma chave está disponível (falha cedo e clara).
        """
        resolved = api_key or os.environ.get("NVIDIA_API_KEY")
        if not resolved:
            raise ValueError("NVIDIA_API_KEY não configurada (env ou parâmetro).")

        self.api_key = resolved
        # O SDK oficial aponta para a NVIDIA apenas trocando o base_url.
        self._client = OpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=self.api_key,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )

    def gerar_resposta(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """Gera uma resposta de chat para o prompt.

        Returns:
            dict com ``success`` (bool), ``data`` (texto ou None) e
            ``error`` (mensagem ou None). Nunca levanta exceção: falhas viram
            ``success=False`` para o backend seguir funcionando.
        """
        if not prompt or not prompt.strip():
            return {"success": False, "data": None, "error": "Prompt vazio."}

        try:
            completion = self._client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except OpenAIError as exc:
            # Erros da biblioteca: autenticação, rate limit, timeout, conexão...
            logger.warning("Erro da OpenAI/NVIDIA: %s", exc)
            return {"success": False, "data": None, "error": f"Erro da API: {exc}"}
        except Exception as exc:  # noqa: BLE001 - fronteira do serviço
            logger.exception("Erro inesperado ao chamar a NVIDIA")
            return {"success": False, "data": None, "error": f"Erro inesperado: {exc}"}

        content = completion.choices[0].message.content if completion.choices else None
        if not content:
            return {"success": False, "data": None, "error": "Resposta vazia do modelo."}

        return {"success": True, "data": content, "error": None}


if __name__ == "__main__":
    # Simulação rápida: python nvidia_service.py "seu prompt"
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    texto = " ".join(sys.argv[1:]) or "Explique em uma frase o que é a EventeIA."
    resultado = NvidiaService().gerar_resposta(texto)
    print(resultado)
