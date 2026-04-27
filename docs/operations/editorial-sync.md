# Syncing Editorial Data — Local → Staging / Production

Sync editorial station decisions (status, featured, taxonomy tags, custom fields, editorial review, internal notes)
from your local database to staging or production.

## Prerequisites

- `psql` installed locally
- `az` CLI installed and logged in (`az login`)
- Local DB running with up-to-date data

---

## Step 1 — (Optional) Touch timestamps

The sync script only imports stations where `last_editor_action_at IS NOT NULL`, and only
overwrites a row on the target if the source timestamp is **newer** than what's already there.

If you've made schema-level changes (e.g. updated taxonomy tags or editorial notes on existing stations without going
through the admin UI), bump the timestamps first so the import treats them as updated:

```bash
psql "postgres://postgres:postgres@localhost:5432/ostgut?sslmode=disable" \
  -c "UPDATE stations SET last_editor_action_at = NOW(), updated_at = NOW() WHERE last_editor_action_at IS NOT NULL;"
```

Skip this step if you made changes through the admin UI — those already set `last_editor_action_at`.

---

## Step 2 — Export

```bash
./scripts/sync-editorial.sh --export \
  "postgres://postgres:postgres@localhost:5432/ostgut?sslmode=disable" \
  ./local-export.sql
```

The script prints how many stations were exported. If it prints `0`, check Step 1.

---

## Step 3 — Upload to Azure Blob Storage

Upload the export to the target environment's storage account:

```bash
# Upload to staging storage
./scripts/sync-editorial.sh --upload staging ./local-export.sql

# Upload to production storage
./scripts/sync-editorial.sh --upload production ./local-export.sql
```

The script prints the blob path, e.g.:

```
Uploaded: staging/2026-04-20T123456Z.sql
Storage:  stostgutstaging<suffix>/editorial-syncs
```

Copy the blob path — you'll need it in the next step.

---

## Step 4 — Trigger the import workflow

Go to **Actions → Sync Editorial Stations → Run workflow** and set:

| Field | Value |
|---|---|
| `mode` | `local-import` |
| `target` | `staging` or `production` |
| `storage_env` | environment you uploaded to in Step 3 |
| `blob_path` | path printed in Step 3 (e.g. `staging/2026-04-20T123456Z.sql`) |
| `dry_run` | `true` to preview, `false` to apply |

Run with `dry_run: true` first to verify the SQL before applying.

The export/import payload now includes:

- `genre_tags`, `subgenre_tags`, and derived `search_tags`
- `style_tags`, `format_tags`, and `texture_tags`
- `editorial_review` and `internal_notes`
- stream metadata routing fields such as `metadata_source`, `metadata_url`, `metadata_resolver`, `metadata_delayed`, `metadata_provider`, and `metadata_provider_config`

---

## Full example (local → staging)

```bash
# 1. Touch timestamps (if needed)
psql "postgres://postgres:postgres@localhost:5432/ostgut?sslmode=disable" \
  -c "UPDATE stations SET last_editor_action_at = NOW(), updated_at = NOW() WHERE last_editor_action_at IS NOT NULL;"

# 2. Export
./scripts/sync-editorial.sh --export \
  "postgres://postgres:postgres@localhost:5432/ostgut?sslmode=disable" \
  ./local-export.sql

# 3. Upload
./scripts/sync-editorial.sh --upload staging ./local-export.sql
# → copy the printed blob path

# 4. Trigger workflow in GitHub Actions
#    mode=local-import, target=staging, storage_env=staging, blob_path=<copied path>
```
