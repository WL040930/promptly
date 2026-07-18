import { isRetryableAIError } from './aiErrors.js';

export const shouldFailover = ({ error, hasNextRoute }) => hasNextRoute && isRetryableAIError(error);
