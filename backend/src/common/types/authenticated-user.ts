import { UserRole, UserStatus } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  status: UserStatus;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  username: string;
  role: UserRole;
  type: 'access';
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}
