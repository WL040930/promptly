---
title: "Database Action"
type: action
subType: database
description: "SQL/NoSQL operations"
ui:
  icon: database
  color: text-slate-800
  bgColor: bg-slate-50
  borderColor: border-slate-200
  shadow: shadow-slate-100
---

# Database Action Node

## When to use this node
Read or mutate the authenticated user's Promptly-owned forms, workflows, folders, and execution logs.

## Configuration Schema
The LLM must configure this node with the following JSON schema:
- `resource`: `forms`, `workflows`, `folders`, or `executionLogs`.
- `operation`: `select`, `insert`, `update`, or `delete`.
- `filters`: simple JSON equality filters. Updates and deletes require an exact `id`.
- `data`: JSON fields for inserts and updates. User ownership and IDs are controlled by the runtime.
- Reads are capped at 100 records and never execute arbitrary SQL.
