-- CNHS Platform: PostgreSQL schema for Supabase.
-- Merges the old MySQL schema.sql + upgrade_1..6 + publications.sql (publications now live in the SAME database).
-- Safe to run once. Run with:  npm run migrate   (or paste into the Supabase SQL editor)

create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table users (
  id serial primary key,
  username varchar(50) not null unique,
  full_name varchar(120) not null,
  pass_hash varchar(255) not null,
  role text not null default 'admin' check (role in ('admin','registrar','encoder')),
  active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now()
);
create table login_attempts (
  id serial primary key, ip varchar(45) not null, username varchar(80) not null,
  created_at timestamptz not null default now()
);
create index on login_attempts(ip, created_at);
create index on login_attempts(username, created_at);
create index on login_attempts(ip, username, created_at);

create table school_years (
  id serial primary key, label varchar(20) not null unique,
  start_date date not null, end_date date not null, is_current boolean not null default false
);
create table teachers (
  id serial primary key,
  teacher_no varchar(30) not null unique, legacy_no varchar(30),
  first_name varchar(60) not null, last_name varchar(60) not null,
  birthdate date not null, address varchar(255) not null, contact_no varchar(20) not null, spouse varchar(120),
  status text not null default 'active' check (status in ('active','on_leave','resigned','retired','terminated')),
  status_reason varchar(255), status_date date,
  portal_hash varchar(255), portal_must_change boolean not null default true, portal_last_login timestamptz,
  is_deleted boolean not null default false, deleted_at timestamptz, deleted_by int,
  created_at timestamptz not null default now()
);
create table sections (
  id serial primary key,
  school_year_id int not null references school_years(id),
  grade_level smallint not null, name varchar(40) not null,
  grading_term smallint not null default 1,
  adviser_id int references teachers(id),
  is_deleted boolean not null default false, deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on sections(school_year_id, grade_level);
create table students (
  id serial primary key,
  student_no varchar(12) unique,
  lrn char(12) not null unique,
  first_name varchar(60) not null, middle_name varchar(60), last_name varchar(60) not null, suffix varchar(10),
  sex char(1) not null, birthdate date not null, address varchar(255) not null,
  grade_level smallint not null,
  school_year_id int not null references school_years(id),
  section_id int references sections(id),
  guardian_name varchar(120) not null, guardian_contact varchar(20) not null,
  emergency_name varchar(120) not null, emergency_contact varchar(20) not null, emergency_relation varchar(40) not null,
  status text not null default 'enrolled' check (status in ('enrolled','dropped','transferred','graduated')),
  status_reason varchar(255), status_date date, transfer_school varchar(160),
  portal_hash varchar(255), portal_must_change boolean not null default true, portal_last_login timestamptz,
  is_deleted boolean not null default false, deleted_at timestamptz, deleted_by int,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on students(school_year_id, grade_level, status);
create index on students(section_id);
create index on students(last_name, first_name);
create trigger students_upd before update on students for each row execute function set_updated_at();

create table subjects (
  id serial primary key, code varchar(20) not null unique, name varchar(120) not null,
  grade_level smallint, is_deleted boolean not null default false, deleted_at timestamptz
);
create table subject_teachers (
  subject_id int not null references subjects(id) on delete cascade,
  teacher_id int not null references teachers(id),
  primary key (subject_id, teacher_id)
);
create table section_subjects (
  section_id int not null references sections(id), subject_id int not null references subjects(id),
  teacher_id int references teachers(id), primary key (section_id, subject_id)
);
create table grades (
  id serial primary key,
  student_id int not null references students(id), subject_id int not null references subjects(id),
  section_id int not null references sections(id), school_year_id int not null references school_years(id),
  term smallint not null, grade numeric(5,2) not null, entered_by int,
  updated_at timestamptz not null default now(),
  unique (student_id, subject_id, school_year_id, term)
);
create index on grades(section_id, subject_id, term);
create trigger grades_upd before update on grades for each row execute function set_updated_at();
create table term_release (
  school_year_id int not null references school_years(id), term smallint not null,
  released_at timestamptz not null default now(), primary key (school_year_id, term)
);
create table attendance (
  id serial primary key,
  student_id int not null references students(id), section_id int not null references sections(id),
  school_year_id int not null references school_years(id),
  att_date date not null, status char(1) not null check (status in ('P','A','L','E')),
  remarks varchar(120), marked_by varchar(60) not null,
  updated_at timestamptz not null default now(), unique (student_id, att_date)
);
create index on attendance(section_id, att_date);
create index on attendance(school_year_id, student_id);
create trigger att_upd before update on attendance for each row execute function set_updated_at();
create table schedules (
  id serial primary key,
  section_id int not null references sections(id), subject_id int not null references subjects(id),
  day_of_week smallint not null, start_time time not null, end_time time not null, room varchar(30)
);
create index on schedules(section_id, day_of_week);
create table class_attendance (
  id serial primary key,
  student_id int not null references students(id), section_id int not null references sections(id),
  subject_id int not null references subjects(id), school_year_id int not null references school_years(id),
  att_date date not null, status char(1) not null check (status in ('P','A','L','E')),
  remarks varchar(120), marked_by varchar(60) not null,
  updated_at timestamptz not null default now(), unique (student_id, subject_id, att_date)
);
create index on class_attendance(section_id, subject_id, att_date);
create index on class_attendance(school_year_id, section_id, subject_id);
create trigger catt_upd before update on class_attendance for each row execute function set_updated_at();
create table class_policy (
  section_id int not null references sections(id), subject_id int not null references subjects(id),
  school_year_id int not null references school_years(id),
  free_absences smallint not null default 10, apply_to_record boolean not null default false, updated_by varchar(60),
  primary key (section_id, subject_id, school_year_id)
);
create table record_columns (
  id serial primary key,
  section_id int not null references sections(id), subject_id int not null references subjects(id),
  school_year_id int not null references school_years(id), term smallint not null,
  title varchar(60) not null, col_date date not null, max_score numeric(7,2) not null, weight numeric(5,2) not null default 1,
  created_by int, is_deleted boolean not null default false, created_at timestamptz not null default now()
);
create index on record_columns(section_id, subject_id, school_year_id, term);
create table record_scores (
  column_id int not null references record_columns(id) on delete cascade,
  student_id int not null references students(id), score numeric(7,2) not null,
  primary key (column_id, student_id)
);
create table class_notices (
  id serial primary key, teacher_id int not null references teachers(id), section_id int not null references sections(id),
  title varchar(160) not null, body text not null, is_deleted boolean not null default false, created_at timestamptz not null default now()
);
create index on class_notices(section_id, is_deleted);
create table lesson_logs (
  id serial primary key,
  teacher_id int not null references teachers(id), section_id int not null references sections(id), subject_id int not null references subjects(id),
  log_date date not null, topic varchar(160) not null, notes text, is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index on lesson_logs(section_id, subject_id, log_date);
create table notices (
  id serial primary key, title varchar(160) not null, body text not null,
  audience text not null default 'all' check (audience in ('all','students','teachers','staff')),
  is_public boolean not null default false, posted_by int,
  is_deleted boolean not null default false, deleted_at timestamptz, created_at timestamptz not null default now()
);
create table announcements (
  id serial primary key,
  author_type text not null check (author_type in ('teacher','admin')), author_id int not null, author_name varchar(120) not null,
  title varchar(160) not null, body text not null,
  audience text not null default 'sections' check (audience in ('sections','all')), audience_label varchar(160) not null default '',
  allow_reactions boolean not null default false, allow_comments boolean not null default false,
  is_deleted boolean not null default false, created_at timestamptz not null default now()
);
create index on announcements(author_type, author_id);
create index on announcements(is_deleted, created_at);
create table announcement_targets (
  announcement_id int not null references announcements(id) on delete cascade, section_id int not null references sections(id),
  primary key (announcement_id, section_id)
);
create index on announcement_targets(section_id);
create table announcement_reactions (
  announcement_id int not null references announcements(id) on delete cascade, student_id int not null references students(id),
  reaction varchar(10) not null, created_at timestamptz not null default now(), primary key (announcement_id, student_id)
);
create table announcement_comments (
  id serial primary key, announcement_id int not null references announcements(id) on delete cascade,
  author_type text not null check (author_type in ('student','teacher','admin')), author_id int not null,
  author_name varchar(120) not null default '', body varchar(500) not null,
  is_deleted boolean not null default false, created_at timestamptz not null default now()
);
create index on announcement_comments(announcement_id, is_deleted);
create table id_counters (
  scope varchar(20) primary key, last_seq int not null default 0, mult int not null, offset_b int not null
);
create table logs (
  id bigserial primary key,
  user_id int, actor_type varchar(10), actor_id int, username varchar(50) not null,
  action varchar(40) not null, entity varchar(30) not null default '', entity_id int,
  details varchar(1000) not null default '', ip varchar(45) not null default '', user_agent varchar(255) not null default '',
  created_at timestamptz not null default now()
);
create index on logs(entity, entity_id);
create index on logs(created_at);
create index on logs(username);
create index on logs(actor_type, actor_id);
create table trash (
  id serial primary key, log_id bigint,
  entity varchar(30) not null, entity_id int, label varchar(200) not null default '',
  payload text not null,
  owner_type text not null check (owner_type in ('admin','teacher')), owner_id int not null default 0,
  deleted_by varchar(60) not null default '', created_at timestamptz not null default now(),
  restored_at timestamptz, restored_by varchar(60)
);
create index on trash(log_id);
create index on trash(owner_type, owner_id, restored_at);
create index on trash(entity, entity_id, restored_at);

-- ===== Publications (was a separate MySQL database) =====
create table pub_writers (
  teacher_id int primary key references teachers(id), teacher_no varchar(30) not null default '',
  full_name varchar(140) not null, assigned_by varchar(60) not null default '', created_at timestamptz not null default now()
);
create table pub_articles (
  id serial primary key, slug varchar(90) not null unique, title varchar(200) not null,
  excerpt varchar(400) not null default '', cover varchar(40), body text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  author_type text not null check (author_type in ('admin','teacher')), author_id int not null, author_name varchar(140) not null,
  published_at timestamptz, is_deleted boolean not null default false, deleted_at timestamptz, deleted_by varchar(60),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on pub_articles(status, is_deleted, published_at);
create index on pub_articles(author_type, author_id);
create trigger pub_upd before update on pub_articles for each row execute function set_updated_at();
create table pub_media (
  id serial primary key, filename varchar(40) not null unique, orig_name varchar(120) not null default '', mime varchar(30) not null,
  bytes int not null default 0, width int not null default 0, height int not null default 0,
  uploader_type text not null check (uploader_type in ('admin','teacher')), uploader_id int not null, created_at timestamptz not null default now()
);
create index on pub_media(uploader_type, uploader_id, created_at);
create table pub_reactions (
  article_id int not null references pub_articles(id) on delete cascade,
  actor_type text not null check (actor_type in ('student','teacher')), actor_id int not null,
  reaction varchar(10) not null, created_at timestamptz not null default now(),
  primary key (article_id, actor_type, actor_id)
);

-- ===== NEW: sessions, realtime notifications, devices =====
create table sessions (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin','teacher','student')), actor_id int not null,
  device text not null default 'desktop' check (device in ('desktop','mobile')),
  created_at timestamptz not null default now(), last_seen timestamptz not null default now(),
  revoked boolean not null default false, ip varchar(45) not null default '', user_agent varchar(255) not null default ''
);
create index on sessions(actor_type, actor_id);
create table notifications (
  id bigserial primary key,
  recipient_type text not null check (recipient_type in ('admin','teacher','student')), recipient_id int not null,
  kind varchar(30) not null, title varchar(160) not null, body varchar(500) not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), read_at timestamptz
);
create index on notifications(recipient_type, recipient_id, id desc);

-- ===== Security: the Supabase "anon" key must never read school data. The Node backend uses the service connection (bypasses RLS). =====
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

insert into schema_migrations(name) values ('001_init');
