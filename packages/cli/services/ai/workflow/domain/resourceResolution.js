const text = value => String(value || '').trim();

const normalized = value => text(value).toLocaleLowerCase().replace(/\s+/g, ' ');

const optionsForPicker = options => (options || []).map(option => ({
    id: String(option.value),
    name: option.label || option.value,
    description: option.description || null
}));

const exactOption = (options, query) => {
    const expected = normalized(query);
    if (!expected) return null;
    return (options || []).find(option => normalized(option.label) === expected) || null;
};

const likelyResponseRange = options => {
    const candidates = options || [];
    if (candidates.length === 1) return candidates[0]?.value || null;
    return candidates.find(option => /^form responses?(?:\s*\d+)?$/i.test(text(option.label)))?.value || null;
};

const picker = ({ id, label, resource, result, message, query = '', allowCustom = false, customLabel = null, defaultValue = null }) => ({
    type: 'message',
    message,
    inputs: [{
        id,
        type: 'resource_picker',
        label,
        resource,
        account: result?.account || null,
        options: optionsForPicker(result?.options),
        searchable: true,
        ...(query ? { query } : {}),
        ...(defaultValue ? { defaultValue } : {}),
        ...(allowCustom ? { allowCustom: true, customLabel: customLabel || 'Paste URL or ID' } : {})
    }]
});

const failed = error => ({ status: 'error', error });

const lookup = async ({ userId, resourceLookup, resource, params = {} }) => {
    try {
        const result = await resourceLookup({ userId, resource, params });
        if (result?.error) return failed(result.error);
        return { status: 'ok', result };
    } catch (error) {
        return failed(error);
    }
};

const googleFormPicker = ({ result, query }) => {
    const preselected = exactOption(result?.options, query)?.value || null;
    return picker({
        id: 'googleFormId',
        label: 'Google Form',
        resource: 'google-forms',
        result,
        query,
        defaultValue: preselected,
        allowCustom: true,
        customLabel: 'Paste Google Form URL or ID',
        message: 'Choose the Google Form whose response Sheet should start this workflow.'
    });
};

const googleSheetPicker = ({ id, label = 'Google Sheet', result, query, message }) => picker({
    id,
    label,
    resource: 'google-spreadsheets',
    result,
    query,
    defaultValue: exactOption(result?.options, query)?.value || null,
    allowCustom: true,
    customLabel: 'Paste Google Sheets URL or ID',
    message
});

/**
 * Resolves a multi-stage Google Form response source without asking callers to
 * know about Drive, Forms, Sheets, or worksheet dependencies. The public
 * result is deliberately small: continue, ask the user, or report a resource
 * failure. Other resource recipes can use the same result shape.
 */
export const resolveGoogleFormResponseSource = async ({
    userId,
    resourceLookup,
    state = {},
    query = ''
} = {}) => {
    const formId = text(state.googleFormId);
    if (!formId) {
        const forms = await lookup({ userId, resourceLookup, resource: 'google-forms' });
        if (forms.status === 'error') return forms;
        return { status: 'clarification', clarification: googleFormPicker({ result: forms.result, query }) };
    }

    const formSource = await lookup({
        userId,
        resourceLookup,
        resource: 'google-form-response-sheet',
        params: { formId }
    });
    if (formSource.status === 'error') return formSource;
    const formMetadata = formSource.result?.metadata || {};
    const linkedSheetId = text(formMetadata.linkedSheetId);
    const requestedSheetId = text(state.googleFormSpreadsheetId);
    const spreadsheetId = linkedSheetId || requestedSheetId;

    if (!spreadsheetId) {
        const spreadsheets = await lookup({ userId, resourceLookup, resource: 'google-spreadsheets' });
        if (spreadsheets.status === 'error') return spreadsheets;
        return {
            status: 'clarification',
            clarification: googleSheetPicker({
                id: 'googleFormSpreadsheetId',
                result: spreadsheets.result,
                query,
                message: 'This Google Form has no linked response Sheet. Choose the Sheet that receives its responses.'
            })
        };
    }

    const ranges = await lookup({
        userId,
        resourceLookup,
        resource: 'google-sheet-ranges',
        params: { spreadsheetId }
    });
    if (ranges.status === 'error') return ranges;
    const selectedRange = text(state.googleFormRange);
    if (!selectedRange) {
        const defaultValue = likelyResponseRange(ranges.result?.options);
        return {
            status: 'clarification',
            clarification: picker({
                id: 'googleFormRange',
                label: 'Response tab',
                resource: 'google-sheet-ranges',
                result: ranges.result,
                defaultValue,
                message: defaultValue
                    ? 'Review the suggested response tab, then continue drafting.'
                    : 'Choose the tab that receives Google Form responses.'
            })
        };
    }

    const rangeOption = (ranges.result?.options || []).find(option => String(option.value) === selectedRange);
    if (!rangeOption) {
        return {
            status: 'clarification',
            clarification: picker({
                id: 'googleFormRange',
                label: 'Response tab',
                resource: 'google-sheet-ranges',
                result: ranges.result,
                message: 'That tab is no longer available. Choose a current response tab.'
            })
        };
    }

    const spreadsheet = await lookup({ userId, resourceLookup, resource: 'google-spreadsheets' });
    if (spreadsheet.status === 'error') return spreadsheet;
    const spreadsheetOption = (spreadsheet.result?.options || []).find(option => String(option.value) === spreadsheetId);
    const spreadsheetName = spreadsheetOption?.label || formMetadata.formTitle || 'Linked response Sheet';
    return {
        status: 'resolved',
        resourceSelections: { 'google-spreadsheets': spreadsheetId },
        source: {
            formId,
            formTitle: formMetadata.formTitle || null,
            spreadsheetId,
            spreadsheetName,
            range: selectedRange,
            rangeName: rangeOption.label || selectedRange
        }
    };
};

/**
 * Resolves a Google Sheets new-row trigger. This intentionally uses the same
 * resource-picker contract as the Form recipe, but has no assumption about a
 * Form, its response Sheet, or a tab name. A pasted ID is verified before it
 * can become a workflow trigger.
 */
export const resolveGoogleSheetRowSource = async ({
    userId,
    resourceLookup,
    state = {},
    query = ''
} = {}) => {
    const sheets = await lookup({ userId, resourceLookup, resource: 'google-spreadsheets' });
    if (sheets.status === 'error') return sheets;
    const requestedSpreadsheetId = text(state.googleSheetTriggerSpreadsheetId);
    if (!requestedSpreadsheetId) {
        return {
            status: 'clarification',
            clarification: googleSheetPicker({
                id: 'googleSheetTriggerSpreadsheetId',
                result: sheets.result,
                query,
                message: 'Choose the Google Sheet to watch for new rows.'
            })
        };
    }

    let spreadsheetOption = (sheets.result?.options || [])
        .find(option => String(option.value) === requestedSpreadsheetId) || null;
    if (!spreadsheetOption) {
        const verified = await lookup({
            userId,
            resourceLookup,
            resource: 'google-spreadsheet',
            params: { spreadsheetId: requestedSpreadsheetId }
        });
        if (verified.status === 'error') return verified;
        spreadsheetOption = verified.result?.options?.[0] || null;
        if (!spreadsheetOption) {
            return {
                status: 'clarification',
                clarification: googleSheetPicker({
                    id: 'googleSheetTriggerSpreadsheetId',
                    result: sheets.result,
                    query,
                    message: 'I could not verify that Google Sheet. Choose one from your connected account or paste another URL.'
                })
            };
        }
    }

    const spreadsheetId = String(spreadsheetOption.value);
    const ranges = await lookup({
        userId,
        resourceLookup,
        resource: 'google-sheet-ranges',
        params: { spreadsheetId }
    });
    if (ranges.status === 'error') return ranges;
    const selectedRange = text(state.googleSheetTriggerRange);
    if (!selectedRange) {
        const defaultValue = (ranges.result?.options || []).length === 1
            ? ranges.result.options[0].value
            : null;
        return {
            status: 'clarification',
            clarification: picker({
                id: 'googleSheetTriggerRange',
                label: 'Sheet tab and range',
                resource: 'google-sheet-ranges',
                result: ranges.result,
                defaultValue,
                message: defaultValue
                    ? 'Review the suggested tab and range, then continue drafting.'
                    : 'Choose the Sheet tab and range to watch for new rows.'
            })
        };
    }

    const rangeOption = (ranges.result?.options || []).find(option => String(option.value) === selectedRange);
    if (!rangeOption) {
        return {
            status: 'clarification',
            clarification: picker({
                id: 'googleSheetTriggerRange',
                label: 'Sheet tab and range',
                resource: 'google-sheet-ranges',
                result: ranges.result,
                message: 'That tab or range is no longer available. Choose a current one.'
            })
        };
    }

    return {
        status: 'resolved',
        resourceSelections: { 'google-spreadsheets': spreadsheetId },
        source: {
            spreadsheetId,
            spreadsheetName: spreadsheetOption.label || 'Google Sheet',
            range: selectedRange,
            rangeName: rangeOption.label || selectedRange
        }
    };
};

export const resourceResolutionInternals = Object.freeze({
    exactOption,
    likelyResponseRange,
    optionsForPicker
});
