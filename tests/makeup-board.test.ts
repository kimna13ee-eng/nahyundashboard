import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const id = "33333333-3333-4333-8333-333333333333";
const origin = "https://planner.example";
const fakeSession =
  "data:text/javascript," +
  encodeURIComponent(
    [
      "export class WorkspaceAccessError extends Error {status=401;}",
      "export async function workspaceSession(params) {",
      "if(params.toString()!=='workspace=PERSONAL')throw new Error('unexpected workspace');",
      "if(globalThis.__tipTestClient)return {client:globalThis.__tipTestClient,user:{id:'owner'}};",
      "throw new WorkspaceAccessError('로그인이 필요해요');}",
    ].join("\n"),
  );
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/workspaces/server")
      return { url: fakeSession, shortCircuit: true };
    if (specifier.startsWith("@/"))
      return next(
        pathToFileURL(resolve("src", specifier.slice(2) + ".ts")).href,
        context,
      );
    return next(
      specifier === "next/server" ? "next/server.js" : specifier,
      context,
    );
  },
});
after(() => hooks.deregister());
const api = await import("../src/app/api/makeup-looks/route.ts");
const images = await import("../src/app/api/makeup-looks/[id]/image/route.ts");
const tips = await import("../src/app/api/makeup-tips/route.ts");
const tipImages = await import(
  "../src/app/api/makeup-tips/[id]/image/route.ts"
);
const { readUpload, MakeupInputError } = await import(
  "../src/lib/makeup-looks-server.ts"
);

test("photo bytes and listings require the personal session; foreign mutations fail before parsing", async () => {
  const req = (path: string, method = "GET", sender = origin) =>
    new NextRequest(origin + path, {
      method,
      headers: { host: "planner.example", origin: sender },
    });
  const path = "/api/makeup-looks";
  assert.equal((await api.GET(req(path + "?week=2026-11-16"))).status, 401);
  assert.equal(
    (
      await images.GET(req(path + "/" + id + "/image?size=thumb"), {
        params: Promise.resolve({ id }),
      })
    ).status,
    401,
  );
  for (const fn of ["POST", "PATCH", "DELETE"] as const) {
    assert.equal(
      (await api[fn](req(path, fn, "https://other.example"))).status,
      403,
    );
    assert.equal((await api[fn](req(path, fn))).status, 401);
  }
  assert.equal(
    (await api.GET(req(path + "?week=2026-11-16&workspace=FRENGLE"))).status,
    403,
  );
  assert.equal((await api.GET(req(path + "?week=2026-11-18"))).status, 400);
  assert.equal(
    (await api.GET(req(path + "?week=2026-11-16&category=unknown"))).status,
    400,
  );
});

test("tip notes and private images are owner-only; invalid and cross-origin changes never write", async () => {
  const path = origin + "/api/makeup-tips";
  const req = (method: string, form?: FormData, sender = origin) =>
    new NextRequest(path, {
      method,
      headers: { host: "planner.example", origin: sender },
      body: form,
    });
  assert.equal((await tips.GET(req("GET"))).status, 401);
  assert.equal(
    (
      await tipImages.GET(
        new NextRequest(path + "/" + id + "/image?size=thumb&v=1"),
        { params: Promise.resolve({ id }) },
      )
    ).status,
    401,
  );
  for (const method of ["POST", "PATCH", "DELETE"] as const) {
    assert.equal((await tips[method](req(method))).status, 401);
    assert.equal(
      (await tips[method](req(method, undefined, "https://other.example")))
        .status,
      403,
    );
  }
  const session = globalThis as typeof globalThis & {
    __tipTestClient?: object;
  };
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  session.__tipTestClient = {
    rpc(name: string, args: Record<string, unknown>) {
      writes.push({ name, args });
      return {
        single: async () => ({
          data: {
            id,
            content: args.p_content,
            has_photo: args.p_image != null,
          },
          error: null,
        }),
      };
    },
  };
  try {
    const form = new FormData();
    form.set("id", id);
    form.set("content", "  부드러운 경계  ");
    const response = await tips.POST(req("POST", form));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      item: { id, content: "부드러운 경계", has_photo: false },
    });
    assert.deepEqual(writes, [
      {
        name: "ops_create_makeup_tip",
        args: {
          p_id: id,
          p_content: "부드러운 경계",
          p_image: null,
          p_thumbnail: null,
        },
      },
    ]);
    form.set("content", "");
    assert.equal((await tips.POST(req("POST", form))).status, 400);
    form.set("image", new Blob(["not a photo"]), "screenshot.jpg");
    assert.equal((await tips.POST(req("POST", form))).status, 415);
    form.delete("image");
    form.set("content", "x".repeat(1501));
    assert.equal((await tips.POST(req("POST", form))).status, 400);
    form.set("content", "새 메모");
    form.set("expectedUpdatedAt", "invalid");
    assert.equal((await tips.POST(req("POST", form))).status, 400);
    form.set("removeImage", "true");
    form.set("content", "");
    assert.equal((await tips.PATCH(req("PATCH", form))).status, 400);
    assert.equal(writes.length, 1);
  } finally {
    delete session.__tipTestClient;
  }
});

test("multipart saves raster bytes and validates the actual file, limits and exact week", async () => {
  const payload = (image: Blob, week = "2026-11-16", category?: string) => {
    const f = new FormData();
    f.set("image", image, "photo.jpg");
    f.set("title", "  로즈  ");
    f.set("id", id);
    f.set("week", week);
    if (category !== undefined) f.set("category", category);
    return new Request(origin, { method: "POST", body: f });
  };
  const picture = new Blob(
    [new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1])],
    { type: "image/jpeg" },
  );
  const result = await readUpload(payload(picture));
  assert.equal(result.p_title, "로즈");
  assert.equal(result.p_image, "\\xffd8ffe000104a4649460001");
  assert.equal(result.p_thumbnail, null);
  assert.equal(result.p_category, null);
  assert.equal(
    (await readUpload(payload(picture, "2026-11-16", "male"))).p_category,
    "male",
  );
  await assert.rejects(
    readUpload(payload(picture, "2026-11-16", "unclassified")),
    /분류/,
  );
  await assert.rejects(
    readUpload(payload(new Blob(["<svg></svg>"], { type: "image/jpeg" }))),
    (e: unknown) => e instanceof MakeupInputError && e.status === 415,
  );
  await assert.rejects(
    readUpload(payload(new Blob([new Uint8Array(1024 * 1024 + 1)]))),
    (e: unknown) => e instanceof MakeupInputError && e.status === 413,
  );
  await assert.rejects(readUpload(payload(picture, "2026-11-17")), /선택한 주/);
});
