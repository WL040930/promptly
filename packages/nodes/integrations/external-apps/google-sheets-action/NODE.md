---
title: "Google Sheets Action"
type: action
subType: googleSheets
description: "Create, Read, Update rows"
ui:
  icon: sheets
  color: text-slate-800
  bgColor: bg-slate-50
  borderColor: border-slate-200
  shadow: shadow-slate-100
---

# Google Sheets Action Node

## When to use this node
Read, append, update, or clear a Google Sheets A1 range using the authenticated user's Google connection.

## Configuration Schema
The LLM must configure this node with the following JSON schema:
- `spreadsheetId`: Google spreadsheet ID.
- `range`: A1 notation such as `Sheet1!A1:D20`.
- `operation`: `read`, `append`, `update`, or `clear`.
- `values`: JSON rows for `append` and `update`, for example `[["Name", "Status"], ["Ada", "Active"]]`. Each cell must be a scalar; flat arrays such as form multi-select answers are written as comma-separated text, while nested arrays and objects are rejected before the Google request.
- `valueInputOption`: `RAW` or `USER_ENTERED`.
