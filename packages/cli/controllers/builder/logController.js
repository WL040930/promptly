import { ExecutionLog, Workflow } from '../../models/index.js';
import { Op } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';

export const getExecutionLogs = asyncHandler(async (req, res) => {
    const { search, status, limit = 100, offset = 0 } = req.query;
    
    let whereClause = { userId: req.user.id };
    
    if (status && status !== 'All') {
        whereClause.status = status;
    }
    
    if (search) {
        // Find workflows matching search term to get workflowIds
        const matchedWorkflows = await Workflow.findAll({
            where: {
                userId: req.user.id,
                name: {
                    [Op.iLike]: `%${search}%`
                }
            },
            attributes: ['id']
        });
        const matchedWorkflowIds = matchedWorkflows.map(w => w.id);
        
        whereClause[Op.or] = [
            { id: { [Op.iLike]: `%${search}%` } },
            { workflowId: { [Op.in]: matchedWorkflowIds } }
        ];
    }
    
    const logs = await ExecutionLog.findAll({
        where: whereClause,
        order: [['time', 'DESC']],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
    });
    
    res.json(logs);
});
