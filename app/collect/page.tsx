import { CollectPackageForm } from "@/components/collect-package-form"

/**
 * Collecting a package, with no account and no session.
 *
 * Unguarded on purpose: the person at the locker was sent a code, not an
 * invitation to sign up, and a first delivery to someone who has never used the
 * service has to be collectable. The code is the credential, and it is the only
 * thing the page asks for — the station and the locker are things the code already
 * knows, and a person standing in front of the doors should not have to tell the
 * system where they are.
 *
 * Nothing is read from the database here, so the page is static and the only
 * request that touches Postgres is the collection itself.
 */
export default function CollectPackagePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl">Collect your package</h1>
        <p className="text-muted-foreground">
          Enter the six-digit code you were sent.
        </p>
      </div>

      <CollectPackageForm />
    </main>
  )
}
