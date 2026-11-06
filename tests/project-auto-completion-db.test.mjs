import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

for (const workspace of ["PERSONAL", "FRENGLE"]) {
  test(`${workspace} projects finish after the final step and reopen only automatic completions`, async () => {
    const db = new PGlite({ extensions: { btree_gist } });
    await db.waitReady;
    const owner = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const outsider = "33333333-3333-4333-8333-333333333333";
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    const all = async (sql, args = []) => (await db.query(sql, args)).rows;
    const become = async (id) =>
      db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    const save = async (id, steps, status = "planning") =>
      (
        await one(
          "select ops_project_save($1,'프로젝트','설명',$2,'content',$3,null) id",
          [id, status, JSON.stringify(steps)],
        )
      ).id;
    const state = async (id) =>
      one(
        "select status,process_auto_completed from ops_projects where id=$1",
        [id],
      );
    const steps = [
      { id: "first", title: "기획", done: true },
      { id: "last", title: "발행", done: false },
    ];
    const completed = steps.map((step) => ({ ...step, done: true }));
    const setStep = (project, step, status) =>
      db.query(
        "update tasks set status=$3 where project_id=$1 and project_step_id=$2",
        [project, step, status],
      );
    try {
      await db.exec(`create schema auth;create schema extensions;create role anon;create role authenticated;
        create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}'),('${outsider}');
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        grant usage on schema auth,public to authenticated,anon;`);
      const files =
        workspace === "PERSONAL"
          ? [
              "001_tasks.sql",
              "002_mvp.sql",
              "003_phase2.sql",
              "004_calendar_recurrence.sql",
              "005_task_classification.sql",
              "006_personal_content.sql",
              "007_workflow.sql",
              "008_content_history.sql",
              "009_prompt_metadata.sql",
              "010_stabilization.sql",
              "014_task_process.sql",
              "017_task_completion.sql",
              "020_project_process.sql",
            ]
          : [
              "001_automation_results.sql",
              "002_work_check_results.sql",
              "003_core_workspace.sql",
              "004_project_process.sql",
            ];
      for (const file of files)
        await db.exec(
          await readFile(`supabase/${workspace.toLowerCase()}/${file}`, "utf8"),
        );
      if (workspace === "FRENGLE")
        await db.query(
          "insert into ops_company_members(user_id) values($1),($2)",
          [owner, other],
        );
      await become(owner);
      const existing = await save(null, completed);
      const manual = await save(null, steps, "completed");
      const empty = await save(null, []);
      const legacy = await save(null, []);
      await db.query(
        "insert into tasks(title,project_id,status) values('독립 업무',$1,'completed')",
        [legacy],
      );
      const taskHistory = await all("select * from tasks order by id");
      await become(other);
      const otherExisting = await save(null, completed);
      const legacyActive = await save(null, completed);
      const legacyTimedTask = (
        await one("select id from tasks where project_id=$1 limit 1", [
          legacyActive,
        ])
      ).id;
      // Model an old inconsistent timer that predates the managed-step guard.
      await db.exec(
        "reset role;alter table ops_work_sessions disable trigger project_session_guard",
      );
      const legacyActiveSession = (
        await one(
          "insert into ops_work_sessions(owner_id,task_id,status) values($1,$2,'ACTIVE') returning id",
          [other, legacyTimedTask],
        )
      ).id;
      await db.exec(
        "alter table ops_work_sessions enable trigger project_session_guard",
      );
      const migration = await readFile(
        `supabase/${workspace.toLowerCase()}/${workspace === "PERSONAL" ? "023" : "006"}_project_auto_completion.sql`,
        "utf8",
      );
      await db.exec("reset role;set request.jwt.claim.sub=''");
      await db.exec(migration);
      await become(owner);
      assert.deepEqual(await state(existing), {
        status: "completed",
        process_auto_completed: true,
      });
      assert.deepEqual(await state(manual), {
        status: "completed",
        process_auto_completed: false,
      });
      assert.deepEqual(await state(empty), {
        status: "planning",
        process_auto_completed: false,
      });
      assert.deepEqual(await state(legacy), {
        status: "planning",
        process_auto_completed: false,
      });
      assert.deepEqual(
        await all("select * from tasks order by id"),
        taskHistory,
      );

      // The first completed insert cannot finish a project before its later
      // pending inserts have been saved within the same atomic RPC.
      const mixed = await save(null, steps);
      assert.deepEqual(await state(mixed), {
        status: "planning",
        process_auto_completed: false,
      });
      await setStep(mixed, "last", "completed");
      assert.deepEqual(await state(mixed), {
        status: "completed",
        process_auto_completed: true,
      });
      const timestamps = await all(
        "select id,completed_at from tasks where project_id=$1 order by id",
        [mixed],
      );
      await db.query("update ops_projects set title='메타 수정' where id=$1", [
        mixed,
      ]);
      assert.deepEqual(
        await all(
          "select id,completed_at from tasks where project_id=$1 order by id",
          [mixed],
        ),
        timestamps,
      );

      await setStep(mixed, "last", "pending");
      assert.deepEqual(await state(mixed), {
        status: "active",
        process_auto_completed: false,
      });
      await save(mixed, completed, "active");
      assert.deepEqual(await state(mixed), {
        status: "completed",
        process_auto_completed: true,
      });
      await db.query("update ops_projects set status='active' where id=$1", [
        mixed,
      ]);
      assert.deepEqual(await state(mixed), {
        status: "completed",
        process_auto_completed: true,
      });

      // A new unfinished step or restoring an archived unfinished step reopens
      // automatic completion, even if the submitted editor status is completed.
      const more = [
        ...completed,
        { id: "extra", title: "추가 검토", done: false },
      ];
      await save(mixed, more, "completed");
      assert.deepEqual(await state(mixed), {
        status: "active",
        process_auto_completed: false,
      });
      await save(mixed, completed, "active");
      assert.deepEqual(await state(mixed), {
        status: "completed",
        process_auto_completed: true,
      });
      await save(mixed, more, "completed");
      assert.deepEqual(await state(mixed), {
        status: "active",
        process_auto_completed: false,
      });
      await save(mixed, completed, "active");
      await save(mixed, [], "completed");
      assert.deepEqual(await state(mixed), {
        status: "active",
        process_auto_completed: false,
      });
      assert.equal(
        (
          await one("select count(*)::int n from tasks where project_id=$1", [
            mixed,
          ])
        ).n,
        3,
      );

      // Manually completed partial projects remain completed across task edits.
      await db.query(
        "update tasks set title='수정된 기획' where project_id=$1 and project_step_id='first'",
        [manual],
      );
      await setStep(manual, "first", "pending");
      assert.deepEqual(await state(manual), {
        status: "completed",
        process_auto_completed: false,
      });
      const allDoneAtCreation = await save(null, completed);
      assert.deepEqual(await state(allDoneAtCreation), {
        status: "completed",
        process_auto_completed: true,
      });

      // Existing timer guards remain authoritative. Finishing the timer and
      // then completing its last task safely completes the project.
      const timedProject = await save(
        null,
        [{ id: "timed", title: "작업", done: false }],
        "active",
      );
      const timedTask = (
        await one("select id from tasks where project_id=$1", [timedProject])
      ).id;
      const session = (
        await one("select ops_timer_guarded('start',$1,$2,null,'','{}') id", [
          timedTask,
          randomUUID(),
        ])
      ).id;
      await assert.rejects(
        setStep(timedProject, "timed", "completed"),
        /active timer/,
      );
      assert.deepEqual(await state(timedProject), {
        status: "active",
        process_auto_completed: false,
      });
      await one(
        "select ops_timer_guarded('finish',$1,$2,$3,'완료 기록','{}')",
        [timedTask, randomUUID(), session],
      );
      await setStep(timedProject, "timed", "completed");
      assert.deepEqual(await state(timedProject), {
        status: "completed",
        process_auto_completed: true,
      });
      assert.equal(
        (
          await one("select status from ops_work_sessions where id=$1", [
            session,
          ])
        ).status,
        "ENDED",
      );
      assert.equal(
        (
          await one(
            "select count(*)::int n from ops_session_events where session_id=$1",
            [session],
          )
        ).n,
        2,
      );

      // Deferred evaluation sees the final state of explicit transactions too.
      const transactionProject = await save(null, steps);
      await db.exec("begin");
      await setStep(transactionProject, "last", "completed");
      await db.query(
        "insert into tasks(title,project_id,project_step_id,project_step_order) values('나중 단계',$1,'later',2)",
        [transactionProject],
      );
      await db.exec("commit");
      assert.deepEqual(await state(transactionProject), {
        status: "planning",
        process_auto_completed: false,
      });

      await become(other);
      assert.deepEqual(await state(otherExisting), {
        status: "completed",
        process_auto_completed: true,
      });
      assert.deepEqual(await state(legacyActive), {
        status: "planning",
        process_auto_completed: false,
      });
      await assert.rejects(
        db.query("update ops_projects set title='아직 진행 중' where id=$1", [
          legacyActive,
        ]),
        /active timer/,
      );
      await db.query(
        "update ops_work_sessions set status='ENDED',ended_at=clock_timestamp() where id=$1",
        [legacyActiveSession],
      );
      await db.query(
        "update ops_projects set title='타이머 종료 후' where id=$1",
        [legacyActive],
      );
      assert.deepEqual(await state(legacyActive), {
        status: "completed",
        process_auto_completed: true,
      });
      assert.equal(await state(existing), undefined);
      await setStep(existing, "last", "pending");
      await become(owner);
      assert.deepEqual(await state(existing), {
        status: "completed",
        process_auto_completed: true,
      });
      if (workspace === "FRENGLE") {
        await become(outsider);
        await assert.rejects(save(null, completed), /Company membership/);
      }
      await db.exec("reset role;set role anon");
      await assert.rejects(save(null, completed), /permission denied/);
      await db.exec("reset role;set request.jwt.claim.sub=''");
      const beforeReapply = await all("select * from ops_projects order by id");
      await db.exec(migration);
      assert.deepEqual(
        await all("select * from ops_projects order by id"),
        beforeReapply,
      );
      assert.equal(
        (
          await one(
            "select prosecdef from pg_proc where proname='ops_project_auto_completion'",
          )
        ).prosecdef,
        false,
      );
      const trigger = await one(
        "select tgdeferrable,tginitdeferred from pg_trigger where tgname='project_auto_completion'",
      );
      assert.deepEqual(trigger, { tgdeferrable: true, tginitdeferred: true });
      const locks = await all(
        "select c.relname,t.tgtype::int flags from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname='project_owner_lock' order by c.relname",
      );
      assert.deepEqual(locks, [
        { relname: "ops_projects", flags: 30 },
        { relname: "ops_session_intervals", flags: 30 },
        { relname: "ops_work_sessions", flags: 30 },
        { relname: "tasks", flags: 30 },
      ]);
    } finally {
      await db.close();
    }
  });
}
