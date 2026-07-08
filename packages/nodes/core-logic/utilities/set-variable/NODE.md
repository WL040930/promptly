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
Use this node to explicitly store a value under a named key in the workflow context, making it available to all downstream nodes via `{{setVariable-nodeId.value}}`.

## Common use cases
- Counter: store `{{loop-nodeId.count}}` as `totalItems`
- Derived value: compute a label like `"Order #" + {{trigger.orderId}}`
- Flag: set `isEligible = true` after a condition check

## Notes
- The variable name you set becomes the key in the output object
- You can chain multiple Set Variable nodes if you need to set several variables at once
