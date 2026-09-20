import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

/**
 * Authorisation is a security boundary, so the hierarchy needs explicit
 * coverage — particularly the "higher role satisfies a lower requirement"
 * behaviour, which is easy to invert by accident.
 */
function contextFor(user: { role: UserRole } | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

function guardRequiring(roles: UserRole[] | undefined) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows a route with no role requirement', () => {
    expect(guardRequiring(undefined).canActivate(contextFor({ role: UserRole.USER }))).toBe(true);
  });

  it('allows an exact role match', () => {
    expect(guardRequiring([UserRole.ADMIN]).canActivate(contextFor({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('allows a higher role to satisfy a lower requirement', () => {
    const guard = guardRequiring([UserRole.MODERATOR]);
    expect(guard.canActivate(contextFor({ role: UserRole.ADMIN }))).toBe(true);
    expect(guard.canActivate(contextFor({ role: UserRole.SUPER_ADMIN }))).toBe(true);
  });

  it('rejects a lower role', () => {
    expect(() => guardRequiring([UserRole.ADMIN]).canActivate(contextFor({ role: UserRole.USER }))).toThrow(
      ForbiddenException,
    );
    expect(() => guardRequiring([UserRole.SUPER_ADMIN]).canActivate(contextFor({ role: UserRole.ADMIN }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request', () => {
    expect(() => guardRequiring([UserRole.USER]).canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('uses the least privileged of several accepted roles', () => {
    const guard = guardRequiring([UserRole.SUPER_ADMIN, UserRole.MODERATOR]);
    expect(guard.canActivate(contextFor({ role: UserRole.MODERATOR }))).toBe(true);
  });
});
