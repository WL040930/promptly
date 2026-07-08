---
title: "Data Transform"
type: logic
subType: dataTransform
description: "Transform text, numbers, dates, or JSON — uppercase, parse, format, calculate, and more"
ui:
  icon: transform
  color: text-violet-600
  bgColor: bg-violet-50
  borderColor: border-violet-200
  shadow: shadow-violet-100
---

# Data Transform Node

## When to use this node
Use this node to manipulate data between steps without writing code. Replaces the old separate Date Formatter, Text Formatter, Math Operations, and JSON Parser nodes.

## Data Types & Operations

### Text
- `uppercase` / `lowercase` / `titlecase`
- `trim` — remove leading/trailing whitespace
- `replace` — find & replace a substring
- `split` — split into an array by delimiter
- `slice` — extract a substring by index

### Number
- `add` / `subtract` / `multiply` / `divide`
- `round` / `floor` / `ceil`
- `abs` — absolute value
- `toFixed` — round to N decimal places

### Date
- `format` — format a date string using a format pattern (e.g. `YYYY-MM-DD`)
- `addDays` / `subtractDays`
- `now` — get the current timestamp

### JSON
- `parse` — parse a JSON string into an object
- `stringify` — convert an object to a JSON string
- `get` — extract a nested value using dot notation (e.g. `user.address.city`)
- `set` — set a nested value (returns updated object)
- `keys` — extract the keys of an object

## Output
Always returns `result` — the transformed value — and `outputType` — the detected type of the result.
