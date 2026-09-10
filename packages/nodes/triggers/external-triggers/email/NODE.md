---
title: "Email Received"
type: trigger
subType: email
implementationStatus: disabled
description: "Trigger on incoming email"
ui:
  icon: email
  color: text-orange-600
  bgColor: bg-orange-50
  borderColor: border-orange-200
  shadow: shadow-orange-100
---

# Email Received Node

## When to use this node
Trigger when a connected Gmail mailbox receives a matching message in the inbox.

## Configuration Schema
The LLM must configure this node with the following JSON schema:
- Configure Gmail labels, sender and subject filters, attachment filtering, and optional body access.
- Gmail notifications are persisted and deduplicated before the workflow starts.
- Message bodies are opt-in because they require broader Google permissions.
