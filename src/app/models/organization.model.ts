import type { Tables } from '../data/database.types';

export type AppRole = 'admin' | 'clinician' | 'viewer';
export type Organization = Tables<'organizations'>;
export type Membership = Tables<'memberships'>;
export type AuditEntry = Tables<'audit_log'>;
