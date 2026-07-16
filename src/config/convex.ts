export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL?.trim() || null;

export const IS_CONVEX_CONFIGURED = CONVEX_URL !== null;
