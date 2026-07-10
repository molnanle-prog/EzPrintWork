import {
  canManageCompany,
  canDeletePermanently,
  canManageTenantRoot,
  isHiddenStaffId,
} from '../src/utils/adminAccess.ts';

const ownerUid = 'owner-uid';
const adminCtx = { userUid: 'admin-uid', userRole: 'admin', tenantOwnerId: ownerUid };
const staffCtx = { userUid: 'staff-uid', userRole: 'staff', tenantOwnerId: ownerUid };
const ownerCtx = { userUid: ownerUid, userRole: 'admin', tenantOwnerId: ownerUid };

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    console.log(`✅ ${name}`);
    pass++;
  } else {
    console.log(`❌ ${name}`);
    fail++;
  }
}

check('owner canManageCompany', canManageCompany(ownerCtx));
check('admin canManageCompany', canManageCompany(adminCtx));
check('staff cannot manage company', !canManageCompany(staffCtx));
check('owner canDeletePermanently', canDeletePermanently(ownerCtx));
check('staff cannot delete permanently', !canDeletePermanently(staffCtx));
check('owner canManageTenantRoot', canManageTenantRoot(ownerCtx));
check('site admin cannot root settings', !canManageTenantRoot(adminCtx));
check('site admin via staff record canManageCompany', canManageCompany({ ...staffCtx, staffRecordRole: 'admin' }));
check('site admin via isCompanyAdmin flag', canManageCompany({ ...staffCtx, staffIsCompanyAdmin: true }));
check('hidden dev-admin id', isHiddenStaffId('dev-admin'));
check('normal id not hidden', !isHiddenStaffId('user-abc'));

console.log(`\n=== adminAccess: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail > 0 ? 1 : 0);
