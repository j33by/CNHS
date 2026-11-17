import crypto from 'node:crypto';
import { tx, db } from './db.js';
import { HttpError } from './util.js';

/*
 * ID numbers (same rules as the PHP portal)
 *   Student: <school-year start><end 2 digits>-<5 digits>   e.g. 202627-48213
 *   Teacher: T-<5 digits>                                   e.g. T-70519
 * No duplicates, even if two people enroll at once: each scope has a counter row that is locked (FOR UPDATE) while a number
 * is taken, the counter is turned into 5 digits with a bijection (mult*n+offset mod 100000), and the UNIQUE index on
 * student_no / teacher_no is the final safety net. The number and the record are saved in the same transaction.
 */
const CAP = 100000;
export const syPrefix = (label) => { const m = /^(\d{4})\s*-\s*(\d{4})$/.exec(String(label).trim()); return m ? m[1] + m[2].slice(2) : null; };
const idMult = () => { let m; do { m = crypto.randomInt(10001, 99999); } while (m % 2 === 0 || m % 5 === 0); return m; };
export const normStudentNo = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 11 ? d.slice(0, 6) + '-' + d.slice(6) : null; };
export const normTeacherNo = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 5 ? 'T-' + d : null; };

/** Reserve the next ID and run store(id, tx) in the same transaction. Returns [id, storeResult]. */
export async function allocateId(kind, yearId, store) {
  let scope, head;
  if (kind === 'student') {
    const label = await db.val('select label from school_years where id=$1', [yearId]);
    const prefix = label && syPrefix(label);
    if (!prefix) throw new HttpError(400, 'The school year label must look like 2026-2027 to create student ID numbers.');
    scope = 'S' + prefix; head = prefix + '-';
  } else { scope = 'T'; head = 'T-'; }
  await db.q('insert into id_counters(scope,last_seq,mult,offset_b) values($1,0,$2,$3) on conflict do nothing', [scope, idMult(), crypto.randomInt(0, CAP)]);
  const taken = (t, no) => t.val(kind === 'student' ? 'select 1 from students where student_no=$1 limit 1' : 'select 1 from teachers where teacher_no=$1 limit 1', [no]);
  for (let attempt = 0; ; attempt++) {
    try {
      return await tx(async (t) => {
        const c = await t.one('select last_seq,mult,offset_b from id_counters where scope=$1 for update', [scope]);
        let seq = c.last_seq, id;
        do {
          seq++;
          if (seq > CAP) throw new HttpError(400, 'All ID numbers for this range are used.');
          id = head + String((c.mult * seq + c.offset_b) % CAP).padStart(5, '0');
        } while (await taken(t, id));
        await t.q('update id_counters set last_seq=$1 where scope=$2', [seq, scope]);
        return [id, await store(id, t)];
      });
    } catch (e) {
      if ((e.code === '40P01' || e.code === '55P03') && attempt < 3) { await new Promise((r) => setTimeout(r, 30 + Math.random() * 120)); continue; }
      throw e;
    }
  }
}
export async function unnumberedCounts() {
  return {
    students: Number(await db.val('select count(*) from students where student_no is null')),
    teachers: Number(await db.val("select count(*) from teachers where teacher_no !~ '^T-[0-9]{5}$'")),
  };
}
