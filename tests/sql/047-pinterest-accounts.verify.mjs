// TASK-091 — live check of migration 047 on a real Postgres (PGlite), outside the app.
// Not part of any test project and not a dependency: run it from a scratch folder:
//   mkdir pg-check && cd pg-check && npm init -y && npm i @electric-sql/pglite@0.2.17
//   cp <repo>/tests/sql/047-pinterest-accounts.verify.mjs . && node 047-pinterest-accounts.verify.mjs <repo>/supabase/migrations
// Builds a minimal schema (auth.uid() stub, role authenticated), runs 007/030/031/032 then 047 on
// legacy data, and checks backfill, constraints, RLS, user isolation and cascades. Exit 1 on failure.

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

await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create role authenticated;
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
create or replace function update_updated_at_column() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table profiles (id uuid primary key);
create table projects (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, name text not null);
alter table projects enable row level security;
create policy p on projects for all using (user_id = auth.uid());
grant select on projects to authenticated;
create table generations (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id));
create table wordpress_categories (id uuid primary key default gen_random_uuid(), user_id uuid not null, project_id uuid not null references projects(id) on delete cascade, name text);
alter table wordpress_categories enable row level security; create policy wc on wordpress_categories for all using (user_id = auth.uid()); grant select on wordpress_categories to authenticated;
create table pins (id uuid primary key default gen_random_uuid(), generation_id uuid not null references generations(id) on delete cascade, board text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
`);
for (const f of ['007_add_boards.sql', '030_add_content_streams.sql', '031_harden_content_streams_rls.sql', '032_add_pins_board_section.sql']) await db.exec(read(f));

const U1 = '00000000-0000-4000-8000-000000000001', U2 = '00000000-0000-4000-8000-000000000002';
const P1 = '10000000-0000-4000-8000-000000000001', P1b = '10000000-0000-4000-8000-000000000003', P2 = '10000000-0000-4000-8000-000000000002';
const B1 = '20000000-0000-4000-8000-000000000001', B2 = '20000000-0000-4000-8000-000000000002', B3 = '20000000-0000-4000-8000-000000000003', BX = '20000000-0000-4000-8000-000000000009', BP1b = '20000000-0000-4000-8000-000000000004';
const S1 = '30000000-0000-4000-8000-000000000001', S2 = '30000000-0000-4000-8000-000000000002', SX = '30000000-0000-4000-8000-000000000009';
const G1 = '40000000-0000-4000-8000-000000000001';
await db.exec(`
insert into profiles values ('${U1}'), ('${U2}');
insert into projects values ('${P1}', '${U1}', 'Clay Idea Lab'), ('${P1b}', '${U1}', 'Other project'), ('${P2}', '${U2}', 'Other user');
insert into boards (id, project_id, user_id, name) values ('${B1}', '${P1}', '${U1}', 'Air Dry Clay Projects'), ('${B2}', '${P1}', '${U1}', 'Easy Air Dry Clay Ideas'), ('${B3}', '${P1}', '${U1}', 'Polymer Clay Ideas'), ('${BP1b}', '${P1b}', '${U1}', 'Elsewhere'), ('${BX}', '${P2}', '${U2}', 'Foreign');
insert into content_streams (id, project_id, user_id, name) values ('${S1}', '${P1}', '${U1}', 'Air Dry Clay'), ('${S2}', '${P1}', '${U1}', 'Polymer Clay'), ('${SX}', '${P2}', '${U2}', 'Foreign stream');
insert into content_stream_boards (content_stream_id, board_id, user_id, created_at) values ('${S1}', '${B1}', '${U1}', now() - interval '2 days'), ('${S1}', '${B2}', '${U1}', now() - interval '1 day'), ('${S2}', '${B3}', '${U1}', now());
insert into generations values ('${G1}', '${U1}');
insert into pins (generation_id, board, board_id, board_section) values ('${G1}', 'Air Dry Clay Projects', '${B1}', 'Legacy Free Text');
`);

await expectOk('migration 047 applies', read('047_add_pinterest_accounts_and_sections.sql'));

const rows = (await db.query(`select content_stream_id, board_id, is_primary, is_active, weight, section_id, id from content_stream_boards order by content_stream_id, created_at`)).rows;
if (rows.length === 3) ok('existing links kept (3 rows)'); else bad('existing links kept', rows.length);
const prim = rows.filter((r) => r.is_primary).map((r) => r.board_id).sort();
if (JSON.stringify(prim) === JSON.stringify([B1, B3].sort())) ok('oldest link of each stream is primary'); else bad('primary backfill', prim);
if (rows.every((r) => r.is_active && r.weight === 1 && r.section_id === null && r.id)) ok('existing links active, weight 1, no section, id filled'); else bad('defaults', rows);
const pin = (await db.query(`select board, board_section, board_id, pinterest_account_id, pinterest_section_id from pins`)).rows[0];
if (pin.board_section === 'Legacy Free Text' && pin.pinterest_account_id === null) ok('pins.board_section kept, new refs null'); else bad('pins legacy', pin);
const st = (await db.query(`select pinterest_account_id from content_streams where id = '${S1}'`)).rows[0];
if (st.pinterest_account_id === null) ok('legacy stream stays unlinked'); else bad('legacy stream', st);
const acc = (await db.query(`select count(*)::int c from pinterest_accounts`)).rows[0].c;
if (acc === 0) ok('no account created automatically'); else bad('auto accounts', acc);

const A1 = '50000000-0000-4000-8000-000000000001', A2 = '50000000-0000-4000-8000-000000000002', AO = '50000000-0000-4000-8000-000000000003';
await expectOk('create accounts', `insert into pinterest_accounts (id, project_id, user_id, name) values ('${A1}', '${P1}', '${U1}', 'Air Dry Clay Projects'), ('${A2}', '${P1}', '${U1}', 'Polymer Clay Ideas'), ('${AO}', '${P1b}', '${U1}', 'Other project account')`);
await expectErr('account name unique per project (case-insensitive)', `insert into pinterest_accounts (project_id, user_id, name) values ('${P1}', '${U1}', 'air dry clay projects')`, /unique/);
await expectErr('account_type checked', `insert into pinterest_accounts (project_id, user_id, name, account_type) values ('${P1}', '${U1}', 'X', 'creator')`, /check/);
await expectErr('status checked', `insert into pinterest_accounts (project_id, user_id, name, status) values ('${P1}', '${U1}', 'Y', 'deleted')`, /check/);
await expectErr('board cannot use an account of another project (FK)', `update boards set pinterest_account_id = '${AO}' where id = '${B1}'`, /foreign key/);
await expectOk('attach boards to accounts', `update boards set pinterest_account_id = '${A1}' where id in ('${B1}', '${B2}'); update boards set pinterest_account_id = '${A2}' where id = '${B3}'`);
const SEC1 = '60000000-0000-4000-8000-000000000001', SEC2 = '60000000-0000-4000-8000-000000000002', SEC3 = '60000000-0000-4000-8000-000000000003';
await expectOk('several sections in one board', `insert into pinterest_board_sections (id, board_id, user_id, name) values ('${SEC1}', '${B1}', '${U1}', 'Pumpkins'), ('${SEC2}', '${B1}', '${U1}', 'Coasters'), ('${SEC3}', '${B2}', '${U1}', 'Pumpkins')`);
await expectErr('section name unique per board (case-insensitive)', `insert into pinterest_board_sections (board_id, user_id, name) values ('${B1}', '${U1}', 'pumpkins')`, /unique/);
await expectErr('section name without "/"', `insert into pinterest_board_sections (board_id, user_id, name) values ('${B1}', '${U1}', 'A/B')`, /check/);
await expectErr('empty section name refused', `insert into pinterest_board_sections (board_id, user_id, name) values ('${B1}', '${U1}', '   ')`, /check/);
const keep = (await db.query(`select name from pinterest_board_sections where id = '${SEC1}'`)).rows[0].name;
if (keep === 'Pumpkins') ok('section name kept exactly'); else bad('name kept', keep);
await expectOk('same board with several sections in one stream', `insert into content_stream_boards (content_stream_id, board_id, section_id, user_id) values ('${S1}', '${B1}', '${SEC1}', '${U1}'), ('${S1}', '${B1}', '${SEC2}', '${U1}')`);
await expectErr('duplicate stream+board (no section) refused', `insert into content_stream_boards (content_stream_id, board_id, user_id) values ('${S1}', '${B1}', '${U1}')`, /unique/);
await expectErr('duplicate stream+board+section refused', `insert into content_stream_boards (content_stream_id, board_id, section_id, user_id) values ('${S1}', '${B1}', '${SEC1}', '${U1}')`, /unique/);
await expectErr('section of another board refused (FK)', `insert into content_stream_boards (content_stream_id, board_id, section_id, user_id) values ('${S1}', '${B2}', '${SEC1}', '${U1}')`, /foreign key/);
await expectErr('second primary refused', `insert into content_stream_boards (content_stream_id, board_id, section_id, user_id, is_primary) values ('${S1}', '${B2}', '${SEC3}', '${U1}', true)`, /unique/);
await expectErr('inactive primary refused', `update content_stream_boards set is_active = false where content_stream_id = '${S1}' and is_primary`, /check/);
await expectErr('weight 0 refused', `update content_stream_boards set weight = 0 where content_stream_id = '${S2}'`, /check/);
await expectErr('weight 101 refused', `update content_stream_boards set weight = 101 where content_stream_id = '${S2}'`, /check/);
await expectErr('stream cannot use an account of another project (FK)', `update content_streams set pinterest_account_id = '${AO}' where id = '${S1}'`, /foreign key/);
await expectErr('account with boards cannot be deleted', `delete from pinterest_accounts where id = '${A1}'`, /foreign key/);

async function asUser(uid, sql) { await db.exec(`set role authenticated; select set_config('app.uid', '${uid}', false); ${sql};`); await db.exec('reset role'); }
async function rlsOk(name, uid, sql) { try { await asUser(uid, sql); ok(name); } catch (e) { await db.exec('reset role'); bad(name, e); } }
async function rlsErr(name, uid, sql) {
  try { await asUser(uid, sql); bad(name, 'expected RLS error'); }
  catch (e) {
    await db.exec('reset role');
    if (/row-level security|permission/.test(e.message)) ok(name + ' -> ' + e.message.slice(0, 80));
    else bad(name, e);
  }
}

await db.exec(`update content_streams set pinterest_account_id = '${A1}' where id = '${S1}'`);
await rlsOk('owner creates an account in own project', U1, `insert into pinterest_accounts (project_id, user_id, name) values ('${P1}', '${U1}', 'Third')`);
await rlsErr('account in another user project refused', U1, `insert into pinterest_accounts (project_id, user_id, name) values ('${P2}', '${U1}', 'Steal')`);
await rlsErr('account written for another user refused', U1, `insert into pinterest_accounts (project_id, user_id, name) values ('${P1}', '${U2}', 'Spoof')`);
await rlsErr('section on another user board refused', U1, `insert into pinterest_board_sections (board_id, user_id, name) values ('${BX}', '${U1}', 'Steal')`);
await rlsErr('board of another account refused for a linked stream', U1, `insert into content_stream_boards (content_stream_id, board_id, user_id) values ('${S1}', '${B3}', '${U1}')`);
await rlsOk('board of the stream account accepted', U1, `update content_stream_boards set weight = 3 where content_stream_id = '${S1}' and board_id = '${B2}' and section_id is null`);
await rlsOk('board of same account + its section accepted', U1, `insert into content_stream_boards (content_stream_id, board_id, section_id, user_id, is_active) values ('${S1}', '${B2}', '${SEC3}', '${U1}', false)`);
await db.exec(`update boards set pinterest_account_id = null where id = '${B3}'`);
await rlsErr('board without account refused for a linked stream', U1, `insert into content_stream_boards (content_stream_id, board_id, user_id) values ('${S1}', '${B3}', '${U1}')`);
await rlsOk('legacy stream (no account) still links any board of its project', U1, `delete from content_stream_boards where content_stream_id = '${S2}'; insert into content_stream_boards (content_stream_id, board_id, user_id, is_primary) values ('${S2}', '${B3}', '${U1}', true)`);
await rlsErr('board of another project refused', U1, `insert into content_stream_boards (content_stream_id, board_id, user_id) values ('${S2}', '${BP1b}', '${U1}')`);
await rlsErr('foreign board refused', U1, `insert into content_stream_boards (content_stream_id, board_id, user_id) values ('${S1}', '${BX}', '${U1}')`);
await rlsErr('board moved to another user project refused', U1, `update boards set project_id = '${P2}' where id = '${B2}'`);
await rlsErr('own stream linked to an account the user does not own refused', U2, `update content_streams set pinterest_account_id = '${A1}' where id = '${SX}'`).catch(() => {});

const seen = async (uid, sql) => { await db.exec(`set role authenticated; select set_config('app.uid', '${uid}', false)`); const r = (await db.query(sql)).rows; await db.exec('reset role'); return r; };
const iso = await seen(U2, `select (select count(*) from pinterest_accounts)::int a, (select count(*) from pinterest_board_sections)::int s, (select count(*) from content_stream_boards)::int d`);
if (iso[0].a === 0 && iso[0].s === 0 && iso[0].d === 0) ok('user B sees none of user A accounts / sections / destinations'); else bad('isolation', iso);

await expectOk('project delete still cascades', `delete from projects where id = '${P1}'`);
const left = (await db.query(`select (select count(*) from pinterest_accounts where project_id = '${P1}')::int a, (select count(*) from pinterest_board_sections)::int s, (select count(*) from content_stream_boards)::int d`)).rows[0];
if (left.a === 0 && left.s === 0 && left.d === 0) ok('cascade left nothing behind'); else bad('cascade', left);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
