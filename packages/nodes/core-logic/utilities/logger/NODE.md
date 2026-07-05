---
title: "Log Data (Example)"
type: logic
subType: log
description: "Prints data to the workflow execution console for debugging. Serves as a reference for creating nodes."
ui:
  icon: alert-circle
  color: text-emerald-600
  bgColor: bg-emerald-50
  borderColor: border-emerald-200
  shadow: shadow-emerald-100
---

# Logger / Example Node

## When to use this node
Use this node to print variables, strings, or JSON objects to the execution console for debugging purposes. 
This node also serves as a **Template and Reference** for how to build a fully modular node.

## How it works
This node receives configuration from its `schema.json` and executes logic inside `index.js`. It does not require any hardcoded frontend updates because `PropertyInspector.jsx` dynamically renders the inputs defined in the schema.
