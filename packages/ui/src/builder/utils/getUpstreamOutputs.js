import { varTypeForField } from './formFieldTypeMap.js';

const PATH_SEGMENT_RE = /^[\w-]+$/;

function normalizeType(type) {
  if (!type) return 'any';
  if (type === 'integer') return 'number';
  if (type === 'text') return 'string';
  return type;
}

function inferSchemaType(schema) {
  if (typeof schema === 'string') return normalizeType(schema);
  if (Array.isArray(schema)) return 'array';
  if (!schema || typeof schema !== 'object') return 'any';
  if (schema.type) return normalizeType(schema.type);
  if (schema.properties || schema.fields) return 'object';
  return 'object';
}

function getPropertyEntries(schema, allowPlainObject = false) {
  if (!schema || typeof schema !== 'object') return [];

  const props = schema.properties || schema.fields;
  if (Array.isArray(props)) {
    return props
      .map(field => [field.name || field.id, field])
      .filter(([key]) => key && PATH_SEGMENT_RE.test(key));
  }

  if (props && typeof props === 'object') {
    return Object.entries(props).filter(([key]) => PATH_SEGMENT_RE.test(key));
  }

  if (allowPlainObject && !schema.type && !Array.isArray(schema)) {
    return Object.entries(schema).filter(([key]) => PATH_SEGMENT_RE.test(key));
  }

  return [];
}

function parseJsonSchema(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function nestedDescription(parentLabel, schema) {
  return schema?.description || `Nested field from ${parentLabel}`;
}

function addNestedProperties(vars, { schema, basePath, baseLabel, nodeId, nodeTitle, depth = 0, parentPath = null, source, allowPlainObject = false }) {
  const entries = getPropertyEntries(schema, allowPlainObject);

  for (const [key, childSchema] of entries) {
    const label = childSchema?.label || childSchema?.title || key;
    const path = `${basePath}.${key}`;
    const type = inferSchemaType(childSchema);

    vars.push({
      path,
      label,
      type,
      description: nestedDescription(baseLabel, childSchema),
      nodeId,
      nodeTitle,
      parentPath: parentPath || basePath,
      depth: depth + 1,
      isNested: true,
      source,
    });

    addNestedProperties(vars, {
      schema: childSchema,
      basePath: path,
      baseLabel: label,
      nodeId,
      nodeTitle,
      depth: depth + 1,
      parentPath: path,
      source,
      allowPlainObject,
    });
  }
}

function addOutputVariable(vars, { nodeId, nodeTitle, output, source }) {
  const path = `${nodeId}.${output.name}`;
  const label = output.label || output.name;

  vars.push({
    path,
    label,
    type: output.type || 'any',
    description: output.description,
    nodeId,
    nodeTitle,
    depth: 0,
    source,
  });

  addNestedProperties(vars, {
    schema: output,
    basePath: path,
    baseLabel: label,
    nodeId,
    nodeTitle,
    source,
  });
}

function addAiExtractionFields(vars, node, nodeTitle, output) {
  if (output.name !== 'response') return;
  if (node.config?.taskType !== 'extract') return;
  if (!node.config?.extractionSchema) return;

  const extractionSchema = parseJsonSchema(node.config?.extractionSchema);
  if (!extractionSchema) return;

  addNestedProperties(vars, {
    schema: extractionSchema,
    basePath: `${node.id}.${output.name}`,
    baseLabel: output.label || output.name,
    nodeId: node.id,
    nodeTitle,
    source: 'ai-extraction',
    allowPlainObject: true,
  });
}

/**
 * Traverses the workflow graph backwards from `nodeId` and collects all
 * output variables that upstream nodes expose — used to power the variable picker.
 *
 * @param {string}  nodeId           - The node whose inspector is open.
 * @param {Array}   nodes            - All workflow nodes (raw data, not React Flow nodes).
 * @param {Array}   edges            - All workflow edges.
 * @param {Object}  resolvedFormFields - Optional map of { [nodeId]: { form, fields[] } }
 *                                      used to expand form-submission nodes into per-field tokens.
 * @returns {Array<{ path, label, type, nodeTitle, nodeId, description, isFormField, formName, parentPath, depth, hasChildren }>}
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
      depth: 0,
    });

    // Walk schema outputs to find non-connection (data) fields
    const schemaOutputs = node.schema?.outputs?.filter(o => !o.isConnection) ?? [];

    for (const o of schemaOutputs) {
      // Expandable object outputs (e.g. form-submission's `fields`) get special treatment
      if (o.expandable && o.name === 'fields') {
        const resolved = resolvedFormFields[id];
        addOutputVariable(vars, { nodeId: id, nodeTitle, output: o, source: 'schema' });

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
              parentPath: `${id}.${o.name}`,
              depth: 1,
              isNested: true,
              source: 'form-field',
            });
          }
          continue;
        }

        continue;
      }

      // Normal (non-expandable) output
      const outputForPicker = node.config?.taskType === 'extract' && o.name === 'response' && node.config?.extractionSchema
        ? { ...o, type: 'object' }
        : o;
      addOutputVariable(vars, { nodeId: id, nodeTitle, output: outputForPicker, source: 'schema' });
      addAiExtractionFields(vars, node, nodeTitle, outputForPicker);
    }

    // Fallback: if a node has no schema outputs at all, expose a generic `data` field
    if (schemaOutputs.length === 0) {
      vars.push({
        path: `${id}.data`,
        label: 'Output Data',
        type: 'object',
        nodeId: id,
        nodeTitle,
        depth: 0,
      });
    }
  }

  const childCounts = vars.reduce((acc, v) => {
    if (v.parentPath) acc[v.parentPath] = (acc[v.parentPath] || 0) + 1;
    return acc;
  }, {});

  return vars.map(v => ({
    ...v,
    hasChildren: !!childCounts[v.path],
  }));
}
