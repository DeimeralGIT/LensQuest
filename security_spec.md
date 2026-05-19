# Security Specification - LensQuest

## Data Invariants
1. **Spot Ownership**: Every `Spot` must have a `userId` field that exactly matches the `uid` of the authenticated user who created it.
2. **Public Exploration**: All authenticated and unauthenticated users can `list` and `get` any `Spot`.
3. **Write Restrictions**: Only the owner of a `Spot` can `update` or `delete` it.
4. **Immutability**: The `userId`, `createdAt`, and `imageUrl` fields of a `Spot` are immutable after creation.
5. **AI Tips Protection**: The `aiTips` field can only be set during creation or via a "Commit Metadata" action; users cannot arbitrarily modify it.
6. **User Profiles**: Users can only `create`, `update`, or `delete` their own profile at `/users/{userId}/profile/public`.

## The Dirty Dozen Payloads (Rejection Targets)

1. **Identity Spoofing**: Attempt to create a `Spot` where `userId` is not `request.auth.uid`.
2. **Shadow Update**: Attempt to `update` a `Spot` and add a `isVerified: true` field.
3. **Owner Hijack**: User A attempts to `delete` or `update` a `Spot` owned by User B.
4. **Timestamp Manipulation**: Attempt to `create` a `Spot` with a `createdAt` date in the past or future (must use `request.time`).
5. **ID Poisoning**: Attempt to `get` or `create` a `Spot` with a document ID containing special characters or exceeding size limits.
6. **Resource Exhaustion**: Attempt to `create` a `Spot` with a `title` exceeding 100 characters or a `description` exceeding 1000 characters.
7. **Cross-User Profile Write**: User A attempts to `update` the profile of User B.
8. **Field Injection**: Attempt to `update` a `Spot` and inject a `promoted: true` field.
9. **Terminal State Bypass**: Attempt to `update` a field that is marked as immutable (e.g., `userId`).
10. **Blanket Read Attack**: Attempt to `list` all users' private info (if we had private collections).
11. **Orphaned Write**: Attempt to `create` a `Spot` without a title or imageUrl.
12. **Metadata Tampering**: Attempt to `update` `aiTips` without it being a valid string or within size limits.

## Implementation Plan
1. Define `isValidId`, `isValidSpot`, and `isValidUser` helpers.
2. Implement tiered logic for `Spot` updates.
3. Deploy final rules to Firebase.
