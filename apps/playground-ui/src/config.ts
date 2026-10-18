const env = import.meta.env;

export const USE_MOCKS = env.VITE_USE_MOCKS ? env.VITE_USE_MOCKS === 'true' : env.DEV;
export const BFF_URL = (env.VITE_BFF_URL ?? '').replace(/\/$/, '');
