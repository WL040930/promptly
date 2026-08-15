import { ASSISTANT_TURN_EVENTS } from '../../../shared/assistantTurnContract.js';

/**
 * The coordinator is the single seam between Ask Promptly's chat transport and
 * the specialist agent runtime. It deliberately owns routing and event shape,
 * while Form AI and Workflow AI keep ownership of their domain planning.
 */
export const createAskPromptlyCoordinator = ({ processAgenticTurn, decideIntent, recoverContext = null } = {}) => {
    if (typeof processAgenticTurn !== 'function') throw new TypeError('processAgenticTurn is required.');
    if (typeof decideIntent !== 'function') throw new TypeError('decideIntent is required.');

    const coordinate = async ({ session, userId, message, context = {}, onEvent = null } = {}) => {
        const decision = await decideIntent({ message, context, onActivity: event => onEvent?.(event) });
        const requestedDomains = Array.isArray(decision?.intent?.domains) ? decision.intent.domains : [];

        onEvent?.({
            type: ASSISTANT_TURN_EVENTS.ROUTED,
            route: decision?.route || 'unavailable',
            domains: requestedDomains,
            goal: decision?.intent?.goal || 'explain',
            confidence: decision?.confidence ?? null
        });

        const resolvedContext = typeof recoverContext === 'function'
            ? await recoverContext({ session, userId, context, decision })
            : context;
        return processAgenticTurn({ session, userId, message, context: resolvedContext, decision, onEvent });
    };

    return Object.freeze({ coordinate });
};
