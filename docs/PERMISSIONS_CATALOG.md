# Shared permission catalog

Edit `shared/permissions.json` for section keys, operation keys, Arabic section
and operation labels, module-specific operation labels, IT-only keys and hidden
sections. The server reads this file directly. System and IT import generated
copies inside `src/generated/permissions.json` because CRA restricts external
source imports.

Both clients automatically run `scripts/syncPermissions.js` before `npm start`,
`npm test` and `npm run build`, including deployment builds. Server `npm test`
also synchronizes before regression checks. Generated copies are committed for
editors and direct test runners; do not edit them manually. You can synchronize
explicitly with `node scripts/syncPermissions.js` or check parity with `--check`.
An already running development server should be restarted after editing the
canonical catalog. Production clients receive changes with the next built and
deployed release, through the normal automatic-update mechanism.

System permission screens, its navigation labels and IT user/role permission
editors use these names. Module-specific labels distinguish weekly-task
management from permission management. IT now includes `tasks.manage`, which
was absent from its hand-maintained mirror.

Renaming labels does not change stored permissions. Existing role defaults,
user grants/revokes and server-side authorization remain authoritative. Adding
a catalog entry alone does not implement a feature or its route enforcement.
IT-only actions remain excluded from everyday roles and cannot be granted by
renaming a section. No migration is needed for this consolidation.
