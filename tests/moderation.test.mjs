import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextResponse } from "next/server.js";
import {
  parseSafetyTarget,
  safetyContentPath,
  isDirectConversation,
} from "../src/lib/moderation-policy.ts";
const require = createRequire(import.meta.url);

function harness() {
  const records = new Map();
  let nextId = 0;
  const copy = (value) =>
    value === undefined ? undefined : structuredClone(value);
  const snap = (ref) => ({
    ref,
    id: ref.id,
    exists: records.has(ref.path),
    data: () => copy(records.get(ref.path)),
  });
  const ref = (pathname) => ({
    path: pathname,
    id: pathname.split("/").at(-1),
    collection: (name) => col(`${pathname}/${name}`),
    get: async () => snap(ref(pathname)),
    set: async (data, options) =>
      records.set(
        pathname,
        options?.merge
          ? { ...records.get(pathname), ...copy(data) }
          : copy(data),
      ),
    create: async (data) => {
      assert.ok(!records.has(pathname));
      records.set(pathname, copy(data));
    },
    delete: async () => records.delete(pathname),
  });
  const col = (pathname) => ({
    doc: (id) => ref(`${pathname}/${id || `new${++nextId}`}`),
  });
  const db = {
    collection: col,
    doc: ref,
    runTransaction: async (fn) =>
      fn({
        get: (r) => r.get(),
        create: (r, d) => r.create(d),
        set: (r, d) => r.set(d),
        delete: (r) => r.delete(),
        update: (r, d) => r.set(d, { merge: true }),
      }),
  };
  const state = {
    auth: { uid: "viewer", role: "adult_player" },
    allowed: true,
    notifications: [],
  };
  records.set("teams/t", { ownerUserId: "owner" });
  records.set("teams/t/feedPosts/p", {
    authorId: "author",
    author: { name: "Original Author" },
    content: "Original content",
  });
  records.set("teams/t/groupChats/c", {
    memberIds: ["viewer", "author"],
    name: "Test channel",
  });
  records.set("teams/t/groupChats/c/messages/m", {
    authorId: "author",
    content: "Message evidence",
  });
  for (const uid of ["viewer", "author", "third"]) records.set(`teams/t/members/${uid}`, {userId:uid,status:"active"});
  const member = { data: { userId: "author", name: "Author" } };
  const overrides = {
    "@/lib/firebase-admin": { adminDb: db },
    "@/lib/api-auth": { verifyFirebaseToken: async () => state.auth },
    "@/lib/server-team-access": {
      findActiveTeamMember: async (_team, uid) =>
        state.allowed ? { data: { userId: uid, name: uid } } : null,
      isParentMember: () => false,
      getTeamAuthority: async () =>
        state.allowed
          ? {
              teamRef: col("teams").doc("t"),
              teamData: {},
              member,
              isOwner: false,
              isStaff: false,
              isSuperAdmin: false,
            }
          : null,
    },
    "@/lib/server-request-guards": {
      enforceUserRateLimit: async () => null,
      readJsonBodyWithLimit: async (req) => req.json(),
      RequestBodyError: class extends Error {},
    },
    "@/lib/server-notification-delivery": {
      sendNotificationToUsers: async (input) => {
        state.notifications.push(input);
        return {};
      },
    },
  };
  const cache = {};
  function load(filename) {
    if (cache[filename]) return cache[filename];
    const loaded = { exports: {} };
    cache[filename] = loaded.exports;
    const source = fs.readFileSync(filename, "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const localRequire = (id) =>
      overrides[id] ||
      (id === "next/server"
        ? { NextResponse }
        : id.startsWith("@/")
          ? load(path.resolve("src", id.slice(2) + ".ts"))
          : id.startsWith(".") ? load(path.resolve(path.dirname(filename), id.endsWith(".ts") ? id : id+".ts")) : require(id));
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {})(
      localRequire,
      loaded,
      loaded.exports,
    );
    cache[filename] = loaded.exports;
    return loaded.exports;
  }
  const post = (route, body) =>
    load(path.resolve("src/app/api", route, "route.ts")).POST({
      json: async () => body,
    });
  return {
    records,
    state,
    post,
    load: (file) => load(path.resolve("src/lib", file + ".ts")),
  };
}
const target = { teamId: "t", kind: "post", contentId: "p" };
const report = {
  ...target,
  action: "report",
  reason: "Harassment or bullying",
  details: "Please review.",
};

test("content references cannot traverse paths or omit a required parent", () => {
  for (const body of [
    { ...target, teamId: "../users" },
    { ...target, contentId: "p/q" },
    { ...target, kind: "message" },
    { ...target, kind: "account" },
  ])
    assert.equal(parseSafetyTarget(body), null);
  assert.equal(
    safetyContentPath(
      parseSafetyTarget({ ...target, kind: "comment", parentId: "parent" }),
    ),
    "teams/t/feedPosts/parent/comments/p",
  );
  assert.equal(
    isDirectConversation(["viewer", "author", "author"], "viewer"),
    true,
  );
  assert.equal(
    isDirectConversation(["viewer", "author", "third"], "viewer"),
    false,
  );
});
test("report submission snapshots authoritative author/content and retries do not duplicate or overwrite evidence", async () => {
  const h = harness();
  const first = await h.post("safety", {
    ...report,
    authorId: "forged",
    contentPreview: "forged",
  });
  assert.equal(first.status, 200);
  const id = (await first.json()).reportId;
  const record = h.records.get(`moderationReports/${id}`);
  assert.equal(record.authorId, "author");
  assert.equal(record.contentPreview, "Original content");

  assert.equal((await h.post("safety", report)).status, 200);
  assert.equal(
    h.records.get(`moderationReports/${id}`).contentPreview,
    "Original content",
  );
  assert.equal(
    [...h.records.keys()].filter((k) => k.startsWith("moderationReports/"))
      .length,
    1,
  );
});
test("edited content can be reported again without replacing prior evidence", async () => {
  const h = harness();
  const first = await (await h.post("safety", report)).json();
  h.records.get(`moderationReports/${first.reportId}`).status = "dismissed";
  assert.equal(
    (await (await h.post("safety", report)).json()).status,
    "dismissed",
  );
  h.records.get("teams/t/feedPosts/p").content = "Changed content";
  const second = await (await h.post("safety", report)).json();
  assert.notEqual(first.reportId, second.reportId);
  assert.equal(second.status, "pending");
  assert.equal(
    h.records.get(`moderationReports/${first.reportId}`).contentPreview,
    "Original content",
  );
});

test("outsiders, inaccessible private conversations, self reports, and invalid reasons are rejected", async () => {
  const h = harness();
  h.state.allowed = false;
  assert.equal((await h.post("safety", report)).status, 403);
  h.state.allowed = true;
  h.records.get("teams/t/groupChats/c").memberIds = ["author", "someone"];
  assert.equal(
    (
      await h.post("safety", {
        ...report,
        kind: "message",
        parentId: "c",
        contentId: "m",
      })
    ).status,
    403,
  );
  assert.equal(
    (await h.post("safety", { ...report, reason: "invented" })).status,
    400,
  );
  h.records.get("teams/t/feedPosts/p").authorId = "viewer";
  assert.equal((await h.post("safety", report)).status, 400);
});
test("block and unblock affect only the authenticated user and server-derived author", async () => {
  const h = harness();
  assert.equal(
    (
      await h.post("safety", {
        ...target,
        action: "block",
        uid: "victim",
        authorId: "forged",
      })
    ).status,
    200,
  );
  assert.ok(h.records.has("userSafety/viewer/blocks/author"));
  assert.ok(!h.records.has("userSafety/victim/blocks/forged"));
  assert.equal(
    await h.load("server-moderation").hasBlockBetween("author", "viewer"),
    true,
  );
  assert.equal(
    (
      await h.post("safety", {
        action: "unblock",
        authorId: "author",
        uid: "victim",
      })
    ).status,
    200,
  );
  assert.equal(
    await h.load("server-moderation").hasBlockBetween("author", "viewer"),
    false,
  );
});
test("either direction of blocking rejects direct chat sends before storing a message", async () => {
  for (const block of [
    "userSafety/viewer/blocks/author",
    "userSafety/author/blocks/viewer",
  ]) {
    const h = harness();
    h.records.set(block, {});
    const result = await h.post("teams/chat/message", {
      teamId: "t",
      chatId: "c",
      type: "text",
      content: "blocked contact",
    });
    assert.equal(result.status, 403);
    assert.equal(
      [...h.records.keys()].filter((k) => k.includes("/messages/")).length,
      1,
    );
    assert.equal(h.state.notifications.length, 0);
  }
});
test("shared group messages remain available to the group while blocked recipients receive no notification", async () => {
  const h = harness();
  h.records.get("teams/t/groupChats/c").memberIds.push("third");
  h.records.set("userSafety/author/blocks/viewer", {});
  const result = await h.post("teams/chat/message", {
    teamId: "t",
    chatId: "c",
    type: "text",
    content: "Group message",
  });
  assert.equal(result.status, 200);
  assert.equal(
    h.records.get("teams/t/groupChats/c").lastMessageAuthorId,
    "viewer",
  );
  assert.equal(h.state.notifications.length, 1);
  assert.deepEqual(Array.from(h.state.notifications[0].recipientUserIds), [
    "third",
  ]);
});
test("blocked feed authors cannot be contacted via comments", async () => {
  const h = harness();
  h.records.set("userSafety/author/blocks/viewer", {});
  assert.equal(
    (
      await h.post("teams/feed/action", {
        teamId: "t",
        postId: "p",
        action: "create-comment",
        content: "reply",
      })
    ).status,
    403,
  );
});
test("moderation queue resolution is claim-gated and targets only the stored report content", async () => {
  const h = harness();
  const id = (await (await h.post("safety", report)).json()).reportId;
  assert.equal(
    (
      await h.post("admin/moderation", {
        reportId: id,
        action: "remove",
        note: "Violation",
      })
    ).status,
    403,
  );
  h.state.auth.role = "superadmin";
  assert.equal(
    (
      await h.post("admin/moderation", {
        reportId: id,
        action: "remove",
        note: "Violation",
        contentPath: "users/victim",
      })
    ).status,
    200,
  );
  assert.ok(!h.records.has("teams/t/feedPosts/p"));
  assert.equal(h.records.get(`moderationReports/${id}`).status, "removed");
  assert.equal(
    (
      await h.post("admin/moderation", {
        reportId: id,
        action: "dismiss",
        note: "Again",
      })
    ).status,
    409,
  );
});

 test('reports respect feed audience, module visibility, and missing parent posts', async () => {
  const h = harness();
  const body = {action:'report',teamId:'t',kind:'post',contentId:'p',reason:'harassment'};
  h.records.get('teams/t/feedPosts/p').audience = 'coaches';
  assert.equal((await h.post('safety',body)).status,404);
  h.records.set('teams/t/feedPosts/missing/comments/c',{authorId:'author',content:'orphan'});
  assert.equal((await h.post('safety',{...body,kind:'comment',parentId:'missing',contentId:'c'})).status,404);
 });
