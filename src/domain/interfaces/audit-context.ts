/**
 * Who is acting, threaded from the route handler through the domain service to
 * the repository, which stamps it into `created_by` / `updated_by`.
 *
 * Nullable because some writes genuinely have no actor — seeds, migrations, and
 * a public collection where the person at the locker has no account.
 */
export type AuditContext = {
  readonly actingUserId: string | null
}
