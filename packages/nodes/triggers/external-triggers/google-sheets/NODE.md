---
title: "Sheets Event"
type: trigger
subType: googleSheets
description: "Trigger on new row"
ui:
  icon: sheets
  color: text-orange-600
  bgColor: bg-orange-50
  borderColor: border-orange-200
  shadow: shadow-orange-100
---

# Sheets Event Node

## When to use this node
Trigger when new rows are appended to a configured range in a connected Google Sheet.

## Configuration Schema
The LLM must configure this node with the following JSON schema:
- Configure the spreadsheet ID, A1 range, and whether existing rows should be processed on first connection.
- Drive change notifications wake the adapter; the adapter reads the range and emits durable row events.
- Existing-row edits are intentionally ignored in the first version; append-only detection is deterministic.
