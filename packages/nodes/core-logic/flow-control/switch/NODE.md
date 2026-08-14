---
title: "Router (Switch)"
type: logic
subType: switch
description: "Route down multiple paths"
ui:
  icon: switch
  color: text-blue-500
  bgColor: bg-blue-50
  borderColor: border-blue-200
  shadow: shadow-blue-100
---

# Router (Switch) Node

## When to use this node
Route one value through up to two exact-match paths, with one default path.

## Routes

- `branchA`: first exact-match case
- `branchB`: second exact-match case
- `default`: every unmatched value

The route handles are fixed. Do not configure arbitrary handles in `cases`.
When Promptly AI creates a Switch, it uses the `add_switch_routes` semantic
operation so the case configuration and graph connections stay aligned.

## Configuration Schema
The LLM must configure this node with the following JSON schema:
- (Define schema here)
