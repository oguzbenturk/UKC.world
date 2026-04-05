import * as yup from 'yup';

export const emailSchema = yup.string()
  .email('Invalid email address')
  .required('Email is required');

export const passwordSchema = yup.string()
  .min(6, 'Password must be at least 6 characters')
  .required('Password is required');

export const loginSchema = yup.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerSchema = yup.object({
  name: yup.string().min(2, 'Name too short').required('Name is required'),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: yup.string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

export const resetPasswordSchema = yup.object({
  email: emailSchema,
});

export const totpSchema = yup.object({
  code: yup.string()
    .length(6, 'Code must be 6 digits')
    .matches(/^\d+$/, 'Code must be numbers only')
    .required('Code is required'),
});
