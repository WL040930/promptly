import { varTypeForField } from './formFieldTypeMap.js';

/**
 * Traverses the workflow graph backwards from `nodeId` and collects all
 * output variables that upstream nodes expose — used to power the variable picker.
 *
 * @param {string}  nodeId           - The node whose inspector is open.
 * @param {Array}   nodes            - All workflow nodes (raw data, not React Flow nodes).
 * @param {Array}   edges            - All workflow edges.
 * @param {Object}  resolvedFormFields - Optional map of { [nodeId]: { form, fields[] } }
 *                                      used to expand form-submission nodes into per-field tokens.
 * @returns {Array<{ path, label, type, nodeTitle, nodeId, description, isFormField, formName }>}
 */
export function getUpstreamOutputs(nodeId, nodes, edges, resolvedFormFields = {}) {
  if (!nodeId || !nodes?.length || !edges?.length) return [];

  // BFS backwards through the edge graph
  const upstreamIds = new Set();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    const incoming = edges.filter(e => e.target === current);
    for (const e of incoming) {
      if (!upstreamIds.has(e.source)) {
        upstreamIds.add(e.source);
        queue.push(e.source);
      }
    }
  }

  // For each upstream node, build the variable list
  const vars = [];

  for (const id of upstreamIds) {
    const node = nodes.find(n => n.id === id);
    if (!node) continue;

    const nodeTitle = node.title || node.subType || id;

    // Always expose a `success` field — every node returns it
    vars.push({
      path: `${id}.success`,
      label: 'Success',
      type: 'boolean',
      nodeId: id,
      nodeTitle,
    });

    // Walk schema outputs to find non-connection (data) fields
    const schemaOutputs = node.schema?.outputs?.filter(o => !o.isConnection) ?? [];

    for (const o of schemaOutputs) {
      // Expandable object outputs (e.g. form-submission's `fields`) get special treatment
      if (o.expandable && o.name === 'fields') {
        const resolved = resolvedFormFields[id];

        if (resolved?.fields?.length > 0) {
          // Emit one typed token per form field
          for (const field of resolved.fields) {
            vars.push({
              path: `${id}.fields.${field.id}`,
              label: field.label || field.id,
              type: varTypeForField(field.type),
              description: `"${field.label}" field from "${resolved.form?.title ?? 'form'}"`,
              nodeId: id,
              nodeTitle,
              isFormField: true,
              formName: resolved.form?.title ?? null,
            });
          }
          continue; // skip the coarse `fields` fallback below
        }

        // Fallback — form not selected yet or still loading; emit the coarse token
        vars.push({
          path: `${id}.${o.name}`,
          label: o.label || o.name,
          type: o.type || 'any',
          description: o.description,
          nodeId: id,
          nodeTitle,
        });
        continue;
      }

      // Normal (non-expandable) output
      vars.push({
        path: `${id}.${o.name}`,
        label: o.label || o.name,
        type: o.type || 'any',
        description: o.description,
        nodeId: id,
        nodeTitle,
      });
    }

    // Fallback: if a node has no schema outputs at all, expose a generic `data` field
    if (schemaOutputs.length === 0) {
      vars.push({
        path: `${id}.data`,
        label: 'Output Data',
        type: 'object',
        nodeId: id,
        nodeTitle,
      });
    }
  }

  return vars;
}
