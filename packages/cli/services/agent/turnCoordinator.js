/**
 * Decide what an incoming chat turn means when an agent run is waiting.
 *
 * This is deliberately a small, dependency-free seam. The chat service owns
 * persistence and execution; this module only prevents unrelated conversation
 * from being fed into a pending clarification as if it were an answer.
 */

const normalize = value => String(value || '').trim().toLowerCase();

const conversationalPatterns = [
    /^(hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening)\b/i,
    /^(who are you|what are you|what can you do|help)\??$/i,
    /^(are you there|how are you)\??$/i,
    /^(who|what|why|how|when|where)\b/i
];

const resumePatterns = [
    /^(resume|continue|go back to)\b.*\b(previous|pending|paused|last)\b/i,
    /^resume\s+(?:run|task)\b/i
];

const answerPatterns = [
    /^(yes|yeah|yep|no|nope|ok|okay|proceed|continue|go ahead|cancel|reject|stop)$/i
];

const optionValues = pending => (pending?.question?.options || pending?.options || [])
    .flatMap(option => [option?.id, option?.value, option?.label, option])
    .filter(value => value !== null && value !== undefined)
    .map(normalize)
    .filter(Boolean);

export const isConversationalMessage = message => conversationalPatterns.some(pattern => pattern.test(String(message || '').trim()));

export const isClarificationAnswer = ({ message, pending = {} } = {}) => {
    const text = normalize(message);
    if (!text) return false;
    if (/\b(create|build|design|update|modify|edit|delete|remove|send|set\s*up|automate)\b/i.test(text)) return false;
    const options = optionValues(pending);
    if (/^\d+$/.test(text) && options.length > 0) return Number(text) >= 1 && Number(text) <= options.length;
    if (options.includes(text) || answerPatterns.some(pattern => pattern.test(text))) return true;
    // A short field/value answer is a useful answer; a sentence that changes
    // the task is more safely treated as a new action.
    return text.split(/\s+/).length <= 6 && Boolean(pending?.question || pending?.kind);
};

export const decidePendingTurn = ({ message, pending = {} } = {}) => {
    const text = String(message || '').trim();
    if (resumePatterns.some(pattern => pattern.test(text))) return { kind: 'resume_pending' };
    if (isConversationalMessage(text)) return { kind: 'conversation' };
    if (isClarificationAnswer({ message: text, pending })) return { kind: 'clarification_answer', answer: text };
    return { kind: 'new_action', message: text };
};
