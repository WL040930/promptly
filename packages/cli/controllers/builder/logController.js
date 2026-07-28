import { AutomationRun, Workflow } from '../../models/index.js';
import { Op } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const parsePageSize = pageSizeValue => (
    Math.min(
        Math.max(Number.parseInt(pageSizeValue, 10) || DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE
    )
);

export const encodeLogCursor = log => Buffer.from(JSON.stringify({
    createdAt: new Date(log.createdAt).toISOString(),
    id: log.id
})).toString('base64url');

export const decodeLogCursor = value => {
    if (!value) return null;
    try {
        const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
        const createdAt = new Date(parsed.createdAt);
        if (!parsed.id || Number.isNaN(createdAt.getTime())) return null;
        return { createdAt, id: String(parsed.id) };
    } catch {
        return null;
    }
};

const buildLogWhereClause = async ({ userId, search, status, workflowId }) => {
    const whereClause = { userId };

    if (status && status !== 'All') {
        const normalizedStatus = {
            success: 'succeeded',
            succeeded: 'succeeded',
            waiting: 'waiting',
            running: 'running',
            resuming: 'resuming',
            failed: 'failed'
        }[String(status).trim().toLowerCase()];
        if (normalizedStatus) whereClause.status = normalizedStatus;
    }

    if (workflowId) {
        whereClause.workflowId = workflowId;
    }

    if (search) {
        const matchedWorkflows = await Workflow.findAll({
            where: {
                userId,
                name: { [Op.iLike]: `%${search}%` }
            },
            attributes: ['id']
        });

        whereClause[Op.or] = [
            { id: { [Op.iLike]: `%${search}%` } },
            { trigger: { [Op.iLike]: `%${search}%` } },
            { error: { [Op.iLike]: `%${search}%` } },
            { workflowId: { [Op.in]: matchedWorkflows.map(workflow => workflow.id) } }
        ];
    }

    return whereClause;
};

export const getExecutionLogs = asyncHandler(async (req, res) => {
    const { search = '', status = 'All', workflowId = '' } = req.query;
    const pageSize = parsePageSize(req.query.pageSize);
    const whereClause = await buildLogWhereClause({
        userId: req.user.id,
        search: search.trim(),
        status,
        workflowId
    });
    const cursor = decodeLogCursor(req.query.cursor);
    if (req.query.cursor && !cursor) {
        return res.status(400).json({ message: 'Invalid run-history cursor.' });
    }
    if (cursor) {
        whereClause[Op.and] = [
            ...(whereClause[Op.and] || []),
            {
                [Op.or]: [
                    { createdAt: { [Op.lt]: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } }
                ]
            }
        ];
    }

    const rows = await AutomationRun.findAll({
        where: whereClause,
        attributes: { exclude: ['steps'] },
        include: [{
            model: Workflow,
            as: 'workflow',
            attributes: ['id', 'name'],
            required: false
        }],
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        limit: pageSize + 1
    });
    const hasNextPage = rows.length > pageSize;
    const data = hasNextPage ? rows.slice(0, pageSize) : rows;
    const last = data.at(-1);

    res.json({
        data,
        pagination: {
            pageSize,
            hasNextPage,
            nextCursor: hasNextPage && last ? encodeLogCursor(last) : null
        }
    });
});

export const getExecutionLog = asyncHandler(async (req, res) => {
    const log = await AutomationRun.findOne({
        where: {
            id: req.params.id,
            userId: req.user.id
        },
        include: [{
            model: Workflow,
            as: 'workflow',
            attributes: ['id', 'name'],
            required: false
        }]
    });

    if (!log) {
        return res.status(404).json({ message: 'Execution log not found' });
    }

    res.json(log);
});
