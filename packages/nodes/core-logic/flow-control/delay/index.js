import { BaseNode } from '../../../BaseNode.js';

export default class WaitDelayNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        let amount = Number(config.delayAmount) || 1;
        const unit = config.delayUnit || "seconds";
        
        let ms = 1000;
        if (unit === "milliseconds") ms = amount;
        else if (unit === "seconds") ms = amount * 1000;
        else if (unit === "minutes") ms = amount * 60000;
        else if (unit === "hours") ms = amount * 3600000;

        await new Promise(resolve => setTimeout(resolve, ms));

        return { 
            success: true, 
            delayedFor: ms 
        };
    }
}
