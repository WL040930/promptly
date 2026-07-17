---
title: "Send Email"
type: action
subType: email
description: "Send via SMTP/SendGrid"
ui:
  icon: email
  color: text-slate-800
  bgColor: bg-slate-50
  borderColor: border-slate-200
  shadow: shadow-slate-100
---

# Send Email Node

## When to use this node
Send a validated plain-text or HTML email through the system SMTP provider or the user's connected Gmail account.

## Configuration Schema
The LLM must configure this node with the following JSON schema:
- `emailProvider`: `system-default`, `smtp`, or `user-gmail`.
- `to`, `subject`, and `body` are required. `htmlBody`, `cc`, `bcc`, and `replyTo` are optional.
- Delivery retries require a trigger idempotency key; uncertain sends without one are not retried to avoid duplicate mail.
- Form responses, webhooks with `x-idempotency-key`, and scheduled runs provide stable event keys for delivery deduplication.
