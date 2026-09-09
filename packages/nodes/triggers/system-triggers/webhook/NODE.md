---
title: "Webhook / Catch Hook"
type: trigger
subType: webhook
description: "Trigger via HTTP POST"
ui:
  icon: webhook
  color: text-orange-600
  bgColor: bg-orange-50
  borderColor: border-orange-200
  shadow: shadow-orange-100
---

# Webhook / Catch Hook Node

## When to use this node
Trigger via HTTP POST

## Configuration Schema
The LLM may configure this node with the following fields:
- `webhookId`: The generated endpoint identifier.
- `secret`: Optional request verification token.
- `deliveryMode`: `async` or `sync`.
- `bodySchema`: Optional typed JSON Schema for the request body. Use a root object with typed properties. Nested objects and arrays of scalar values are supported; extra properties are allowed. Do not invent body fields that are not present in this contract.

When a downstream step needs a webhook field, reference the non-connection `body` output with a canonical workflow expression, for example `{ "$expr": "reference", "v": 1, "nodeId": "webhook_trigger", "path": ["body", "amount"] }`.
