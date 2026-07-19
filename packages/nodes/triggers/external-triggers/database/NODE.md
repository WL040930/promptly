---
title: "Database Event"
type: trigger
subType: database
description: "Trigger on row changes"
ui:
  icon: database
  color: text-orange-600
  bgColor: bg-orange-50
  borderColor: border-orange-200
  shadow: shadow-orange-100
---

# Database Event Node

## When to use this node
Trigger when a Promptly-owned form, workflow, or execution log is created, updated, or deleted.

## Configuration Schema
The LLM must configure this node with the following JSON schema:
- Configure a resource, event list, and simple equality filters.
- The event payload contains `before`, `after`, `changedFields`, `recordId`, and `resource`.
- Events are durable and deduplicated before workflow execution.
