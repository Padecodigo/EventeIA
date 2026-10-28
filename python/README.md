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
