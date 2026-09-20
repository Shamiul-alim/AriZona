import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skips authentication entirely for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
/**
 * Route works for both guests and signed-in users. A valid token populates
 * `req.user`; a missing or invalid token leaves it undefined instead of 401.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

export const AUDIT_ACTION_KEY = 'auditAction';
/** Records the decorated admin action in the ActivityLog audit trail. */
export const Audit = (action: string, entityType?: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, entityType });
