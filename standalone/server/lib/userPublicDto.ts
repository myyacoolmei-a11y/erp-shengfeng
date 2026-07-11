import type { User } from "@workspace/db";
import type { FeatureKey, DataPermission } from "../../shared/userPermissions.ts";
import {
  resolveFeaturePermissions,
  resolveDataPermission,
  effectiveRolesFromUser,
} from "../../shared/userPermissions.ts";

export interface UserPublicDto {
  id: number;
  username: string;
  displayName: string;
  role: string;
  roles: string[];
  phone: string | null;
  email: string | null;
  identityType: string;
  title: string | null;
  notes: string | null;
  featurePermissions: FeatureKey[];
  dataPermission: DataPermission;
  linkedEmployeeId: number | null;
  isActive: boolean;
  createdAt: Date;
}

export function toUserPublicDto(user: User): UserPublicDto {
  const roles = effectiveRolesFromUser(user);
  const userLike = {
    role: user.role,
    roles,
    featurePermissions: user.featurePermissions ?? [],
    dataPermission: user.dataPermission,
  };
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roles,
    phone: user.phone ?? null,
    email: user.email ?? null,
    identityType: user.identityType ?? "employee",
    title: user.title ?? null,
    notes: user.notes ?? null,
    featurePermissions: resolveFeaturePermissions(userLike),
    dataPermission: resolveDataPermission(userLike),
    linkedEmployeeId: user.linkedEmployeeId ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export function toJwtUserFields(user: User) {
  const dto = toUserPublicDto(user);
  return {
    id: dto.id,
    username: dto.username,
    displayName: dto.displayName,
    role: dto.role,
    roles: dto.roles,
    mustChangePassword: user.mustChangePassword,
    linkedEmployeeId: dto.linkedEmployeeId,
    featurePermissions: dto.featurePermissions,
    dataPermission: dto.dataPermission,
  };
}
