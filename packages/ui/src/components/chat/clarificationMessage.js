import { clarificationInputsOrFallback } from '../../../../shared/clarificationContract.js';

export const clarificationMessageData = message => {
    const payload = message?.payload || message?.proposal || {};
    const clarification = (message?.options && !Array.isArray(message.options)) ? message.options : null;
    const rawOptions = Array.isArray(message?.options)
        ? message.options
        : (clarification?.inputs || payload.inputs || payload.options || []);
    const options = message?.kind === 'clarification' || clarification
        ? clarificationInputsOrFallback({ inputs: rawOptions, question: message?.text })
        : rawOptions;

    return {
        clarification,
        options,
        selectedState: clarification?.selectedState || payload.selectedState || {}
    };
};
