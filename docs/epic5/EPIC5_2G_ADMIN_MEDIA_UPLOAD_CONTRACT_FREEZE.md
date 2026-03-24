# EPIC 5.2G — Admin Media Upload Contract Freeze

## Status
- **Type:** Contract freeze (docs-only)
- **Date:** 2026-03-24
- **Audience:** Backend + Admin UI engineers
- **Goal:** Lock request/response contracts for admin media upload/attach flows before any provider-backed implementation.

## Scope Boundaries (Explicit)
This freeze defines **contract shape only** for admin media upload initiation and upload finalization/attachment.

In scope:
- Admin-only candidate endpoints for upload-init and upload-finalize/attach.
- Deterministic request/response envelopes.
- Allowed MIME policy and max file size policy.
- Canonical uploaded image metadata fields.
- Interaction contract with existing admin `replace-media` semantics.
- Error envelope expectations aligned with current runtime conventions.
- Idempotency/failure expectations for finalize.

Out of scope in this stage:
- Provider implementation.
- Signed URL provider wiring.
- Image transformation pipeline.
- Drag-and-drop UI.
- Thumbnail generation runtime.
- Frontend implementation.

---

## Candidate Endpoints (Admin-only)
All endpoints are under `/api/admin` and require existing admin authentication/authorization behavior.

### 1) Upload Init
`POST /api/admin/media/uploads/init`

Purpose:
- Request an upload slot/session for a single image file.
- Return provider-agnostic upload session metadata (contract only).

#### Request (JSON)
```json
{
  "filename": "amani-chair-main.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 734003,
  "sha256": "8f8d...optional-hex..."
}
```

#### Validation policy
- `mimeType` allowed values (freeze):
  - `image/jpeg`
  - `image/png`
  - `image/webp`
- `sizeBytes` max (freeze): **10_485_760** (10 MiB)
- `filename` is informational and must not be trusted for storage decisions.

#### Success response (200)
```json
{
  "data": {
    "upload": {
      "uploadId": "ul_01H...",
      "uploadUrl": "https://upload.example/...",
      "expiresAt": "2026-03-24T12:00:00.000Z",
      "headers": {
        "content-type": "image/jpeg"
      },
      "constraints": {
        "mimeType": "image/jpeg",
        "maxSizeBytes": 10485760
      }
    }
  }
}
```

Notes:
- `uploadId` is server-generated and stable for finalize.
- `uploadUrl` is opaque to client logic.
- `headers` are explicit and deterministic (empty object allowed).

### 2) Upload Finalize / Attach
`POST /api/admin/media/uploads/finalize`

Purpose:
- Confirm an uploaded object and return canonical media asset metadata usable by product media contracts.

#### Request (JSON)
```json
{
  "uploadId": "ul_01H...",
  "idempotencyKey": "adm-media-finalize-0001"
}
```

#### Success response (200)
```json
{
  "data": {
    "asset": {
      "assetId": "ast_01H...",
      "url": "https://cdn.example.com/products/amani-chair/main.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 734003,
      "width": 1600,
      "height": 1200,
      "checksumSha256": "8f8d...",
      "createdAt": "2026-03-24T12:00:10.000Z"
    }
  }
}
```

Idempotency/failure expectations:
- `idempotencyKey` is required for finalize.
- Repeating the same `(uploadId, idempotencyKey)` must return the same logical asset outcome.
- If upload is missing/expired/not completed, return deterministic not-found/invalid-state error via standard error envelope.

---

## Canonical Uploaded Image Metadata (this stage)
Minimum canonical fields returned by finalize:
- `assetId` (string)
- `url` (absolute URL)
- `mimeType` (one of allowed values)
- `sizeBytes` (integer)
- `width` (integer)
- `height` (integer)
- `checksumSha256` (string)
- `createdAt` (ISO-8601 string)

No extra provider internals are contractually exposed.

---

## Relation to Existing Product Media Contract
Existing admin product media contract is preserved:
```json
{
  "id": "media_001",
  "url": "https://cdn.example.com/products/amani-chair/main.jpg",
  "alt": "Amani Chair front view",
  "sortOrder": 0,
  "isPrimary": true,
  "kind": "image"
}
```

Attachment model in this freeze:
- Finalized `asset.url` is the source URL used when building product `media[]` entries.
- Product media `id` remains explicit contract data for `replace-media`; no placeholder IDs.
- `replace-media` remains deterministic and authoritative for final product media ordering (`sortOrder`) and primary selection.

---

## Replace-Media Interaction with Uploaded Assets
The upload flow does **not** mutate product media by itself.

Expected sequence:
1. `uploads/init`
2. Client uploads bytes to returned upload target.
3. `uploads/finalize` returns canonical `asset` metadata.
4. Existing `PUT /api/admin/products/:id/media` is called with explicit `media[]` entries using finalized `asset.url`.

This keeps product media write semantics unchanged and isolated.

---

## Error Envelope Expectations (Aligned with runtime conventions)
All failures use current error envelope style:
```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human-readable message",
    "details": [],
    "requestId": "..."
  }
}
```

Expected classes:
- Validation errors (400) for malformed payloads / invalid mime / oversize declarations.
- Auth/permission errors (401/403) per existing admin stack.
- Not found / invalid state (404/409) for unknown, expired, or already-consumed upload IDs.
- Internal dependency/runtime failures (5xx) via existing error conventions.

---

## Explicit Non-Goals (Freeze)
Not implemented or designed here:
- Storage provider adapters.
- Real signed URL generation.
- Virus scanning, transformations, thumbnail rendering.
- Client-side upload UX details.
- Bulk upload API design.
- Product-specific upload endpoint variants.

---

## Safest Recommended Next-Step Order
1. **Provider abstraction + config**
   - Define provider interface and environment/config validation.
2. **Runtime upload-init/finalize routes**
   - Implement contract exactly as frozen.
3. **Persistence integration**
   - Persist upload sessions/assets and idempotency records.
4. **Admin UI integration**
   - Wire UI to frozen contracts only after backend stability.
