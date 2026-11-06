export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
  roleId: number;
  hierarchyLevel: number;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleId: number;
  hierarchyLevel: number;
  pinCode?: string;
}

/**
 * Hono App 環境型別：包含 D1/R2 綁定與 JWT 解出的使用者變數
 */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: JWTPayload;
  };
}
