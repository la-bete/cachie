# Cachie

Cachie is a small search-token analytics service. Every search it receives is broken into phrases and indexed in an in-memory TTL cache, so you can later ask how often a phrase appeared, by exact or fuzzy (substring) match, broken down by client and session. Every request and response is validated against an OpenAPI spec, so the contract in `src/api.yml` is enforced rather than just documented.

## Tech stack

- Node.js
- Express
- express-openapi-validator
- express-rate-limit
- pino
- Jest

## How it works

- `POST /search` normalises the query (trimmed, lower-cased, whitespace collapsed) and indexes every contiguous run of words in it. `"The quick brown fox"` indexes `the`, `the quick`, `quick brown fox` and so on.
- Each indexed phrase records the full searches it appeared in exactly, plus the searches it fuzzy-matches: phrases where one contains the other as a substring, so `quick` also matches a search for `quickly moving`.
- The full search keeps a per-client count and the set of sessions it came from. Repeating the same search from the same client and session is a no-op.
- Cache entries expire `CACHE_TTL` seconds after they were last written. Expired entries are dropped when they are next read.
- `GET /analyse` looks up one or more phrases and returns match counts, client distribution and session counts, with optional totals across the whole result set.

## Getting started

```bash
git clone https://github.com/La-BeTe/cachie.git
cd cachie
npm install
npm start
```

The server listens on port `9000` by default. `npm run dev` runs it under nodemon.

Logs are pretty-printed with pino-pretty in development. With `NODE_ENV=production`, or when dev dependencies are not installed, they are written as plain JSON lines.

## Configuration

Settings come from environment variables. A `.env` file in the project root is loaded on startup.

| Variable               | Default | Purpose                                                                 |
| ---------------------- | ------- | ----------------------------------------------------------------------- |
| `PORT`                 | `9000`  | Port the server listens on                                              |
| `CACHE_TTL`            | `900`   | Lifetime of a cache entry, in seconds                                   |
| `RATE_LIMIT_MAX`       | `100`   | Requests allowed per client in one window                               |
| `RATE_LIMIT_WINDOW_MS` | `900`   | Length of the rate-limit window, **in seconds** despite the `_MS` name  |
| `LOG_LEVEL`            | `info`  | pino log level                                                          |
| `NODE_ENV`             | (unset) | `production` turns off pretty logging                                   |

```
PORT=9000
CACHE_TTL=900
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900
```

Rate limiting applies to `POST /search` only and is keyed on the `client_id` in the request body, not the caller's IP. Responses carry the standard `RateLimit-*` headers, and an exceeded limit returns `429`.

## API

The OpenAPI 3 spec lives in `src/api.yml` and is served as YAML at `GET /spec`. Requests that do not match it are rejected with `400`, and responses are checked against it too. Errors use the shape `{ "status": "error", "message": "..." }`. Unknown routes return `404`.

An `x-trace-id` header (or body or query field) is attached to the request logs. If none is sent, one is generated.

### POST /search

```json
{
	"search_query": "The quick brown fox jumps",
	"client_id": "client_123",
	"session_id": "session_1"
}
```

All three fields are required and must not be blank. Returns `201`:

```json
{
	"status": "ok",
	"processed_tokens": 5,
	"processing_time": "5ms"
}
```

`processed_tokens` is the number of words in the normalised query.

### GET /analyse

Query parameters:

- `analysis_token` (required): comma-separated phrases to look up, for example `the quick,lazy dog`. A phrase can be any run of words from a past search. Lookups are case-sensitive against the lower-cased index, so send phrases in lower case.
- `match_type` (required): `exact` or `fuzzy`. With `exact`, `fuzzy_matches` is always `0`.
- `include_stats` (optional, boolean): when `true`, the `stats` block is filled in. When omitted or `false`, `stats` is still returned but its counts are `0`; `processing_time` is always set.

Example:

```http
GET /analyse?analysis_token=the%20quick&match_type=fuzzy&include_stats=true
```

```json
{
	"results": {
		"the quick": {
			"exact_matches": 1,
			"fuzzy_matches": 2,
			"client_distribution": {
				"client_123": 2
			},
			"unique_sessions": 2
		}
	},
	"stats": {
		"unique_clients": 1,
		"unique_sessions": 2,
		"processing_time": "5ms",
		"total_searches_analyzed": 2
	}
}
```

A phrase that has never been searched (or has expired) comes back with zero counts rather than an error.

## Testing

```bash
npm test                 # all tests
npx jest tests/e2e.test.js
npx jest --coverage
```

The end-to-end tests import `src/app.js`, which starts listening on `PORT`, so make sure that port is free (or set `PORT`) before running them, for example `PORT=9100 npx jest --forceExit`.

## Limitations

- State lives in process memory. It is lost on restart and is not shared between instances.
- Indexing a search compares every new phrase against every key in the cache, so write cost grows with the size of the cache. This is fine for a single process with modest traffic, not for a large index.
- Expired entries are only removed when read, so phrases that are never looked up again stay in memory.
- Importing `src/app.js` starts the server, so the tests bind a real port and Jest does not exit on its own without `--forceExit`.

## Next steps

- Move the index to Redis (sorted sets per phrase) so it survives restarts and scales across instances.
- Replace the linear fuzzy-match scan with a proper substring or n-gram index.
- Periodically sweep expired entries.
- Split the Express app from the `listen` call so tests can run without binding a port.

## License

MIT. See [LICENSE](LICENSE).
