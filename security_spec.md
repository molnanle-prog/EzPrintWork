# Security Specification for EzPrintWork

## Data Invariants
1. **Tenant Isolation**: A user can only access data belonging to their assigned `tenantId`.
2. **Role-Based Access**:
   - `admin`: Full access within their tenant.
   - `staff`: Can read all data in the tenant. Can create/update jobs, staff (except status/role of others), clients, quotes, messages, etc.
   - `system admin` (Bootstrap): Initial user who creates the tenant is an admin.
3. **Public Access**: No public access allowed to any tenant data.
4. **User Profile**: Users can only read/write their own root `/users/{uid}` document, except that `tenantId` and `role` are immutable by the user (only system/admin can set them during onboarding).

## The Dirty Dozen Payloads (Rejection Targets)

1. **Identity Spoofing**: Attacker authenticated as `userA` attempts to create a job at `/tenants/tenantB/jobs/job1`.
2. **Privilege Escalation**: `staff` member attempts to update their own role to `admin` in `/users/uid`.
3. **Ghost Field Injection**: Attacker attempts to update a job with `isVerified: true` (a field not in schema).
4. **ID Poisoning**: Attacker attempts to create a document with a 1MB junk string as the ID.
5. **Orphaned Write**: Attacker attempts to create a job with a `projectId` that doesn't exist. (Relational Sync)
6. **Immutable field change**: User attempts to change `createdAt` on an existing job.
7. **Resource Exhaustion**: User attempts to save a 1MB string into the `title` field.
8. **PII Leak**: Non-admin user attempts to read another user's email from `/users/{uid}`.
9. **State Shortcut**: User attempts to set job status to `DELIVERY` directly from `RECEIVED` bypassing middle states (if enforced).
10. **Tenant Hopping**: User with `tenantA` attempts to list jobs from `tenantB`.
11. **Shadow Update**: User updates job but also changes `ownerId`.
12. **Unverified Email**: User with unverified email attempts to write data (if verification is strict).

## Testing Strategy
We will use `firestore.rules.test.ts` to verify these rejections.
