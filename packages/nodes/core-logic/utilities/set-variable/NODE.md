---
title: "Set Variable"
type: logic
subType: setVariable
description: "Define or update a named variable in the workflow execution context"
ui:
  icon: variable
  color: text-teal-600
  bgColor: bg-teal-50
  borderColor: border-teal-200
  shadow: shadow-teal-100
---

# Set Variable Node

## When to use this node
Use this node to explicitly store a value under a named key in the workflow context, making it available to all downstream nodes as a structured workflow expression.

## Common use cases
- Counter: store `{ "$expr": "reference", "v": 1, "nodeId": "loop-node-id", "path": ["count"] }` as `totalItems`
- Derived value: use a `$expr: "template"` value combining literal text with a reference to an upstream output
- Flag: set `isEligible = true` after a condition check

## Notes
- The variable name you set becomes the key in the output object
- You can chain multiple Set Variable nodes if you need to set several variables at once
