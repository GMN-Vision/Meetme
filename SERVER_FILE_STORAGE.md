# Shared files on server disk

New file and media uploads use the Next.js Node server's disk. MongoDB stores file metadata and storage reservations. Existing Supabase uploads stay listed and downloadable; they are not moved automatically.

Set `FILE_STORAGE_PATH=/srv/melanam/meeting-files` in the deployed server environment. Create the directory with write access for the application user and mount it as a persistent volume. The default for development is `data/meeting-files` under the project. Keep this directory outside `public`. Back up both this volume and MongoDB.

All application instances must mount the same storage directory and use the same MongoDB database. An ephemeral serverless filesystem is unsuitable for this storage mode. Existing Supabase credentials remain necessary for accessing and accounting for older uploads.

The browser reserves space and uploads sequential chunks of up to 4 MiB, with percentage progress. If a proxy returns HTTP 413, the browser retries the rejected chunk at the same offset with smaller requests, down to 64 KiB. Allowing at least 5 MiB request bodies (for example, Nginx `client_max_body_size 5m;`) avoids that extra negotiation. Downloads stream from disk and support byte ranges. Set proxy timeouts to accommodate large downloads and slow connections. Changes take effect after restarting the application with the new environment.

Uploads accept all file extensions, including PNG, JPG/JPEG, MP4, documents, and archives, regardless of uppercase extensions or missing browser MIME types. Plan and workspace size limits still apply. Browser preview/playback support is separate from accepting a file for sharing.

Current per-file limits are Free 100 MB, Pro 1 GB, Business 5 GB and Enterprise 10 GB. Workspace storage is 1 GB, 50 GB, 250 GB and uncapped respectively. Limits are enforced on the server before bytes are accepted; pending uploads reserve their full declared size. Uploads are charged to the uploader's workspace. The interface shows the plan limit and available storage.

Failed browser uploads attempt to delete their partial file and release the reservation. Abandoned uploads expire after 24 hours; expired partial files are removed when another upload starts. Reservations expire even if no new uploads arrive. Files are only listed after all bytes have been written. Files keep their original names for download. Uploaders, meeting hosts and administrators can delete server files.

Filesystem locks in `.locks` coordinate writes and quota reservations. If an application process is forcibly terminated during a write, stop all app instances before removing stale lock files from that directory, then restart. Do not remove locks while uploads are active.

The implementation has been checked locally; deployment volume mounts, disk capacity and proxy settings must be configured on the actual host. No existing remote files are deleted or migrated by this change.
