import {
  collection,
  deleteDoc,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  addDaysToDateStr,
  assembleChunksToBlob,
  computeSha256,
  encodeFileToChunks,
  generateSyncedTrackingCode,
  getTodayDateStr,
} from '../lib/trackingAndCalendar';
import {
  computeTenderPricingItem,
  summarizePricingItems,
} from '../lib/tenderPricing';
import {
  AccountingCheque,
  AccountingChequeDirection,
  AccountingChequeStatus,
  AccountingCompany,
  AccountingCompanyType,
  AccountingEntry,
  AccountingEntryType,
  AccountingPaymentMethod,
  AccountingPaymentStatus,
  ActorIdentity,
  BidProduct,
  BOOTSTRAP_ADMIN_EMAIL,
  COMPANY_VAULT_CATEGORY_LABELS,
  CompanyProfile,
  CompanyVaultCategory,
  CompanyVaultDocument,
  CurrencyCode,
  DEFAULT_CHECKLIST,
  formatProjectManagerNames,
  FULL_PERMISSIONS,
  isOwnRecord,
  isProjectManager,
  Project,
  ProjectManagerEntry,
  ProjectStatus,
  ProjectTransaction,
  ProjectTransactionType,
  PROJECT_TX_TYPE_LABELS,
  RecycleBinItem,
  SALES_QUOTE_DOC_TYPE_LABELS,
  SalesQuote,
  SalesQuoteDocType,
  SalesQuoteItem,
  SalesQuoteStatus,
  SCHEMA_LIMITS,
  TENDER_DOC_CATEGORY_LABELS,
  Tender,
  TenderChecklist,
  TenderDocCategory,
  TenderDocument,
  SavedTenderAnalysis,
  TenderAnalysisMode,
  TenderPricingItem,
  TenderPricingSheet,
  TenderStatus,
  UserAuthStatus,
  UserAuthorization,
  UserInvite,
  UserPermissions,
  UserRole,
  VatFinancingBasis,
  ZERO_PERMISSIONS,
} from '../types/tender';

function makeSafeId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${rand}`;
}

function clampString(val: string, max: number): string {
  return (val || '').trim().slice(0, max);
}

export function buildMemberIds(
  workspaceOwnerId: string,
  extraMemberIds?: string[]
): string[] {
  const set = new Set<string>();
  if (workspaceOwnerId) set.add(workspaceOwnerId);
  if (auth.currentUser?.uid) set.add(auth.currentUser.uid);
  if (extraMemberIds) {
    for (const id of extraMemberIds) {
      if (id && typeof id === 'string') set.add(id);
    }
  }
  return Array.from(set).slice(0, 50);
}

function sameStringArray(a?: string[], b?: string[]): boolean {
  const arrA = a || [];
  const arrB = b || [];
  if (arrA.length !== arrB.length) return false;
  const setA = new Set(arrA);
  return arrB.every((item) => setA.has(item));
}

function ownerOrMemberFilter(_currentUid: string, workspaceOwnerId: string) {
  return where('ownerId', '==', workspaceOwnerId);
}

function resolveActor(actor?: ActorIdentity): ActorIdentity {
  const uid = actor?.uid || auth.currentUser?.uid || '';
  const email = clampString(
    (actor?.email || auth.currentUser?.email || '').toLowerCase(),
    SCHEMA_LIMITS.EMAIL_MAX
  );
  const displayName = clampString(
    actor?.displayName || auth.currentUser?.displayName || email || 'Kullanıcı',
    100
  );
  return { uid, email, displayName };
}

function buildCreatorFields(actor?: ActorIdentity) {
  const resolved = resolveActor(actor);
  return {
    createdBy: resolved.uid,
    createdByEmail: resolved.email,
    createdByName: resolved.displayName,
  };
}

function sanitizePermissions(p?: Partial<UserPermissions>): UserPermissions {
  return {
    canCreateTender: Boolean(p?.canCreateTender),
    canEditTender: Boolean(p?.canEditTender),
    canDeleteTender: Boolean(p?.canDeleteTender),
    canManageVault: Boolean(p?.canManageVault),
    canManageProducts: Boolean(p?.canManageProducts),
    canAnalyzeDocuments: Boolean(p?.canAnalyzeDocuments),
    canManageSettings: Boolean(p?.canManageSettings),
    canManageAccounting: Boolean(p?.canManageAccounting),
    canViewProjects: Boolean(p?.canViewProjects),
    canManageQuotes: Boolean(p?.canManageQuotes),
    canManagePricing: Boolean(p?.canManagePricing),
  };
}

// Preserves the exact keys stored on an invite document so Firestore rules equality
// (`incoming().permissions == invite.permissions`) holds for both legacy and new invites.
function preserveInvitePermissions(p?: Partial<UserPermissions>): UserPermissions {
  const base: UserPermissions = {
    canCreateTender: Boolean(p?.canCreateTender),
    canEditTender: Boolean(p?.canEditTender),
    canDeleteTender: Boolean(p?.canDeleteTender),
    canManageVault: Boolean(p?.canManageVault),
    canManageProducts: Boolean(p?.canManageProducts),
    canAnalyzeDocuments: Boolean(p?.canAnalyzeDocuments),
    canManageSettings: Boolean(p?.canManageSettings),
  };
  if (p && 'canManageAccounting' in p) {
    base.canManageAccounting = Boolean(p.canManageAccounting);
  }
  if (p && 'canViewProjects' in p) {
    base.canViewProjects = Boolean(p.canViewProjects);
  }
  if (p && 'canManageQuotes' in p) {
    base.canManageQuotes = Boolean(p.canManageQuotes);
  }
  if (p && 'canManagePricing' in p) {
    base.canManagePricing = Boolean(p.canManagePricing);
  }
  return base;
}

// 0. User Authorizations & RBAC
export function subscribeCurrentUserAuth(
  uid: string,
  onData: (authDoc: UserAuthorization | null) => void
) {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData(snap.data() as UserAuthorization);
      }
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export async function ensureUserAuthorization(
  firebaseUser: User
): Promise<UserAuthorization> {
  const uid = firebaseUser.uid;
  const emailLower = clampString(
    (firebaseUser.email || '').toLowerCase(),
    SCHEMA_LIMITS.EMAIL_MAX
  );
  const isBootstrap = emailLower === BOOTSTRAP_ADMIN_EMAIL;
  const userRef = doc(db, 'users', uid);
  const adminRef = doc(db, 'admins', uid);
  const path = `users/${uid}`;

  try {
    const existingSnap = await getDoc(userRef);

    if (existingSnap.exists()) {
      const data = existingSnap.data() as UserAuthorization;

      if (isBootstrap) {
        if (
          data.role !== 'admin' ||
          data.status !== 'active' ||
          data.workspaceOwnerId !== uid
        ) {
          const adminSnap = await getDoc(adminRef);
          if (!adminSnap.exists()) {
            await setDoc(adminRef, {
              uid,
              email: emailLower,
              grantedBy: uid,
              createdAt: serverTimestamp(),
            });
          }
          const nextManagers = Array.from(
            new Set([...(data.managerUids || []), uid])
          ).slice(0, 20);
          await updateDoc(userRef, {
            role: 'admin',
            status: 'active',
            workspaceOwnerId: uid,
            permissions: { ...FULL_PERMISSIONS },
            approvedBy: uid,
            managerUids: nextManagers,
            updatedAt: serverTimestamp(),
          });
          return {
            ...data,
            role: 'admin',
            status: 'active',
            workspaceOwnerId: uid,
            permissions: { ...FULL_PERMISSIONS },
            approvedBy: uid,
            managerUids: nextManagers,
          };
        }
      } else if (data.status === 'pending' && emailLower) {
        const pendingInvitesSnap = await getDocs(
          query(
            collection(db, 'userInvites'),
            where('email', '==', emailLower),
            where('status', '==', 'pending_claim')
          )
        );
        if (!pendingInvitesSnap.empty) {
          const inviteDoc = pendingInvitesSnap.docs[0];
          const invite = inviteDoc.data() as Omit<UserInvite, 'id'>;
          const managers = Array.from(
            new Set([invite.workspaceOwnerId, invite.invitedBy].filter(Boolean))
          ).slice(0, 20);
          const nextPermissions = preserveInvitePermissions(invite.permissions);
          const nextDisplayName = clampString(
            invite.displayName || data.displayName || firebaseUser.displayName || emailLower,
            100
          );
          const nextDepartment = clampString(
            invite.department || data.department || '',
            SCHEMA_LIMITS.DEPARTMENT_MAX
          );

          const batch = writeBatch(db);
          batch.update(userRef, {
            displayName: nextDisplayName,
            department: nextDepartment,
            role: invite.role,
            status: 'active' as UserAuthStatus,
            workspaceOwnerId: invite.workspaceOwnerId,
            inviteId: inviteDoc.id,
            permissions: nextPermissions,
            approvedBy: invite.invitedBy,
            managerUids: managers,
            updatedAt: serverTimestamp(),
          });
          batch.update(inviteDoc.ref, {
            status: 'claimed',
            claimedBy: uid,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();

          if (invite.role === 'admin') {
            const adminSnap = await getDoc(adminRef);
            if (!adminSnap.exists()) {
              await setDoc(adminRef, {
                uid,
                email: emailLower,
                grantedBy: invite.invitedBy,
                createdAt: serverTimestamp(),
              });
            }
          }

          return {
            ...data,
            displayName: nextDisplayName,
            department: nextDepartment,
            role: invite.role,
            status: 'active',
            workspaceOwnerId: invite.workspaceOwnerId,
            inviteId: inviteDoc.id,
            permissions: nextPermissions,
            approvedBy: invite.invitedBy,
            managerUids: managers,
          };
        }
      }

      return data;
    }

    // Bootstrap Admin first login
    if (isBootstrap) {
      const payload = {
        uid,
        email: emailLower,
        displayName: clampString(firebaseUser.displayName || 'Sistem Yöneticisi', 100),
        department: 'Yönetim',
        role: 'admin' as UserRole,
        status: 'active' as UserAuthStatus,
        workspaceOwnerId: uid,
        inviteId: '',
        permissions: { ...FULL_PERMISSIONS },
        approvedBy: uid,
        managerUids: [uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, payload);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          uid,
          email: emailLower,
          grantedBy: uid,
          createdAt: serverTimestamp(),
        });
      }
      return payload;
    }

    // Check email pre-authorization invite
    if (emailLower) {
      const invitesSnap = await getDocs(
        query(
          collection(db, 'userInvites'),
          where('email', '==', emailLower),
          where('status', '==', 'pending_claim')
        )
      );

      if (!invitesSnap.empty) {
        const inviteDoc = invitesSnap.docs[0];
        const invite = inviteDoc.data() as Omit<UserInvite, 'id'>;
        const managers = Array.from(
          new Set([invite.workspaceOwnerId, invite.invitedBy].filter(Boolean))
        ).slice(0, 20);

        const userPayload = {
          uid,
          email: emailLower,
          displayName: clampString(
            invite.displayName || firebaseUser.displayName || emailLower,
            100
          ),
          department: clampString(invite.department || '', SCHEMA_LIMITS.DEPARTMENT_MAX),
          role: invite.role,
          status: 'active' as UserAuthStatus,
          workspaceOwnerId: invite.workspaceOwnerId,
          inviteId: inviteDoc.id,
          permissions: preserveInvitePermissions(invite.permissions),
          approvedBy: invite.invitedBy,
          managerUids: managers,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const batch = writeBatch(db);
        batch.set(userRef, userPayload);
        batch.update(inviteDoc.ref, {
          status: 'claimed',
          claimedBy: uid,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();

        if (invite.role === 'admin') {
          await setDoc(adminRef, {
            uid,
            email: emailLower,
            grantedBy: invite.invitedBy,
            createdAt: serverTimestamp(),
          });
        }

        return userPayload;
      }
    }

    // Uninvited user -> Pending authorization gate
    const pendingPayload = {
      uid,
      email: emailLower,
      displayName: clampString(
        firebaseUser.displayName || emailLower || 'Kullanıcı',
        100
      ),
      department: '',
      role: 'goruntuleyici' as UserRole,
      status: 'pending' as UserAuthStatus,
      workspaceOwnerId: '',
      inviteId: '',
      permissions: { ...ZERO_PERMISSIONS },
      approvedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, pendingPayload);
    return pendingPayload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeAllUsers(
  currentUid: string,
  isBootstrap: boolean,
  onData: (users: UserAuthorization[]) => void
) {
  const path = 'users';
  const q = isBootstrap
    ? collection(db, 'users')
    : query(
        collection(db, 'users'),
        where('managerUids', 'array-contains', currentUid)
      );

  return onSnapshot(
    q,
    (snap) => {
      const items: UserAuthorization[] = snap.docs.map(
        (d) => d.data() as UserAuthorization
      );
      items.sort((a, b) => {
        const order: Record<UserAuthStatus, number> = {
          pending: 0,
          active: 1,
          suspended: 2,
        };
        const cmp = order[a.status] - order[b.status];
        if (cmp !== 0) return cmp;
        return (a.displayName || a.email).localeCompare(
          b.displayName || b.email,
          'tr'
        );
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeUserInvites(
  currentUid: string,
  isBootstrap: boolean,
  onData: (invites: UserInvite[]) => void
) {
  const path = 'userInvites';
  const q = isBootstrap
    ? collection(db, 'userInvites')
    : query(collection(db, 'userInvites'), where('invitedBy', '==', currentUid));

  return onSnapshot(
    q,
    (snap) => {
      const items: UserInvite[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<UserInvite, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => a.email.localeCompare(b.email, 'tr'));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export interface CreateUserInviteInput {
  email: string;
  displayName: string;
  department: string;
  role: UserRole;
  permissions: UserPermissions;
}

export async function createUserInvite(
  adminUid: string,
  workspaceOwnerId: string,
  input: CreateUserInviteInput
): Promise<string> {
  const inviteId = makeSafeId('inv');
  const path = `userInvites/${inviteId}`;
  const emailLower = clampString(
    input.email.toLowerCase(),
    SCHEMA_LIMITS.EMAIL_MAX
  );

  try {
    await setDoc(doc(db, 'userInvites', inviteId), {
      email: emailLower,
      displayName: clampString(input.displayName, 100),
      department: clampString(input.department, SCHEMA_LIMITS.DEPARTMENT_MAX),
      role: input.role,
      workspaceOwnerId,
      permissions:
        input.role === 'admin'
          ? { ...FULL_PERMISSIONS }
          : sanitizePermissions(input.permissions),
      invitedBy: adminUid,
      status: 'pending_claim',
      claimedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return inviteId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteUserInvite(inviteId: string): Promise<void> {
  const path = `userInvites/${inviteId}`;
  try {
    await deleteDoc(doc(db, 'userInvites', inviteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface UpdateUserAuthInput {
  displayName: string;
  department: string;
  role: UserRole;
  status: UserAuthStatus;
  permissions: UserPermissions;
}

export async function updateUserAuthorization(
  adminUid: string,
  workspaceOwnerId: string,
  targetUser: UserAuthorization,
  updates: UpdateUserAuthInput,
  managerUids: string[]
): Promise<void> {
  const path = `users/${targetUser.uid}`;
  const effectivePermissions =
    updates.role === 'admin'
      ? { ...FULL_PERMISSIONS }
      : sanitizePermissions(updates.permissions);
  const nextWorkspaceOwnerId =
    updates.status === 'active'
      ? targetUser.workspaceOwnerId || workspaceOwnerId
      : targetUser.workspaceOwnerId;
  const normalizedManagers = Array.from(
    new Set([workspaceOwnerId, adminUid, ...managerUids].filter(Boolean))
  ).slice(0, 20);

  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      displayName: clampString(updates.displayName, 100),
      department: clampString(updates.department, SCHEMA_LIMITS.DEPARTMENT_MAX),
      role: updates.role,
      status: updates.status,
      workspaceOwnerId: nextWorkspaceOwnerId,
      permissions: effectivePermissions,
      approvedBy: adminUid,
      managerUids: normalizedManagers,
      updatedAt: serverTimestamp(),
    });

    const adminRef = doc(db, 'admins', targetUser.uid);
    const adminSnap = await getDoc(adminRef);
    const shouldBeAdmin = updates.role === 'admin' && updates.status === 'active';

    if (shouldBeAdmin && !adminSnap.exists()) {
      await setDoc(adminRef, {
        uid: targetUser.uid,
        email: targetUser.email.toLowerCase(),
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
      });
    } else if (!shouldBeAdmin && adminSnap.exists() && targetUser.uid !== adminUid) {
      await deleteDoc(adminRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserAuthorization(targetUid: string): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    const adminRef = doc(db, 'admins', targetUid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists()) {
      await deleteDoc(adminRef);
    }
    await deleteDoc(doc(db, 'users', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

async function commitInChunks(
  ops: { ref: DocumentReference; data: Record<string, unknown> }[]
): Promise<number> {
  const CHUNK_SIZE = 350;
  let updatedCount = 0;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const slice = ops.slice(i, i + CHUNK_SIZE);
    try {
      const batch = writeBatch(db);
      for (const op of slice) {
        batch.update(op.ref, op.data);
      }
      await batch.commit();
      updatedCount += slice.length;
    } catch {
      // Fall back to individual updates so one legacy doc never aborts the entire sync
      for (const op of slice) {
        try {
          await updateDoc(op.ref, op.data);
          updatedCount += 1;
        } catch {
          // Skip doc that cannot be updated
        }
      }
    }
  }
  return updatedCount;
}

export async function syncWorkspaceMemberIds(
  workspaceOwnerId: string,
  activeMemberUids: string[]
): Promise<number> {
  const normalizedMembers = buildMemberIds(workspaceOwnerId, activeMemberUids);
  const path = `workspaceSync/${workspaceOwnerId}`;
  const ops: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

  try {
    const profileRef = doc(db, 'companyProfiles', workspaceOwnerId);
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      const existingMembers = (profileSnap.data() as CompanyProfile).memberIds;
      if (!sameStringArray(existingMembers, normalizedMembers)) {
        ops.push({
          ref: profileRef,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const tendersSnap = await getDocs(
      query(collection(db, 'tenders'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const tDoc of tendersSnap.docs) {
      const existingMembers = (tDoc.data() as Tender).memberIds;
      if (!sameStringArray(existingMembers, normalizedMembers)) {
        ops.push({
          ref: tDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }

      const docsSnap = await getDocs(
        query(
          collection(db, 'tenders', tDoc.id, 'documents'),
          where('ownerId', '==', workspaceOwnerId)
        )
      );
      for (const dDoc of docsSnap.docs) {
        const dExisting = (dDoc.data() as TenderDocument).memberIds;
        if (!sameStringArray(dExisting, normalizedMembers)) {
          ops.push({
            ref: dDoc.ref,
            data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
          });
        }
      }
    }

    const vaultSnap = await getDocs(
      query(collection(db, 'companyVault'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const vDoc of vaultSnap.docs) {
      const vExisting = (vDoc.data() as CompanyVaultDocument).memberIds;
      if (!sameStringArray(vExisting, normalizedMembers)) {
        ops.push({
          ref: vDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const productsSnap = await getDocs(
      query(collection(db, 'bidProducts'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const pDoc of productsSnap.docs) {
      const pExisting = (pDoc.data() as BidProduct).memberIds;
      if (!sameStringArray(pExisting, normalizedMembers)) {
        ops.push({
          ref: pDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const accCompaniesSnap = await getDocs(
      query(collection(db, 'accountingCompanies'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const cDoc of accCompaniesSnap.docs) {
      const cExisting = (cDoc.data() as AccountingCompany).memberIds;
      if (!sameStringArray(cExisting, normalizedMembers)) {
        ops.push({
          ref: cDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const accEntriesSnap = await getDocs(
      query(collection(db, 'accountingEntries'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const eDoc of accEntriesSnap.docs) {
      const eExisting = (eDoc.data() as AccountingEntry).memberIds;
      if (!sameStringArray(eExisting, normalizedMembers)) {
        ops.push({
          ref: eDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const accChequesSnap = await getDocs(
      query(collection(db, 'accountingCheques'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const qDoc of accChequesSnap.docs) {
      const qExisting = (qDoc.data() as AccountingCheque).memberIds;
      if (!sameStringArray(qExisting, normalizedMembers)) {
        ops.push({
          ref: qDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const projectsSnap = await getDocs(
      query(collection(db, 'projects'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const prDoc of projectsSnap.docs) {
      const prExisting = (prDoc.data() as Project).memberIds;
      if (!sameStringArray(prExisting, normalizedMembers)) {
        ops.push({
          ref: prDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const projectTxsSnap = await getDocs(
      query(collection(db, 'projectTransactions'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const ptDoc of projectTxsSnap.docs) {
      const ptExisting = (ptDoc.data() as ProjectTransaction).memberIds;
      if (!sameStringArray(ptExisting, normalizedMembers)) {
        ops.push({
          ref: ptDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const salesQuotesSnap = await getDocs(
      query(collection(db, 'salesQuotes'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const sqDoc of salesQuotesSnap.docs) {
      const sqExisting = (sqDoc.data() as SalesQuote).memberIds;
      if (!sameStringArray(sqExisting, normalizedMembers)) {
        ops.push({
          ref: sqDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const pricingSnap = await getDocs(
      query(collection(db, 'tenderPricingSheets'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const prcDoc of pricingSnap.docs) {
      const prcExisting = (prcDoc.data() as TenderPricingSheet).memberIds;
      if (!sameStringArray(prcExisting, normalizedMembers)) {
        ops.push({
          ref: prcDoc.ref,
          data: { memberIds: normalizedMembers, updatedAt: serverTimestamp() },
        });
      }
    }

    const trashSnap = await getDocs(
      query(collection(db, 'recycleBin'), where('ownerId', '==', workspaceOwnerId))
    );
    for (const rDoc of trashSnap.docs) {
      const rExisting = (rDoc.data() as RecycleBinItem).memberIds;
      if (!sameStringArray(rExisting, normalizedMembers)) {
        ops.push({
          ref: rDoc.ref,
          data: { memberIds: normalizedMembers },
        });
      }
    }

    if (ops.length > 0) {
      return await commitInChunks(ops);
    }
    return 0;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// 1. Company Profile
export function subscribeCompanyProfile(
  workspaceOwnerId: string,
  onData: (profile: CompanyProfile | null) => void
) {
  const path = `companyProfiles/${workspaceOwnerId}`;
  return onSnapshot(
    doc(db, 'companyProfiles', workspaceOwnerId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData(snap.data() as CompanyProfile);
      }
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export async function saveCompanyProfile(
  workspaceOwnerId: string,
  input: Omit<CompanyProfile, 'ownerId' | 'updatedAt' | 'memberIds'>,
  memberIds?: string[]
): Promise<void> {
  const path = `companyProfiles/${workspaceOwnerId}`;
  const payload = {
    ownerId: workspaceOwnerId,
    companyName:
      clampString(input.companyName, SCHEMA_LIMITS.COMPANY_NAME_MAX) || 'Kurumsal Firma',
    taxOffice: clampString(input.taxOffice, SCHEMA_LIMITS.TAX_OFFICE_MAX),
    taxNumber: clampString(input.taxNumber, SCHEMA_LIMITS.TAX_NUMBER_MAX),
    authorizedPerson: clampString(input.authorizedPerson, SCHEMA_LIMITS.PERSON_MAX),
    phone: clampString(input.phone, SCHEMA_LIMITS.PHONE_MAX),
    email: clampString(input.email, SCHEMA_LIMITS.EMAIL_MAX),
    defaultReminderDays: Math.max(0, Math.min(30, Number(input.defaultReminderDays) || 3)),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'companyProfiles', workspaceOwnerId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// 2. Tenders
export function subscribeTenders(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (tenders: Tender[]) => void
) {
  const path = 'tenders';
  const q = query(
    collection(db, 'tenders'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: Tender[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<Tender, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const cmp = a.tenderDate.localeCompare(b.tenderDate);
        if (cmp !== 0) return cmp;
        return a.tenderTime.localeCompare(b.tenderTime);
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export type TenderInput = Omit<
  Tender,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

export async function createTender(
  workspaceOwnerId: string,
  input: TenderInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const tenderId = makeSafeId('ih');
  const path = `tenders/${tenderId}`;
  const payload = {
    ownerId: workspaceOwnerId,
    trackingCode: clampString(input.trackingCode, SCHEMA_LIMITS.TRACKING_CODE_MAX),
    ikn: clampString(input.ikn, SCHEMA_LIMITS.IKN_MAX),
    title: clampString(input.title, SCHEMA_LIMITS.TITLE_MAX),
    authority: clampString(input.authority, SCHEMA_LIMITS.AUTHORITY_MAX),
    tenderDate: input.tenderDate,
    tenderTime: input.tenderTime || '10:00',
    location: clampString(input.location, SCHEMA_LIMITS.LOCATION_MAX),
    procurementType: input.procurementType,
    estimatedAmount: Math.max(0, Number(input.estimatedAmount) || 0),
    bidBondAmount: Math.max(0, Number(input.bidBondAmount) || 0),
    currency: input.currency,
    status: input.status,
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    checklist: input.checklist || { ...DEFAULT_CHECKLIST },
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'tenders', tenderId), payload);
    return tenderId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTender(
  tenderId: string,
  input: Partial<TenderInput>,
  options?: {
    currentUid?: string;
    workspaceOwnerId?: string;
    canSyncProducts?: boolean;
  }
): Promise<void> {
  const path = `tenders/${tenderId}`;
  const updateData: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (input.trackingCode !== undefined)
    updateData.trackingCode = clampString(
      input.trackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    );
  if (input.ikn !== undefined) updateData.ikn = clampString(input.ikn, SCHEMA_LIMITS.IKN_MAX);
  if (input.title !== undefined)
    updateData.title = clampString(input.title, SCHEMA_LIMITS.TITLE_MAX);
  if (input.authority !== undefined)
    updateData.authority = clampString(input.authority, SCHEMA_LIMITS.AUTHORITY_MAX);
  if (input.tenderDate !== undefined) updateData.tenderDate = input.tenderDate;
  if (input.tenderTime !== undefined) updateData.tenderTime = input.tenderTime;
  if (input.location !== undefined)
    updateData.location = clampString(input.location, SCHEMA_LIMITS.LOCATION_MAX);
  if (input.procurementType !== undefined)
    updateData.procurementType = input.procurementType;
  if (input.estimatedAmount !== undefined)
    updateData.estimatedAmount = Math.max(0, Number(input.estimatedAmount) || 0);
  if (input.bidBondAmount !== undefined)
    updateData.bidBondAmount = Math.max(0, Number(input.bidBondAmount) || 0);
  if (input.currency !== undefined) updateData.currency = input.currency;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.notes !== undefined)
    updateData.notes = clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX);
  if (input.checklist !== undefined) updateData.checklist = input.checklist;

  try {
    await updateDoc(doc(db, 'tenders', tenderId), updateData);
    const activeUid = options?.currentUid || auth.currentUser?.uid;
    const ownerId = options?.workspaceOwnerId || activeUid;
    const allowProductSync = options?.canSyncProducts ?? true;

    if (input.trackingCode !== undefined && activeUid && ownerId && allowProductSync) {
      const nextCode = clampString(
        input.trackingCode,
        SCHEMA_LIMITS.TRACKING_CODE_MAX
      );
      const linkedSnap = await getDocs(
        query(
          collection(db, 'bidProducts'),
          ownerOrMemberFilter(activeUid, ownerId),
          where('tenderId', '==', tenderId)
        )
      );
      if (!linkedSnap.empty) {
        const batch = writeBatch(db);
        linkedSnap.docs.forEach((p) => {
          batch.update(p.ref, {
            tenderTrackingCode: nextCode,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTenderChecklist(
  tenderId: string,
  checklist: TenderChecklist
): Promise<void> {
  const path = `tenders/${tenderId}`;
  try {
    await updateDoc(doc(db, 'tenders', tenderId), {
      checklist,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTenderStatus(
  tenderId: string,
  status: TenderStatus
): Promise<void> {
  const path = `tenders/${tenderId}`;
  try {
    await updateDoc(doc(db, 'tenders', tenderId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTender(
  currentUid: string,
  workspaceOwnerId: string,
  tender: Tender,
  options?: {
    canManageProducts?: boolean;
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(tender, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan ihale kaydı silinemez.');
  }

  const tenderId = tender.id;
  const docsPath = `tenders/${tenderId}/documents`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || tender.memberIds);
  const canManageProducts = options?.canManageProducts ?? true;

  const docsSnap = await getDocs(
    query(
      collection(db, 'tenders', tenderId, 'documents'),
      ownerOrMemberFilter(currentUid, workspaceOwnerId)
    )
  );
  const tenderDocs: TenderDocument[] = docsSnap.docs.map((d) => ({
    ...(d.data() as Omit<TenderDocument, 'id'>),
    id: d.id,
  }));

  const foreignDoc = tenderDocs.find((d) => !isOwnRecord(d, currentUid));
  if (foreignDoc) {
    throw new Error(
      `Bu ihale dosyasında başka bir kullanıcı tarafından yüklenmiş doküman ("${foreignDoc.name}") bulunduğu için silinemez.`
    );
  }

  try {
    for (const d of tenderDocs) {
      await deleteTenderDocument(currentUid, workspaceOwnerId, tenderId, d, {
        actor,
        parentTenderCode: tender.trackingCode,
        memberIds: members,
      });
    }

    if (canManageProducts) {
      const linkedProductsSnap = await getDocs(
        query(
          collection(db, 'bidProducts'),
          ownerOrMemberFilter(currentUid, workspaceOwnerId),
          where('tenderId', '==', tenderId)
        )
      );
      if (!linkedProductsSnap.empty) {
        const batch = writeBatch(db);
        linkedProductsSnap.docs.forEach((p) => {
          batch.update(p.ref, {
            tenderId: '',
            tenderTrackingCode: '',
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'tender',
      originalId: tender.id,
      parentTenderId: tender.id,
      parentTenderCode: clampString(tender.trackingCode, 64),
      title: clampString(tender.title, 200) || 'İhale Kaydı',
      subtitle: clampString(
        `${tender.trackingCode} · ${tender.authority}`.trim(),
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(tender.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(tender.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        trackingCode: tender.trackingCode,
        ikn: tender.ikn || '',
        title: tender.title,
        authority: tender.authority,
        tenderDate: tender.tenderDate,
        tenderTime: tender.tenderTime,
        location: tender.location || '',
        procurementType: tender.procurementType,
        estimatedAmount: tender.estimatedAmount || 0,
        bidBondAmount: tender.bidBondAmount || 0,
        currency: tender.currency,
        status: tender.status,
        notes: tender.notes || '',
        checklist: tender.checklist || { ...DEFAULT_CHECKLIST },
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'tenders', tenderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docsPath);
  }
}

// 3. Tender Documents
export function subscribeTenderDocuments(
  currentUid: string,
  workspaceOwnerId: string,
  tenderId: string,
  onData: (docs: TenderDocument[]) => void
) {
  const path = `tenders/${tenderId}/documents`;
  const q = query(
    collection(db, 'tenders', tenderId, 'documents'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: TenderDocument[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<TenderDocument, 'id'>),
        id: d.id,
      }));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function uploadTenderDocument(
  workspaceOwnerId: string,
  tenderId: string,
  file: File,
  category: TenderDocCategory,
  notes: string,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const docId = makeSafeId('doc');
  const path = `tenders/${tenderId}/documents/${docId}`;
  const { chunks, sha256, mimeType, sizeBytes } = await encodeFileToChunks(file);
  const members = buildMemberIds(workspaceOwnerId, memberIds);
  const creatorFields = buildCreatorFields(actor);

  try {
    await setDoc(doc(db, 'tenders', tenderId, 'documents', docId), {
      ownerId: workspaceOwnerId,
      tenderId,
      name: clampString(file.name, SCHEMA_LIMITS.DOC_NAME_MAX) || 'Belge',
      category,
      mimeType: clampString(mimeType, 120),
      sizeBytes,
      chunkCount: chunks.length,
      sha256,
      verified: false,
      notes: clampString(notes, SCHEMA_LIMITS.DOC_NOTES_MAX),
      memberIds: members,
      ...creatorFields,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const batch = writeBatch(db);
    chunks.forEach((chunkData, index) => {
      const chunkId = `c_${index}`;
      const chunkRef = doc(
        db,
        'tenders',
        tenderId,
        'documents',
        docId,
        'chunks',
        chunkId
      );
      batch.set(chunkRef, {
        ownerId: workspaceOwnerId,
        docId,
        index,
        data: chunkData,
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleTenderDocVerified(
  tenderId: string,
  docId: string,
  verified: boolean
): Promise<void> {
  const path = `tenders/${tenderId}/documents/${docId}`;
  try {
    await updateDoc(doc(db, 'tenders', tenderId, 'documents', docId), {
      verified,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTenderDocument(
  currentUid: string,
  workspaceOwnerId: string,
  tenderId: string,
  docMeta: TenderDocument,
  options?: {
    actor?: ActorIdentity;
    parentTenderCode?: string;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(docMeta, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından yüklenen doküman silinemez.');
  }

  const path = `tenders/${tenderId}/documents/${docMeta.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || docMeta.memberIds);

  try {
    const chunksSnap = await getDocs(
      query(
        collection(db, 'tenders', tenderId, 'documents', docMeta.id, 'chunks'),
        ownerOrMemberFilter(currentUid, workspaceOwnerId)
      )
    );
    const orderedChunks = chunksSnap.docs
      .map((c) => ({ ref: c.ref, data: c.data() as { index: number; data: string } }))
      .sort((a, b) => a.data.index - b.data.index);

    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'tender_document',
      originalId: docMeta.id,
      parentTenderId: tenderId,
      parentTenderCode: clampString(options?.parentTenderCode || '', 64),
      title: clampString(docMeta.name, 200) || 'İhale Dokümanı',
      subtitle: clampString(
        TENDER_DOC_CATEGORY_LABELS[docMeta.category] || docMeta.category,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(docMeta.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(docMeta.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        name: docMeta.name,
        category: docMeta.category,
        mimeType: docMeta.mimeType,
        sizeBytes: docMeta.sizeBytes,
        chunkCount: orderedChunks.length,
        sha256: docMeta.sha256,
        verified: Boolean(docMeta.verified),
        notes: docMeta.notes || '',
      },
      chunkCount: orderedChunks.length,
      memberIds: members,
    });

    if (orderedChunks.length > 0) {
      const creatorFields = buildCreatorFields(actor);
      const copyBatch = writeBatch(db);
      orderedChunks.forEach((chunkItem, idx) => {
        const chunkRef = doc(db, 'recycleBin', trashId, 'chunks', `c_${idx}`);
        copyBatch.set(chunkRef, {
          ownerId: workspaceOwnerId,
          docId: trashId,
          index: chunkItem.data.index ?? idx,
          data: chunkItem.data.data,
          memberIds: members,
          ...creatorFields,
          createdAt: serverTimestamp(),
        });
      });
      await copyBatch.commit();

      const delBatch = writeBatch(db);
      orderedChunks.forEach((chunkItem) => delBatch.delete(chunkItem.ref));
      await delBatch.commit();
    }

    await deleteDoc(doc(db, 'tenders', tenderId, 'documents', docMeta.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function downloadTenderDocumentBlob(
  currentUid: string,
  workspaceOwnerId: string,
  tenderId: string,
  docMeta: TenderDocument
): Promise<Blob> {
  const path = `tenders/${tenderId}/documents/${docMeta.id}/chunks`;
  const filter = ownerOrMemberFilter(currentUid, workspaceOwnerId);
  try {
    const q = query(
      collection(db, 'tenders', tenderId, 'documents', docMeta.id, 'chunks'),
      filter,
      orderBy('index', 'asc')
    );
    const snap = await getDocs(q);
    const ordered = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index)
      .map((c) => c.data);
    return assembleChunksToBlob(ordered, docMeta.mimeType);
  } catch (error) {
    try {
      const q2 = query(
        collection(db, 'tenders', tenderId, 'documents', docMeta.id, 'chunks'),
        filter
      );
      const snap2 = await getDocs(q2);
      const ordered2 = snap2.docs
        .map((d) => d.data() as { index: number; data: string })
        .sort((a, b) => a.index - b.index)
        .map((c) => c.data);
      return assembleChunksToBlob(ordered2, docMeta.mimeType);
    } catch (innerErr) {
      handleFirestoreError(innerErr ?? error, OperationType.LIST, path);
    }
  }
}

// 4. Company Master Vault
export function subscribeCompanyVault(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (docs: CompanyVaultDocument[]) => void
) {
  const path = 'companyVault';
  const q = query(
    collection(db, 'companyVault'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: CompanyVaultDocument[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<CompanyVaultDocument, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function uploadCompanyVaultDocument(
  workspaceOwnerId: string,
  file: File,
  category: CompanyVaultCategory,
  expiryDate: string,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const docId = makeSafeId('cv');
  const path = `companyVault/${docId}`;
  const { chunks, sha256, mimeType, sizeBytes } = await encodeFileToChunks(file);
  const members = buildMemberIds(workspaceOwnerId, memberIds);
  const creatorFields = buildCreatorFields(actor);

  try {
    await setDoc(doc(db, 'companyVault', docId), {
      ownerId: workspaceOwnerId,
      name: clampString(file.name, SCHEMA_LIMITS.DOC_NAME_MAX) || 'Kurumsal Evrak',
      category,
      mimeType: clampString(mimeType, 120),
      sizeBytes,
      chunkCount: chunks.length,
      sha256,
      expiryDate: expiryDate || '',
      memberIds: members,
      ...creatorFields,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const batch = writeBatch(db);
    chunks.forEach((chunkData, index) => {
      const chunkId = `c_${index}`;
      const chunkRef = doc(db, 'companyVault', docId, 'chunks', chunkId);
      batch.set(chunkRef, {
        ownerId: workspaceOwnerId,
        docId,
        index,
        data: chunkData,
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCompanyVaultDocument(
  currentUid: string,
  workspaceOwnerId: string,
  docMeta: CompanyVaultDocument,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(docMeta, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından yüklenen kurumsal evrak silinemez.');
  }

  const path = `companyVault/${docMeta.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || docMeta.memberIds);

  try {
    const chunksSnap = await getDocs(
      query(
        collection(db, 'companyVault', docMeta.id, 'chunks'),
        ownerOrMemberFilter(currentUid, workspaceOwnerId)
      )
    );
    const orderedChunks = chunksSnap.docs
      .map((c) => ({ ref: c.ref, data: c.data() as { index: number; data: string } }))
      .sort((a, b) => a.data.index - b.data.index);

    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'company_vault',
      originalId: docMeta.id,
      parentTenderId: '',
      parentTenderCode: '',
      title: clampString(docMeta.name, 200) || 'Kurumsal Evrak',
      subtitle: clampString(
        COMPANY_VAULT_CATEGORY_LABELS[docMeta.category] || docMeta.category,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(docMeta.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(docMeta.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        name: docMeta.name,
        category: docMeta.category,
        mimeType: docMeta.mimeType,
        sizeBytes: docMeta.sizeBytes,
        chunkCount: orderedChunks.length,
        sha256: docMeta.sha256,
        expiryDate: docMeta.expiryDate || '',
      },
      chunkCount: orderedChunks.length,
      memberIds: members,
    });

    if (orderedChunks.length > 0) {
      const creatorFields = buildCreatorFields(actor);
      const copyBatch = writeBatch(db);
      orderedChunks.forEach((chunkItem, idx) => {
        const chunkRef = doc(db, 'recycleBin', trashId, 'chunks', `c_${idx}`);
        copyBatch.set(chunkRef, {
          ownerId: workspaceOwnerId,
          docId: trashId,
          index: chunkItem.data.index ?? idx,
          data: chunkItem.data.data,
          memberIds: members,
          ...creatorFields,
          createdAt: serverTimestamp(),
        });
      });
      await copyBatch.commit();

      const delBatch = writeBatch(db);
      orderedChunks.forEach((chunkItem) => delBatch.delete(chunkItem.ref));
      await delBatch.commit();
    }

    await deleteDoc(doc(db, 'companyVault', docMeta.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function downloadCompanyVaultBlob(
  currentUid: string,
  workspaceOwnerId: string,
  docMeta: CompanyVaultDocument
): Promise<Blob> {
  const path = `companyVault/${docMeta.id}/chunks`;
  try {
    const q = query(
      collection(db, 'companyVault', docMeta.id, 'chunks'),
      ownerOrMemberFilter(currentUid, workspaceOwnerId)
    );
    const snap = await getDocs(q);
    const ordered = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index)
      .map((c) => c.data);
    return assembleChunksToBlob(ordered, docMeta.mimeType);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// 5. Bid Products (Teklif Verilen Ürün Kartları)
export type BidProductInput = Omit<
  BidProduct,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

export function subscribeBidProducts(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: BidProduct[]) => void
) {
  const path = 'bidProducts';
  const q = query(
    collection(db, 'bidProducts'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: BidProduct[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<BidProduct, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const cmp = (b.quotedDate || '').localeCompare(a.quotedDate || '');
        if (cmp !== 0) return cmp;
        return a.materialName.localeCompare(b.materialName, 'tr');
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function fetchWorkspaceBidProducts(
  currentUid: string,
  workspaceOwnerId: string
): Promise<BidProduct[]> {
  const path = 'bidProducts';
  try {
    const q = query(
      collection(db, 'bidProducts'),
      ownerOrMemberFilter(currentUid, workspaceOwnerId)
    );
    const snap = await getDocs(q);
    const items: BidProduct[] = snap.docs.map((d) => ({
      ...(d.data() as Omit<BidProduct, 'id'>),
      id: d.id,
    }));
    items.sort((a, b) => {
      const aDate = a.priceDate || a.purchaseDate || a.quotedDate || '';
      const bDate = b.priceDate || b.purchaseDate || b.quotedDate || '';
      const cmp = bDate.localeCompare(aDate);
      if (cmp !== 0) return cmp;
      return a.materialName.localeCompare(b.materialName, 'tr');
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createBidProduct(
  workspaceOwnerId: string,
  input: BidProductInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const productId = makeSafeId('prd');
  const path = `bidProducts/${productId}`;
  const payload = {
    ownerId: workspaceOwnerId,
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    stockNumber: clampString(input.stockNumber, SCHEMA_LIMITS.STOCK_NUMBER_MAX),
    partNumber: clampString(input.partNumber, SCHEMA_LIMITS.PART_NUMBER_MAX),
    materialName: clampString(input.materialName, SCHEMA_LIMITS.MATERIAL_NAME_MAX),
    supplierCompany: clampString(
      input.supplierCompany,
      SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX
    ),
    priceDate: clampString(input.priceDate, 10),
    offeredSalePrice: Math.max(0, Number(input.offeredSalePrice) || 0),
    currency: input.currency,
    purchaseDate: clampString(input.purchaseDate, 10),
    quotedDate: clampString(input.quotedDate, 10),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'bidProducts', productId), payload);
    return productId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBidProduct(
  productId: string,
  input: BidProductInput
): Promise<void> {
  const path = `bidProducts/${productId}`;
  const payload = {
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    stockNumber: clampString(input.stockNumber, SCHEMA_LIMITS.STOCK_NUMBER_MAX),
    partNumber: clampString(input.partNumber, SCHEMA_LIMITS.PART_NUMBER_MAX),
    materialName: clampString(input.materialName, SCHEMA_LIMITS.MATERIAL_NAME_MAX),
    supplierCompany: clampString(
      input.supplierCompany,
      SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX
    ),
    priceDate: clampString(input.priceDate, 10),
    offeredSalePrice: Math.max(0, Number(input.offeredSalePrice) || 0),
    currency: input.currency,
    purchaseDate: clampString(input.purchaseDate, 10),
    quotedDate: clampString(input.quotedDate, 10),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'bidProducts', productId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBidProduct(
  currentUid: string,
  workspaceOwnerId: string,
  product: BidProduct,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(product, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan ürün kartı silinemez.');
  }

  const path = `bidProducts/${product.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || product.memberIds);

  try {
    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'bid_product',
      originalId: product.id,
      parentTenderId: product.tenderId || '',
      parentTenderCode: clampString(product.tenderTrackingCode || '', 64),
      title: clampString(product.materialName, 200) || 'Ürün Kartı',
      subtitle: clampString(
        `${product.supplierCompany}${product.stockNumber ? ` · Stok: ${product.stockNumber}` : ''}`,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(product.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(product.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        tenderId: product.tenderId || '',
        tenderTrackingCode: product.tenderTrackingCode || '',
        stockNumber: product.stockNumber || '',
        partNumber: product.partNumber || '',
        materialName: product.materialName,
        supplierCompany: product.supplierCompany,
        priceDate: product.priceDate || '',
        offeredSalePrice: product.offeredSalePrice || 0,
        currency: product.currency || 'TRY',
        purchaseDate: product.purchaseDate || '',
        quotedDate: product.quotedDate || '',
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'bidProducts', product.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 5B. Ön Muhasebe — Cari Firmalar (Accounting Companies)
export type AccountingCompanyInput = Omit<
  AccountingCompany,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

export function subscribeAccountingCompanies(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: AccountingCompany[]) => void
) {
  const path = 'accountingCompanies';
  const q = query(
    collection(db, 'accountingCompanies'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: AccountingCompany[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<AccountingCompany, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createAccountingCompany(
  workspaceOwnerId: string,
  input: AccountingCompanyInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const companyId = makeSafeId('car');
  const path = `accountingCompanies/${companyId}`;
  const payload = {
    ownerId: workspaceOwnerId,
    name: clampString(input.name, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Cari Firma',
    companyType: input.companyType,
    taxOffice: clampString(input.taxOffice, SCHEMA_LIMITS.TAX_OFFICE_MAX),
    taxNumber: clampString(input.taxNumber, SCHEMA_LIMITS.TAX_NUMBER_MAX),
    contactPerson: clampString(input.contactPerson, SCHEMA_LIMITS.PERSON_MAX),
    phone: clampString(input.phone, SCHEMA_LIMITS.PHONE_MAX),
    email: clampString(input.email, SCHEMA_LIMITS.EMAIL_MAX),
    address: clampString(input.address, SCHEMA_LIMITS.ADDRESS_MAX),
    iban: clampString(input.iban, SCHEMA_LIMITS.IBAN_MAX),
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'accountingCompanies', companyId), payload);
    return companyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAccountingCompany(
  companyId: string,
  input: AccountingCompanyInput
): Promise<void> {
  const path = `accountingCompanies/${companyId}`;
  const payload = {
    name: clampString(input.name, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Cari Firma',
    companyType: input.companyType,
    taxOffice: clampString(input.taxOffice, SCHEMA_LIMITS.TAX_OFFICE_MAX),
    taxNumber: clampString(input.taxNumber, SCHEMA_LIMITS.TAX_NUMBER_MAX),
    contactPerson: clampString(input.contactPerson, SCHEMA_LIMITS.PERSON_MAX),
    phone: clampString(input.phone, SCHEMA_LIMITS.PHONE_MAX),
    email: clampString(input.email, SCHEMA_LIMITS.EMAIL_MAX),
    address: clampString(input.address, SCHEMA_LIMITS.ADDRESS_MAX),
    iban: clampString(input.iban, SCHEMA_LIMITS.IBAN_MAX),
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'accountingCompanies', companyId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAccountingCompany(
  currentUid: string,
  workspaceOwnerId: string,
  company: AccountingCompany,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(company, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan cari firma kartı silinemez.');
  }

  const path = `accountingCompanies/${company.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || company.memberIds);

  try {
    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'accounting_company',
      originalId: company.id,
      parentTenderId: '',
      parentTenderCode: '',
      title: clampString(company.name, 200) || 'Cari Firma',
      subtitle: clampString(
        `${company.taxOffice ? `${company.taxOffice}` : 'Cari Kart'}${company.taxNumber ? ` · VKN: ${company.taxNumber}` : ''}`,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(company.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(company.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        name: company.name,
        companyType: company.companyType,
        taxOffice: company.taxOffice || '',
        taxNumber: company.taxNumber || '',
        contactPerson: company.contactPerson || '',
        phone: company.phone || '',
        email: company.email || '',
        address: company.address || '',
        iban: company.iban || '',
        notes: company.notes || '',
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'accountingCompanies', company.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 5C. Ön Muhasebe — İşlemler, Faturalar, Tahsilat & Giderler (Accounting Entries)
export type AccountingEntryInput = Omit<
  AccountingEntry,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

export function subscribeAccountingEntries(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: AccountingEntry[]) => void
) {
  const path = 'accountingEntries';
  const q = query(
    collection(db, 'accountingEntries'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: AccountingEntry[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<AccountingEntry, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const cmp = (b.entryDate || '').localeCompare(a.entryDate || '');
        if (cmp !== 0) return cmp;
        return a.companyName.localeCompare(b.companyName, 'tr');
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createAccountingEntry(
  workspaceOwnerId: string,
  input: AccountingEntryInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const entryId = makeSafeId('muh');
  const path = `accountingEntries/${entryId}`;
  const qty = Math.max(0, Number(input.quantity) || 0);
  const unitPrice = Math.max(0, Number(input.unitPrice) || 0);
  const vatRate = Math.max(0, Math.min(100, Number(input.vatRate) || 0));
  const subtotalAmount = Math.max(0, Number(input.subtotalAmount) || 0);
  const vatAmount = Math.max(0, Number(input.vatAmount) || 0);
  const totalAmount = Math.max(0, Number(input.totalAmount) || 0);
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);

  const payload = {
    ownerId: workspaceOwnerId,
    entryType: input.entryType,
    companyId: clampString(input.companyId, 128),
    companyName:
      clampString(input.companyName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Firma',
    invoiceNo: clampString(input.invoiceNo, SCHEMA_LIMITS.INVOICE_NO_MAX),
    title:
      clampString(input.title, SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX) || 'Muhasebe Kaydı',
    stockNumber: clampString(input.stockNumber, SCHEMA_LIMITS.STOCK_NUMBER_MAX),
    partNumber: clampString(input.partNumber, SCHEMA_LIMITS.PART_NUMBER_MAX),
    quantity: qty,
    unit: clampString(input.unit, SCHEMA_LIMITS.UNIT_MAX) || 'Adet',
    unitPrice,
    vatRate,
    subtotalAmount,
    vatAmount,
    totalAmount,
    paidAmount,
    currency: input.currency,
    entryDate: clampString(input.entryDate, 10) || getTodayDateStr(),
    dueDate: clampString(input.dueDate, 10),
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'accountingEntries', entryId), payload);
    return entryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAccountingEntry(
  entryId: string,
  input: AccountingEntryInput
): Promise<void> {
  const path = `accountingEntries/${entryId}`;
  const qty = Math.max(0, Number(input.quantity) || 0);
  const unitPrice = Math.max(0, Number(input.unitPrice) || 0);
  const vatRate = Math.max(0, Math.min(100, Number(input.vatRate) || 0));
  const subtotalAmount = Math.max(0, Number(input.subtotalAmount) || 0);
  const vatAmount = Math.max(0, Number(input.vatAmount) || 0);
  const totalAmount = Math.max(0, Number(input.totalAmount) || 0);
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);

  const payload = {
    entryType: input.entryType,
    companyId: clampString(input.companyId, 128),
    companyName:
      clampString(input.companyName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Firma',
    invoiceNo: clampString(input.invoiceNo, SCHEMA_LIMITS.INVOICE_NO_MAX),
    title:
      clampString(input.title, SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX) || 'Muhasebe Kaydı',
    stockNumber: clampString(input.stockNumber, SCHEMA_LIMITS.STOCK_NUMBER_MAX),
    partNumber: clampString(input.partNumber, SCHEMA_LIMITS.PART_NUMBER_MAX),
    quantity: qty,
    unit: clampString(input.unit, SCHEMA_LIMITS.UNIT_MAX) || 'Adet',
    unitPrice,
    vatRate,
    subtotalAmount,
    vatAmount,
    totalAmount,
    paidAmount,
    currency: input.currency,
    entryDate: clampString(input.entryDate, 10) || getTodayDateStr(),
    dueDate: clampString(input.dueDate, 10),
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'accountingEntries', entryId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateAccountingEntryPayment(
  entryId: string,
  paymentStatus: AccountingPaymentStatus,
  paidAmount: number,
  paymentMethod: AccountingPaymentMethod
): Promise<void> {
  const path = `accountingEntries/${entryId}`;
  try {
    await updateDoc(doc(db, 'accountingEntries', entryId), {
      paymentStatus,
      paidAmount: Math.max(0, Number(paidAmount) || 0),
      paymentMethod,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAccountingEntry(
  currentUid: string,
  workspaceOwnerId: string,
  entry: AccountingEntry,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(entry, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan muhasebe kaydı silinemez.');
  }

  const path = `accountingEntries/${entry.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || entry.memberIds);

  try {
    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'accounting_entry',
      originalId: entry.id,
      parentTenderId: entry.tenderId || '',
      parentTenderCode: clampString(entry.tenderTrackingCode || '', 64),
      title: clampString(entry.title, 200) || 'Ön Muhasebe Kaydı',
      subtitle: clampString(
        `${entry.companyName}${entry.invoiceNo ? ` · Belge: ${entry.invoiceNo}` : ''}`,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(entry.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(entry.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        entryType: entry.entryType,
        companyId: entry.companyId || '',
        companyName: entry.companyName,
        invoiceNo: entry.invoiceNo || '',
        title: entry.title,
        stockNumber: entry.stockNumber || '',
        partNumber: entry.partNumber || '',
        quantity: entry.quantity || 0,
        unit: entry.unit || 'Adet',
        unitPrice: entry.unitPrice || 0,
        vatRate: entry.vatRate || 0,
        subtotalAmount: entry.subtotalAmount || 0,
        vatAmount: entry.vatAmount || 0,
        totalAmount: entry.totalAmount || 0,
        paidAmount: entry.paidAmount || 0,
        currency: entry.currency || 'TRY',
        entryDate: entry.entryDate || getTodayDateStr(),
        dueDate: entry.dueDate || '',
        paymentMethod: entry.paymentMethod || 'banka_havale',
        paymentStatus: entry.paymentStatus || 'bekliyor',
        tenderId: entry.tenderId || '',
        tenderTrackingCode: entry.tenderTrackingCode || '',
        notes: entry.notes || '',
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'accountingEntries', entry.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 5D. Ön Muhasebe — Çek Takibi (Accounting Cheques)
export type AccountingChequeInput = Omit<
  AccountingCheque,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

export function subscribeAccountingCheques(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: AccountingCheque[]) => void
) {
  const path = 'accountingCheques';
  const q = query(
    collection(db, 'accountingCheques'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: AccountingCheque[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<AccountingCheque, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const cmp = (a.dueDate || '').localeCompare(b.dueDate || '');
        if (cmp !== 0) return cmp;
        return a.companyName.localeCompare(b.companyName, 'tr');
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createAccountingCheque(
  workspaceOwnerId: string,
  input: AccountingChequeInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const chequeId = makeSafeId('cek');
  const path = `accountingCheques/${chequeId}`;
  const payload = {
    ownerId: workspaceOwnerId,
    direction: input.direction,
    chequeNo: clampString(input.chequeNo, SCHEMA_LIMITS.CHEQUE_NO_MAX) || 'CEK-01',
    bankName: clampString(input.bankName, SCHEMA_LIMITS.BANK_NAME_MAX) || 'Banka',
    branchName: clampString(input.branchName, SCHEMA_LIMITS.BRANCH_NAME_MAX),
    drawerName: clampString(input.drawerName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX),
    companyId: clampString(input.companyId, 128),
    companyName:
      clampString(input.companyName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Firma',
    endorsedTo: clampString(input.endorsedTo, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX),
    issueDate: clampString(input.issueDate, 10),
    dueDate: clampString(input.dueDate, 10) || getTodayDateStr(),
    amount: Math.max(0, Number(input.amount) || 0),
    currency: input.currency,
    status: input.status,
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'accountingCheques', chequeId), payload);
    return chequeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAccountingCheque(
  chequeId: string,
  input: AccountingChequeInput
): Promise<void> {
  const path = `accountingCheques/${chequeId}`;
  const payload = {
    direction: input.direction,
    chequeNo: clampString(input.chequeNo, SCHEMA_LIMITS.CHEQUE_NO_MAX) || 'CEK-01',
    bankName: clampString(input.bankName, SCHEMA_LIMITS.BANK_NAME_MAX) || 'Banka',
    branchName: clampString(input.branchName, SCHEMA_LIMITS.BRANCH_NAME_MAX),
    drawerName: clampString(input.drawerName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX),
    companyId: clampString(input.companyId, 128),
    companyName:
      clampString(input.companyName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Firma',
    endorsedTo: clampString(input.endorsedTo, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX),
    issueDate: clampString(input.issueDate, 10),
    dueDate: clampString(input.dueDate, 10) || getTodayDateStr(),
    amount: Math.max(0, Number(input.amount) || 0),
    currency: input.currency,
    status: input.status,
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'accountingCheques', chequeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateAccountingChequeStatus(
  chequeId: string,
  status: AccountingChequeStatus,
  endorsedTo = ''
): Promise<void> {
  const path = `accountingCheques/${chequeId}`;
  try {
    await updateDoc(doc(db, 'accountingCheques', chequeId), {
      status,
      endorsedTo: clampString(endorsedTo, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAccountingCheque(
  currentUid: string,
  workspaceOwnerId: string,
  cheque: AccountingCheque,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(cheque, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan çek kaydı silinemez.');
  }

  const path = `accountingCheques/${cheque.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || cheque.memberIds);

  try {
    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'accounting_cheque',
      originalId: cheque.id,
      parentTenderId: cheque.tenderId || '',
      parentTenderCode: clampString(cheque.tenderTrackingCode || '', 64),
      title: clampString(`${cheque.bankName} · Çek No: ${cheque.chequeNo}`, 200) || 'Çek Kaydı',
      subtitle: clampString(
        `${cheque.direction === 'alinan' ? 'Alınan Çek' : 'Verilen Çek'} · ${cheque.companyName}`,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(cheque.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(cheque.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        direction: cheque.direction,
        chequeNo: cheque.chequeNo,
        bankName: cheque.bankName,
        branchName: cheque.branchName || '',
        drawerName: cheque.drawerName || '',
        companyId: cheque.companyId || '',
        companyName: cheque.companyName,
        endorsedTo: cheque.endorsedTo || '',
        issueDate: cheque.issueDate || '',
        dueDate: cheque.dueDate,
        amount: cheque.amount || 0,
        currency: cheque.currency || 'TRY',
        status: cheque.status || 'portfoyde',
        tenderId: cheque.tenderId || '',
        tenderTrackingCode: cheque.tenderTrackingCode || '',
        notes: cheque.notes || '',
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'accountingCheques', cheque.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 5E. Proje Yönetimi (Projects)
export type ProjectInput = Omit<
  Project,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

export function subscribeProjects(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: Project[]) => void
) {
  const path = 'projects';
  const q = query(
    collection(db, 'projects'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: Project[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<Project, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const cmp = (b.startDate || '').localeCompare(a.startDate || '');
        if (cmp !== 0) return cmp;
        return a.title.localeCompare(b.title, 'tr');
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

function buildProjectManagerSummaryName(managers: ProjectManagerEntry[]): string {
  const names = managers
    .map((m) => clampString(m.displayName || m.email, SCHEMA_LIMITS.PERSON_MAX))
    .filter(Boolean);
  if (names.length === 0) return 'Proje Yöneticisi';
  if (names.length === 1) return names[0];
  const joined = names.join(', ');
  if (joined.length <= SCHEMA_LIMITS.PERSON_MAX) return joined;
  return clampString(
    `${names[0]} (+${names.length - 1} yönetici)`,
    SCHEMA_LIMITS.PERSON_MAX
  );
}

function normalizeProjectManagers(
  managers: ProjectManagerEntry[],
  fallback?: { uid: string; email: string; displayName: string }
): {
  managerUid: string;
  managerEmail: string;
  managerName: string;
  managerUids: string[];
  managers: ProjectManagerEntry[];
} {
  const seen = new Set<string>();
  const list: ProjectManagerEntry[] = [];
  for (const m of managers) {
    const uid = clampString(m?.uid || '', 128);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const email = clampString((m?.email || '').toLowerCase(), SCHEMA_LIMITS.EMAIL_MAX);
    const displayName =
      clampString(m?.displayName || email, SCHEMA_LIMITS.PERSON_MAX) ||
      'Proje Yöneticisi';
    list.push({ uid, email, displayName });
    if (list.length >= 20) break;
  }
  if (list.length === 0 && fallback?.uid) {
    const uid = clampString(fallback.uid, 128);
    const email = clampString((fallback.email || '').toLowerCase(), SCHEMA_LIMITS.EMAIL_MAX);
    const displayName =
      clampString(fallback.displayName || email, SCHEMA_LIMITS.PERSON_MAX) ||
      'Proje Yöneticisi';
    list.push({ uid, email, displayName });
  }
  if (list.length === 0) {
    throw new Error('En az bir proje yöneticisi seçilmelidir.');
  }
  const primary = list[0];
  return {
    managerUid: primary.uid,
    managerEmail: primary.email,
    managerName: buildProjectManagerSummaryName(list),
    managerUids: list.map((m) => m.uid),
    managers: list,
  };
}

export async function createProject(
  workspaceOwnerId: string,
  input: ProjectInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const projectId = makeSafeId('prj');
  const path = `projects/${projectId}`;
  const managerFields = normalizeProjectManagers(input.managers || [], {
    uid: input.managerUid,
    email: input.managerEmail,
    displayName: input.managerName,
  });
  const payload = {
    ownerId: workspaceOwnerId,
    projectCode:
      clampString(input.projectCode, SCHEMA_LIMITS.PROJECT_CODE_MAX) ||
      `PRJ-${new Date().getFullYear()}`,
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    quoteId: clampString(input.quoteId || '', 128),
    quoteNumber: clampString(input.quoteNumber || '', SCHEMA_LIMITS.QUOTE_NUMBER_MAX),
    title: clampString(input.title, SCHEMA_LIMITS.TITLE_MAX) || 'Proje',
    authority: clampString(input.authority, SCHEMA_LIMITS.AUTHORITY_MAX) || 'Kurum',
    contractAmount: Math.max(0, Number(input.contractAmount) || 0),
    currency: input.currency,
    startDate: clampString(input.startDate, 10) || getTodayDateStr(),
    endDate: clampString(input.endDate, 10),
    status: input.status,
    ...managerFields,
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'projects', projectId), payload);
    return projectId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProject(
  projectId: string,
  input: Omit<
    ProjectInput,
    'managerUid' | 'managerEmail' | 'managerName' | 'managerUids' | 'managers'
  >
): Promise<void> {
  const path = `projects/${projectId}`;
  const payload = {
    projectCode:
      clampString(input.projectCode, SCHEMA_LIMITS.PROJECT_CODE_MAX) ||
      `PRJ-${new Date().getFullYear()}`,
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    quoteId: clampString(input.quoteId || '', 128),
    quoteNumber: clampString(input.quoteNumber || '', SCHEMA_LIMITS.QUOTE_NUMBER_MAX),
    title: clampString(input.title, SCHEMA_LIMITS.TITLE_MAX) || 'Proje',
    authority: clampString(input.authority, SCHEMA_LIMITS.AUTHORITY_MAX) || 'Kurum',
    contractAmount: Math.max(0, Number(input.contractAmount) || 0),
    currency: input.currency,
    startDate: clampString(input.startDate, 10) || getTodayDateStr(),
    endDate: clampString(input.endDate, 10),
    status: input.status,
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'projects', projectId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function reassignProjectManagers(
  projectId: string,
  managers: ProjectManagerEntry[]
): Promise<void> {
  const path = `projects/${projectId}`;
  const managerFields = normalizeProjectManagers(managers);
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      ...managerFields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function reassignProjectManager(
  projectId: string,
  manager: { uid: string; email: string; displayName: string }
): Promise<void> {
  return reassignProjectManagers(projectId, [manager]);
}

export async function deleteProject(
  currentUid: string,
  workspaceOwnerId: string,
  project: Project,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isProjectManager(project, currentUid)) {
    throw new Error('Bu projeyi yalnızca atanmış proje yöneticisi silebilir.');
  }
  if (!isOwnRecord(project, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan proje kaydı silinemez.');
  }

  const path = `projects/${project.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || project.memberIds);

  const txSnap = await getDocs(
    query(
      collection(db, 'projectTransactions'),
      ownerOrMemberFilter(currentUid, workspaceOwnerId),
      where('projectId', '==', project.id)
    )
  );
  const childTxs: ProjectTransaction[] = txSnap.docs.map((d) => ({
    ...(d.data() as Omit<ProjectTransaction, 'id'>),
    id: d.id,
  }));

  const foreignTx = childTxs.find((tx) => !isOwnRecord(tx, currentUid));
  if (foreignTx) {
    throw new Error(
      `Bu projede başka bir kullanıcı tarafından oluşturulmuş işlem ("${foreignTx.title}") bulunduğu için proje silinemez.`
    );
  }

  try {
    for (const tx of childTxs) {
      await deleteProjectTransaction(currentUid, workspaceOwnerId, project, tx, {
        actor,
        memberIds: members,
      });
    }

    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'project',
      originalId: project.id,
      parentTenderId: project.tenderId || '',
      parentTenderCode: clampString(project.tenderTrackingCode || project.projectCode, 64),
      title: clampString(project.title, 200) || 'Proje Kaydı',
      subtitle: clampString(
        `${project.projectCode} · Yönetici: ${formatProjectManagerNames(project)}`,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(project.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(project.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        projectCode: project.projectCode,
        tenderId: project.tenderId || '',
        tenderTrackingCode: project.tenderTrackingCode || '',
        quoteId: project.quoteId || '',
        quoteNumber: project.quoteNumber || '',
        title: project.title,
        authority: project.authority,
        contractAmount: project.contractAmount || 0,
        currency: project.currency || 'TRY',
        startDate: project.startDate || getTodayDateStr(),
        endDate: project.endDate || '',
        status: project.status || 'aktif',
        managerUid: project.managerUid,
        managerEmail: project.managerEmail || '',
        managerName: project.managerName,
        managerUids: project.managerUids || [project.managerUid],
        managers: project.managers || [
          {
            uid: project.managerUid,
            email: project.managerEmail || '',
            displayName: project.managerName,
          },
        ],
        notes: project.notes || '',
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'projects', project.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 5F. Proje İşlemleri (Gelen Faturalar, Kesilen Faturalar, Proje Giderleri)
export type ProjectTransactionInput = Omit<
  ProjectTransaction,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

export function subscribeProjectTransactions(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: ProjectTransaction[]) => void
) {
  const path = 'projectTransactions';
  const q = query(
    collection(db, 'projectTransactions'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: ProjectTransaction[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<ProjectTransaction, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const cmp = (b.txDate || '').localeCompare(a.txDate || '');
        if (cmp !== 0) return cmp;
        return a.title.localeCompare(b.title, 'tr');
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createProjectTransaction(
  workspaceOwnerId: string,
  input: ProjectTransactionInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const txId = makeSafeId('ptx');
  const path = `projectTransactions/${txId}`;
  const vatRate = Math.max(0, Math.min(100, Number(input.vatRate) || 0));
  const subtotalAmount = Math.max(0, Number(input.subtotalAmount) || 0);
  const vatAmount = Math.max(0, Number(input.vatAmount) || 0);
  const totalAmount = Math.max(0, Number(input.totalAmount) || 0);
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);

  const payload = {
    ownerId: workspaceOwnerId,
    projectId: clampString(input.projectId, 128),
    projectCode: clampString(input.projectCode, SCHEMA_LIMITS.PROJECT_CODE_MAX),
    projectTitle: clampString(input.projectTitle, SCHEMA_LIMITS.TITLE_MAX),
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    txType: input.txType,
    category:
      clampString(input.category, SCHEMA_LIMITS.PROJECT_CATEGORY_MAX) ||
      'Diğer Gelir / Gider',
    companyId: clampString(input.companyId, 128),
    companyName:
      clampString(input.companyName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Firma',
    invoiceNo: clampString(input.invoiceNo, SCHEMA_LIMITS.INVOICE_NO_MAX),
    title:
      clampString(input.title, SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX) || 'Proje İşlemi',
    vatRate,
    subtotalAmount,
    vatAmount,
    totalAmount,
    paidAmount,
    currency: input.currency,
    txDate: clampString(input.txDate, 10) || getTodayDateStr(),
    dueDate: clampString(input.dueDate, 10),
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'projectTransactions', txId), payload);
    return txId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProjectTransaction(
  txId: string,
  input: Omit<ProjectTransactionInput, 'projectId'>
): Promise<void> {
  const path = `projectTransactions/${txId}`;
  const vatRate = Math.max(0, Math.min(100, Number(input.vatRate) || 0));
  const subtotalAmount = Math.max(0, Number(input.subtotalAmount) || 0);
  const vatAmount = Math.max(0, Number(input.vatAmount) || 0);
  const totalAmount = Math.max(0, Number(input.totalAmount) || 0);
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);

  const payload = {
    projectCode: clampString(input.projectCode, SCHEMA_LIMITS.PROJECT_CODE_MAX),
    projectTitle: clampString(input.projectTitle, SCHEMA_LIMITS.TITLE_MAX),
    tenderId: clampString(input.tenderId, 128),
    tenderTrackingCode: clampString(
      input.tenderTrackingCode,
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    txType: input.txType,
    category:
      clampString(input.category, SCHEMA_LIMITS.PROJECT_CATEGORY_MAX) ||
      'Diğer Gelir / Gider',
    companyId: clampString(input.companyId, 128),
    companyName:
      clampString(input.companyName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Firma',
    invoiceNo: clampString(input.invoiceNo, SCHEMA_LIMITS.INVOICE_NO_MAX),
    title:
      clampString(input.title, SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX) || 'Proje İşlemi',
    vatRate,
    subtotalAmount,
    vatAmount,
    totalAmount,
    paidAmount,
    currency: input.currency,
    txDate: clampString(input.txDate, 10) || getTodayDateStr(),
    dueDate: clampString(input.dueDate, 10),
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'projectTransactions', txId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateProjectTransactionPayment(
  txId: string,
  paymentStatus: AccountingPaymentStatus,
  paidAmount: number,
  paymentMethod: AccountingPaymentMethod
): Promise<void> {
  const path = `projectTransactions/${txId}`;
  try {
    await updateDoc(doc(db, 'projectTransactions', txId), {
      paymentStatus,
      paidAmount: Math.max(0, Number(paidAmount) || 0),
      paymentMethod,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProjectTransaction(
  currentUid: string,
  workspaceOwnerId: string,
  project: Project,
  tx: ProjectTransaction,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isProjectManager(project, currentUid)) {
    throw new Error('Bu projenin işlemlerini yalnızca atanmış proje yöneticisi silebilir.');
  }
  if (!isOwnRecord(tx, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan proje işlemi silinemez.');
  }

  const path = `projectTransactions/${tx.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || tx.memberIds);

  try {
    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'project_transaction',
      originalId: tx.id,
      parentTenderId: tx.tenderId || '',
      parentTenderCode: clampString(tx.tenderTrackingCode || tx.projectCode, 64),
      title: clampString(tx.title, 200) || 'Proje İşlemi',
      subtitle: clampString(
        `${PROJECT_TX_TYPE_LABELS[tx.txType] || tx.txType} · ${tx.companyName}${
          tx.invoiceNo ? ` · Belge: ${tx.invoiceNo}` : ''
        }`,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(tx.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(tx.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        projectId: tx.projectId,
        projectCode: tx.projectCode || '',
        projectTitle: tx.projectTitle || project.title,
        tenderId: tx.tenderId || '',
        tenderTrackingCode: tx.tenderTrackingCode || '',
        txType: tx.txType,
        category: tx.category || '',
        companyId: tx.companyId || '',
        companyName: tx.companyName,
        invoiceNo: tx.invoiceNo || '',
        title: tx.title,
        vatRate: tx.vatRate || 0,
        subtotalAmount: tx.subtotalAmount || 0,
        vatAmount: tx.vatAmount || 0,
        totalAmount: tx.totalAmount || 0,
        paidAmount: tx.paidAmount || 0,
        currency: tx.currency || 'TRY',
        txDate: tx.txDate || getTodayDateStr(),
        dueDate: tx.dueDate || '',
        paymentMethod: tx.paymentMethod || 'banka_havale',
        paymentStatus: tx.paymentStatus || 'bekliyor',
        notes: tx.notes || '',
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'projectTransactions', tx.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 5G. Özel Sektör Teklif ve Proforma Yönetimi (SalesQuotes)
export type SalesQuoteInput = Omit<
  SalesQuote,
  | 'id'
  | 'ownerId'
  | 'memberIds'
  | 'createdBy'
  | 'createdByEmail'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
>;

function sanitizeSalesQuoteItems(items: SalesQuoteItem[]): SalesQuoteItem[] {
  return (items || []).slice(0, 100).map((it, idx) => {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
    const discountRate = Math.max(0, Math.min(100, Number(it.discountRate) || 0));
    const vatRate = Math.max(0, Math.min(100, Number(it.vatRate) || 0));
    const gross = qty * unitPrice;
    const netSubtotal = Number((gross * (1 - discountRate / 100)).toFixed(2));
    const vatAmount = Number(((netSubtotal * vatRate) / 100).toFixed(2));
    const total = Number((netSubtotal + vatAmount).toFixed(2));

    return {
      id: clampString(it.id || `qi_${idx + 1}`, 64) || `qi_${idx + 1}`,
      productId: clampString(it.productId || '', 128),
      stockNumber: clampString(it.stockNumber || '', SCHEMA_LIMITS.STOCK_NUMBER_MAX),
      partNumber: clampString(it.partNumber || '', SCHEMA_LIMITS.PART_NUMBER_MAX),
      materialName:
        clampString(it.materialName || 'Ürün / Hizmet', SCHEMA_LIMITS.MATERIAL_NAME_MAX) ||
        'Ürün / Hizmet',
      supplierCompany: clampString(
        it.supplierCompany || '',
        SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX
      ),
      description: clampString(it.description || '', 300),
      quantity: qty,
      unit: clampString(it.unit || 'Adet', SCHEMA_LIMITS.UNIT_MAX) || 'Adet',
      unitPrice,
      discountRate,
      vatRate,
      subtotal: netSubtotal,
      vatAmount,
      total,
      sourceCurrency: it.sourceCurrency || 'TRY',
      sourceUnitPrice: Math.max(0, Number(it.sourceUnitPrice) || unitPrice),
    };
  });
}

function buildSalesQuotePayload(input: SalesQuoteInput) {
  const cleanItems = sanitizeSalesQuoteItems(input.items);
  const computedSubtotal = Number(
    cleanItems.reduce((acc, it) => acc + it.subtotal, 0).toFixed(2)
  );
  const computedDiscount = Number(
    cleanItems
      .reduce((acc, it) => acc + it.quantity * it.unitPrice * (it.discountRate / 100), 0)
      .toFixed(2)
  );
  const computedVat = Number(
    cleanItems.reduce((acc, it) => acc + it.vatAmount, 0).toFixed(2)
  );
  const computedGrand = Number((computedSubtotal + computedVat).toFixed(2));

  return {
    quoteNumber:
      clampString(input.quoteNumber, SCHEMA_LIMITS.QUOTE_NUMBER_MAX) ||
      `TKL-${new Date().getFullYear()}-01`,
    docType: input.docType,
    status: input.status,
    customerId: clampString(input.customerId, 128),
    customerName:
      clampString(input.customerName, SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) || 'Müşteri Firma',
    customerTaxOffice: clampString(input.customerTaxOffice, SCHEMA_LIMITS.TAX_OFFICE_MAX),
    customerTaxNumber: clampString(input.customerTaxNumber, SCHEMA_LIMITS.TAX_NUMBER_MAX),
    customerContactPerson: clampString(
      input.customerContactPerson,
      SCHEMA_LIMITS.PERSON_MAX
    ),
    customerPhone: clampString(input.customerPhone, SCHEMA_LIMITS.PHONE_MAX),
    customerEmail: clampString(input.customerEmail, SCHEMA_LIMITS.EMAIL_MAX),
    customerAddress: clampString(input.customerAddress, SCHEMA_LIMITS.ADDRESS_MAX),
    title: clampString(input.title, SCHEMA_LIMITS.TITLE_MAX) || 'Özel Sektör Satış Teklifi',
    issueDate: clampString(input.issueDate, 10) || getTodayDateStr(),
    validUntilDate: clampString(input.validUntilDate, 10),
    currency: input.currency,
    exchangeNote: clampString(input.exchangeNote, 200),
    deliveryTerms: clampString(input.deliveryTerms, 300),
    paymentTerms: clampString(input.paymentTerms, 300),
    warrantyTerms: clampString(input.warrantyTerms, 300),
    bankInfo: clampString(input.bankInfo, 300),
    notes: clampString(input.notes, SCHEMA_LIMITS.NOTES_MAX),
    items: cleanItems,
    subtotalAmount: cleanItems.length > 0 ? computedSubtotal : Math.max(0, Number(input.subtotalAmount) || 0),
    discountTotal: cleanItems.length > 0 ? computedDiscount : Math.max(0, Number(input.discountTotal) || 0),
    vatTotal: cleanItems.length > 0 ? computedVat : Math.max(0, Number(input.vatTotal) || 0),
    grandTotal: cleanItems.length > 0 ? computedGrand : Math.max(0, Number(input.grandTotal) || 0),
    linkedProjectId: clampString(input.linkedProjectId, 128),
    linkedProjectCode: clampString(input.linkedProjectCode, SCHEMA_LIMITS.PROJECT_CODE_MAX),
    orderConfirmedDate: clampString(input.orderConfirmedDate, 10),
  };
}

export function subscribeSalesQuotes(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: SalesQuote[]) => void
) {
  const path = 'salesQuotes';
  const q = query(
    collection(db, 'salesQuotes'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: SalesQuote[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<SalesQuote, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const cmp = (b.issueDate || '').localeCompare(a.issueDate || '');
        if (cmp !== 0) return cmp;
        return (b.quoteNumber || '').localeCompare(a.quoteNumber || '', 'tr');
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createSalesQuote(
  workspaceOwnerId: string,
  input: SalesQuoteInput,
  memberIds?: string[],
  actor?: ActorIdentity
): Promise<string> {
  const quoteId = makeSafeId('tkl');
  const path = `salesQuotes/${quoteId}`;
  const payload = {
    ownerId: workspaceOwnerId,
    ...buildSalesQuotePayload(input),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'salesQuotes', quoteId), payload);
    return quoteId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSalesQuote(
  quoteId: string,
  input: SalesQuoteInput
): Promise<void> {
  const path = `salesQuotes/${quoteId}`;
  const payload = {
    ...buildSalesQuotePayload(input),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'salesQuotes', quoteId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateSalesQuoteStatus(
  quoteId: string,
  status: SalesQuoteStatus,
  orderConfirmedDate = ''
): Promise<void> {
  const path = `salesQuotes/${quoteId}`;
  try {
    await updateDoc(doc(db, 'salesQuotes', quoteId), {
      status,
      orderConfirmedDate:
        status === 'siparis_onaylandi'
          ? clampString(orderConfirmedDate || getTodayDateStr(), 10)
          : clampString(orderConfirmedDate, 10),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function linkProjectToSalesQuote(
  quoteId: string,
  linkedProjectId: string,
  linkedProjectCode: string,
  orderConfirmedDate = ''
): Promise<void> {
  const path = `salesQuotes/${quoteId}`;
  try {
    await updateDoc(doc(db, 'salesQuotes', quoteId), {
      status: 'siparis_onaylandi',
      orderConfirmedDate: clampString(orderConfirmedDate || getTodayDateStr(), 10),
      linkedProjectId: clampString(linkedProjectId, 128),
      linkedProjectCode: clampString(linkedProjectCode, SCHEMA_LIMITS.PROJECT_CODE_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSalesQuote(
  currentUid: string,
  workspaceOwnerId: string,
  quote: SalesQuote,
  options?: {
    actor?: ActorIdentity;
    memberIds?: string[];
  }
): Promise<void> {
  if (!isOwnRecord(quote, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan teklif/proforma silinemez.');
  }

  const path = `salesQuotes/${quote.id}`;
  const actor = resolveActor(options?.actor);
  const members = buildMemberIds(workspaceOwnerId, options?.memberIds || quote.memberIds);

  try {
    const trashId = makeSafeId('tr');
    await setDoc(doc(db, 'recycleBin', trashId), {
      ownerId: workspaceOwnerId,
      entityType: 'sales_quote',
      originalId: quote.id,
      parentTenderId: '',
      parentTenderCode: clampString(quote.quoteNumber, 64),
      title: clampString(`${quote.quoteNumber} · ${quote.title}`, 200) || 'Teklif / Proforma',
      subtitle: clampString(
        `${SALES_QUOTE_DOC_TYPE_LABELS[quote.docType] || quote.docType} · ${quote.customerName}`,
        200
      ),
      createdBy: actor.uid,
      createdByEmail: clampString(quote.createdByEmail || actor.email, SCHEMA_LIMITS.EMAIL_MAX),
      createdByName: clampString(quote.createdByName || actor.displayName, 100),
      deletedBy: actor.uid,
      deletedByEmail: actor.email,
      deletedByName: actor.displayName,
      deletedAt: serverTimestamp(),
      payload: {
        quoteNumber: quote.quoteNumber,
        docType: quote.docType,
        status: quote.status,
        customerId: quote.customerId || '',
        customerName: quote.customerName,
        customerTaxOffice: quote.customerTaxOffice || '',
        customerTaxNumber: quote.customerTaxNumber || '',
        customerContactPerson: quote.customerContactPerson || '',
        customerPhone: quote.customerPhone || '',
        customerEmail: quote.customerEmail || '',
        customerAddress: quote.customerAddress || '',
        title: quote.title,
        issueDate: quote.issueDate || getTodayDateStr(),
        validUntilDate: quote.validUntilDate || '',
        currency: quote.currency || 'TRY',
        exchangeNote: quote.exchangeNote || '',
        deliveryTerms: quote.deliveryTerms || '',
        paymentTerms: quote.paymentTerms || '',
        warrantyTerms: quote.warrantyTerms || '',
        bankInfo: quote.bankInfo || '',
        notes: quote.notes || '',
        items: quote.items || [],
        subtotalAmount: quote.subtotalAmount || 0,
        discountTotal: quote.discountTotal || 0,
        vatTotal: quote.vatTotal || 0,
        grandTotal: quote.grandTotal || 0,
        linkedProjectId: quote.linkedProjectId || '',
        linkedProjectCode: quote.linkedProjectCode || '',
        orderConfirmedDate: quote.orderConfirmedDate || '',
      },
      chunkCount: 0,
      memberIds: members,
    });

    await deleteDoc(doc(db, 'salesQuotes', quote.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 5C. Tender Pricing Sheets (İhale Operasyonu Fiyat Çalışması)
export interface TenderPricingSheetInput {
  tenderId: string;
  tenderTrackingCode: string;
  tenderTitle: string;
  currency: CurrencyCode;
  annualFinancingRate: number;
  defaultDeliveryDays: number;
  vatFinancingBasis: VatFinancingBasis;
  notes: string;
  items: TenderPricingItem[];
}

function sanitizePricingItems(
  items: TenderPricingItem[],
  vatFinancingBasis: VatFinancingBasis
): TenderPricingItem[] {
  return (items || []).slice(0, 150).map((it, idx) =>
    computeTenderPricingItem(
      {
        id: clampString(it.id || `pi_${idx + 1}`, 64) || `pi_${idx + 1}`,
        productId: clampString(it.productId || '', 128),
        stockNumber: clampString(it.stockNumber || '', SCHEMA_LIMITS.STOCK_NUMBER_MAX),
        partNumber: clampString(it.partNumber || '', SCHEMA_LIMITS.PART_NUMBER_MAX),
        materialName:
          clampString(it.materialName || 'Teklif Kalemi', SCHEMA_LIMITS.MATERIAL_NAME_MAX) ||
          'Teklif Kalemi',
        supplierCompany: clampString(
          it.supplierCompany || '',
          SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX
        ),
        quantity: Math.max(0, Number(it.quantity) || 0),
        unit: clampString(it.unit || 'Adet', SCHEMA_LIMITS.UNIT_MAX) || 'Adet',
        unitCost: Math.max(0, Number(it.unitCost) || 0),
        profitRate: Math.max(0, Math.min(1000, Number(it.profitRate) || 0)),
        deliveryDays: Math.max(0, Math.min(3650, Math.round(Number(it.deliveryDays) || 0))),
        financingRate: Math.max(0, Math.min(500, Number(it.financingRate) || 0)),
        taxRate: Math.max(0, Math.min(500, Number(it.taxRate) || 0)),
        shippingAmount: Math.max(0, Number(it.shippingAmount) || 0),
        vatRate: Math.max(0, Math.min(100, Number(it.vatRate) || 0)),
        vatFinancing180Enabled: Boolean(it.vatFinancing180Enabled),
        vatFinancingRate: Math.max(0, Math.min(500, Number(it.vatFinancingRate) || 0)),
        notes: clampString(it.notes || '', 300),
      },
      vatFinancingBasis
    )
  );
}

export function subscribeTenderPricingSheets(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (sheets: TenderPricingSheet[]) => void
) {
  const path = 'tenderPricingSheets';
  const q = query(
    collection(db, 'tenderPricingSheets'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: TenderPricingSheet[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<TenderPricingSheet, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) =>
        (a.tenderTrackingCode || '').localeCompare(b.tenderTrackingCode || '', 'tr')
      );
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function saveTenderPricingSheet(
  workspaceOwnerId: string,
  input: TenderPricingSheetInput,
  memberIds?: string[],
  actor?: ActorIdentity,
  hasExistingSheet?: boolean
): Promise<string> {
  const sheetId = `prc_${input.tenderId}`;
  const path = `tenderPricingSheets/${sheetId}`;
  const sheetRef = doc(db, 'tenderPricingSheets', sheetId);

  const basis: VatFinancingBasis =
    input.vatFinancingBasis === 'kdv_tutari' ? 'kdv_tutari' : 'maliyet';
  const currency: CurrencyCode =
    input.currency === 'USD' || input.currency === 'EUR' ? input.currency : 'TRY';
  const cleanItems = sanitizePricingItems(input.items, basis);
  const totals = summarizePricingItems(cleanItems);

  const corePayload = {
    tenderTrackingCode: clampString(
      input.tenderTrackingCode || '',
      SCHEMA_LIMITS.TRACKING_CODE_MAX
    ),
    tenderTitle:
      clampString(input.tenderTitle || '', SCHEMA_LIMITS.TITLE_MAX) || 'İhale Fiyat Çalışması',
    currency,
    annualFinancingRate: Math.max(0, Math.min(500, Number(input.annualFinancingRate) || 0)),
    defaultDeliveryDays: Math.max(
      0,
      Math.min(3650, Math.round(Number(input.defaultDeliveryDays) || 0))
    ),
    vatFinancingBasis: basis,
    notes: clampString(input.notes || '', SCHEMA_LIMITS.NOTES_MAX),
    items: cleanItems,
    totalCost: Math.max(0, Number(totals.totalCost) || 0),
    totalProfit: Math.max(0, Number(totals.totalProfit) || 0),
    totalDeliveryFinancing: Math.max(0, Number(totals.totalDeliveryFinancing) || 0),
    totalTaxes: Math.max(0, Number(totals.totalTaxes) || 0),
    totalShipping: Math.max(0, Number(totals.totalShipping) || 0),
    totalVatFinancing: Math.max(0, Number(totals.totalVatFinancing) || 0),
    totalBidNet: Math.max(0, Number(totals.totalBidNet) || 0),
    totalVat: Math.max(0, Number(totals.totalVat) || 0),
    totalBidGross: Math.max(0, Number(totals.totalBidGross) || 0),
    memberIds: buildMemberIds(workspaceOwnerId, memberIds),
  };

  const createPayload = {
    ownerId: workspaceOwnerId,
    tenderId: input.tenderId,
    ...corePayload,
    ...buildCreatorFields(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const updatePayload = {
    ...corePayload,
    updatedAt: serverTimestamp(),
  };

  try {
    if (hasExistingSheet === true) {
      try {
        await updateDoc(sheetRef, updatePayload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err || '');
        if (msg.includes('not-found') || msg.includes('No document to update')) {
          await setDoc(sheetRef, createPayload);
        } else {
          throw err;
        }
      }
    } else if (hasExistingSheet === false) {
      await setDoc(sheetRef, createPayload);
    } else {
      const existing = await getDoc(sheetRef);
      if (existing.exists()) {
        await updateDoc(sheetRef, updatePayload);
      } else {
        await setDoc(sheetRef, createPayload);
      }
    }
    return sheetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTenderPricingSheet(
  currentUid: string,
  sheet: TenderPricingSheet
): Promise<void> {
  if (!isOwnRecord(sheet, currentUid)) {
    throw new Error('Başka bir kullanıcı tarafından oluşturulan fiyat çalışması silinemez.');
  }
  const path = `tenderPricingSheets/${sheet.id}`;
  try {
    await deleteDoc(doc(db, 'tenderPricingSheets', sheet.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 6. Recycle Bin (Geri Dönüşüm Kutusu)
export function subscribeRecycleBin(
  currentUid: string,
  workspaceOwnerId: string,
  onData: (items: RecycleBinItem[]) => void
) {
  const path = 'recycleBin';
  const q = query(
    collection(db, 'recycleBin'),
    ownerOrMemberFilter(currentUid, workspaceOwnerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: RecycleBinItem[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<RecycleBinItem, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const aSec =
          typeof (a.deletedAt as { seconds?: number } | undefined)?.seconds === 'number'
            ? (a.deletedAt as { seconds: number }).seconds
            : 0;
        const bSec =
          typeof (b.deletedAt as { seconds?: number } | undefined)?.seconds === 'number'
            ? (b.deletedAt as { seconds: number }).seconds
            : 0;
        return bSec - aSec;
      });
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function downloadRecycleBinBlob(
  currentUid: string,
  workspaceOwnerId: string,
  item: RecycleBinItem
): Promise<Blob> {
  const path = `recycleBin/${item.id}/chunks`;
  const mimeType = String(item.payload?.mimeType || 'application/octet-stream');
  try {
    const q = query(
      collection(db, 'recycleBin', item.id, 'chunks'),
      ownerOrMemberFilter(currentUid, workspaceOwnerId)
    );
    const snap = await getDocs(q);
    const ordered = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index)
      .map((c) => c.data);
    return assembleChunksToBlob(ordered, mimeType);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function permanentlyDeleteRecycleBinItem(
  currentUid: string,
  workspaceOwnerId: string,
  item: RecycleBinItem
): Promise<void> {
  if (item.deletedBy !== currentUid) {
    throw new Error('Geri dönüşüm kutusundan kalıcı silme işlemini yalnızca kaydı silen kullanıcı yapabilir.');
  }

  const path = `recycleBin/${item.id}`;
  try {
    if (item.chunkCount > 0) {
      const chunksSnap = await getDocs(
        query(
          collection(db, 'recycleBin', item.id, 'chunks'),
          ownerOrMemberFilter(currentUid, workspaceOwnerId)
        )
      );
      if (!chunksSnap.empty) {
        const batch = writeBatch(db);
        chunksSnap.docs.forEach((c) => batch.delete(c.ref));
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, 'recycleBin', item.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function restoreRecycleBinItem(
  currentUid: string,
  workspaceOwnerId: string,
  item: RecycleBinItem,
  actor: ActorIdentity,
  existingTenders: Tender[],
  memberIds?: string[]
): Promise<void> {
  if (item.deletedBy !== currentUid) {
    throw new Error('Geri yükleme işlemini yalnızca kaydı silen kullanıcı yapabilir.');
  }

  const resolvedActor = resolveActor(actor);
  const creatorFields = buildCreatorFields(resolvedActor);
  const members = buildMemberIds(workspaceOwnerId, memberIds || item.memberIds);
  const p = item.payload || {};

  if (item.entityType === 'tender_document') {
    const parentExists =
      existingTenders.some((t) => t.id === item.parentTenderId) ||
      (item.parentTenderId
        ? (await getDoc(doc(db, 'tenders', item.parentTenderId))).exists()
        : false);
    if (!parentExists) {
      throw new Error(
        'Bu dokümanın ait olduğu ihale kaydı henüz geri yüklenmemiş. Lütfen önce ilgili ihaleyi geri yükleyin.'
      );
    }
  }

  const path = `recycleBin/${item.id}`;
  try {
    if (item.entityType === 'tender') {
      const existingSnap = await getDoc(doc(db, 'tenders', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('ih') : item.originalId;
      await setDoc(doc(db, 'tenders', targetId), {
        ownerId: workspaceOwnerId,
        trackingCode: clampString(
          String(p.trackingCode || item.parentTenderCode || 'IH-RESTORE'),
          SCHEMA_LIMITS.TRACKING_CODE_MAX
        ),
        ikn: clampString(String(p.ikn || ''), SCHEMA_LIMITS.IKN_MAX),
        title: clampString(String(p.title || item.title), SCHEMA_LIMITS.TITLE_MAX),
        authority: clampString(
          String(p.authority || 'Kurum'),
          SCHEMA_LIMITS.AUTHORITY_MAX
        ),
        tenderDate: String(p.tenderDate || getTodayDateStr()),
        tenderTime: String(p.tenderTime || '10:00'),
        location: clampString(String(p.location || ''), SCHEMA_LIMITS.LOCATION_MAX),
        procurementType: String(p.procurementType || 'acik_ihale'),
        estimatedAmount: Math.max(0, Number(p.estimatedAmount) || 0),
        bidBondAmount: Math.max(0, Number(p.bidBondAmount) || 0),
        currency: String(p.currency || 'TRY'),
        status: String(p.status || 'hazirlik'),
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.NOTES_MAX),
        checklist: (p.checklist as TenderChecklist) || { ...DEFAULT_CHECKLIST },
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (item.entityType === 'tender_document') {
      const chunksSnap = await getDocs(
        query(
          collection(db, 'recycleBin', item.id, 'chunks'),
          ownerOrMemberFilter(currentUid, workspaceOwnerId)
        )
      );
      const orderedChunks = chunksSnap.docs
        .map((c) => ({ ref: c.ref, data: c.data() as { index: number; data: string } }))
        .sort((a, b) => a.data.index - b.data.index);

      const existingSnap = await getDoc(
        doc(db, 'tenders', item.parentTenderId, 'documents', item.originalId)
      );
      const targetDocId = existingSnap.exists() ? makeSafeId('doc') : item.originalId;

      await setDoc(doc(db, 'tenders', item.parentTenderId, 'documents', targetDocId), {
        ownerId: workspaceOwnerId,
        tenderId: item.parentTenderId,
        name: clampString(String(p.name || item.title), SCHEMA_LIMITS.DOC_NAME_MAX) || 'Belge',
        category: String(p.category || 'diger'),
        mimeType: clampString(String(p.mimeType || 'application/octet-stream'), 120),
        sizeBytes: Math.max(1, Number(p.sizeBytes) || 1),
        chunkCount: Math.max(1, orderedChunks.length),
        sha256: String(p.sha256 || '').padEnd(64, '0').slice(0, 64),
        verified: Boolean(p.verified),
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.DOC_NOTES_MAX),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (orderedChunks.length > 0) {
        const copyBatch = writeBatch(db);
        orderedChunks.forEach((chunkItem, idx) => {
          const chunkRef = doc(
            db,
            'tenders',
            item.parentTenderId,
            'documents',
            targetDocId,
            'chunks',
            `c_${idx}`
          );
          copyBatch.set(chunkRef, {
            ownerId: workspaceOwnerId,
            docId: targetDocId,
            index: chunkItem.data.index ?? idx,
            data: chunkItem.data.data,
            memberIds: members,
            ...creatorFields,
            createdAt: serverTimestamp(),
          });
        });
        await copyBatch.commit();

        const delBatch = writeBatch(db);
        orderedChunks.forEach((chunkItem) => delBatch.delete(chunkItem.ref));
        await delBatch.commit();
      }
    } else if (item.entityType === 'company_vault') {
      const chunksSnap = await getDocs(
        query(
          collection(db, 'recycleBin', item.id, 'chunks'),
          ownerOrMemberFilter(currentUid, workspaceOwnerId)
        )
      );
      const orderedChunks = chunksSnap.docs
        .map((c) => ({ ref: c.ref, data: c.data() as { index: number; data: string } }))
        .sort((a, b) => a.data.index - b.data.index);

      const existingSnap = await getDoc(doc(db, 'companyVault', item.originalId));
      const targetDocId = existingSnap.exists() ? makeSafeId('cv') : item.originalId;

      await setDoc(doc(db, 'companyVault', targetDocId), {
        ownerId: workspaceOwnerId,
        name:
          clampString(String(p.name || item.title), SCHEMA_LIMITS.DOC_NAME_MAX) ||
          'Kurumsal Evrak',
        category: String(p.category || 'diger'),
        mimeType: clampString(String(p.mimeType || 'application/octet-stream'), 120),
        sizeBytes: Math.max(1, Number(p.sizeBytes) || 1),
        chunkCount: Math.max(1, orderedChunks.length),
        sha256: String(p.sha256 || '').padEnd(64, '0').slice(0, 64),
        expiryDate: String(p.expiryDate || ''),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (orderedChunks.length > 0) {
        const copyBatch = writeBatch(db);
        orderedChunks.forEach((chunkItem, idx) => {
          const chunkRef = doc(db, 'companyVault', targetDocId, 'chunks', `c_${idx}`);
          copyBatch.set(chunkRef, {
            ownerId: workspaceOwnerId,
            docId: targetDocId,
            index: chunkItem.data.index ?? idx,
            data: chunkItem.data.data,
            memberIds: members,
            ...creatorFields,
            createdAt: serverTimestamp(),
          });
        });
        await copyBatch.commit();

        const delBatch = writeBatch(db);
        orderedChunks.forEach((chunkItem) => delBatch.delete(chunkItem.ref));
        await delBatch.commit();
      }
    } else if (item.entityType === 'bid_product') {
      const existingSnap = await getDoc(doc(db, 'bidProducts', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('prd') : item.originalId;
      const rawTenderId = String(p.tenderId || '');
      const hasLinkedTender =
        rawTenderId !== '' &&
        (existingTenders.some((t) => t.id === rawTenderId) ||
          (await getDoc(doc(db, 'tenders', rawTenderId))).exists());

      await setDoc(doc(db, 'bidProducts', targetId), {
        ownerId: workspaceOwnerId,
        tenderId: hasLinkedTender ? rawTenderId : '',
        tenderTrackingCode: hasLinkedTender
          ? clampString(String(p.tenderTrackingCode || ''), SCHEMA_LIMITS.TRACKING_CODE_MAX)
          : '',
        stockNumber: clampString(String(p.stockNumber || ''), SCHEMA_LIMITS.STOCK_NUMBER_MAX),
        partNumber: clampString(String(p.partNumber || ''), SCHEMA_LIMITS.PART_NUMBER_MAX),
        materialName: clampString(
          String(p.materialName || item.title),
          SCHEMA_LIMITS.MATERIAL_NAME_MAX
        ),
        supplierCompany: clampString(
          String(p.supplierCompany || 'Tedarikçi'),
          SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX
        ),
        priceDate: clampString(String(p.priceDate || ''), 10),
        offeredSalePrice: Math.max(0, Number(p.offeredSalePrice) || 0),
        currency: String(p.currency || 'TRY'),
        purchaseDate: clampString(String(p.purchaseDate || ''), 10),
        quotedDate: clampString(String(p.quotedDate || ''), 10),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (item.entityType === 'accounting_company') {
      const existingSnap = await getDoc(doc(db, 'accountingCompanies', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('car') : item.originalId;
      await setDoc(doc(db, 'accountingCompanies', targetId), {
        ownerId: workspaceOwnerId,
        name:
          clampString(String(p.name || item.title), SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) ||
          'Cari Firma',
        companyType: (p.companyType as AccountingCompanyType) || 'tedarikci',
        taxOffice: clampString(String(p.taxOffice || ''), SCHEMA_LIMITS.TAX_OFFICE_MAX),
        taxNumber: clampString(String(p.taxNumber || ''), SCHEMA_LIMITS.TAX_NUMBER_MAX),
        contactPerson: clampString(String(p.contactPerson || ''), SCHEMA_LIMITS.PERSON_MAX),
        phone: clampString(String(p.phone || ''), SCHEMA_LIMITS.PHONE_MAX),
        email: clampString(String(p.email || ''), SCHEMA_LIMITS.EMAIL_MAX),
        address: clampString(String(p.address || ''), SCHEMA_LIMITS.ADDRESS_MAX),
        iban: clampString(String(p.iban || ''), SCHEMA_LIMITS.IBAN_MAX),
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.NOTES_MAX),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (item.entityType === 'accounting_entry') {
      const existingSnap = await getDoc(doc(db, 'accountingEntries', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('muh') : item.originalId;
      const rawTenderId = String(p.tenderId || '');
      const hasLinkedTender =
        rawTenderId !== '' &&
        (existingTenders.some((t) => t.id === rawTenderId) ||
          (await getDoc(doc(db, 'tenders', rawTenderId))).exists());

      await setDoc(doc(db, 'accountingEntries', targetId), {
        ownerId: workspaceOwnerId,
        entryType: (p.entryType as AccountingEntryType) || 'alis_faturasi',
        companyId: clampString(String(p.companyId || ''), 128),
        companyName:
          clampString(String(p.companyName || 'Firma'), SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) ||
          'Firma',
        invoiceNo: clampString(String(p.invoiceNo || ''), SCHEMA_LIMITS.INVOICE_NO_MAX),
        title:
          clampString(String(p.title || item.title), SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX) ||
          'Muhasebe Kaydı',
        stockNumber: clampString(String(p.stockNumber || ''), SCHEMA_LIMITS.STOCK_NUMBER_MAX),
        partNumber: clampString(String(p.partNumber || ''), SCHEMA_LIMITS.PART_NUMBER_MAX),
        quantity: Math.max(0, Number(p.quantity) || 0),
        unit: clampString(String(p.unit || 'Adet'), SCHEMA_LIMITS.UNIT_MAX) || 'Adet',
        unitPrice: Math.max(0, Number(p.unitPrice) || 0),
        vatRate: Math.max(0, Math.min(100, Number(p.vatRate) || 0)),
        subtotalAmount: Math.max(0, Number(p.subtotalAmount) || 0),
        vatAmount: Math.max(0, Number(p.vatAmount) || 0),
        totalAmount: Math.max(0, Number(p.totalAmount) || 0),
        paidAmount: Math.max(0, Number(p.paidAmount) || 0),
        currency: String(p.currency || 'TRY'),
        entryDate: String(p.entryDate || getTodayDateStr()),
        dueDate: clampString(String(p.dueDate || ''), 10),
        paymentMethod: (p.paymentMethod as AccountingPaymentMethod) || 'banka_havale',
        paymentStatus: (p.paymentStatus as AccountingPaymentStatus) || 'bekliyor',
        tenderId: hasLinkedTender ? rawTenderId : '',
        tenderTrackingCode: hasLinkedTender
          ? clampString(String(p.tenderTrackingCode || ''), SCHEMA_LIMITS.TRACKING_CODE_MAX)
          : '',
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.NOTES_MAX),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (item.entityType === 'accounting_cheque') {
      const existingSnap = await getDoc(doc(db, 'accountingCheques', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('cek') : item.originalId;
      const rawTenderId = String(p.tenderId || '');
      const hasLinkedTender =
        rawTenderId !== '' &&
        (existingTenders.some((t) => t.id === rawTenderId) ||
          (await getDoc(doc(db, 'tenders', rawTenderId))).exists());

      await setDoc(doc(db, 'accountingCheques', targetId), {
        ownerId: workspaceOwnerId,
        direction: (p.direction as AccountingChequeDirection) || 'alinan',
        chequeNo: clampString(String(p.chequeNo || 'CEK-01'), SCHEMA_LIMITS.CHEQUE_NO_MAX),
        bankName: clampString(String(p.bankName || 'Banka'), SCHEMA_LIMITS.BANK_NAME_MAX),
        branchName: clampString(String(p.branchName || ''), SCHEMA_LIMITS.BRANCH_NAME_MAX),
        drawerName: clampString(String(p.drawerName || ''), SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX),
        companyId: clampString(String(p.companyId || ''), 128),
        companyName:
          clampString(String(p.companyName || 'Firma'), SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) ||
          'Firma',
        endorsedTo: clampString(String(p.endorsedTo || ''), SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX),
        issueDate: clampString(String(p.issueDate || ''), 10),
        dueDate: String(p.dueDate || getTodayDateStr()),
        amount: Math.max(0, Number(p.amount) || 0),
        currency: String(p.currency || 'TRY'),
        status: (p.status as AccountingChequeStatus) || 'portfoyde',
        tenderId: hasLinkedTender ? rawTenderId : '',
        tenderTrackingCode: hasLinkedTender
          ? clampString(String(p.tenderTrackingCode || ''), SCHEMA_LIMITS.TRACKING_CODE_MAX)
          : '',
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.NOTES_MAX),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (item.entityType === 'project') {
      const existingSnap = await getDoc(doc(db, 'projects', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('prj') : item.originalId;
      const rawTenderId = String(p.tenderId || '');
      const hasLinkedTender =
        rawTenderId !== '' &&
        (existingTenders.some((t) => t.id === rawTenderId) ||
          (await getDoc(doc(db, 'tenders', rawTenderId))).exists());

      await setDoc(doc(db, 'projects', targetId), {
        ownerId: workspaceOwnerId,
        projectCode:
          clampString(String(p.projectCode || item.parentTenderCode || 'PRJ-RESTORE'), SCHEMA_LIMITS.PROJECT_CODE_MAX) ||
          'PRJ-RESTORE',
        tenderId: hasLinkedTender ? rawTenderId : '',
        tenderTrackingCode: hasLinkedTender
          ? clampString(String(p.tenderTrackingCode || ''), SCHEMA_LIMITS.TRACKING_CODE_MAX)
          : '',
        quoteId: clampString(String(p.quoteId || ''), 128),
        quoteNumber: clampString(String(p.quoteNumber || ''), SCHEMA_LIMITS.QUOTE_NUMBER_MAX),
        title: clampString(String(p.title || item.title), SCHEMA_LIMITS.TITLE_MAX) || 'Proje',
        authority: clampString(String(p.authority || 'Kurum'), SCHEMA_LIMITS.AUTHORITY_MAX) || 'Kurum',
        contractAmount: Math.max(0, Number(p.contractAmount) || 0),
        currency: String(p.currency || 'TRY'),
        startDate: String(p.startDate || getTodayDateStr()),
        endDate: clampString(String(p.endDate || ''), 10),
        status: (p.status as ProjectStatus) || 'aktif',
        ...normalizeProjectManagers(
          Array.isArray(p.managers) ? (p.managers as ProjectManagerEntry[]) : [],
          {
            uid: String(p.managerUid || currentUid),
            email: String(p.managerEmail || resolvedActor.email),
            displayName: String(p.managerName || resolvedActor.displayName),
          }
        ),
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.NOTES_MAX),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (item.entityType === 'sales_quote') {
      const existingSnap = await getDoc(doc(db, 'salesQuotes', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('tkl') : item.originalId;
      const cleanItems = sanitizeSalesQuoteItems((p.items as SalesQuoteItem[]) || []);

      await setDoc(doc(db, 'salesQuotes', targetId), {
        ownerId: workspaceOwnerId,
        quoteNumber:
          clampString(String(p.quoteNumber || item.parentTenderCode || 'TKL-RESTORE'), SCHEMA_LIMITS.QUOTE_NUMBER_MAX) ||
          'TKL-RESTORE',
        docType: (p.docType as SalesQuoteDocType) || 'teklif',
        status: (p.status as SalesQuoteStatus) || 'taslak',
        customerId: clampString(String(p.customerId || ''), 128),
        customerName:
          clampString(String(p.customerName || 'Müşteri Firma'), SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) ||
          'Müşteri Firma',
        customerTaxOffice: clampString(String(p.customerTaxOffice || ''), SCHEMA_LIMITS.TAX_OFFICE_MAX),
        customerTaxNumber: clampString(String(p.customerTaxNumber || ''), SCHEMA_LIMITS.TAX_NUMBER_MAX),
        customerContactPerson: clampString(String(p.customerContactPerson || ''), SCHEMA_LIMITS.PERSON_MAX),
        customerPhone: clampString(String(p.customerPhone || ''), SCHEMA_LIMITS.PHONE_MAX),
        customerEmail: clampString(String(p.customerEmail || ''), SCHEMA_LIMITS.EMAIL_MAX),
        customerAddress: clampString(String(p.customerAddress || ''), SCHEMA_LIMITS.ADDRESS_MAX),
        title: clampString(String(p.title || item.title), SCHEMA_LIMITS.TITLE_MAX) || 'Teklif / Proforma',
        issueDate: String(p.issueDate || getTodayDateStr()),
        validUntilDate: clampString(String(p.validUntilDate || ''), 10),
        currency: String(p.currency || 'TRY'),
        exchangeNote: clampString(String(p.exchangeNote || ''), 200),
        deliveryTerms: clampString(String(p.deliveryTerms || ''), 300),
        paymentTerms: clampString(String(p.paymentTerms || ''), 300),
        warrantyTerms: clampString(String(p.warrantyTerms || ''), 300),
        bankInfo: clampString(String(p.bankInfo || ''), 300),
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.NOTES_MAX),
        items: cleanItems,
        subtotalAmount: Math.max(0, Number(p.subtotalAmount) || 0),
        discountTotal: Math.max(0, Number(p.discountTotal) || 0),
        vatTotal: Math.max(0, Number(p.vatTotal) || 0),
        grandTotal: Math.max(0, Number(p.grandTotal) || 0),
        linkedProjectId: clampString(String(p.linkedProjectId || ''), 128),
        linkedProjectCode: clampString(String(p.linkedProjectCode || ''), SCHEMA_LIMITS.PROJECT_CODE_MAX),
        orderConfirmedDate: clampString(String(p.orderConfirmedDate || ''), 10),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (item.entityType === 'project_transaction') {
      const parentProjectId = String(p.projectId || '');
      if (!parentProjectId) {
        throw new Error('Bu işlemin bağlı olduğu proje bilgisi bulunamadı.');
      }
      const parentProjectSnap = await getDoc(doc(db, 'projects', parentProjectId));
      if (!parentProjectSnap.exists()) {
        throw new Error(
          'Bu işlemin ait olduğu proje henüz geri yüklenmemiş. Lütfen önce ilgili projeyi geri yükleyin.'
        );
      }
      const existingSnap = await getDoc(doc(db, 'projectTransactions', item.originalId));
      const targetId = existingSnap.exists() ? makeSafeId('ptx') : item.originalId;
      const rawTenderId = String(p.tenderId || '');
      const hasLinkedTender =
        rawTenderId !== '' &&
        (existingTenders.some((t) => t.id === rawTenderId) ||
          (await getDoc(doc(db, 'tenders', rawTenderId))).exists());

      await setDoc(doc(db, 'projectTransactions', targetId), {
        ownerId: workspaceOwnerId,
        projectId: parentProjectId,
        projectCode: clampString(String(p.projectCode || ''), SCHEMA_LIMITS.PROJECT_CODE_MAX),
        projectTitle: clampString(String(p.projectTitle || ''), SCHEMA_LIMITS.TITLE_MAX),
        tenderId: hasLinkedTender ? rawTenderId : '',
        tenderTrackingCode: hasLinkedTender
          ? clampString(String(p.tenderTrackingCode || ''), SCHEMA_LIMITS.TRACKING_CODE_MAX)
          : '',
        txType: (p.txType as ProjectTransactionType) || 'gider',
        category: clampString(String(p.category || ''), SCHEMA_LIMITS.PROJECT_CATEGORY_MAX) || 'Diğer Gelir / Gider',
        companyId: clampString(String(p.companyId || ''), 128),
        companyName:
          clampString(String(p.companyName || 'Firma'), SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX) ||
          'Firma',
        invoiceNo: clampString(String(p.invoiceNo || ''), SCHEMA_LIMITS.INVOICE_NO_MAX),
        title: clampString(String(p.title || item.title), SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX) || 'Proje İşlemi',
        vatRate: Math.max(0, Math.min(100, Number(p.vatRate) || 0)),
        subtotalAmount: Math.max(0, Number(p.subtotalAmount) || 0),
        vatAmount: Math.max(0, Number(p.vatAmount) || 0),
        totalAmount: Math.max(0, Number(p.totalAmount) || 0),
        paidAmount: Math.max(0, Number(p.paidAmount) || 0),
        currency: String(p.currency || 'TRY'),
        txDate: String(p.txDate || getTodayDateStr()),
        dueDate: clampString(String(p.dueDate || ''), 10),
        paymentMethod: (p.paymentMethod as AccountingPaymentMethod) || 'banka_havale',
        paymentStatus: (p.paymentStatus as AccountingPaymentStatus) || 'bekliyor',
        notes: clampString(String(p.notes || ''), SCHEMA_LIMITS.NOTES_MAX),
        memberIds: members,
        ...creatorFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await deleteDoc(doc(db, 'recycleBin', item.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Optional Sample Scenario Loader (triggered explicitly by user)
async function uploadTextSampleToTender(
  workspaceOwnerId: string,
  tenderId: string,
  filename: string,
  category: TenderDocCategory,
  content: string,
  verified: boolean,
  memberIds?: string[],
  actor?: ActorIdentity
) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const sha256 = await computeSha256(bytes.buffer);
  const base64 = btoa(unescape(encodeURIComponent(content)));
  const docId = makeSafeId('doc');
  const members = buildMemberIds(workspaceOwnerId, memberIds);
  const creatorFields = buildCreatorFields(actor);

  await setDoc(doc(db, 'tenders', tenderId, 'documents', docId), {
    ownerId: workspaceOwnerId,
    tenderId,
    name: filename,
    category,
    mimeType: 'text/plain;charset=utf-8',
    sizeBytes: bytes.byteLength,
    chunkCount: 1,
    sha256,
    verified,
    notes: 'Örnek ihale dokümanı',
    memberIds: members,
    ...creatorFields,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'tenders', tenderId, 'documents', docId, 'chunks', 'c_0'), {
    ownerId: workspaceOwnerId,
    docId,
    index: 0,
    data: base64,
    memberIds: members,
    ...creatorFields,
    createdAt: serverTimestamp(),
  });
}

export async function loadSampleTenderScenario(
  workspaceOwnerId: string,
  existingTenders: Tender[],
  userEmail: string,
  memberIds?: string[]
): Promise<void> {
  const today = getTodayDateStr();
  const inFiveDays = addDaysToDateStr(today, 5);
  const inTwelveDays = addDaysToDateStr(today, 12);

  await saveCompanyProfile(
    workspaceOwnerId,
    {
      companyName: 'Anadolu Altyapı ve Mühendislik A.Ş.',
      taxOffice: 'Çankaya Vergi Dairesi',
      taxNumber: '4820193746',
      authorizedPerson: 'Kemal Yılmaz',
      phone: '+90 312 440 12 80',
      email: userEmail || 'ihale@anadolumuhendislik.com.tr',
      defaultReminderDays: 3,
    },
    memberIds
  );

  const codeToday = generateSyncedTrackingCode(today, existingTenders);
  const t1 = await createTender(
    workspaceOwnerId,
    {
      trackingCode: codeToday,
      ikn: '2026/1184920',
      title: 'Merkez Yerleşke Enerji Altyapısı ve Trafo Yenileme İşi',
      authority: 'T.C. Ankara Büyükşehir Belediyesi Fen İşleri Dairesi',
      tenderDate: today,
      tenderTime: '14:30',
      location: 'EKAP Üzerinden E-Teklif / İhale Komisyonu Kat 4',
      procurementType: 'acik_ihale',
      estimatedAmount: 4850000,
      bidBondAmount: 145500,
      currency: 'TRY',
      status: 'onay_bekliyor',
      notes: 'Geçici teminat mektubu EKAP üzerinden teyit edildi. Zeyilname 1 kontrol edildi.',
      checklist: {
        idariSartname: true,
        teknikSartname: true,
        birimFiyat: true,
        geciciTeminat: true,
        imzaSirkuleri: true,
        teklifMektubu: false,
      },
    },
    memberIds
  );

  await uploadTextSampleToTender(
    workspaceOwnerId,
    t1,
    'Idari_Sartname_Ozeti_2026_1184920.txt',
    'idari_sartname',
    `İKN: 2026/1184920\nKurum: Ankara Büyükşehir Belediyesi\nİhale Saati: 14:30\nGeçici Teminat Oranı: %3 (145.500 TRY)\nİş Bitirme Şartı: Teklif bedelinin %60'ı`,
    true,
    memberIds
  );
  await uploadTextSampleToTender(
    workspaceOwnerId,
    t1,
    'Gecici_Teminat_Teyit_Referans.txt',
    'gecici_teminat',
    `Elektronik Geçici Teminat Mektubu Referans No: TR-GTM-2026-994812\nTutar: 145.500,00 TRY\nVade: İhale tarihinden itibaren 120 gün`,
    true,
    memberIds
  );

  const code2 = generateSyncedTrackingCode(inFiveDays, existingTenders);
  await createTender(
    workspaceOwnerId,
    {
      trackingCode: code2,
      ikn: '2026/1203415',
      title: 'Bölge Hastanesi Mekanik Tesisat ve İklimlendirme Bakım İhalesi',
      authority: 'İl Sağlık Müdürlüğü Satınalma Birimi',
      tenderDate: inFiveDays,
      tenderTime: '10:30',
      location: 'İl Sağlık Müdürlüğü Toplantı Salonu B Blok',
      procurementType: 'acik_ihale',
      estimatedAmount: 2150000,
      bidBondAmount: 64500,
      currency: 'TRY',
      status: 'hazirlik',
      notes: 'Keşif özeti metrajları teknik ekiple teyit edilecek.',
      checklist: {
        idariSartname: true,
        teknikSartname: false,
        birimFiyat: false,
        geciciTeminat: false,
        imzaSirkuleri: true,
        teklifMektubu: false,
      },
    },
    memberIds
  );

  const code3 = generateSyncedTrackingCode(inTwelveDays, existingTenders);
  await createTender(
    workspaceOwnerId,
    {
      trackingCode: code3,
      ikn: '2026/1219804',
      title: 'Organize Sanayi Bölgesi Fiber Optik ve Güvenlik Altyapısı',
      authority: 'OSTİM OSB Yönetim Kurulu Başkanlığı',
      tenderDate: inTwelveDays,
      tenderTime: '11:00',
      location: 'OSTİM İdari Bina İhale Salonu',
      procurementType: 'belli_istekliler',
      estimatedAmount: 120000,
      bidBondAmount: 3600,
      currency: 'USD',
      status: 'hazirlik',
      notes: 'Ön yeterlik dosyası tamamlandı, teknik teklif hazırlanıyor.',
      checklist: {
        idariSartname: true,
        teknikSartname: true,
        birimFiyat: false,
        geciciTeminat: false,
        imzaSirkuleri: true,
        teklifMektubu: false,
      },
    },
    memberIds
  );

  await createBidProduct(
    workspaceOwnerId,
    {
      tenderId: t1,
      tenderTrackingCode: codeToday,
      stockNumber: 'STK-630-TRF',
      partNumber: 'PN-ABB-630KVA',
      materialName: '630 kVA 34.5/0.4 kV Yağlı Tip Dağıtım Trafosu',
      supplierCompany: 'Beta Elektromekanik San. ve Tic. A.Ş.',
      priceDate: addDaysToDateStr(today, -3),
      offeredSalePrice: 1485000,
      currency: 'TRY',
      purchaseDate: addDaysToDateStr(today, -2),
      quotedDate: today,
    },
    memberIds
  );

  await createBidProduct(
    workspaceOwnerId,
    {
      tenderId: t1,
      tenderTrackingCode: codeToday,
      stockNumber: 'STK-240-XLPE',
      partNumber: 'PN-HES-3X240',
      materialName: '3x240/25 mm² 36 kV XLPE Yeraltı Güç Kablosu (1000 m)',
      supplierCompany: 'Anadolu Kablo ve İletken A.Ş.',
      priceDate: addDaysToDateStr(today, -4),
      offeredSalePrice: 920000,
      currency: 'TRY',
      purchaseDate: addDaysToDateStr(today, -1),
      quotedDate: today,
    },
    memberIds
  );
}

export async function saveTenderAnalysis(params: {
  workspaceOwnerId: string;
  tenderId: string;
  actor: ActorIdentity;
  mode: 'summary' | 'products';
  result: Record<string, unknown>;
  preferenceNote?: string;
  memberIds?: string[];
}): Promise<string> {
  const id = makeSafeId('analysis');

  const path = `tenders/${params.tenderId}/analyses/${id}`;

  await setDoc(doc(db, path), {
    id,
    ownerId: params.workspaceOwnerId,
    tenderId: params.tenderId,
    mode: params.mode,
    result: params.result,
    preferenceNote: params.preferenceNote?.trim().slice(0, 2000) || '',
    memberIds: buildMemberIds(params.workspaceOwnerId, params.memberIds),
    ...buildCreatorFields(params.actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return id;
}

export function subscribeTenderAnalyses(
  workspaceOwnerId: string,
  tenderId: string,
  onData: (analyses: SavedTenderAnalysis[]) => void,
  onError?: (error: Error) => void
) {
  const path = `tenders/${tenderId}/analyses`;

  const q = query(
    collection(db, 'tenders', tenderId, 'analyses'),
    where('ownerId', '==', workspaceOwnerId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const items: SavedTenderAnalysis[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<SavedTenderAnalysis, 'id'>),
        id: d.id,
      }));

      items.sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );

      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  );
}
