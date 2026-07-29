---
title: "Create Google Sheet"
type: action
subType: googleSheetsCreate
description: "Create a spreadsheet during the workflow run"
ui:
  icon: sheets
  color: text-slate-800
  bgColor: bg-slate-50
  borderColor: border-slate-200
  shadow: shadow-slate-100
---

# Create Google Sheet

Creates one Google spreadsheet during the current workflow execution, renames
its first tab, and optionally writes a header row. Use its `spreadsheetId`
output in a later Google Sheets action.
