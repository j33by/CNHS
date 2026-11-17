const env = process.env;
export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || '',
  dbSsl: env.DB_SSL !== 'false',
  jwtSecret: env.JWT_SECRET || '',
  supabaseUrl: (env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseServiceKey: env.SUPABASE_SERVICE_KEY || '',
  storageBucket: env.STORAGE_BUCKET || 'pub-media',
  siteUrl: (env.SITE_URL || '').replace(/\/$/, ''),
  tz: 'Asia/Manila',
  // Same limits as the PHP config.php
  MAX_SUBJECTS_PER_TEACHER: 5,
  MAX_TEACHERS_PER_SUBJECT: 3,
  MAX_SUBJECTS_PER_SECTION: 12,
  SECTION_CAP: 50,
  PASSING_GRADE: 75,
  MAX_RECORD_COLS: 15,
  UNDO_SECONDS: 12,
  // Session policy. "desktop" = the old web rules (20 min idle, 8 h max). "mobile" = a phone stays signed in so background notifications keep working.
  session: {
    desktop: { idle: 1200, absolute: 28800 },
    mobile: { idle: 60 * 60 * 24 * 30, absolute: 60 * 60 * 24 * 90 },
  },
};
export function assertConfig() {
  const bad = [];
  if (!config.databaseUrl) bad.push('DATABASE_URL');
  if (config.jwtSecret.length < 32) bad.push('JWT_SECRET (at least 32 characters)');
  if (bad.length) throw new Error('Missing environment settings: ' + bad.join(', '));
}
export const GRADES = [7, 8, 9, 10, 11, 12];
export const STU_STATUS = { enrolled: 'Enrolled', dropped: 'Dropped', transferred: 'Transferred out', graduated: 'Graduated' };
export const TCH_STATUS = { active: 'Active', on_leave: 'On leave', resigned: 'Resigned', retired: 'Retired', terminated: 'Terminated' };
export const ATT = { P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' };
export const DAYS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };
export const ROLES = { admin: 'Administrator', registrar: 'Registrar', encoder: 'Grade and attendance encoder' };
export const ROLE_MODULES = {
  admin: ['*'],
  registrar: ['index', 'students', 'sections', 'attendance', 'schedule', 'teachers', 'subjects', 'notices', 'announcements', 'reports', 'years', 'account'],
  encoder: ['index', 'grades', 'attendance', 'reports', 'account'],
};
export const REACTIONS = { like: 'Like', love: 'Love', thanks: 'Thanks', noted: 'Noted' };
