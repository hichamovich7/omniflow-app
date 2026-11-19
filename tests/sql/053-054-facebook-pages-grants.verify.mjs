// TASK-102 / TASK-100 follow-up — live check of migrations 053 and 054 on a real Postgres (PGlite),
// outside the app. Not part of any test project and not a dependency: run it from a scratch folder:
//   mkdir pg-check && cd pg-check && npm init -y && npm i @electric-sql/pglite
//   cp <repo>/tests/sql/053-054-facebook-pages-grants.verify.mjs . && node 053-054-facebook-pages-grants.verify.mjs <repo>/supabase/migrations
// Builds a minimal schema (auth.uid() stub, roles anon / authenticated / service_role), runs 045, 046, 048,
// then checks: the old ON CONFLICT (project_id, platform) key before / after 053, several Pages per project,
// no duplicate Page, legacy rows kept, the mapping RLS (own project, category of the same project, connected
// Page of the same project), and the exact service_role privileges of 054. Exit 1 on failure.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = process.argv[2];
const db = new PGlite();
const read = (f) => readFileSync(join(MIG, f), 'utf8');
let failures = 0;
const ok = (name) => console.log('PASS', name);
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? JSON.stringify(e)); };
async function expectOk(name, sql) { try { await db.exec(sql); ok(name); } catch (e) { bad(name, e); } }
async function expectErr(name, sql, re) {
  try { await db.exec(sql); bad(name, 'expected an error'); }
  catch (e) { if (!re || re.test(e.message)) ok(name + ' -> ' + e.message.slice(0, 90)); else bad(name, e); }
}
async function value(sql) { return Object.values((await db.query(sql)).rows[0])[0]; }
async function asUser(uid, sql) { return `reset role; set app.uid = '${uid}'; set role authenticated; ${sql}; reset role;`; }

await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create role anon; create role authenticated; create role service_role;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to authenticated;
create or replace function update_updated_at_column() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table profiles (id uuid primary key);
create table projects (id uuid primary key, user_id uuid not null references profiles(id) on delete cascade, name text not null);
alter table projects enable row level security; create policy p on projects for all using (user_id = auth.uid()); grant select on projects to authenticated;
create table wordpress_generations (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table wordpress_sites (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table generations (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table content_streams (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table wordpress_categories (id uuid primary key, project_id uuid not null references projects(id) on delete cascade, user_id uuid not null, name text not null);
alter table wordpress_categories enable row level security; create policy wc on wordpress_categories for all using (user_id = auth.uid()); grant select on wordpress_categories to authenticated;
`);
for (const f of ['045_add_social_content_generations.sql', '046_add_social_connections_and_publications.sql', '048_add_social_publication_scheduling.sql']) await db.exec(read(f));

const U1 = '00000000-0000-4000-8000-000000000001', U2 = '00000000-0000-4000-8000-000000000002';
const P1 = '10000000-0000-4000-8000-000000000001', P1b = '10000000-0000-4000-8000-000000000003', P2 = '10000000-0000-4000-8000-000000000002';
const C1 = '20000000-0000-4000-8000-000000000001', C1b = '20000000-0000-4000-8000-000000000003';
const PAGE_A = '1111111111', PAGE_B = '2222222222';
const conn = (id, user, project, page, name) =>
  `insert into social_connections (id, user_id, project_id, platform, account_type, external_account_id, external_account_name, encrypted_access_token)
   values ('${id}', '${user}', '${project}', 'facebook', 'facebook_page', '${page}', '${name}', 'enc')`;
await db.exec(`
insert into profiles values ('${U1}'), ('${U2}');
insert into projects values ('${P1}', '${U1}', 'Crochet Blog EN'), ('${P1b}', '${U1}', 'Other project'), ('${P2}', '${U2}', 'Other user');
insert into wordpress_categories values ('${C1}', '${P1}', '${U1}', 'Sweaters'), ('${C1b}', '${P1b}', '${U1}', 'Elsewhere');
`);
const LEGACY = '30000000-0000-4000-8000-000000000001';
await expectOk('before 053: legacy connection (one Page per project)', conn(LEGACY, U1, P1, PAGE_A, 'Crochet Sweater Pattern'));
await expectOk('before 053: old code upsert ON CONFLICT (project_id, platform) works',
  `insert into social_connections (user_id, project_id, platform, account_type, external_account_id, external_account_name, encrypted_access_token)
   values ('${U1}', '${P1}', 'facebook', 'facebook_page', '${PAGE_A}', 'Crochet Sweater Pattern', 'enc2')
   on conflict (project_id, platform) do update set encrypted_access_token = excluded.encrypted_access_token`);
await expectErr('before 053: new code upsert ON CONFLICT (project_id, platform, external_account_id) fails (no constraint)',
  `insert into social_connections (user_id, project_id, platform, account_type, external_account_id, external_account_name, encrypted_access_token)
   values ('${U1}', '${P1}', 'facebook', 'facebook_page', '${PAGE_B}', 'B', 'enc')
   on conflict (project_id, platform, external_account_id) do update set encrypted_access_token = excluded.encrypted_access_token`, /no unique or exclusion constraint/);
await expectOk('publication on the legacy connection', `insert into social_publications (user_id, project_id, connection_id, platform, external_account_id, external_account_name, post_message)
   values ('${U1}', '${P1}', '${LEGACY}', 'facebook', '${PAGE_A}', 'Crochet Sweater Pattern', 'hello')`);

// ---------------------------------------------------------------------------
await expectOk('migration 053 applies', read('053_add_facebook_multiple_pages.sql'));

if ((await value(`select count(*)::int from social_connections where id = '${LEGACY}' and encrypted_access_token = 'enc2'`)) === 1) ok('legacy connection kept (same id, same token)'); else bad('legacy kept');
if ((await value(`select count(*)::int from social_publications where connection_id = '${LEGACY}'`)) === 1) ok('its publication still points to it'); else bad('publication link');
await expectErr('after 053: old code upsert ON CONFLICT (project_id, platform) fails (dropped key)',
  `insert into social_connections (user_id, project_id, platform, account_type, external_account_id, external_account_name, encrypted_access_token)
   values ('${U1}', '${P1}', 'facebook', 'facebook_page', '${PAGE_B}', 'B', 'enc')
   on conflict (project_id, platform) do update set encrypted_access_token = excluded.encrypted_access_token`, /no unique or exclusion constraint/);
const upsertNew = (page, name, token) =>
  `insert into social_connections (user_id, project_id, platform, account_type, external_account_id, external_account_name, encrypted_access_token)
   values ('${U1}', '${P1}', 'facebook', 'facebook_page', '${page}', '${name}', '${token}')
   on conflict (project_id, platform, external_account_id) do update set encrypted_access_token = excluded.encrypted_access_token, status = 'active'`;
await expectOk('second Page added to the same project', upsertNew(PAGE_B, 'Crochet Hats', 'encB'));
await expectOk('same Page again = refresh in place', upsertNew(PAGE_A, 'Crochet Sweater Pattern', 'enc3'));
if ((await value(`select count(*)::int from social_connections where project_id = '${P1}'`)) === 2) ok('two Pages, no duplicate'); else bad('page count');
if ((await value(`select id::text from social_connections where project_id = '${P1}' and external_account_id = '${PAGE_A}'`)) === LEGACY) ok('reconnect keeps the legacy id'); else bad('reconnect id');
await expectErr('same Page twice in one project refused', conn('30000000-0000-4000-8000-000000000009', U1, P1, PAGE_B, 'dup'), /unique/);
await expectOk('same Page in another project allowed', conn('30000000-0000-4000-8000-000000000002', U1, P1b, PAGE_B, 'B elsewhere'));
await expectOk('other user connection', conn('30000000-0000-4000-8000-000000000003', U2, P2, PAGE_A, 'Theirs'));

// Mapping RLS (role authenticated).
await db.exec(`grant select on wordpress_categories to authenticated`);
const mapping = (project, category, page) => `insert into facebook_page_category_mappings (user_id, project_id, wordpress_category_id, external_account_id) values ('${U1}', '${project}', '${category}', '${page}')`;
await expectOk('mapping: own project + category + connected Page', await asUser(U1, mapping(P1, C1, PAGE_B)));
await expectErr('mapping: one Page per category (unique)', await asUser(U1, mapping(P1, C1, PAGE_A)), /unique/);
await db.exec(`reset role`);
await expectErr('mapping: category of another project refused (RLS)', await asUser(U1, mapping(P1, C1b, PAGE_B)), /row-level security/);
await db.exec(`reset role`);
await expectErr('mapping: Page not connected to this project refused (RLS)', await asUser(U1, mapping(P1b, C1b, PAGE_A)), /row-level security/);
await db.exec(`reset role`);
await expectErr('mapping: another user cannot write into my project (RLS)',
  await asUser(U2, `insert into facebook_page_category_mappings (user_id, project_id, wordpress_category_id, external_account_id) values ('${U2}', '${P1}', '${C1}', '${PAGE_A}')`), /row-level security/);
await db.exec(`reset role`);
await db.exec(`set app.uid = '${U2}'; set role authenticated;`);
if ((await value(`select count(*)::int from facebook_page_category_mappings`)) === 0) ok('mapping invisible to another user'); else bad('mapping isolation');
await db.exec(`reset role`);
if ((await value(`select has_column_privilege('authenticated', 'public.social_connections', 'encrypted_access_token', 'SELECT')`)) === false) ok('token column still unreadable by authenticated'); else bad('token privilege');

// ---------------------------------------------------------------------------
// 054 — exactly SELECT + UPDATE for service_role on social_publications.
const priv = (role, p) => value(`select has_table_privilege('${role}', 'public.social_publications', '${p}')`);
if ((await priv('service_role', 'SELECT')) === false && (await priv('service_role', 'UPDATE')) === false) ok('before 054: service_role has no SELECT / UPDATE (fresh environment)'); else bad('before 054');
const authBefore = await value(`select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee = 'authenticated' and table_name = 'social_publications'`);
await expectOk('migration 054 applies', read('054_grant_service_role_social_publications.sql'));
await expectOk('migration 054 re-applied (idempotent, as in production)', read('054_grant_service_role_social_publications.sql'));
for (const [p, want] of [['SELECT', true], ['UPDATE', true], ['INSERT', false], ['DELETE', false], ['TRUNCATE', false], ['REFERENCES', false], ['TRIGGER', false]]) {
  if ((await priv('service_role', p)) === want) ok(`service_role ${p} = ${want}`); else bad(`service_role ${p}`, { expected: want });
}
const sr = await value(`select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee = 'service_role' and table_name = 'social_publications'`);
if (sr === 'SELECT,UPDATE') ok('service_role grants on social_publications = SELECT,UPDATE'); else bad('service_role grant list', sr);
const authAfter = await value(`select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee = 'authenticated' and table_name = 'social_publications'`);
if (authAfter === authBefore) ok(`authenticated grants unchanged (${authAfter})`); else bad('authenticated grants', { authBefore, authAfter });
if ((await priv('anon', 'SELECT')) === false) ok('anon still has nothing'); else bad('anon');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
