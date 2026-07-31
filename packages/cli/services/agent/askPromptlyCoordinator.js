import { ASSISTANT_TURN_EVENTS } from '../../../shared/assistantTurnContract.js';

/**
 * The coordinator is the single seam between Ask Promptly's chat transport and
 * the specialist agent runtime. It deliberately owns routing and event shape,
 * while Form AI and Workflow AI keep ownership of their domain planning.
 */
export const createAskPromptlyCoordinator = ({ processAgenticTurn, classifyIntent } = {}) => {
    if (typeof processAgenticTurn !== 'function') throw new TypeError('processAgenticTurn is required.');
    if (typeof classifyIntent !== 'function') throw new TypeError('classifyIntent is required.');

    const coordinate = async ({ session, userId, message, context = {}, onEvent = null } = {}) => {
        const deterministic = classifyIntent({ message, context });
        const requestedDomains = Array.isArray(deterministic?.domains) ? deterministic.domains : [];
        const route = ['create', 'modify', 'delete', 'connect'].includes(deterministic?.goal) && requestedDomains.length > 0
            ? 'coordination'
            : 'conversation';

        onEvent?.({
            type: ASSISTANT_TURN_EVENTS.ROUTED,
            route,
            domains: requestedDomains,
            goal: deterministic?.goal || 'explain'
        });

        return processAgenticTurn({ session, userId, message, context, onEvent });
    };

    return Object.freeze({ coordinate });
};
