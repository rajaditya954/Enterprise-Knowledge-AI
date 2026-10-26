/**
 * Build the SQL WHERE clause fragment for RBAC filtering.
 * Uses the check_rbac_access() function defined in schema.sql.
 *
 * @param {object} user - { role, departmentId }
 * @param {string} chunkAlias - SQL alias for document_chunks table (default 'c')
 * @returns {{ clause: string, params: any[] }}
 */
export function buildRbacPredicate(user, chunkAlias = 'c') {
  return {
    clause: `check_rbac_access($RBAC_ROLE, $RBAC_DEPT, ${chunkAlias}.department_id, ${chunkAlias}.permission_level)`,
    params: { role: user.role, departmentId: user.departmentId },
  };
}

/**
 * Build the SQL WHERE clause for document listing RBAC.
 *
 * @param {object} user - { role, departmentId }
 * @param {string} docAlias - SQL alias for documents table (default 'd')
 * @returns {{ clause: string, params: { role: string, departmentId: string } }}
 */
export function buildDocRbacPredicate(user, docAlias = 'd') {
  return {
    clause: `check_rbac_access($RBAC_ROLE, $RBAC_DEPT, ${docAlias}.department_id, ${docAlias}.permission_level)`,
    params: { role: user.role, departmentId: user.departmentId },
  };
}

/**
 * Check if a user can access a specific document.
 */
export function canAccessDocument(user, document) {
  const { role, departmentId } = user;
  const { department_id: docDeptId, permission_level: permLevel } = document;

  if (role === 'ADMIN') return true;

  if (role === 'MANAGER') {
    if (docDeptId === departmentId && permLevel <= 3) return true;
    if (permLevel <= 2) return true;
    return false;
  }

  if (role === 'EMPLOYEE') {
    if (docDeptId === departmentId && permLevel <= 2) return true;
    if (permLevel <= 1) return true;
    return false;
  }

  return false;
}
