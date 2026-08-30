export const MIN_PASSWORD_LENGTH = 12;

export const PASSWORD_REQUIREMENTS_HINT = `Use at least ${MIN_PASSWORD_LENGTH} characters, including an uppercase letter, a lowercase letter, a number, and a symbol.`;
export const PASSWORD_REQUIREMENTS_ERROR = `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include uppercase, lowercase, number, and symbol.`;

export const passwordPattern = new RegExp(
    `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{${MIN_PASSWORD_LENGTH},}$`
);

export const isValidPassword = value => passwordPattern.test(String(value || ''));
