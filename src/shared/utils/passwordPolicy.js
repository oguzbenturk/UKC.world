export const PASSWORD_STRENGTH_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export function getPasswordChecks(pwd = '') {
  return {
    length: pwd.length >= 8,
    lower: /[a-z]/.test(pwd),
    upper: /[A-Z]/.test(pwd),
    digit: /\d/.test(pwd),
    special: /[@$!%*?&]/.test(pwd),
  };
}
