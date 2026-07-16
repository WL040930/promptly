import { ExecutionLog, Workflow } from '../../models/index.js';
import { Op } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const parsePagination = (pageValue, pageSizeValue) => {
    const page = Math.max(Number.parseInt(pageValue, 10) || 1, 1);
    const pageSize = Math.min(
        Math.max(Number.parseInt(pageSizeValue, 10) || DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE
    );

    return { page, pageSize, offset: (page - 1) * pageSize };
};

const buildLogWhereClause = async ({ userId, search, status, workflowId }) => {
    const whereClause = { userId };

    if (status && status !== 'All') {
        whereClause.status = status;
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
    const { page, pageSize, offset } = parsePagination(req.query.page, req.query.pageSize);
    const whereClause = await buildLogWhereClause({
        userId: req.user.id,
        search: search.trim(),
        status,
        workflowId
    });

    const { rows, count } = await ExecutionLog.findAndCountAll({
        where: whereClause,
        attributes: { exclude: ['steps'] },
        include: [{
            model: Workflow,
            as: 'workflow',
            attributes: ['id', 'name'],
            required: false
        }],
        order: [['time', 'DESC'], ['id', 'DESC']],
        limit: pageSize,
        offset,
        distinct: true
    });

    const totalPages = Math.ceil(count / pageSize);

    res.json({
        data: rows,
        pagination: {
            page,
            pageSize,
            total: count,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
        }
    });
});

export const getExecutionLog = asyncHandler(async (req, res) => {
    const log = await ExecutionLog.findOne({
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
