# Imagine Sign for agents

Replace `https://sign.example.com` with your own deployment URL.

Agents (Claude, Cursor, your own bots) can send and track agreements through either:

- **MCP**: `https://sign.example.com/api/mcp` (Streamable HTTP, stateless, JSON responses). Header `Authorization: Bearer isk_...`.
- **REST v1**: `https://sign.example.com/api/v1`. Same key. Human docs: https://sign.example.com/developers, machine spec: `/api/v1/openapi.json`.

The MCP server calls the REST handlers in-process, so permissions, validation, audit trail and error codes are identical.

Keys are created in the app under Settings > API keys (`isk_` prefix, stored hashed, shown once). An envelope created with a key belongs to that key's user and shows `created_via: "mcp"` or `"api"`.

## Connect

Claude Code / Claude Desktop / Cursor (`.mcp.json`):

```json
{
  "mcpServers": {
    "imagine-sign": {
      "type": "http",
      "url": "https://sign.example.com/api/mcp",
      "headers": { "Authorization": "Bearer ${IMAGINE_SIGN_API_KEY}" }
    }
  }
}
```

Raw JSON-RPC:

```bash
curl -s https://sign.example.com/api/mcp \
  -H "Authorization: Bearer $IMAGINE_SIGN_API_KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_templates","arguments":{}}}'
```

## Tools

| Tool | Does | Side effects |
| --- | --- | --- |
| `whoami` | user + workspace for the key | none |
| `list_templates` / `get_template` | find a template, its roles and field labels | none |
| `create_envelope` | from a template (roles + prefill) or from PDFs (anchor or explicit fields). **Defaults to draft** | creates a draft |
| `send_envelope` | sends a draft | **emails recipients** |
| `get_envelope` | status, recipients, links (`includeEvents` for the audit trail) | none |
| `list_envelopes` | search by status / text | none |
| `resend_envelope` | re-sends to whoever is waiting | **emails recipients** |
| `void_envelope` | voids (irreversible) | **emails recipients** |
| `get_signing_link` | fresh signing URL for one recipient (secret) | none |
| `download_completed` | URLs for the sealed PDF + certificate (fetch with the same key) | none |
| `add_comment` / `list_comments` | collaboration thread (`internal` or `everyone`) | may email the team |

Tool failures come back as `isError: true` results with `code (HTTP status): message` so the model can recover. Protocol errors use JSON-RPC codes.

## Rules for agents

1. Create as **draft**, show the human the app link, and only `send_envelope` after an explicit yes. Same for void and resend.
2. Never paste signing links into shared channels. They let anyone sign as that recipient.
3. Prefer templates. For ad-hoc PDFs, put anchor text in the doc (`/sig1/`, `/date1/`, white text is fine) and place fields with `anchor` + `offsetX/offsetY` (points) instead of guessing coordinates.
4. Coordinates, when explicit, are normalized 0..1 of the displayed page, origin top-left.
5. Pass PDFs by `url` when possible; base64 only for small files.

## Example: order form from the template

```json
{"name":"create_envelope","arguments":{
  "templateId":"<Order Form template id>",
  "subject":"Acme Inc x Example Co - SaaS Services Order Form",
  "message":"Hi Jordan, here's the order form we went over.",
  "recipients":[
    {"roleName":"Customer","name":"Jordan Lee","email":"jordan@example.com"},
    {"roleName":"Acme Inc","name":"Alex Kim","email":"alex@example.com"}
  ],
  "prefill":{"Company":"Example Co","Seats":"3"},
  "metadata":{"hubspotDealId":"123"}
}}
```

With a template, only the template's roles can be filled (match by `roleName`); add CC people as a role in the template. Then share `links.app` from the response with the human -> `send_envelope` on approval -> poll `get_envelope` or subscribe a webhook (`envelope.completed`) -> `download_completed`.

## Example: ad-hoc PDF with anchors

```json
{"name":"create_envelope","arguments":{
  "subject":"Mutual NDA - Acme Inc x Example Co",
  "documents":[{"name":"NDA.pdf","url":"https://example.com/nda.pdf"}],
  "recipients":[{"name":"Jane Doe","email":"jane@example.com","routingOrder":1},{"name":"Alex Kim","email":"alex@example.com","routingOrder":2}],
  "fields":[
    {"recipient":0,"type":"signature","anchor":"/sig1/","offsetY":-4,"width":150,"height":36},
    {"recipient":0,"type":"date_signed","anchor":"/date1/"},
    {"recipient":1,"type":"signature","anchor":"/sig2/","offsetY":-4}
  ]
}}
```
