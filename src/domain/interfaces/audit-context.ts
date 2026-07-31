/**
 * Who is acting; stamped into `created_by` / `updated_by`. Null when a write
 * has no actor (seeds, migrations, public collection).
 */
export type AuditContext = {
  readonly actingUserId: string | null
}
