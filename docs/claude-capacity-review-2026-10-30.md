# Kamatera capacity discussion — request to actual Claude Code

Date: 2026-10-30. Advisory only; no infrastructure or application changes.

The owner explicitly asks Codex to discuss Tamheed with Claude and recommend
server additions for Tamheed, its sports subsystem, a growing local database,
and documents/photos stored on the server instead of Google Drive. This request
authorizes this bounded architecture discussion. No environment files, secrets,
runtime logs, real user records, or unrelated review payloads are included.

Codex is the author/coordinator. Actual Claude Code is the independent peer.
Review only this text, with no tools, file access, edits, other agents, or services.

## Evidence inspected by Codex (repository, not live production)

- Screenshot: Kamatera Type B, 1 vCPU, 2048 MB RAM, 20 GB OS disk;
  Full Daily Backup = No. Owner clarified a maximum of 50–60 simultaneous users. No measured utilization, current storage usage, monthly growth, or budget.
- Main React client and the Vite sports client share one Node/Express API and
  MongoDB. Both Nginx hosts proxy port 5000.
- `deploy/ecosystem.config.js:13-18`: one PM2 process, fork mode, memory restart
  700M; live updates and in-memory rate limits assume a single process.
- Review log dated 2026-10-27 records that the OWNER completed the move from
  Atlas to local MongoDB on Ubuntu 24.04. This is historical evidence, not a
  fresh production check. The deployment guide still starts with Atlas steps.
- Local Mongo guide configures a 0.25 GB WiredTiger cache for the old 2 GB VPS.
- `deploy/update.sh` installs packages and builds both frontends on the live
  VPS, then restarts the app. The builds need extra RAM/disk headroom.
- Player photos use sharp + CPU ONNX/MODNet in a worker, one queued job at a
  time; model about 26 MB, source input limit 15 MB/40M decoded pixels.
  `SportPlayerPhotos` stores the derived WebP image as a Mongo binary buffer.
  Source photos still come from Drive. There is no GPU requirement here.
- General files are tightly bound to googleDrive.service: folder listing,
  quota, upload, delete, rename, and signed view/download redirect to Drive.
  No general local-disk storage provider switch was found.
- Uploads stage on OS temp paths; public whole-file limit defaults to 2048 MB,
  chunk limit 60 MB in memory. Local-storage planning must account for staging
  and overlapping uploads, not only the final saved file.
- `deploy/mongo-backup.sh` defaults to full gzip DB dumps retained locally in
  `/var/backups/tamheed` for ~14 days. It stops the shared app while dumping,
  then restarts it. It does NOT back up future local documents/photos. Local
  backups share the server's failure domain. No new production checks done.

## Codex's preliminary recommendation to challenge

1. One server is a reasonable starting architecture, provided single-server
   downtime is acceptable. Type B, 4 vCPU + 8 GB RAM is a provisional baseline;
   4 vCPU + 16 GB offers more margin for local Mongo, uploads and photo workers
   when budget allows. Avoid claiming a concurrent-user capacity without load
   measurements. More systems alone does not specify load. No need for Type D
   or GPU without measured evidence.
2. Grow the OS/application disk from 20 to 60–80 GB. Add a 200 GB data disk as
   an INITIAL example, housing separate directories for Mongo and files, with
   explicit filesystem mounts and service startup dependency. Consider a
   third DB volume later for operational isolation, not a claim of independent
   physical disks or high availability. Final size depends on existing files,
   DB allocated size/indexes, monthly growth, staging and backup retention.
   Keep at least 25–30% headroom. Growing a disk in the console alone does not
   move Mongo or files or guarantee guest filesystem expansion.
3. Keep ordinary document/image bytes on a private filesystem, metadata and
   permissions in Mongo. Existing cutout-in-DB behavior is an exception to
   measure, not a reason to rewrite it now. Serve files through authorization
   (or protected internal Nginx handoff), not a public static directory.
   Build a provider abstraction and migrate/copy Drive files with checksums,
   metadata/link mapping and rollback before removing the old originals.
4. Off-server versioned backups for DB AND files plus restore tests are part
   of the design. Provider daily backup can supplement application-consistent
   backups; snapshots alone do not guarantee that. Existing local full dumps
   and stop-the-app strategy become expensive/disruptive as DB grows.
5. Revisit old Mongo cache and PM2 limits based on total measured memory,
   keep one process initially, move builds off production when practical,
   monitor memory pressure/swap, disk/inodes, CPU per core, I/O and API latency.
   If the single Node event loop is saturated, simply adding cores is not a
   linear fix; shared event/rate-limit/locking state needs design before scaleout.

Questions: What would you change in the recommendation? 8 GB vs 16 GB, disk
layout and sensible first capacity, migration requirements, backup/availability
tradeoffs? Separate facts, assumptions and measurements still needed. Do not
invent prices, benchmarks, counts or a claimed live-server inspection. Give a
concise independent opinion and concrete corrections. Owner has answered the concurrency question: 50–60 maximum. Stored GB, monthly growth and budget remain unknown.

