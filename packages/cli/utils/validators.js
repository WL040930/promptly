import { PASSWORD_REQUIREMENTS_ERROR, passwordPattern } from '../../shared/passwordPolicy.js';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export { normalizeEmail, emailPattern, passwordPattern, PASSWORD_REQUIREMENTS_ERROR };
