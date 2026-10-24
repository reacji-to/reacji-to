# Integration payload, version 1

Every destination receives the same envelope. The background builds it from the verified browser sender and validated reaction; a page cannot provide its own URL, attachment bytes, attachment reference, or actor identity.

```json
{
  "version": 1,
  "id": "6bf02c83-971d-4238-a09b-479a27fd464f",
  "occurredAt": "2026-10-19T20:00:00.000Z",
  "source": { "url": "https://example.com/article#section", "title": "Article title" },
  "target": { "post": { "platform": "x", "id": "123456789" } },
  "reaction": { "emoji": "🚀", "destination": "raycast", "operation": "set" },
  "context": {
    "quote": "A selected passage",
    "selection": {
      "exact": "A selected passage",
      "prefix": "Before: ",
      "suffix": ". After.",
      "start": 8,
      "end": 26
    }
  },
  "attachments": [{
    "id": "187c084e-1c41-4b89-a1e2-c2941a43ac49",
    "backend": "https://reacji.to",
    "destination": "raycast",
    "kind": "screenshot",
    "access": "private",
    "mediaType": "image/png",
    "bytes": 153024,
    "width": 1440,
    "height": 900,
    "capturedAt": "2026-10-19T19:59:59.000Z"
  }]
}
```

`source.url` is the exact current browser URL, including its fragment. `target.post` is the canonical reaction identity; webpage targets use a URL hash. A page placement also adds `target.placement` with its UUID, DOM selector, tag, short anchor quote, point coordinates, and placement mode. The selected span lives in `context.selection`, avoiding a second copy inside the payload's placement.

The operation is `add`, `set`, `move`, or `remove`. Social post reactions use `add` and an emoji-specific `remove`; each changes only that emoji in the person’s set. A legacy `set` replaces the set, and a `remove` with a null emoji clears it. Page placements keep the existing single-reaction behavior. The destination is the resolved registry ID. Explicit integration selection wins over automatic emoji rules. Selecting Public or Private can still route a matching rule to another integration. Local actions never run on reading, moving, or removing a reaction.

## Text selection

Hold Option (Alt on Windows/Linux) and drag the eyes over visible text. The picker previews the selection; saving highlights the span. `exact` is at most 4,000 UTF-16 code units. `prefix` and `suffix` hold up to 64 code units each; `start` and `end` are offsets in the anchor's eligible text nodes. Offsets are used first, then a unique quote-and-context match. Ambiguous matches remain unhighlighted. Inputs, editable content, hidden text, and spans crossing protected controls are excluded.

Public selection text is public; Private selection text follows private repository access; Slack receives the selected excerpt; Raycast receives the payload locally. The normal context quote is capped at 1,500 code units and the title at 200.

## Private screenshot attachment

Screenshots are off by default and selected separately for each reaction. Enable screenshot access in extension Settings first. Capture requires the main frame, the originating tab still active in the focused window, and an unchanged browser-reported URL before and after capture. The extension hides its picker and pins during capture. It captures only the visible viewport, including any visible form fields; it does not scroll or stitch a full page.

The screenshot is temporarily held in the background for up to two minutes. Saving uploads it to the backend selected in Settings, then delivers the payload. A failed upload stops the reaction/action. Delivery retries reuse the same captured file, not a new screenshot. An uploaded file remains private if delivery fails and can be deleted in Settings.

The default storage adapter is `AttachmentAccount`, a per-account Durable Object on the configured Worker. It stores PNG chunks and metadata transactionally. Up to 100 files or 50 MB per account are retained until explicitly deleted; each file is at most 4 MB. This is private access control, not end-to-end encryption: the selected Worker operator can access stored files. Screenshot bytes and references never enter public GitHub reaction documents or Slack messages.

The reference contains no token, public URL, or signed download capability. `backend` identifies the selected origin; `id` is an opaque file identifier. All file operations require the owner's GitHub bearer token, verified independently on every request:

| POST endpoint | JSON body | Result |
| --- | --- | --- |
| `/v1/attachments/create` | `{reference, data}` (PNG base64) | Validated private reference |
| `/v1/attachments/read` | `{id}` | `{reference, data}` |
| `/v1/attachments/list` | `{}` | `{files: [...]}` |
| `/v1/attachments/delete` | `{id}` | `{deleted: true}` |

A command can receive the reference without receiving credentials. To retrieve it, it needs its own authorized access to that backend; the extension does not place the GitHub token in a Raycast deeplink. Users can also view or delete files in extension Settings. Switching backends leaves files on the previous backend.

The Worker changes and the v3 `ATTACHMENTS` binding/migration must be deployed before live screenshot saving works. They are configured in the sibling website repository; tests run the actual Worker locally. The website trial stays browser-local and does not expose screenshot capture or remote file storage.

## Adding a destination

Register a descriptor in `src/destinations.js`: ID, label, identity requirement, catalog and its load condition, description, optional routing predicate, and read operation. Implement its `read` and `react` runtime adapters in the dispatcher. The shared picker derives its single destination row, catalogs, hover descriptions, and data fields from the registry. No provider-name branches are required in the picker or reaction controller.

Screenshot capture and upload are an independent attachment pipeline, shared by all destinations. A different backend can implement the same private attachment operations or replace that storage adapter without changing the envelope or picker. Existing providers use the configured Worker for attachments; Raycast itself is a command destination, not a file-storage service.

Raycast receives this envelope as `LaunchContext.reacji` through its deeplink `context` parameter; pre-existing context fields and command arguments are preserved. Commands must explicitly consume that context to act on the URL, selection, or attachment. A successful deeplink request confirms handoff to the OS, not completion of the command. Public/Private after-save mappings receive the same envelope; a launch failure never rolls back an already committed GitHub reaction.
