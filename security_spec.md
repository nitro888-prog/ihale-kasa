# Security Specification — İhaleKasa

## 1. Data Invariants
1. **Strict Tenant / Company Isolation**: Every `companyProfiles/{userId}`, `tenders/{tenderId}`, `tenders/{tenderId}/documents/{docId}`, `tenders/{tenderId}/documents/{docId}/chunks/{chunkId}`, `companyVault/{docId}`, and `companyVault/{docId}/chunks/{chunkId}` document is owned exclusively by `ownerId == request.auth.uid` with `request.auth.token.email_verified == true`.
2. **Master Gate Relational Integrity**: Subcollections (`documents` and `chunks`) enforce `get()` against parent `tenders/{tenderId}` or `companyVault/{docId}` on single-document operations (`get`, `create`, `update`, `delete`) to ensure synchronous revocation if parent is deleted or re-owned.
3. **Calendar-Synchronized Tracking Code Format**: `trackingCode` must match `^IH-[0-9]{8}-[0-9]{2,4}$` and `tenderDate` must match `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`.
4. **Immutable Ownership & Timestamps**: `ownerId`, `tenderId`, `docId`, and `createdAt` cannot be modified after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Terminal State Locking**: Once a tender reaches terminal status `'sonuclandi'` or `'iptal'`, status transitions back to active preparation are blocked unless explicitly deleting or archiving notes? Actually per Pillar 4.6, once status is `'sonuclandi'` or `'iptal'`, block further state mutations!

## 2. Dirty Dozen Adversarial Payloads
1. **Cross-Tenant Read/List**: User B attempts `list` on `/tenders` without `where('ownerId', '==', uidB)` -> Rejected by `resource.data.ownerId == request.auth.uid`.
2. **Identity Spoofing on Create**: User A sets `ownerId: "userB"` when creating a tender -> Rejected by `incoming().ownerId == request.auth.uid`.
3. **Unverified Email Access**: Authenticated user with `email_verified: false` attempts write -> Rejected by `isVerified()`.
4. **Shadow Ghost Field Injection**: User injects `isAdmin: true` or `ghostField: "x"` in tender payload -> Rejected by `hasOnly(...)`.
5. **Document ID Poisoning**: Attacker writes to `/tenders/<1500-char-id>` -> Rejected by `isValidId(tenderId)`.
6. **Orphaned Document Write**: Attacker writes to `/tenders/nonexistent/documents/doc1` -> Rejected by parent `exists()` / `get()` Master Gate.
7. **Oversized String Denial-of-Wallet**: Attacker sends 1MB string in `tender.title` or `notes` -> Rejected by `.size() <= max`.
8. **Timestamp Forgery**: Attacker sends `createdAt: "2020-01-01T00:00:00Z"` -> Rejected by `incoming().createdAt == request.time`.
9. **Immutable Field Overwrite**: Attacker attempts `update` changing `ownerId` or `createdAt` -> Rejected by `affectedKeys().hasOnly(...)` & equality check.
10. **Terminal State Mutation**: Attacker updates a tender whose existing status is `'iptal'` back to `'hazirlik'` -> Rejected by terminal lock `!(existing().status in ['sonuclandi', 'iptal'])`.
11. **Value Poisoning on Whitelisted Key**: Attacker sends `status: 12345` or `estimatedAmount: -999` in allowed update keys -> Rejected by `isValidTender()` wrapping entire update block.
12. **PII Leak on Company Profile**: User B tries `get('/companyProfiles/userA')` -> Rejected by `request.auth.uid == userId`.
