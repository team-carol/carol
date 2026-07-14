# Achievement event model (approved)

## Canonical product behavior

`achievement_play_event_log` is the canonical raw play timeline. It is additive
and deliberately separate from the experimental `achievement_events` and
`achievement_play_events` tables; neither is altered, dropped, or used by the
new flow. A live row requires the stable DX NET `detailIdx` source play ID.

The event key is `SHA-256("achievement-play-event-log" || profile_key || detailIdx)`
(with unit separators). Identity contains no chart, timestamp,
capture time, or payload. The event-log table stores `event_key`, profile/source ID,
`is_baseline`, `played_at`, source sequence, capture time, raw achievement,
FC/sync, nullable `rating_up`, display fields, `record_json`, and payload hash.
It intentionally has **no `play_day` column**. Timeline indexes support
`profile_key,is_baseline,played_at` and source-ID lookup.

`achievement_play_event_log_state(profile_key, initialized_at)` is the explicit
canonical-cutover marker. Its absence means the next complete valid history
batch is initialization. Every row in that first batch is `is_baseline=1` and
the marker is committed in the same transaction. A later complete batch adds
unseen IDs as `is_baseline=0`; duplicate IDs are immutable except that a null
stored `rating_up` may be filled once. Validation happens for the whole batch
before writes: it must be nonempty, have unique nonempty detail IDs, and have
valid parsed source timestamps. Failure rolls back all inserts and never marks
initialization. Existing legacy metadata does not influence this decision.

## Sync and `/성과`

After profile payload validation/cache, `/sync` submits the enriched history as
one event-log transaction. The first successful response is `initialized` (`init` in
the product terminology): the visible rolling playlog establishes the baseline;
subsequent syncs collect new plays. Later responses are `ok`. Bookmarklet UI
explicitly explains this lifecycle. Legacy daily tables remain for pre-cutover
fallback and rollback, but are not written as canonical data by this flow.

With no marker, `/성과` retains its legacy reader. With a marker, it queries
only event-log non-baseline rows in `[05:00 KST, next 05:00 KST)`, newest first. The
UTC bounds are the requested day at 20:00 UTC through the following 20:00 UTC.
Every raw event is returned: no score-improvement test, mark test, chart
collapse, persisted day, or legacy fallback. Empty canonical results stay
empty. Raw FC/sync/rating-up values are retained. The canonical path does not
fabricate a percentage gain; its display is event/timeline semantics.

## SQLite rollout

1. Deploy additive event-log schema, state marker, atomic batch writer, and marker-gated
   reader.
2. Existing profiles initialize from their next complete sync, regardless of
   `daily_achievement_snapshots` or `achievement_initialized_at`.
3. Shadow-check counts and 05:00-boundary results while legacy fallback remains
   available only for profiles without a marker.
4. Keep old tables during the rollback window; do not backfill them into the event log
   without an explicit complete source-ID policy.

## PostgreSQL migration

PostgreSQL is not a synchronous adapter swap. First introduce an async
repository boundary, migrate callers, and use a maintenance window (or an
explicit dual-run). The local verifier serializes a consistent SQLite snapshot
as a protected base64-encoded JSON document and sends it to `psql` over stdin;
it does not put serialized data in process arguments or repository files. Each
profile/session row is preserved as a full-column JSON object, while event
`record_json` is transported as UTF-8 bytes encoded inside the document. Import
into PostgreSQL staging tables, then reconcile exact event-key set,
counts, full-row checksums, payload checksums, and a representative 05:00 time-range query before
building indexes and switching repositories. Keep the SQLite snapshot for
rollback. The verifier includes profiles, sessions, catalog baselines/state, and
event-log rows/state; legacy daily tables are excluded. Import must remain idempotent
by `event_key` and must never regenerate identity from capture time.
This command verifies migration staging only; the runtime repository remains
SQLite and no PostgreSQL runtime adapter is shipped here.

### Phase-1 PostgreSQL rehearsal

The non-destructive rehearsal is build-integrated but is not a runtime cutover:

```sh
POSTGRES_REHEARSAL=1 \
DATABASE_URL='postgres://postgres:test@127.0.0.1:5432/postgres' \
SQLITE_PATH=/path/to/maimai.db \
npm run db:rehearse-postgres
```

`SQLITE_PATH` defaults to `DATA_DIR/maimai.db`. `POSTGRES_REHEARSAL=1` and an
explicit `DATABASE_URL` are required. The command creates a dedicated
`rehearsal_*` schema, refuses a non-empty schema, snapshots SQLite with
better-sqlite3 backup semantics, discovers every user table, preserves typed
per-table copies plus a deterministic row-preservation manifest, and verifies
counts/checksums before commit. The schema is removed afterward unless
`KEEP_REHEARSAL_SCHEMA=1`; it never promotes, drops, or rewrites a supplied
production schema. A temporary local target can be started with:

```sh
docker run --rm --name carol-postgres-rehearsal \
  -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16
```

The later phase must introduce an async repository boundary and an explicit
maintenance-window cutover; this rehearsal does not perform that conversion.

Run the local verification with:

```sh
npm run verify:achievement-postgres
```

It exports the migration targets, starts a temporary `postgres:16` container,
imports through protected stdin with `psql`, and reconciles full-row checksums,
counts, and a representative range.
When Docker/image access is unavailable it exits safely with an explicit
`SKIP` reason.

## Catalog baselines and staged synchronization

`chart_record_baselines` is a separate observed catalog state, not an event
source. Its identity is `(profile_key, score_locator, diff)`: `score_locator`
is the opaque `input[name=idx]` from an authenticated `musicSort/search` score
list and is deliberately distinct from playlog `detailIdx`, jacket/music IDs,
and any static song registry. It stores title, level, kind, achievement value
and text, FC/sync, `observed_at`, `changed_at`, source HTML/hash; it has no
`played_at` or `play_day`. `chart_record_baseline_state` records the complete
five-page capture timestamp, row count, and page manifest. A complete 0..4
crawl is parsed and validated before one transaction; unchanged rows only move
`observed_at`, changed state moves `changed_at`, and missing rows remain.

Core `/sync` persists the profile and raw dated event-log plays independently.
It returns the existing plain `initialized`/`ok` body plus
`x-carol-catalog: required|not_due`. When required, the bookmarklet serially
fetches the five authenticated score lists with pacing and posts them to
`POST /sync/catalog`; catalog failure warns without changing core success.
Older bookmarklets continue to use core `/sync` only. The catalog baseline never
appears in `/성과`; only post-baseline event-log plays do. No achievement date is
inferred from `musicDetail` (its date is a last-play observation). The known
limitation is that catalog collection is observed current state, not a dated
history, and score-list discovery does not provide a static new-song registry.

Migration exports/imports `profiles`, `sessions`, catalog baseline rows/state,
and event-log rows/state. Legacy daily snapshot tables are excluded and must never
be seeded into the event log by this model. Sensitive session data stays inside protected
temporary artifacts and is never printed.
