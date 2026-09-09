import Ajv from 'ajv';
import {
    normalizeWebhookBodySchema,
    webhookBodyContractFingerprint
} from '../../../shared/webhookPayloadContract.js';

const ajv = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: false,
    removeAdditional: false,
    useDefaults: false
});

const validators = new Map();

const escapePointer = value => String(value).replace(/~/g, '~0').replace(/\//g, '~1');

const issuePath = error => {
    const base = error?.instancePath || '';
    if (error?.keyword === 'required' && error.params?.missingProperty) {
        return `${base}/${escapePointer(error.params.missingProperty)}` || '/';
    }
    if (error?.keyword === 'additionalProperties' && error.params?.additionalProperty) {
        return `${base}/${escapePointer(error.params.additionalProperty)}` || '/';
    }
    return base || '/';
};

const publicIssue = error => ({
    path: issuePath(error),
    keyword: error?.keyword,
    message: error?.message || 'Request body is invalid.'
});

export const compileWebhookBodyValidator = bodySchema => {
    const contract = normalizeWebhookBodySchema(bodySchema);
    if (!contract.configured || contract.issues.length > 0) return { contract, validate: null };
    const fingerprint = webhookBodyContractFingerprint(contract.schema);
    let validate = validators.get(fingerprint);
    if (!validate) {
        validate = ajv.compile(contract.schema);
        validators.set(fingerprint, validate);
    }
    return { contract, validate };
};

export const validateWebhookBody = ({ body, bodySchema } = {}) => {
    const compiled = compileWebhookBodyValidator(bodySchema);
    if (compiled.contract.issues.length > 0) {
        return {
            valid: false,
            configurationIssues: compiled.contract.issues,
            issues: []
        };
    }
    if (!compiled.validate) return { valid: true, configurationIssues: [], issues: [] };
    const valid = compiled.validate(body);
    return {
        valid,
        configurationIssues: [],
        issues: valid ? [] : (compiled.validate.errors || []).map(publicIssue)
    };
};

export const webhookContractFingerprint = bodySchema => webhookBodyContractFingerprint(bodySchema) || 'none';

export const webhookContractsAgree = contracts => {
    const fingerprints = new Set((contracts || []).map(contract => webhookContractFingerprint(contract)));
    return fingerprints.size <= 1;
};
