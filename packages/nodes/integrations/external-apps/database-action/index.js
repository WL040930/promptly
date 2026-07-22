import { BaseNode } from '../../../BaseNode.js';
import {
    buildOrder,
    buildScopedWhere,
    getResourceDefinition,
    mergeRecordIdFilter,
    parseLimit,
    parseObject,
    requireRecordFilter,
    sanitizeWritableData
} from './databaseConnector.js';

const serialize = record => record?.toJSON ? record.toJSON() : record;

export default class DatabaseActionNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const operation = String(config.operation || 'select').toLowerCase();

        try {
            if (!['select', 'insert', 'update', 'delete'].includes(operation)) {
                throw new Error(`Unsupported database operation "${operation}".`);
            }

            const definition = getResourceDefinition(config.resource || config.table);
            const filters = parseObject(config.filters, 'Database filters');
            const filtersWithRecord = mergeRecordIdFilter({ filters, recordId: config.recordId });
            const where = buildScopedWhere({ definition, userId: context.metadata?.userId, filters: filtersWithRecord });

            if (operation === 'select') {
                const records = await definition.model.findAll({
                    where,
                    limit: parseLimit(config.limit),
                    order: buildOrder({ definition, orderBy: config.orderBy, orderDirection: config.orderDirection })
                });
                return {
                    success: true,
                    outputData: { operation, resource: definition.resource, records: records.map(serialize), count: records.length },
                    records: records.map(serialize),
                    count: records.length
                };
            }

            if (definition.readOnly) throw new Error(`Resource "${definition.resource}" is read-only.`);

            if (operation === 'insert') {
                const data = sanitizeWritableData({ definition, data: parseObject(config.data, 'Database data') });
                const record = await definition.model.create({ ...data, userId: context.metadata.userId });
                const serialized = serialize(record);
                return {
                    success: true,
                    outputData: { operation, resource: definition.resource, record: serialized, affectedCount: 1 },
                    record: serialized,
                    affectedCount: 1
                };
            }

            requireRecordFilter(filtersWithRecord);
            const data = operation === 'update'
                ? sanitizeWritableData({ definition, data: parseObject(config.data, 'Database data') })
                : null;
            const affectedCount = operation === 'update'
                ? (await definition.model.update(data, { where }))[0]
                : await definition.model.destroy({ where });
            const record = operation === 'update'
                ? await definition.model.findOne({ where })
                : null;
            const serialized = serialize(record);
            return {
                success: true,
                outputData: { operation, resource: definition.resource, ...(serialized ? { record: serialized } : {}), affectedCount },
                ...(serialized ? { record: serialized } : {}),
                affectedCount
            };
        } catch (error) {
            return { success: false, errorCode: 'DATABASE_ACTION_FAILED', error: error.message };
        }
    }
}
