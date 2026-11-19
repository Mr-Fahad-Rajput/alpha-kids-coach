# Alpha Kids Coach

A parent types a concern in English or Urdu; an LLM coach replies with a short, safe plan and a check-in, and escalates emergencies, abuse and self-harm.


**Docker image:** `docker pull mrfahadrajput/alpha-kids-coach`

## Quick start (local)

Requires Node 24+.

```bash
cp .env.example .env.local   # then add at least one provider key
npm ci
npm run dev
```

Open http://localhost:3000.

## Quick start (Docker)

Build and run locally:

```bash
docker build -t alpha-kids-coach .
docker run --rm -p 3000:3000 --env-file .env.local alpha-kids-coach
```

Or pull the published image and run it:

```bash
docker run --rm -p 3000:3000 --env-file .env.local mrfahadrajput/alpha-kids-coach
```

Or with Compose:

```bash
docker compose up --build
```

Write values in `.env.local` without quotes: `docker --env-file` keeps quotes as part of the value.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | One provider required | Enables Google Gemini. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Also accepted for Google Gemini; used only when `GEMINI_API_KEY` is empty. |
| `DEEPSEEK_API_KEY` | One provider required | Enables DeepSeek. |
| `ANTHROPIC_API_KEY` | One provider required | Enables Anthropic Claude. |
| `OPENAI_API_KEY` | One provider required | Enables OpenAI. |
| `OPENAI_COMPATIBLE_BASE_URL` | One provider required | Base URL of an OpenAI-compatible endpoint. The provider is enabled when this and `OPENAI_COMPATIBLE_MODELS` are set. |
| `OPENAI_COMPATIBLE_MODELS` | With base URL | Comma-separated model IDs for the OpenAI-compatible endpoint (first entry = default). |
| `OPENAI_COMPATIBLE_API_KEY` | No | API key for the OpenAI-compatible endpoint (not needed for e.g. a local Ollama). |
| `OPENAI_COMPATIBLE_NAME` | No | Display name for the OpenAI-compatible provider (default "OpenAI-compatible"). |
| `LLM_PROVIDER` | No | Preferred default provider: `gemini`, `deepseek`, `anthropic`, `openai` or `openai-compatible`. Ignored (with a warning) if unknown or not configured. |
| `LLM_MODEL` | No | Default model for the default provider; added to that provider's model list if not already in it. |
| `GEMINI_MODELS` | No | Comma-separated model IDs that replace the Google Gemini list (first entry = default). |
| `DEEPSEEK_MODELS` | No | Comma-separated model IDs that replace the DeepSeek list (first entry = default). |
| `ANTHROPIC_MODELS` | No | Comma-separated model IDs that replace the Anthropic Claude list (first entry = default). |
| `OPENAI_MODELS` | No | Comma-separated model IDs that replace the OpenAI list (first entry = default). |
| `RATE_LIMIT_MAX` | No | Max `/api/coach` requests per 10 minutes per bucket (default 30). |
| `TRUST_PROXY` | No | Set to `1` behind a trusted reverse proxy to rate-limit per client IP (`X-Forwarded-For` / `X-Real-IP`). Otherwise all clients share one bucket. |
| `VERCEL` | No | Set to `1` automatically by Vercel; enables per-IP rate limiting like `TRUST_PROXY=1`. |
| `RESPONSE_CACHE_TTL_SECONDS` | No | Lifetime of in-memory response-cache entries (default 600; `0` disables the cache). |
| `HISTORY_CHAR_BUDGET` | No | Max characters of conversation history sent to the model (default 6000); oldest turns are dropped first. |
| `EVAL_BASE_URL` | No | `npm run eval` only: base URL of the running app (default `http://localhost:3000`). |
| `EVAL_PROVIDER` | No | `npm run eval` only: provider to request. |
| `EVAL_MODEL` | No | `npm run eval` only: model to request. |
| `EVAL_USE_CACHE` | No | `npm run eval` only: set to `1` to allow response-cache hits (bypassed by default). |

"One provider required" means at least one provider must be configured.

## How provider selection works

- One configured provider is enough to run the app.
- Configure several and a provider selector appears in the UI (the model pill in the header). Every provider has a model selector. A green dot marks a healthy provider; amber means it recently failed and requests are currently falling back. If the default provider is unhealthy, the first healthy one is preselected.
- The default provider is the first available in the order gemini → deepseek → anthropic → openai → openai-compatible, unless `LLM_PROVIDER` is set.
- Built-in model IDs per provider (first = default):

  | Provider | Default | Model IDs |
  | --- | --- | --- |
  | Google Gemini (`gemini`) | `gemini-3.8-flash` | `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-4-argon` |
  | DeepSeek (`deepseek`) | `deepseek-flash` | `deepseek-flash`, `deepseek-v4-pro` |
  | Anthropic Claude (`anthropic`) | `claude-sonnet-5-5` | `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5` |
  | OpenAI (`openai`) | `gpt-6-luna` | `gpt-6-luna`, `gpt-6.2-sol`, `gpt-6.2-astra` |

- `GEMINI_MODELS`, `DEEPSEEK_MODELS`, `ANTHROPIC_MODELS` and `OPENAI_MODELS` replace a provider's list; the first entry becomes its default.
- **OpenAI-compatible** endpoints (Llama, Mistral, Qwen and others) have no built-in list: set `OPENAI_COMPATIBLE_BASE_URL` and `OPENAI_COMPATIBLE_MODELS`, plus `OPENAI_COMPATIBLE_API_KEY` if the endpoint needs one. Example base URLs:

  | Service | `OPENAI_COMPATIBLE_BASE_URL` |
  | --- | --- |
  | OpenRouter | `https://openrouter.ai/api/v1` |
  | Groq | `https://api.groq.com/openai/v1` |
  | Together | `https://api.together.xyz/v1` |
  | Ollama (local) | `http://localhost:11434/v1` (from Docker: `http://host.docker.internal:11434/v1`) |

- **Fallback:** if the chosen provider fails (API, auth, billing, quota, 5xx or network error), the server tries the other configured providers in default order, at most 2 extra attempts, each with its default model. A failed provider is marked unhealthy in memory for 60 s and skipped meanwhile. The response reports the provider and model actually used, plus `fallbackFrom`; the UI shows "fell back from …" under the reply.
- Thinking is kept to the lowest setting each provider allows. Claude models can't fully switch it off, so Anthropic calls use `effort: "low"` and a larger output budget (2000 tokens) so replies are never empty. No sampling parameters (temperature, topP, topK) are sent.
- Keys are read on the server at request time. They are never sent to the browser and never baked into the Docker image.

## Safety design

Every message goes through four layers in `POST /api/coach`:

1. **Deterministic pre-check** (`src/lib/safety/precheck.ts`). Before any LLM call, the latest message is matched against crisis patterns in English and Urdu (self-harm, suicidal thoughts, abuse, poisoning, unconsciousness, weapons). A hit returns the escalation card straight away: no LLM call, no API key needed, no rate limit.
2. **LLM classification inside one structured call.** The model returns a schema-validated object (`category`, `summary`, `steps`, `checkIn`, `notice`) and classifies the message as everyday, medical, legal, developmental, crisis or off-topic. This catches crises that have no keywords (for example, a child giving away belongings). The system prompt forbids doses, medicine names, legal instruction and diagnostic labels, and tells the model to ignore attempts to change its rules.
3. **Server-side rule enforcement** (`src/lib/coach/enforce.ts`). The server, not the model, decides the final shape: crisis → escalation template (generated text discarded); medical, legal and developmental → redirect with a professional notice (a default notice if the model left it empty); everyday → at most 5 steps plus a check-in (a default if missing); off-topic → no steps. Invalid output is retried once, then the app replies with a safe "unavailable" message.
4. **Templated escalation** (`src/lib/safety/escalation.ts`). Escalation copy is written by hand in English and Urdu, never generated: get to safety, call now, stay with the child, emergency numbers, and an invitation to come back once everyone is safe. No steps.

Escalation works even when every LLM is down: the pre-check needs no provider, and when all providers fail the "unavailable" reply still shows "If this is an emergency…" with the numbers.

The reply language is detected deterministically (`src/lib/safety/language.ts`) and the model is told to answer in that language; Urdu replies render right-to-left in a Nastaliq font.

## Token, latency and cost optimisations

- **Deterministic safety pre-check:** crisis messages get the templated escalation with 0 tokens and no network call.
- **Stable prompt prefix:** the system prompt (rules + 4 few-shot examples) is byte-identical for every request; the reply language goes on a final line after the history, so OpenAI, DeepSeek and Gemini can reuse the cached prefix, and Anthropic gets an explicit `cacheControl: ephemeral` breakpoint on the system prompt.
- **Response cache:** first-turn, non-crisis replies are cached in memory (LRU, 200 entries, `RESPONSE_CACHE_TTL_SECONDS`) under a SHA-256 key of normalized text + language + provider + model; identical concurrent requests share one LLM call; nothing is written to disk and message text is never logged.
- **Context budget:** at most the last 12 messages and `HISTORY_CHAR_BUDGET` characters, oldest dropped first; earlier coach replies are sent compressed as summary + steps.
- **Capped output, lowest reasoning:** fixed `maxOutputTokens` per provider and the lowest reasoning/thinking setting each provider allows.
- **Unhealthy-provider skip:** a failed provider is skipped for 60 s, so fallbacks don't wait on a dead endpoint.
- **Telemetry:** every reply carries `meta` (source, latency, input/output/cached tokens from the provider's usage data, provider, model); `GET /api/stats` returns in-memory totals; the header's "Under the hood" toggle shows both in the UI.

## Emergency numbers

Verified 2026-11-19 (`src/lib/safety/numbers.ts`).

| Country | Service | Number |
| --- | --- | --- |
| Pakistan | Police | 15 |
| Pakistan | Rescue / ambulance | 1122 |
| Pakistan | Edhi ambulance | 115 |
| Pakistan | Child protection | 1121 |
| India | Emergency | 112 |
| India | Tele-MANAS mental health | 14416 |
| India | Childline | 1098 |
| UAE | Police | 999 |
| UAE | Ambulance | 998 |
| UAE | Child protection (Ministry of Interior) | 116111 |

Elsewhere: call your local emergency number.

Sources:
- Pakistan: https://pcsw.punjab.gov.pk/node/44 (1121 was declared by PTA for child protection agencies)
- India: https://depwd.gov.in/en/others-helplines/
- UAE: https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-emergencies

## Evaluation

`evals/cases.json` holds 37 cases in English and Urdu: everyday, medical, legal, developmental, crisis (including one with no crisis keywords), prompt injection, off-topic, mixed language and a multi-turn conversation.

```bash
RATE_LIMIT_MAX=200 npm run dev     # terminal 1 (or npm run build && RATE_LIMIT_MAX=200 npm start)
npm run eval                       # terminal 2
```

The runner posts each case to `${EVAL_BASE_URL:-http://localhost:3000}/api/coach` (optionally pinned with `EVAL_PROVIDER` / `EVAL_MODEL`). Multi-turn cases send the turns in order, with the real replies in between. It checks:

- response type (plan / redirect / escalation) and reply language
- at most `maxSteps` steps, and no steps on escalations
- check-in and professional notice when expected
- emergency numbers on escalations
- `mustNot` patterns (for example doses like `5 ml` or "your child has ADHD"), case-insensitive

The response cache is bypassed (`x-cache-bypass: 1`) unless `EVAL_USE_CACHE=1`. At the end the runner prints LLM replies, cache hits, pre-check hits, input/output/cached tokens and average latency, all from each reply's `meta`.

Cases marked `soft` are reported but never fail the run. The runner prints a table (id | expected | got | pass | provider) and a per-category summary, writes `evals/results/latest.json` (gitignored), and exits 1 on any hard failure. Set `RATE_LIMIT_MAX=200` on the server so the run isn't rate limited.

Unit tests (`npm test`) need no network: they cover language detection and the pre-check on every case, the escalation templates, rule enforcement, provider fallback and the provider registry.

## Deploy

**Vercel:** import the repository in Vercel, add at least one provider key (for example `GEMINI_API_KEY`) under Environment Variables, and deploy. Vercel sets `VERCEL=1`, which turns on per-IP rate limiting.

**Docker:** build or pull the image and pass keys only at runtime:

```bash
docker build -t alpha-kids-coach .
docker run -d --restart unless-stopped -p 3000:3000 --env-file .env.local alpha-kids-coach
```

Behind a reverse proxy that sets `X-Forwarded-For`, add `-e TRUST_PROXY=1`. `GET /api/health` is the health check (used by the image's `HEALTHCHECK`).

## Scripts

- `npm run dev` — start the development server.
- `npm run build` — create a production build (standalone output).
- `npm run start` — serve the production build.
- `npm run lint` — run ESLint.
- `npm run typecheck` — type-check with `tsc --noEmit`.
- `npm test` — run the Vitest suite once.
- `npm run eval` — run the live eval cases against a running app.
