# Media Upload Pipeline

## Purpose

Every uploaded file passes through a **deterministic, multi-stage pipeline**
before it is stored. This prevents:

- Remote Code Execution (RCE) via crafted images
- Polyglot files (valid image + embedded script)
- MIME spoofing (`.exe` renamed to `.jpg`)
- Decompression bombs (small file, huge decoded bitmap)
- EXIF privacy leaks (GPS coordinates)
- Path traversal in storage
- DoS via unbounded uploads
- Stored XSS via SVG

## Pipeline stages

```text
Client POST (multipart/form-data)
    │
    ▼
┌─────────────────────────────────────────────┐
│ 1. Streaming intake (busboy)                │
│    - Hard cap on total bytes (5 MB)         │
│    - Hard cap on number of parts (10)       │
│    - Hard cap on number of files (1)        │
│    - Hard cap on field sizes                │
│    - Reject extra fields                    │
└─────────────────────────────────────────────┘
    │  Buffer (≤ 5 MB)
    ▼
┌─────────────────────────────────────────────┐
│ 2. Magic-byte detection (src/utils/imageType.js) │
│    - Read first bytes of buffer             │
│    - Accept only: jpeg, png, webp, gif      │
│    - Reject: svg, pdf, exe, zip, everything │
│    - Ignore the client's Content-Type       │
└─────────────────────────────────────────────┘
    │  { ext, mime }
    ▼
┌─────────────────────────────────────────────┐
│ 3. Decode + re-encode (sharp)               │
│    - sharp(buf).metadata() → width/height   │
│    - Reject if width > 4000 or height > 4000│
│    - sharp(buf).rotate().resize(...).webp() │
│    - EXIF stripped automatically            │
│    - Output: brand-new WebP buffer          │
└─────────────────────────────────────────────┘
    │  { buffer, width, height, mime: image/webp }
    ▼
┌─────────────────────────────────────────────┐
│ 4. Storage (src/media/storage.js)           │
│    - SHA-256 of final buffer                │
│    - Path = <root>/<ab>/<cd>/<sha256>.<ext> │
│    - Write atomically (tmp + rename)        │
│    - Never trust original_name              │
└─────────────────────────────────────────────┘
    │  { storagePath, sha256, sizeBytes }
    ▼
┌─────────────────────────────────────────────┐
│ 5. DB insert (media.model.js)               │
│    - Row: user_id, post_id, kind, mime,     │
│      size, width, height, storage_path,     │
│      sha256, original_name (display only)   │
└─────────────────────────────────────────────┘
    │
    ▼
201 { id, url, width, height }

```

## Why re-encode?

Re-encoding with `sharp` writes a **brand-new file** from raw pixel data. Any
appended bytes, EXIF tricks, or polyglot payloads are destroyed. This is the
single most important security measure in the pipeline.

Consider a JPEG file that is:

```text
[valid JPEG bytes] [PHP webshell] [valid JPEG trailer]

```

A naive app that only checks magic bytes would accept it. If the file is ever
served with a PHP handler (misconfiguration, or moved to another server), the
webshell executes. By decoding to raw pixels and re-encoding, we produce a
clean file containing only the visible image.

## Why not trust Content-Type?

The client sends `Content-Type: image/jpeg` for any file. Attackers rename
`shell.php` to `shell.jpg` and set the header. Only magic bytes reveal the
truth, and only a full decode confirms it. For the CVE that motivated removing file-type@16, see SECURITY.md → Accepted Risks / Resolved.

## Why a custom magic-byte detector (not file-type)?

`file-type@16` was originally used, but it is affected by **CVE-2026-31808** (infinite loop in the ASF parser on malformed 55-byte input — a DoS vector). Upgrading to v22 requires migrating the codebase to ESM (v17+ are ESM-only), which is incompatible with our CommonJS setup.

Since we only accept 4 formats (JPEG, PNG, WebP, GIF), a 50-line magic-byte checker (`src/utils/imageType.js`) is:

- **Faster** (~10x)
- **Safer** (no parser = no parser CVEs)

- **Simpler to audit**

See `docs/SECURITY.md` → "Accepted Risks" for the full decision record.

## Why WebP?

- Smaller files than JPEG/PNG at similar quality.
- Widely supported (all modern browsers).
- Configurable via `MEDIA_OUTPUT_FORMAT`.

## Why SHA-256 in the path?

- Deduplication: identical uploads map to one file.
- Integrity: verifiable on backup/restore.
- Path safety: hex only — no `../`, no shell metacharacters.
- Deterministic: the same bytes always produce the same path.

## Directory sharding

`<root>/ab/cd/abc...webp` — first 4 hex chars as two 2-char directories.
Prevents a single directory with millions of entries on large deployments.
Theoretically, 16^4 = 65,536 shard directories, each with a manageable number
of files even at millions of uploads.

## Limits enforced

| Limit | Default | Configurable | Enforced by |
| --- | --- | --- | --- |
| Max file size | 5 MB | `MEDIA_MAX_FILE_BYTES` | busboy streaming |
| Max files per request | 1 | hard-coded | busboy |
| Max fields per request | 5 | hard-coded | busboy |
| Max parts per request | 10 | hard-coded | busboy |
| Max decoded width | 4000 | `MEDIA_MAX_WIDTH` | sharp metadata |
| Max decoded height | 4000 | `MEDIA_MAX_HEIGHT` | sharp metadata |
| Output resize cap (W) | 1920 | `MEDIA_RESIZE_MAX_WIDTH` | sharp resize |
| Output resize cap (H) | 1920 | `MEDIA_RESIZE_MAX_HEIGHT` | sharp resize |
| Output format | webp | `MEDIA_OUTPUT_FORMAT` | sharp |
| Output quality | 85 | `MEDIA_OUTPUT_QUALITY` | sharp |
| Per-user quota | 200 | `MEDIA_MAX_PER_USER` | media.model count |
| Upload rate | 20/min | hard-coded | express-rate-limit |

## Error responses

| Condition | Status | Message |
| --- | --- | --- |
| Wrong Content-Type | 415 | Expected multipart/form-data |
| No file provided | 400 | No file provided |
| File too large (during stream) | 413 | File too large |
| Too many files | 400 | Too many files |
| Too many fields | 400 | Too many fields |
| Magic bytes not allowed | 415 | Unsupported file type. Allowed: JPEG, PNG, WebP, GIF. |
| Corrupted image | 400 | Invalid or corrupted image |
| Dimensions exceed limit | 413 | Image too large. Max 4000x4000. |
| Post not found | 404 | Post not found |
| Not post owner | 403 | You can only attach media to your own posts |
| Quota exceeded | 429 | Media quota exceeded |

## Lifecycle

### Upload

1. Authenticated user POSTs a file to `/api/posts/:postId/media`.
2. Middleware chain: `requireAuth` → `uploadLimiter` → `mediaUploadGuard` → controller.
3. Controller verifies post exists and belongs to user, quota not exceeded.
4. `handleUpload(req)` runs the full pipeline.
5. Row inserted in `media`, response returned with `{ id, url, width, height }`.

### Serve

1. Public `GET /api/media/:id`.
2. Look up row, resolve absolute path, verify file exists.
3. Stream with `Content-Type` from DB and `nosniff` header.
4. `Cache-Control: public, max-age=31536000, immutable`.

### Delete

1. Authenticated owner `DELETE /api/media/:id`.
2. Verify `media.user_id === req.user.id`.
3. Delete DB row + delete file (ENOENT tolerated).

### Cascade

- Deleting a post deletes its `media` rows (SQLite `ON DELETE CASCADE`).
- Deleting a user deletes their `media` rows.
- Orphan files (no DB row) can be cleaned via `npm run media:cleanup`.

## Files involved

| File | Role |
| --- | --- |
| `src/media/upload.js` | busboy streaming intake |
| `src/media/detect.js` | magic-byte allow-list |
| `src/media/process.js` | decode + re-encode |
| `src/media/storage.js` | SHA-256 + atomic write |
| `src/media/index.js` | unified entry point |
| `src/models/media.model.js` | DB CRUD |
| `src/controllers/media.controller.js` | HTTP layer |
| `src/routes/media.routes.js` | URL mapping |
| `src/middleware/mediaUpload.js` | Content-Type guard (415) |
| `scripts/cleanup-media.js` | orphan cleanup |
| `scripts/seed-demo-media.js` | demo image seeding |
| `tests/media.*.test.js` | 3 test suites |
