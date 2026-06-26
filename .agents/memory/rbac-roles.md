---
name: RBAC 7-role matrix
description: Role permission matrix for all 7 roles and which routes/pages each can access
---

## Roles
owner, admin, sales, engineer, technician, accountant, distributor

## Route → allowed roles
| Route | Roles |
|-------|-------|
| / dashboard | owner, admin, accountant |
| /customers | owner, admin, sales, accountant |
| /quotes | owner, admin, sales, distributor |
| /work-orders | owner, admin, engineer, technician |
| /receivables | owner, admin, accountant |
| /payments | owner, admin, accountant |
| /warranties | owner, admin, accountant |
| /maintenance | owner, admin, engineer, technician |
| /users | owner only |

## Backend enforcement pattern
Each route file (customers.ts, quotes.ts, workOrders.ts, maintenance.ts) has READ_ROLES / WRITE_ROLES / DELETE_ROLES constants.
- sales: can read+write customers/quotes but NOT delete
- engineer: can read+write work-orders/maintenance
- technician: read-only on work-orders/maintenance (PATCH via PROGRESS_ROLES)
- distributor: read+write quotes only

## defaultPathForRole (App.tsx)
- engineer, technician → /work-orders
- sales, distributor → /quotes
- owner, admin, accountant → /

## User management safety rules (backend enforced)
- Cannot DELETE self (checked against req.user.id)
- Cannot DELETE last active owner (counts other active owners first)
- Reset password forces mustChangePassword: true on target user

**Why:** These rules prevent lockout and accidental self-deletion; enforced server-side so frontend bypass is impossible.
