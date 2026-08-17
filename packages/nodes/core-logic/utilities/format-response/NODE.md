---
title: "Format Response"
type: logic
subType: formatResponse
description: "Shape and compose the final output of a workflow — combine multiple upstream values into a structured response"
ui:
  icon: file-output
  color: text-cyan-600
  bgColor: bg-cyan-50
  borderColor: border-cyan-200
  shadow: shadow-cyan-100
---

# Format Response Node

## When to use this node
Place this at the end of a workflow to cleanly define what the workflow returns — a formatted message, a structured JSON, or an HTML email body. It prevents callers from receiving raw internal execution state.

## Modes
- **Template** — Compose literal text with canonical `$expr: "reference"` parts from upstream nodes. Output is a string.
- **JSON Builder** — Define a JSON object with literal values and canonical expressions referencing upstream data. Output is an object.

## Example
Combine an AI response and a user ID into a final JSON:
```json
{
  "userId": { "$expr": "reference", "v": 1, "nodeId": "form-node-id", "path": ["fields", "user_id"] },
  "reply": { "$expr": "reference", "v": 1, "nodeId": "ai-task-node-id", "path": ["response"] }
}
```
