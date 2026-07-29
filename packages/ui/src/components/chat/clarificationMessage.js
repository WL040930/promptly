export const clarificationMessageData = message => {
    const payload = message?.payload || message?.proposal || {};
    const clarification = (message?.options && !Array.isArray(message.options)) ? message.options : null;
    const options = Array.isArray(message?.options)
        ? message.options
        : (clarification?.inputs || payload.inputs || payload.options || []);

    return {
        clarification,
        options,
        selectedState: clarification?.selectedState || payload.selectedState || {}
    };
};
