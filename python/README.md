# Python — integração com a NVIDIA Build API

Serviço isolado para **testar e simular** o uso da NVIDIA antes de trocar de provedor no site.
A NVIDIA Build expõe uma API **compatível com OpenAI**, então o SDK oficial funciona apenas
trocando o `base_url`.

## Setup

```bash
cd python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export NVIDIA_API_KEY="sua-chave"
```

## Uso

```python
from nvidia_service import NvidiaService

svc = NvidiaService()  # lê NVIDIA_API_KEY
res = svc.gerar_resposta("Escreva uma legenda para um buffet em Taubaté.")
print(res)             # {"success": True, "data": "...", "error": None}
```

## Simulação rápida (CLI)

```bash
python nvidia_service.py "Descreva um casamento para 120 convidados"
```

## Contrato de retorno

| Campo | Tipo | Descrição |
|---|---|---|
| `success` | `bool` | `False` em qualquer falha (o backend não cai) |
| `data` | `str \| None` | conteúdo retornado pelo modelo |
| `error` | `str \| None` | mensagem de erro legível |

## Notas

- Timeout de 60s; erros da biblioteca (`OpenAIError`) são tratados separadamente.
- Modelo padrão: `google/diffusiongemma-26b-a4b-it` (pode ser trocado por parâmetro).
- Nenhuma dependência do projeto Next.js: é um módulo Python independente.

---

# Geração de imagens (NVIDIA NIM)

`nvidia_image_service.py` usa `requests` direto no NIM GenAI.

## Uso

```python
from nvidia_image_service import NvidiaImageService

svc = NvidiaImageService()  # lê NVIDIA_API_KEY; salva em ./artifacts
res = svc.gerar_imagem("buffet elegante para casamento, luz natural")
if res["success"]:
    print(res["image_data"]["path"], res["image_data"]["mime"])
else:
    print(res["error"])
```

## CLI de simulação

```bash
python nvidia_image_service.py "casamento ao ar livre em Taubaté"
```

## Contrato

| Campo | Tipo | Descrição |
|---|---|---|
| `success` | `bool` | `False` em qualquer falha |
| `image_data` | `dict \| None` | `path`, `mime`, `bytes`, `base64`, `url` |
| `error` | `str \| None` | mensagem legível |

Aceita resposta em **Base64**, **data URI** ou **URL** (baixa e salva).
Modelo padrão: `black-forest-labs/flux-3-image-klein`; endpoint base
`https://ai.api.nvidia.com/v1/genai/{model}` (configurável).

## Testes offline

```bash
cd python && PYTHONPATH=. python3 -m unittest -v test_nvidia_image_service.py
```
