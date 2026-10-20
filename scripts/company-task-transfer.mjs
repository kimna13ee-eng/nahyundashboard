// Manual, reviewed task/history transfer. This script never connects to a DB.
// Real owner/task identifiers and exported rows stay in ignored work/outputs.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { containsSecret } from "../src/lib/secrets.ts";

export const transferTables = {
  tasks: {
    table: "tasks",
    columns: [
      "id",
      "owner_id",
      "title",
      "notes",
      "status",
      "priority",
      "due_date",
      "created_at",
      "project_id",
      "tool",
      "assignee",
      "result_url",
      "estimated_minutes",
      "approval",
      "updated_at",
      "work_kind",
      "follow_up_at",
      "contact_status",
      "is_test",
      "task_category",
      "process_steps",
      "completed_at",
    ],
  },
  task_notes: {
    table: "ops_task_notes",
    columns: [
      "id",
      "owner_id",
      "task_id",
      "body",
      "kind",
      "pinned",
      "done",
      "converted_task_id",
      "created_at",
      "updated_at",
    ],
  },
  note_versions: {
    table: "ops_note_versions",
    columns: [
      "id",
      "owner_id",
      "note_id",
      "body",
      "kind",
      "pinned",
      "done",
      "created_at",
    ],
  },
  work_sessions: {
    table: "ops_work_sessions",
    columns: [
      "id",
      "owner_id",
      "task_id",
      "status",
      "summary",
      "created_at",
      "updated_at",
      "ended_at",
    ],
  },
  session_intervals: {
    table: "ops_session_intervals",
    columns: [
      "id",
      "owner_id",
      "session_id",
      "starts_at",
      "ends_at",
      "created_at",
    ],
  },
  session_events: {
    table: "ops_session_events",
    columns: [
      "id",
      "owner_id",
      "request_id",
      "session_id",
      "previous_session_id",
      "kind",
      "created_at",
    ],
  },
  work_journal: {
    table: "ops_work_journal",
    columns: [
      "id",
      "owner_id",
      "session_id",
      "work_date",
      "summary",
      "created_at",
    ],
  },
  parked_context: {
    table: "ops_parked_context",
    columns: ["id", "owner_id", "session_id", "payload", "created_at"],
  },
};
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (message) => {
  throw new Error(message);
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sameSet = (a, b) =>
  a.length === b.length &&
  [...a].sort().every((value, index) => value === [...b].sort()[index]);

export function validateTransferManifest(manifest) {
  if (
    !manifest ||
    manifest.format_version !== 1 ||
    !uuid(manifest.source_owner) ||
    !uuid(manifest.target_owner) ||
    manifest.source_owner === manifest.target_owner
  )
    fail("Invalid transfer owner manifest");
  if (
    !Array.isArray(manifest.task_ids) ||
    manifest.task_ids.length !== 10 ||
    new Set(manifest.task_ids).size !== 10 ||
    !manifest.task_ids.every(uuid)
  )
    fail("Exactly 10 distinct approved task IDs are required");
  if (
    !Array.isArray(manifest.expected_parked_session_ids) ||
    !manifest.expected_parked_session_ids.every(uuid) ||
    new Set(manifest.expected_parked_session_ids).size !==
      manifest.expected_parked_session_ids.length
  )
    fail("Explicit parked-session inventory is required");
  return manifest;
}

/** A single SELECT exports a consistent source snapshot with explicit columns.
 * Auth, settings, content, leave, sheets, schedules and library are not selected. */
export function buildCompanyTaskExport(rawManifest) {
  const manifest = validateTransferManifest(rawManifest);
  const keys = Object.keys(transferTables);
  const select = (key, where) =>
    `${key} as (select ${transferTables[key].columns.map((column) => `r.${column}`).join(",")} from public.${transferTables[key].table} r where r.owner_id=(select source_owner from parameters) and ${where})`;
  const aggregates = keys
    .map(
      (key) =>
        `${literal(key)},coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from ${key} r),'[]'::jsonb)`,
    )
    .join(",\n");
  const counts = keys
    .map((key) => `${literal(key)},(select count(*) from ${key})`)
    .join(",");
  return `-- PERSONAL source only. READ ONLY: approved 10 company tasks and attached history.
-- No source rows or timer statuses are changed. Save the JSON privately.
with parameters as (select ${literal(manifest.source_owner)}::uuid source_owner,${literal(manifest.target_owner)}::uuid target_owner),
requested as (select unnest(array[${manifest.task_ids.map((id) => `${literal(id)}::uuid`).join(",")}]) id),
${select("tasks", "r.id in (select id from requested)")},
${select("task_notes", "r.task_id in (select id from tasks)")},
${select("note_versions", "r.note_id in (select id from task_notes)")},
${select("work_sessions", "r.task_id in (select id from tasks)")},
${select("session_intervals", "r.session_id in (select id from work_sessions)")},
${select("session_events", "r.session_id in (select id from work_sessions)")},
${select("work_journal", "r.session_id in (select id from work_sessions)")},
${select("parked_context", "r.session_id in (select id from work_sessions)")}
select jsonb_build_object(
 'format_version',1,'source_owner',(select source_owner from parameters),'target_owner',(select target_owner from parameters),
 'selected_task_ids',(select jsonb_agg(id order by id) from requested),'generated_at',clock_timestamp(),
 'counts',jsonb_build_object(${counts}),
 'checks',jsonb_build_object(
  'selected_task_count',(select count(*) from tasks),
  'all_projects_null',not exists(select 1 from tasks where project_id is not null),
  'no_test_tasks',not exists(select 1 from tasks where is_test is true),
  'external_converted_task_ids',(select count(*) from task_notes where converted_task_id is not null and converted_task_id not in(select id from tasks)),
  'external_previous_session_ids',(select count(*) from session_events where previous_session_id is not null and previous_session_id not in(select id from work_sessions))
 ),
 'tables',jsonb_build_object(${aggregates})
) as company_task_export;
`;
}

export function unwrapCompanyTaskExport(raw) {
  if (Array.isArray(raw) && raw.length === 1 && raw[0]?.company_task_export)
    return raw[0].company_task_export;
  if (raw?.company_task_export) return raw.company_task_export;
  return raw;
}

export function validateCompanyTaskExport(raw, rawManifest) {
  const manifest = validateTransferManifest(rawManifest);
  const payload = unwrapCompanyTaskExport(raw);
  if (
    payload &&
    Object.keys(payload).some(
      (key) =>
        ![
          "format_version",
          "source_owner",
          "target_owner",
          "selected_task_ids",
          "generated_at",
          "counts",
          "checks",
          "tables",
        ].includes(key),
    )
  )
    fail("Unexpected export metadata requires review");
  if (
    !payload ||
    payload.format_version !== 1 ||
    payload.source_owner !== manifest.source_owner ||
    payload.target_owner !== manifest.target_owner ||
    !sameSet(payload.selected_task_ids || [], manifest.task_ids)
  )
    fail("Export scope differs from the approved manifest");
  if (
    typeof payload.generated_at !== "string" ||
    !Number.isFinite(Date.parse(payload.generated_at))
  )
    fail("Export timestamp is missing");
  if (
    !payload.tables ||
    !sameSet(Object.keys(payload.tables), Object.keys(transferTables))
  )
    fail("Unexpected or missing export tables");
  if (Buffer.byteLength(JSON.stringify(payload)) > 10 * 1024 * 1024)
    fail("Export exceeds the manual transfer size limit");
  if (containsSecret(JSON.stringify(payload.tables)))
    fail("Export contains a possible credential; review it before transfer");
  const tables = structuredClone(payload.tables);
  const ids = {};
  for (const [key, definition] of Object.entries(transferTables)) {
    const rows = tables[key];
    if (
      !Array.isArray(rows) ||
      rows.length > 10000 ||
      payload.counts?.[key] !== rows.length
    )
      fail(`Invalid export count: ${key}`);
    ids[key] = new Set();
    for (const row of rows) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        !sameSet(Object.keys(row), definition.columns)
      )
        fail(`Unexpected columns in ${key}`);
      if (
        !uuid(row.id) ||
        ids[key].has(row.id) ||
        row.owner_id !== manifest.source_owner
      )
        fail(`Invalid owner or duplicate ID in ${key}`);
      ids[key].add(row.id);
      for (const column of definition.columns) {
        if (
          (column.endsWith("_at") ||
            column === "created_at" ||
            column === "updated_at") &&
          row[column] !== null &&
          (typeof row[column] !== "string" ||
            !Number.isFinite(Date.parse(row[column])))
        )
          fail(`Invalid timestamp in ${key}.${column}`);
      }
    }
  }
  if (!sameSet([...ids.tasks], manifest.task_ids))
    fail("Export must contain the exact 10 approved tasks");
  for (const task of tables.tasks) {
    if (task.project_id !== null)
      fail("Project-linked tasks require a separately reviewed transfer");
    if (task.is_test === true)
      fail("Approved real-task export unexpectedly contains a test task");
  }
  const requireLink = (rows, column, parent) => {
    for (const row of rows)
      if (!ids[parent].has(row[column]))
        fail(`Out-of-scope relationship: ${column}`);
  };
  requireLink(tables.task_notes, "task_id", "tasks");
  requireLink(tables.note_versions, "note_id", "task_notes");
  requireLink(tables.work_sessions, "task_id", "tasks");
  for (const key of [
    "session_intervals",
    "session_events",
    "work_journal",
    "parked_context",
  ])
    requireLink(tables[key], "session_id", "work_sessions");
  for (const note of tables.task_notes)
    if (
      note.converted_task_id !== null &&
      !ids.tasks.has(note.converted_task_id)
    )
      fail(
        "A note points to an unapproved converted task; no task was added automatically",
      );
  const parked = tables.work_sessions
    .filter((session) => session.status === "PARKED")
    .map((session) => session.id);
  if (!sameSet(parked, manifest.expected_parked_session_ids))
    fail("Parked sessions changed since the approved inventory");
  if (tables.work_sessions.some((session) => session.status === "ACTIVE"))
    fail("An active timer requires a fresh review; no timer was stopped");
  const allowedContext = [
    "last_stage",
    "last_note",
    "issues",
    "next_actions",
    "next_action",
    "last_file",
    "result_url",
    "tool",
    "paused_at",
    "reason",
  ];
  for (const context of tables.parked_context)
    if (
      !context.payload ||
      typeof context.payload !== "object" ||
      Array.isArray(context.payload) ||
      Object.keys(context.payload).some((key) => !allowedContext.includes(key))
    )
      fail("Unexpected parked-context fields require review");
  const clearedPreviousSessionLinks = [];
  for (const event of tables.session_events) {
    if (
      event.previous_session_id !== null &&
      !ids.work_sessions.has(event.previous_session_id)
    ) {
      if (!uuid(event.previous_session_id))
        fail("Invalid previous-session reference");
      clearedPreviousSessionLinks.push({
        event_id: event.id,
        previous_session_id: event.previous_session_id,
      });
      event.previous_session_id = null;
    }
  }
  for (const rows of Object.values(tables))
    for (const row of rows) row.owner_id = manifest.target_owner;
  return {
    tables,
    report: {
      counts: payload.counts,
      preserved_parked_sessions: parked.length,
      cleared_previous_session_links: clearedPreviousSessionLinks,
      source_deleted: false,
    },
  };
}

/** Only INSERT triggers on the imported tables are suspended, under a table
 * lock and within this transaction. FK constraints and forced RLS stay enabled.
 * Their exact O/A/R/D states are restored before commit. */
export function buildCompanyTaskImport(raw, rawManifest) {
  const manifest = validateTransferManifest(rawManifest);
  const normalized = validateCompanyTaskExport(raw, manifest);
  const keys = Object.keys(transferTables);
  const tableSql = keys
    .map((key) => `public.${transferTables[key].table}`)
    .join(",");
  const json = literal(JSON.stringify({ tables: normalized.tables }));
  const preflight = keys
    .map((key) => {
      const { table, columns } = transferTables[key];
      return `if to_regclass('public.${table}') is null then raise exception 'Missing company table: ${table}';end if;
 if exists(select 1 from unnest(array[${columns.map(literal).join(",")}]) c where not exists(select 1 from information_schema.columns where table_schema='public' and table_name='${table}' and column_name=c)) then raise exception 'Missing company columns: ${table}';end if;`;
    })
    .join("\n ");
  const collision = keys
    .map((key) => {
      const { table } = transferTables[key];
      return `if exists(select 1 from public.${table} t join jsonb_array_elements(p->'tables'->'${key}') r on t.id=(r->>'id')::uuid) then raise exception 'ID collision: ${table}; no rows imported';end if;`;
    })
    .join("\n ");
  const inserts = keys
    .map((key) => {
      const { table, columns } = transferTables[key];
      return `insert into public.${table}(${columns.join(",")}) select ${columns.join(",")} from jsonb_populate_recordset(null::public.${table},(select payload->'tables'->'${key}' from company_transfer_payload));`;
    })
    .join("\n");
  const verify = keys
    .map((key) => {
      const { table, columns } = transferTables[key];
      return `if exists(select 1 from jsonb_populate_recordset(null::public.${table},p->'tables'->'${key}') e left join public.${table} a on a.id=e.id where a.id is null or row(${columns.map((column) => `a.${column}`).join(",")}) is distinct from row(${columns.map((column) => `e.${column}`).join(",")})) then raise exception 'History verification failed: ${table}';end if;
 if (select count(*) from public.${table}) <> (select original_count from company_transfer_counts where table_name='${table}')+jsonb_array_length(p->'tables'->'${key}') then raise exception 'Unexpected side-effect rows: ${table}';end if;`;
    })
    .join("\n ");
  const countUnion = keys
    .map(
      (key) =>
        `select '${transferTables[key].table}'::text table_name,count(*)::bigint original_count from public.${transferTables[key].table}`,
    )
    .join(" union all ");
  return `-- FRENGLE target ONLY. COPY approved company tasks/history; never delete the source.
-- One transaction: all 10 IDs must be new. No RLS, grants or RPCs are changed.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
set local standard_conforming_strings=on;
do $preflight$ begin
 if to_regclass('public.ops_company_members') is null then raise exception 'Company membership schema required';end if;
 if not exists(select 1 from auth.users where id=${literal(manifest.target_owner)}::uuid) or not exists(select 1 from public.ops_company_members where user_id=${literal(manifest.target_owner)}::uuid) then raise exception 'Target company member is missing';end if;
 ${preflight}
end $preflight$;
lock table ${tableSql} in share row exclusive mode;
lock table public.ops_company_members in share mode;
create temporary table company_transfer_payload(payload jsonb not null) on commit drop;
insert into company_transfer_payload values(${json}::jsonb);
create temporary table company_transfer_counts on commit drop as ${countUnion};
do $collision$ declare p jsonb;begin
 select payload into p from company_transfer_payload;
 if not exists(select 1 from public.ops_company_members where user_id=${literal(manifest.target_owner)}::uuid) then raise exception 'Target company member is missing';end if;
 ${collision}
 if exists(select 1 from public.ops_session_events t join jsonb_array_elements(p->'tables'->'session_events') r on t.owner_id=${literal(manifest.target_owner)}::uuid and t.request_id=(r->>'request_id')::uuid) then raise exception 'Timer request ID collision; no rows imported';end if;
end $collision$;
create temporary table company_transfer_triggers on commit drop as
 select n.nspname schema_name,c.relname table_name,t.tgname trigger_name,t.tgenabled::text enabled_state
 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in(${keys.map((key) => literal(transferTables[key].table)).join(",")}) and not t.tgisinternal and (t.tgtype::integer & 4)<>0;
do $suspend$ declare r record;begin
 for r in select * from company_transfer_triggers where enabled_state<>'D' loop
  execute format('alter table %I.%I disable trigger %I',r.schema_name,r.table_name,r.trigger_name);
 end loop;
end $suspend$;
${inserts}
do $verify$ declare p jsonb;begin
 select payload into p from company_transfer_payload;
 ${verify}
end $verify$;
do $restore$ declare r record;action text;begin
 for r in select * from company_transfer_triggers loop
  action:=case r.enabled_state when 'O' then 'enable' when 'A' then 'enable always' when 'R' then 'enable replica' when 'D' then 'disable' else null end;
  if action is null then raise exception 'Unknown trigger state';end if;
  execute format('alter table %I.%I %s trigger %I',r.schema_name,r.table_name,action,r.trigger_name);
 end loop;
 if exists(select 1 from company_transfer_triggers saved join pg_catalog.pg_namespace n on n.nspname=saved.schema_name join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=saved.table_name join pg_catalog.pg_trigger t on t.tgrelid=c.oid and t.tgname=saved.trigger_name where t.tgenabled::text<>saved.enabled_state) then raise exception 'Trigger restoration failed';end if;
end $restore$;
commit;
select ${literal(JSON.stringify({ imported: true, ...normalized.report }))}::jsonb as company_task_transfer_report;
`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

export function transferFingerprints(raw, manifest) {
  const source = unwrapCompanyTaskExport(raw);
  const normalized = validateCompanyTaskExport(source, manifest);
  const hash = (tables) =>
    createHash("sha256")
      .update(
        JSON.stringify(
          canonical(
            Object.fromEntries(
              Object.entries(tables).map(([key, rows]) => [
                key,
                [...rows].sort((a, b) => a.id.localeCompare(b.id)),
              ]),
            ),
          ),
        ),
      )
      .digest("hex");
  return {
    source_fingerprint: hash(source.tables),
    target_fingerprint: hash(normalized.tables),
  };
}

function scopedVerification(owner, taskIds) {
  const definitions = {
    tasks: `r.id in (${taskIds.map((id) => `${literal(id)}::uuid`).join(",")})`,
    task_notes: "r.task_id in (select id from actual_tasks)",
    note_versions: "r.note_id in (select id from actual_task_notes)",
    work_sessions: "r.task_id in (select id from actual_tasks)",
    session_intervals: "r.session_id in (select id from actual_work_sessions)",
    session_events: "r.session_id in (select id from actual_work_sessions)",
    work_journal: "r.session_id in (select id from actual_work_sessions)",
    parked_context: "r.session_id in (select id from actual_work_sessions)",
  };
  const ctes = Object.entries(transferTables)
    .map(
      ([key, { table, columns }]) =>
        `actual_${key} as (select ${columns.map((column) => `r.${column}`).join(",")} from public.${table} r where r.owner_id=${literal(owner)}::uuid and ${definitions[key]})`,
    )
    .join(",\n");
  const matches = Object.entries(transferTables).map(
    ([key, { table, columns }]) =>
      `not exists(select 1 from jsonb_populate_recordset(null::public.${table},(select payload->'tables'->'${key}' from company_transfer_expected)) e full join actual_${key} a on a.id=e.id where a.id is null or e.id is null or row(${columns.map((column) => `a.${column}`).join(",")}) is distinct from row(${columns.map((column) => `e.${column}`).join(",")}))`,
  );
  return {
    ctes,
    matches: matches.join(" and\n"),
    counts: Object.keys(transferTables)
      .map((key) => `${literal(key)},(select count(*) from actual_${key})`)
      .join(","),
  };
}

/** Read-only target comparison attests to exact typed row equality, including
 * all children, before it returns the fingerprints bound to this export. */
export function buildCompanyTaskVerification(raw, rawManifest) {
  const manifest = validateTransferManifest(rawManifest);
  const normalized = validateCompanyTaskExport(raw, manifest);
  const fingerprints = transferFingerprints(raw, manifest);
  const scope = scopedVerification(manifest.target_owner, manifest.task_ids);
  return `-- FRENGLE target. READ ONLY: verify full approved task/history closure.
with company_transfer_expected as (select ${literal(JSON.stringify({ tables: normalized.tables }))}::jsonb payload),
${scope.ctes},
verification as (select (${scope.matches}) and exists(select 1 from public.ops_company_members where user_id=${literal(manifest.target_owner)}::uuid) as matched)
select jsonb_build_object(
 'format_version',1,'verified',(select matched from verification),'source_owner',${literal(manifest.source_owner)},'target_owner',${literal(manifest.target_owner)},
 'task_ids',${literal(JSON.stringify([...manifest.task_ids].sort()))}::jsonb,
 'source_fingerprint',${literal(fingerprints.source_fingerprint)},'target_fingerprint',${literal(fingerprints.target_fingerprint)},
 'counts',jsonb_build_object(${scope.counts}),'verified_at',clock_timestamp()
) as company_task_transfer_verification;
`;
}

export function validateTransferReceipt(rawReceipt, raw, rawManifest) {
  const manifest = validateTransferManifest(rawManifest);
  const normalized = validateCompanyTaskExport(raw, manifest);
  const fingerprints = transferFingerprints(raw, manifest);
  const receipt =
    Array.isArray(rawReceipt) && rawReceipt.length === 1
      ? rawReceipt[0].company_task_transfer_verification
      : rawReceipt?.company_task_transfer_verification || rawReceipt;
  if (
    !receipt ||
    receipt.format_version !== 1 ||
    receipt.verified !== true ||
    receipt.source_owner !== manifest.source_owner ||
    receipt.target_owner !== manifest.target_owner ||
    !sameSet(receipt.task_ids || [], manifest.task_ids) ||
    receipt.source_fingerprint !== fingerprints.source_fingerprint ||
    receipt.target_fingerprint !== fingerprints.target_fingerprint ||
    JSON.stringify(canonical(receipt.counts)) !==
      JSON.stringify(canonical(normalized.report.counts))
  )
    fail("A matching successful target verification receipt is required");
  const verifiedAt = Date.parse(receipt.verified_at);
  if (
    !Number.isFinite(verifiedAt) ||
    Date.now() - verifiedAt > 30 * 60000 ||
    verifiedAt - Date.now() > 60000
  )
    fail("Target verification must be renewed within 30 minutes");
  return receipt;
}

/** Prepare only after target verification and a separate final user approval.
 * No connection is made here; the caller must explicitly run the SQL in PERSONAL.
 * Every source row and newly attached child is rechecked before any deletion. */
export function buildCompanyTaskFinalize(raw, rawManifest, rawReceipt) {
  const manifest = validateTransferManifest(rawManifest);
  const receipt = validateTransferReceipt(rawReceipt, raw, manifest);
  const source = unwrapCompanyTaskExport(raw);
  if (source.tables.session_intervals.some((row) => row.ends_at === null))
    fail("An open interval prevents source finalization");
  const scope = scopedVerification(manifest.source_owner, manifest.task_ids);
  const keys = Object.keys(transferTables);
  const tablesSql = keys
    .map((key) => `public.${transferTables[key].table}`)
    .join(",");
  const deleteIds = keys
    .map(
      (key) =>
        `select '${transferTables[key].table}'::text table_name,(r->>'id')::uuid id from jsonb_array_elements((select payload->'tables'->'${key}' from company_transfer_expected)) r`,
    )
    .join(" union all ");
  const deletionOrder = [
    "session_events",
    "session_intervals",
    "work_journal",
    "parked_context",
    "note_versions",
    "task_notes",
    "work_sessions",
    "tasks",
  ];
  const deletes = deletionOrder
    .map((key) => {
      const { table } = transferTables[key];
      return `delete from public.${table} where owner_id=${literal(manifest.source_owner)}::uuid and id in(select id from company_transfer_delete_ids where table_name='${table}');
 get diagnostics affected=row_count;
 if affected<>${source.counts[key]} then raise exception 'Source row count changed: ${table}';end if;`;
    })
    .join("\n ");
  return `-- PERSONAL source FINALIZATION ONLY. Do not execute without final user approval.
-- Target verified within 30 minutes. No outside references are cleared or cascaded.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
set local standard_conforming_strings=on;
select pg_advisory_xact_lock(hashtextextended(${literal(manifest.source_owner)},0));
lock table ${tablesSql} in share row exclusive mode;
create temporary table company_transfer_expected(payload jsonb not null) on commit drop;
insert into company_transfer_expected values(${literal(JSON.stringify({ tables: source.tables }))}::jsonb);
create temporary table company_transfer_delete_ids on commit drop as ${deleteIds};
do $guard$ begin
 if not exists(select 1 from auth.users where id=${literal(manifest.source_owner)}::uuid) then raise exception 'Source owner missing';end if;
 if to_regclass('public.ops_personal_sheet_sources') is null then raise exception 'PERSONAL source schema required';end if;
 if clock_timestamp() not between ${literal(receipt.verified_at)}::timestamptz-interval '1 minute' and ${literal(receipt.verified_at)}::timestamptz+interval '30 minutes' then raise exception 'Renew target verification before source finalization';end if;
 if exists(select 1 from public.ops_work_sessions where owner_id=${literal(manifest.source_owner)}::uuid and task_id in(${manifest.task_ids.map((value) => `${literal(value)}::uuid`).join(",")}) and status='ACTIVE') or exists(select 1 from public.ops_session_intervals where owner_id=${literal(manifest.source_owner)}::uuid and session_id in(select id from company_transfer_delete_ids where table_name='ops_work_sessions') and ends_at is null) then raise exception 'Active timer/open interval prevents source finalization';end if;
 if exists(select 1 from pg_catalog.pg_trigger where tgrelid in(${keys.map((key) => `'public.${transferTables[key].table}'::regclass`).join(",")}) and not tgisinternal and (tgtype::integer & 8)<>0 and tgenabled<>'D') then raise exception 'Unexpected DELETE trigger requires review';end if;
end $guard$;
-- Discover and lock every referencing table before checking external rows.
-- FK constraints (including unknown future CASCADE relationships) stay enabled.
do $foreign_keys$ declare fk record;join_sql text;outside_sql text;blocked boolean;begin
 for fk in
  select con.oid,con.conrelid,con.confrelid,con.conkey,con.confkey,cn.nspname child_schema,cc.relname child_table,pn.nspname parent_schema,pc.relname parent_table
  from pg_catalog.pg_constraint con join pg_catalog.pg_class cc on cc.oid=con.conrelid join pg_catalog.pg_namespace cn on cn.oid=cc.relnamespace
  join pg_catalog.pg_class pc on pc.oid=con.confrelid join pg_catalog.pg_namespace pn on pn.oid=pc.relnamespace
  where con.contype='f' and con.confrelid in(${keys.map((key) => `'public.${transferTables[key].table}'::regclass`).join(",")}) order by con.conrelid,con.oid
 loop
  execute format('lock table %I.%I in share row exclusive mode',fk.child_schema,fk.child_table);
  select string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ' order by s.i) into join_sql
   from generate_subscripts(fk.conkey,1) s(i) join pg_catalog.pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=fk.conkey[s.i]
   join pg_catalog.pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=fk.confkey[s.i];
  outside_sql:='';
  if fk.child_schema='public' and fk.child_table in(${keys.map((key) => literal(transferTables[key].table)).join(",")}) then
   outside_sql:=format(' and not exists(select 1 from company_transfer_delete_ids own where own.table_name=%L and own.id=child.id)',fk.child_table);
  end if;
  execute format('select exists(select 1 from %I.%I child join %I.%I parent on %s join company_transfer_delete_ids chosen on chosen.table_name=%L and chosen.id=parent.id where true %s)',fk.child_schema,fk.child_table,fk.parent_schema,fk.parent_table,join_sql,fk.parent_table,outside_sql) into blocked;
  if blocked then raise exception 'External FK reference requires review: %.%',fk.child_schema,fk.child_table;end if;
 end loop;
end $foreign_keys$;
create temporary table company_transfer_source_matches on commit drop as
with ${scope.ctes} select (${scope.matches}) as matched;
do $delete$ declare affected bigint;begin
 if not (select matched from company_transfer_source_matches) then raise exception 'Source fingerprint/child closure changed; export and verify again';end if;
 ${deletes}
end $delete$;
commit;
select jsonb_build_object('source_finalized',true,'removed_tasks',10,'verified_source_fingerprint',${literal(receipt.source_fingerprint)},'target_owner',${literal(manifest.target_owner)}) as company_task_source_finalization;
`;
}

async function main() {
  const action = process.argv[2];
  const manifest = JSON.parse(
    await readFile("work/company-task-transfer-manifest.private.json", "utf8"),
  );
  await mkdir("work", { recursive: true });
  if (action === "export") {
    await writeFile(
      "work/export-company-tasks.sql",
      buildCompanyTaskExport(manifest),
      { mode: 0o600 },
    );
    console.log("Prepared read-only export SQL for 10 approved tasks.");
  } else if (action === "import") {
    const raw = JSON.parse(
      await readFile("outputs/company-task-transfer.private.json", "utf8"),
    );
    const normalized = validateCompanyTaskExport(raw, manifest);
    await writeFile(
      "work/import-company-tasks.private.sql",
      buildCompanyTaskImport(raw, manifest),
      { mode: 0o600 },
    );
    await writeFile(
      "work/verify-company-task-transfer.private.sql",
      buildCompanyTaskVerification(raw, manifest),
      { mode: 0o600 },
    );
    await writeFile(
      "outputs/company-task-transfer-report.private.json",
      JSON.stringify(normalized.report, null, 2),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        prepared: true,
        counts: normalized.report.counts,
        parked_sessions: normalized.report.preserved_parked_sessions,
        cleared_previous_session_links:
          normalized.report.cleared_previous_session_links.length,
        source_deleted: false,
      }),
    );
  } else if (action === "finalize") {
    const raw = JSON.parse(
      await readFile("outputs/company-task-transfer.private.json", "utf8"),
    );
    const receipt = JSON.parse(
      await readFile(
        "outputs/company-task-transfer-verified.private.json",
        "utf8",
      ),
    );
    await writeFile(
      "work/finalize-company-task-transfer.private.sql",
      buildCompanyTaskFinalize(raw, manifest, receipt),
      { mode: 0o600 },
    );
    console.log(
      "Prepared source finalization SQL only. Separate final user approval is required before execution.",
    );
  } else
    fail(
      "Use export, import or finalize. This command does not connect to a database.",
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
