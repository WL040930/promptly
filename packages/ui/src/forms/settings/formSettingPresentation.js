export const FORM_SETTING_LABELS = {
    acceptingResponses: 'Accepting responses',
    confirmationMessage: 'Confirmation message',
    limitOnePerBrowser: 'One response per browser',
    hasResponseLimit: 'Response limit',
    responseLimit: 'Maximum responses'
};

export const getFormSettingLabel = key => FORM_SETTING_LABELS[key] || key;

export const formatFormSettingValue = (key, value) => {
    if (value === undefined || value === null || value === '') return 'Not set';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (key === 'responseLimit') return `${value} responses`;
    return String(value);
};
