import { ExecutionLog, Workflow } from '../../models/index.js';
import { Op } from 'sequelize';

export const getExecutionLogs = async (req, res) => {
    const { search, status } = req.query;
    
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
        limit: 100
    });
    
    res.json(logs);
};
