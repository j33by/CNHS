import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/* Article pictures. On Render the disk is wiped on every deploy, so pictures go to Supabase Storage (public bucket).
 * If SUPABASE_URL / SUPABASE_SERVICE_KEY are not set (local testing), they are kept in ./uploads/pub instead. */
const remote = () => !!(config.supabaseUrl && config.supabaseServiceKey);
export const localDir = path.resolve('uploads/pub');
export const imgBase = () => (remote() ? `${config.supabaseUrl}/storage/v1/object/public/${config.storageBucket}/` : (config.siteUrl || '') + '/uploads/pub/');

export async function saveImage(name, buffer, mime) {
  if (remote()) {
    const r = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.storageBucket}/${name}`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + config.supabaseServiceKey, apikey: config.supabaseServiceKey, 'Content-Type': mime, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' }, body: buffer,
    });
    if (!r.ok) throw new Error('Storage upload failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
  } else { await fs.mkdir(localDir, { recursive: true }); await fs.writeFile(path.join(localDir, name), buffer); }
}
/** Creates the public bucket on first start (needs the service key). */
export async function ensureBucket() {
  if (!remote()) return;
  try {
    const h = { Authorization: 'Bearer ' + config.supabaseServiceKey, apikey: config.supabaseServiceKey, 'Content-Type': 'application/json' };
    const r = await fetch(`${config.supabaseUrl}/storage/v1/bucket/${config.storageBucket}`, { headers: h });
    if (r.status === 200) return;
    const c = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, { method: 'POST', headers: h, body: JSON.stringify({ id: config.storageBucket, name: config.storageBucket, public: true, file_size_limit: 6291456, allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] }) });
    console.log('storage bucket', c.ok ? 'created' : 'not created: ' + (await c.text()).slice(0, 160));
  } catch (e) { console.error('ensureBucket', e.message); }
}
