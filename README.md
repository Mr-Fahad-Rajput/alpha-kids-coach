# Alpha Kids Coach

A parent types a concern in English or Urdu; an LLM coach replies with a short, safe plan and a check-in, and escalates emergencies, abuse and self-harm.

## Quick start (local)

Requires Node 24+.

```bash
cp .env.example .env.local   # then add at least one provider key
npm ci
npm run dev
```

Open http://localhost:3000.

## Quick start (Docker)

```bash
docker build -t alpha-kids-coach .
docker run --rm -p 3000:3000 --env-file .env.local alpha-kids-coach
```

Or with Compose:

```bash
docker compose up --build
```

Write values in `.env.local` without quotes: `docker --env-file` keeps quotes as part of the value.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | One key required | Enables Anthropic Claude. |
| `GEMINI_API_KEY` | One key required | Enables Google Gemini. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Also accepted for Google Gemini; used only when `GEMINI_API_KEY` is empty. |
| `DEEPSEEK_API_KEY` | One key required | Enables DeepSeek. |
| `LLM_PROVIDER` | No | Preferred default provider: `gemini`, `deepseek` or `anthropic`. Ignored (with a warning) if unknown or its key is missing. |
| `LLM_MODEL` | No | Default model for the default provider; added to that provider's model list if not already in it. |
| `ANTHROPIC_MODELS` | No | Comma-separated model IDs that replace the Anthropic Claude list (first entry = default). |
| `GEMINI_MODELS` | No | Comma-separated model IDs that replace the Google Gemini list (first entry = default). |
| `DEEPSEEK_MODELS` | No | Comma-separated model IDs that replace the DeepSeek list (first entry = default). |

"One key required" means at least one of the provider keys must be set.

## How provider selection works

- Any one API key is enough to run the app.
- Set several keys and a provider selector appears in the UI. Every provider has a model selector.
- The default provider is the first available in the order gemini → deepseek → anthropic, unless `LLM_PROVIDER` is set.
- Built-in model IDs per provider (first = default):

  | Provider | Default | Model IDs |
  | --- | --- | --- |
  | Google Gemini (`gemini`) | `gemini-3.8-flash` | `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-4-argon` |
  | DeepSeek (`deepseek`) | `deepseek-flash` | `deepseek-flash`, `deepseek-v4-pro` |
  | Anthropic Claude (`anthropic`) | `claude-sonnet-5-5` | `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5` |

- `ANTHROPIC_MODELS`, `GEMINI_MODELS` and `DEEPSEEK_MODELS` replace a provider's list; the first entry becomes its default.
- Keys are read on the server at request time. They are never sent to the browser and never baked into the Docker image.

## Scripts

- `npm run dev` — start the development server.
- `npm run build` — create a production build (standalone output).
- `npm run start` — serve the production build.
- `npm run lint` — run ESLint.
- `npm run typecheck` — type-check with `tsc --noEmit`.
- `npm test` — run the Vitest suite once.
