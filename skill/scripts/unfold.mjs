#!/usr/bin/env node

// src/cli/main.ts
import { spawn } from "node:child_process";
import { writeFileSync as writeFileSync2 } from "node:fs";
import { resolve as resolve3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/core/graph.ts
var EDGE_KINDS = ["next", "loop", "parallel"];
var ID_RE = /^[1-9]\d*(\.[1-9]\d*)*$/;
function parentId(id) {
  const i = id.lastIndexOf(".");
  return i < 0 ? "" : id.slice(0, i);
}
function compareIds(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
function childrenOf(nodes, parent) {
  return nodes.filter((n) => parentId(n.id) === parent).sort((a, b) => compareIds(a.id, b.id));
}
function edgesAt(edges, parent) {
  return edges.filter((e) => parentId(e.from) === parent && parentId(e.to) === parent);
}

// src/scope/markdown.ts
var ORIGIN_TAG = { requested: "", assumption: " `\uAC00\uC815`", added: " `AI \uCD94\uAC00`" };
function toMarkdown(doc) {
  const out = [];
  out.push(`# ${doc.feature}`, "");
  out.push(`> \uC694\uCCAD: ${doc.request}`, "");
  out.push(doc.status === "confirmed" ? `\uC0C1\uD0DC: \uD655\uC815 (${doc.confirmedAt ?? "\uC2DC\uAC01 \uC5C6\uC74C"})` : "\uC0C1\uD0DC: \uC791\uC131 \uC911", "");
  out.push("## \uB3D9\uC791", "");
  const walk = (parent, depth) => {
    const pad = "  ".repeat(depth);
    for (const n of childrenOf(doc.nodes, parent)) {
      const touches = n.touches?.length ? ` (\uC678\uBD80: ${n.touches.join(", ")})` : "";
      const end = n.terminal ? " \u2014 \uD750\uB984 \uC885\uB8CC" : "";
      out.push(`${pad}- **${n.id} ${n.title}**${ORIGIN_TAG[n.origin]}${touches}${end}${n.summary ? `: ${n.summary}` : ""}`);
      walk(n.id, depth + 1);
    }
    const edges = edgesAt(doc.edges, parent);
    if (edges.length) {
      const text = edges.map((e) => {
        const notes = [e.when, e.kind === "loop" ? "\uBC18\uBCF5" : e.kind === "parallel" ? "\uB3D9\uC2DC\uC5D0" : ""].filter(Boolean);
        return `${e.from} \u2192 ${e.to}${notes.length ? ` (${notes.join(", ")})` : ""}`;
      }).join(", ");
      out.push(`${pad}- \uD750\uB984: ${text}`);
    }
  };
  walk("", 0);
  out.push("");
  const list = (title, nodes) => {
    if (!nodes.length) return;
    out.push(`## ${title}`, "");
    for (const n of nodes) out.push(`- ${n.id} ${n.title}${n.summary ? `: ${n.summary}` : ""}`);
    out.push("");
  };
  list("AI\uC758 \uAC00\uC815", doc.nodes.filter((n) => n.origin === "assumption"));
  list("AI\uAC00 \uCD94\uAC00\uD55C \uAC83", doc.nodes.filter((n) => n.origin === "added"));
  if (doc.excluded?.length) {
    out.push("## \uC81C\uC678\uD55C \uAC83", "");
    for (const x of doc.excluded) out.push(`- ${x.title}: ${x.reason}`);
    out.push("");
  }
  if (doc.doneWhen?.length) {
    out.push("## \uC644\uB8CC \uAE30\uC900", "");
    for (const d of doc.doneWhen) out.push(`- ${d}`);
    out.push("");
  }
  return out.join("\n");
}

// src/scope/schema.ts
var ORIGINS = ["requested", "assumption", "added"];
var CODE_PATTERNS = [
  [/`/, "\uBC31\uD2F1\uC73C\uB85C \uAC10\uC2FC \uCF54\uB4DC"],
  [/[\w\-/]+\.(ts|tsx|js|jsx|mjs|py|go|rs|java|kt|rb|cs|cpp|c|h|sql)\b/, "\uD30C\uC77C \uACBD\uB85C"],
  [/\b[a-z]+[a-z0-9]*[A-Z][A-Za-z0-9]*\b/, "camelCase \uC2DD\uBCC4\uC790"],
  [/\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/, "PascalCase \uC2DD\uBCC4\uC790"],
  [/\b[a-z]+_[a-z0-9_]+\b/, "snake_case \uC2DD\uBCC4\uC790"],
  [/\w\(\)/, "\uD568\uC218 \uD638\uCD9C"]
];
var isStr = (v) => typeof v === "string" && v.trim().length > 0;
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function validate(input) {
  const issues = [];
  const err = (where, message) => issues.push({ level: "error", where, message });
  const warn = (where, message) => issues.push({ level: "warning", where, message });
  if (!isObj(input)) {
    err("\uBB38\uC11C", "JSON \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4");
    return issues;
  }
  if (input.unfold !== 1) err("unfold", "1 \uC774\uC5B4\uC57C \uD55C\uB2E4");
  if (input.stage !== "scope") err("stage", '"scope" \uC5EC\uC57C \uD55C\uB2E4');
  if (!isStr(input.feature)) err("feature", "\uAE30\uB2A5 \uC774\uB984\uC774 \uD544\uC694\uD558\uB2E4");
  if (!isStr(input.request)) err("request", "\uC0AC\uC6A9\uC790\uC758 \uC694\uCCAD \uBB38\uC7A5\uC774 \uD544\uC694\uD558\uB2E4");
  if (input.status !== "draft" && input.status !== "confirmed") err("status", '"draft" \uB610\uB294 "confirmed" \uC5EC\uC57C \uD55C\uB2E4');
  if (input.doneWhen !== void 0 && !(Array.isArray(input.doneWhen) && input.doneWhen.every(isStr)))
    err("doneWhen", "\uBB38\uC7A5 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD55C\uB2E4");
  if (input.excluded !== void 0) {
    if (!Array.isArray(input.excluded)) err("excluded", "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD55C\uB2E4");
    else
      input.excluded.forEach((x, i) => {
        if (!isObj(x) || !isStr(x.title) || !isStr(x.reason)) err(`excluded[${i}]`, "title \uACFC reason \uC774 \uD544\uC694\uD558\uB2E4");
      });
  }
  if (!Array.isArray(input.nodes)) {
    err("nodes", "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD55C\uB2E4");
    return issues;
  }
  if (!Array.isArray(input.edges)) {
    err("edges", "\uBC30\uC5F4\uC774\uC5B4\uC57C \uD55C\uB2E4");
    return issues;
  }
  const ids = /* @__PURE__ */ new Set();
  const nodes = [];
  input.nodes.forEach((n, i) => {
    if (!isObj(n) || !isStr(n.id)) return err(`nodes[${i}]`, "id \uAC00 \uD544\uC694\uD558\uB2E4");
    const at = `\uB178\uB4DC ${n.id}`;
    if (!ID_RE.test(n.id)) return err(at, 'id \uB294 "2", "2.1", "2.1.3" \uD615\uC2DD\uC774\uC5B4\uC57C \uD55C\uB2E4');
    if (ids.has(n.id)) return err(at, "id \uAC00 \uC911\uBCF5\uB41C\uB2E4");
    ids.add(n.id);
    if (!isStr(n.title)) err(at, "title \uC774 \uD544\uC694\uD558\uB2E4");
    if (n.summary !== void 0 && typeof n.summary !== "string") err(at, "summary \uB294 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD55C\uB2E4");
    if (!ORIGINS.includes(n.origin)) err(at, `origin \uC740 ${ORIGINS.join(" / ")} \uC911 \uD558\uB098\uC5EC\uC57C \uD55C\uB2E4`);
    if (n.touches !== void 0 && !(Array.isArray(n.touches) && n.touches.every(isStr)))
      err(at, "touches \uB294 \uBB38\uC790\uC5F4 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD55C\uB2E4");
    nodes.push(n);
  });
  const systems = new Set(nodes.flatMap((n) => Array.isArray(n.touches) ? n.touches : []));
  for (const n of nodes) {
    const at = `\uB178\uB4DC ${n.id}`;
    const parent = parentId(n.id);
    if (parent && !ids.has(parent)) err(at, `\uBD80\uBAA8 \uB178\uB4DC ${parent} \uAC00 \uC5C6\uB2E4`);
    if (n.leaf && nodes.some((c) => parentId(c.id) === n.id)) err(at, "leaf \uC778\uB370 \uD558\uC704 \uB178\uB4DC\uAC00 \uC788\uB2E4");
    let text = `${n.title ?? ""} ${n.summary ?? ""}`;
    for (const s of systems) text = text.split(s).join(" ");
    const hit = CODE_PATTERNS.find(([re]) => re.test(text));
    if (hit)
      warn(at, `${hit[1]}\uCC98\uB7FC \uBCF4\uC774\uB294 \uD45C\uD604\uC774 \uC788\uB2E4. \uAE30\uB2A5 \uC815\uC758\uC5D0\uB294 \uB3D9\uC791\uB9CC \uC4F0\uACE0, \uCF54\uB4DC \uAD6C\uC870\uB294 \uC124\uACC4 \uB2E8\uACC4\uB85C \uBBF8\uB8EC\uB2E4`);
  }
  const seenEdges = /* @__PURE__ */ new Set();
  input.edges.forEach((e, i) => {
    if (!isObj(e) || !isStr(e.from) || !isStr(e.to)) return err(`edges[${i}]`, "from \uACFC to \uAC00 \uD544\uC694\uD558\uB2E4");
    const at = `\uC120 ${e.from} \u2192 ${e.to}`;
    if (!ids.has(e.from)) return err(at, `\uB178\uB4DC ${e.from} \uAC00 \uC5C6\uB2E4`);
    if (!ids.has(e.to)) return err(at, `\uB178\uB4DC ${e.to} \uAC00 \uC5C6\uB2E4`);
    if (e.from === e.to) return err(at, "\uC790\uAE30 \uC790\uC2E0\uC73C\uB85C \uAC00\uB294 \uC120\uC740 \uC4F8 \uC218 \uC5C6\uB2E4. \uBC18\uBCF5\uC740 \uC55E \uB178\uB4DC\uB85C \uB3CC\uC544\uAC00\uB294 \uC120\uC73C\uB85C \uADF8\uB9B0\uB2E4");
    if (parentId(e.from) !== parentId(e.to))
      err(at, "\uAC19\uC740 \uB2E8\uACC4\uC758 \uB178\uB4DC\uB07C\uB9AC\uB9CC \uC774\uC744 \uC218 \uC788\uB2E4. \uB2E4\uB978 \uB2E8\uACC4\uB85C \uAC00\uB294 \uD750\uB984\uC740 \uBD80\uBAA8 \uB178\uB4DC\uC758 \uC120\uC73C\uB85C \uD45C\uD604\uD55C\uB2E4");
    if (e.when !== void 0 && typeof e.when !== "string") err(at, "when \uC740 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD55C\uB2E4");
    if (e.kind !== void 0 && !EDGE_KINDS.includes(e.kind)) err(at, `kind \uB294 ${EDGE_KINDS.join(" / ")} \uC911 \uD558\uB098\uC5EC\uC57C \uD55C\uB2E4`);
    const key = `${e.from}>${e.to}`;
    if (seenEdges.has(key)) warn(at, "\uAC19\uC740 \uC120\uC774 \uB450 \uBC88 \uC788\uB2E4");
    seenEdges.add(key);
  });
  if (!issues.some((x) => x.level === "error")) {
    const edges = input.edges;
    for (const parent of ["", ...ids]) {
      const kids = childrenOf(nodes, parent);
      const where = parent ? `\uB178\uB4DC ${parent} \uC548\uCABD` : "\uCCAB \uB2E8\uACC4";
      if (kids.length > 1 && !edges.some((e) => parentId(e.from) === parent))
        warn(where, "\uB178\uB4DC\uAC00 \uC5EC\uB7EC \uAC1C\uC778\uB370 \uC120\uC774 \uC5C6\uC5B4 \uC21C\uC11C\uB97C \uC54C \uC218 \uC5C6\uB2E4");
      if (kids.length > 9) warn(where, `\uB178\uB4DC\uAC00 ${kids.length}\uAC1C\uB2E4. \uD55C \uB2E8\uACC4\uB294 7\uAC1C \uC548\uD30E\uC73C\uB85C \uBB36\uB294\uB2E4`);
    }
  }
  return issues;
}
function diff(prev, cur) {
  const before = new Map(prev.nodes.map((n) => [n.id, n]));
  const after = new Map(cur.nodes.map((n) => [n.id, n]));
  const sig = (n) => JSON.stringify([n.title, n.summary ?? "", n.origin, n.touches ?? [], !!n.leaf, !!n.terminal]);
  const added = [];
  const changed = /* @__PURE__ */ new Set();
  for (const n of cur.nodes) {
    const old = before.get(n.id);
    if (!old) added.push(n.id);
    else if (sig(old) !== sig(n)) changed.add(n.id);
  }
  const edgeSig = (e) => `${e.from}>${e.to}|${e.when ?? ""}|${e.kind ?? "next"}`;
  const oldEdges = new Set(prev.edges.map(edgeSig));
  const newEdges = new Set(cur.edges.map(edgeSig));
  for (const e of [...prev.edges, ...cur.edges]) {
    if (oldEdges.has(edgeSig(e)) && newEdges.has(edgeSig(e))) continue;
    for (const id of [e.from, e.to]) if (before.has(id) && after.has(id)) changed.add(id);
  }
  const removed = prev.nodes.filter((n) => !after.has(n.id)).map((n) => ({ id: n.id, title: n.title }));
  return { added, changed: [...changed], removed };
}

// src/cli/state.ts
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
function stateDir(file) {
  const key = createHash("sha1").update(resolve(file)).digest("hex").slice(0, 12);
  const dir = join(tmpdir(), "unfold", key);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function readState(file, name2) {
  try {
    return JSON.parse(readFileSync(join(stateDir(file), name2), "utf8"));
  } catch {
    return void 0;
  }
}
function writeState(file, name2, value) {
  writeFileSync(join(stateDir(file), name2), JSON.stringify(value));
}
function clearState(file, name2) {
  rmSync(join(stateDir(file), name2), { force: true });
}

// src/cli/revisions.ts
var name = (n) => `r${n}.json`;
function currentNumber(file) {
  return readState(file, "meta.json")?.current ?? 0;
}
function revision(file, n) {
  return n > 0 ? readState(file, name(n)) : void 0;
}
function current(file) {
  const n = currentNumber(file);
  const doc = revision(file, n);
  return doc ? { n, doc } : void 0;
}
function commit(file, doc) {
  const n = currentNumber(file) + 1;
  writeState(file, name(n), doc);
  writeState(file, "meta.json", { current: n });
  return n;
}
function reset(file, doc) {
  for (let n = currentNumber(file); n > 0; n--) clearState(file, name(n));
  writeState(file, name(1), doc);
  writeState(file, "meta.json", { current: 1 });
}
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// src/cli/server.ts
import { readFileSync as readFileSync2, watch } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var IDLE_EXIT_MS = 30 * 60 * 1e3;
function loadDoc(file) {
  let text;
  try {
    text = readFileSync2(file, "utf8");
  } catch {
    return { parseError: "\uC544\uC9C1 \uD30C\uC77C\uC774 \uC5C6\uB2E4" };
  }
  try {
    return { doc: JSON.parse(text) };
  } catch (e) {
    return { parseError: `JSON \uC744 \uC77D\uC744 \uC218 \uC5C6\uB2E4: ${e.message}` };
  }
}
function payload(file) {
  const live = loadDoc(file);
  let rev = current(file);
  if (!rev) {
    if (live.parseError) return { file, parseError: live.parseError };
    const issues = validate(live.doc);
    if (issues.some((i) => i.level === "error")) return { file, doc: live.doc, issues };
    rev = { n: commit(file, live.doc), doc: live.doc };
  }
  const prev = revision(file, rev.n - 1);
  return {
    file,
    doc: rev.doc,
    issues: validate(rev.doc),
    diff: prev ? diff(prev, rev.doc) : void 0,
    revision: rev.n,
    // 작업본이 화면의 리비전과 다르면 에이전트가 고치는 중이다.
    editing: live.parseError ? true : !same(live.doc, rev.doc)
  };
}
function serve(fileArg) {
  const file = resolve2(fileArg);
  const viewerPath = fileURLToPath(new URL("../viewer/index.html", import.meta.url));
  const clients = /* @__PURE__ */ new Set();
  let idleTimer;
  const armIdle = () => {
    clearTimeout(idleTimer);
    if (clients.size === 0) idleTimer = setTimeout(() => shutdown(), IDLE_EXIT_MS);
  };
  const shutdown = () => {
    clearState(file, "server.json");
    process.exit(0);
  };
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync2(viewerPath));
    } else if (url === "/doc") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(payload(file)));
    } else if (url === "/ping") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ file }));
    } else if (url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      clients.add(res);
      armIdle();
      req.on("close", () => {
        clients.delete(res);
        armIdle();
      });
    } else if (url === "/seen" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const ids = JSON.parse(body);
          const seen = new Set(readState(file, "seen.json") ?? []);
          for (const id of ids) if (typeof id === "string") seen.add(id);
          writeState(file, "seen.json", [...seen]);
        } catch {
        }
        res.writeHead(204).end();
      });
    } else if (url === "/refresh" && req.method === "POST") {
      res.writeHead(204).end();
      notify();
    } else if (url === "/stop" && req.method === "POST") {
      res.writeHead(204).end();
      shutdown();
    } else {
      res.writeHead(404).end();
    }
  });
  let debounce;
  const notify = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      for (const c of clients) c.write("data: change\n\n");
    }, 80);
  };
  try {
    watch(dirname(file), (_event, name2) => {
      if (!name2 || name2 === basename(file)) notify();
    });
  } catch {
  }
  setInterval(() => {
    for (const c of clients) c.write(": keepalive\n\n");
  }, 25e3).unref();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    writeState(file, "server.json", { port, pid: process.pid });
    armIdle();
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// src/cli/main.ts
var USAGE = `unfold <\uBA85\uB839> <scope.json>

  check <\uD30C\uC77C>              \uD615\uC2DD\uACFC \uADDC\uCE59\uC744 \uAC80\uC0AC\uD55C\uB2E4
  done <\uD30C\uC77C>               \uC791\uC131\uC774\uB098 \uC218\uC815\uC744 \uB9C8\uCCE4\uB2E4\uACE0 \uC54C\uB9B0\uB2E4. \uC0C8 \uB9AC\uBE44\uC804\uC774 \uB418\uC5B4 \uD654\uBA74\uC5D0 \uBC18\uC601\uB41C\uB2E4
  view <\uD30C\uC77C> [--no-open]   \uBDF0\uC5B4\uB97C \uB744\uC6B0\uACE0 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC5F0\uB2E4. \uB9C8\uC9C0\uB9C9 \uB9AC\uBE44\uC804\uC744 \uBCF4\uC5EC\uC900\uB2E4
  revert <\uD30C\uC77C> <\uBC88\uD638>      \uC9C0\uC815\uD55C \uB9AC\uBE44\uC804\uC758 \uB0B4\uC6A9\uC73C\uB85C \uB418\uB3CC\uB9B0\uB2E4 (\uC0C8 \uB9AC\uBE44\uC804\uC73C\uB85C \uAE30\uB85D\uB41C\uB2E4)
  confirm <\uD30C\uC77C> [--force]  \uD655\uC815\uD55C\uB2E4. \uC774\uC804 \uB9AC\uBE44\uC804\uC740 \uBAA8\uB450 \uC9C0\uC6CC\uC9C4\uB2E4
  reopen <\uD30C\uC77C>             \uD655\uC815\uC744 \uD480\uACE0 \uC218\uC815 \uC911\uC73C\uB85C \uB3CC\uB9B0\uB2E4
  md <\uD30C\uC77C>                 \uC77D\uAE30\uC6A9 Markdown \uC744 \uCD9C\uB825\uD55C\uB2E4
  stop <\uD30C\uC77C>               \uBDF0\uC5B4\uB97C \uB048\uB2E4
`;
function fail(message) {
  console.error(message);
  process.exit(1);
}
function printIssues(issues) {
  for (const i of issues) console.log(`${i.level === "error" ? "\uC624\uB958" : "\uACBD\uACE0"}  ${i.where}: ${i.message}`);
}
function readValid(file) {
  const { doc, parseError } = loadDoc(file);
  if (parseError) fail(parseError);
  const issues = validate(doc);
  if (issues.some((i) => i.level === "error")) {
    printIssues(issues);
    process.exit(1);
  }
  return { doc, issues };
}
function save(file, doc) {
  writeFileSync2(file, JSON.stringify(doc, null, 2) + "\n");
}
async function ping(info, file) {
  if (!info) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/ping`, { signal: AbortSignal.timeout(500) });
    return (await res.json()).file === file;
  } catch {
    return false;
  }
}
async function refresh(file) {
  const info = readState(file, "server.json");
  if (await ping(info, file)) await fetch(`http://127.0.0.1:${info.port}/refresh`, { method: "POST" }).catch(() => {
  });
}
async function view(file, open) {
  let info = readState(file, "server.json");
  if (!await ping(info, file)) {
    clearState(file, "server.json");
    spawn(process.execPath, [fileURLToPath2(import.meta.url), "serve", file], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      info = readState(file, "server.json");
      if (await ping(info, file)) break;
    }
    if (!await ping(info, file)) fail("\uBDF0\uC5B4\uB97C \uB744\uC6B0\uC9C0 \uBABB\uD588\uB2E4");
  }
  const url = `http://127.0.0.1:${info.port}/`;
  if (open) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {
    }).unref();
  }
  console.log(url);
}
async function done(file) {
  const { doc, issues } = readValid(file);
  printIssues(issues);
  if (doc.status === "confirmed") fail("\uD655\uC815\uB41C \uBB38\uC11C\uB2E4. \uACE0\uCE58\uB824\uBA74 \uBA3C\uC800 reopen \uD55C\uB2E4");
  const rev = current(file);
  if (rev && same(rev.doc, doc)) {
    console.log(`\uBC14\uB010 \uAC83\uC774 \uC5C6\uB2E4. \uD654\uBA74\uC740 r${rev.n} \uADF8\uB300\uB85C\uB2E4`);
    return;
  }
  const n = commit(file, doc);
  await refresh(file);
  console.log(`r${n} \uC73C\uB85C \uD654\uBA74\uC5D0 \uBC18\uC601\uD588\uB2E4`);
}
async function revert(file, arg) {
  const n = Number((arg ?? "").replace(/^r/, ""));
  const target = revision(file, n);
  if (!target) fail(`\uB9AC\uBE44\uC804 r${arg ?? ""} \uC774 \uC5C6\uB2E4. \uC9C0\uAE08\uC740 r1 ~ r${currentNumber(file)} \uAE4C\uC9C0 \uC788\uB2E4`);
  if (readValid(file).doc.status === "confirmed") fail("\uD655\uC815\uB41C \uBB38\uC11C\uB2E4. \uACE0\uCE58\uB824\uBA74 \uBA3C\uC800 reopen \uD55C\uB2E4");
  save(file, target);
  const now = commit(file, target);
  await refresh(file);
  console.log(`r${n} \uC758 \uB0B4\uC6A9\uC73C\uB85C \uB418\uB3CC\uB838\uB2E4 (r${now})`);
}
async function confirm(file, force) {
  const { doc, issues } = readValid(file);
  printIssues(issues);
  if (doc.status === "confirmed") fail("\uC774\uBBF8 \uD655\uC815\uB41C \uBB38\uC11C\uB2E4");
  const rev = current(file);
  if (!rev || !same(rev.doc, doc)) fail("\uD654\uBA74\uC5D0 \uBC18\uC601\uB418\uC9C0 \uC54A\uC740 \uC218\uC815\uC774 \uC788\uB2E4. \uBA3C\uC800 done \uC744 \uC2E4\uD589\uD574 \uC0AC\uC6A9\uC790\uAC00 \uCD5C\uC2E0 \uB0B4\uC6A9\uC744 \uBCF4\uAC8C \uD55C\uB2E4");
  if (!doc.doneWhen?.length) fail("\uC624\uB958  doneWhen: \uD655\uC815\uD558\uB824\uBA74 \uC644\uB8CC \uAE30\uC900\uC774 \uD55C \uC904 \uC774\uC0C1 \uD544\uC694\uD558\uB2E4");
  const seen = new Set(readState(file, "seen.json") ?? []);
  const unseen = doc.nodes.filter((n) => n.origin === "added" && !seen.has(n.id));
  if (unseen.length && !force) {
    console.log("\uC0AC\uC6A9\uC790\uAC00 \uD654\uBA74\uC5D0\uC11C \uC544\uC9C1 \uBCF4\uC9C0 \uC54A\uC740 AI \uCD94\uAC00 \uD56D\uBAA9\uC774 \uC788\uB2E4. \uC544\uB798 \uBAA9\uB85D\uC744 \uC0AC\uC6A9\uC790\uC5D0\uAC8C \uBCF4\uC5EC\uC8FC\uACE0 \uB123\uC744\uC9C0 \uBE84\uC9C0 \uD655\uC778\uD55C \uB4A4,");
    console.log("--force \uB97C \uBD99\uC5EC \uB2E4\uC2DC \uC2E4\uD589\uD55C\uB2E4.");
    for (const n of unseen) console.log(`  ${n.id} ${n.title}${n.summary ? ` \u2014 ${n.summary}` : ""}`);
    process.exit(2);
  }
  doc.status = "confirmed";
  doc.confirmedAt = (/* @__PURE__ */ new Date()).toISOString();
  save(file, doc);
  reset(file, doc);
  await refresh(file);
  console.log(`\uD655\uC815\uD588\uB2E4: ${doc.feature} (\uB178\uB4DC ${doc.nodes.length}\uAC1C). \uC774\uC804 \uB9AC\uBE44\uC804\uC740 \uC9C0\uC6E0\uB2E4`);
}
async function main() {
  const [command, fileArg, ...rest] = process.argv.slice(2);
  if (!command || !fileArg) fail(USAGE);
  const file = resolve3(fileArg);
  switch (command) {
    case "serve":
      return serve(file);
    case "view":
      return view(file, !rest.includes("--no-open"));
    case "check": {
      const { doc, parseError } = loadDoc(file);
      if (parseError) fail(parseError);
      const issues = validate(doc);
      printIssues(issues);
      const errors = issues.filter((i) => i.level === "error").length;
      console.log(errors ? `\uC624\uB958 ${errors}\uAC1C` : `\uD1B5\uACFC (\uACBD\uACE0 ${issues.length}\uAC1C)`);
      process.exit(errors ? 1 : 0);
    }
    case "done":
      return done(file);
    case "revert":
      return revert(file, rest[0]);
    case "confirm":
      return confirm(file, rest.includes("--force"));
    case "reopen": {
      const { doc } = readValid(file);
      if (doc.status !== "confirmed") fail("\uC774\uBBF8 \uC218\uC815 \uC911\uC774\uB2E4");
      doc.status = "draft";
      delete doc.confirmedAt;
      save(file, doc);
      commit(file, doc);
      await refresh(file);
      console.log("\uC218\uC815 \uC911\uC73C\uB85C \uB3CC\uB838\uB2E4");
      return;
    }
    case "md":
      console.log(toMarkdown(readValid(file).doc));
      return;
    case "stop": {
      const info = readState(file, "server.json");
      if (await ping(info, file)) await fetch(`http://127.0.0.1:${info.port}/stop`, { method: "POST" }).catch(() => {
      });
      clearState(file, "server.json");
      console.log("\uBDF0\uC5B4\uB97C \uAED0\uB2E4");
      return;
    }
    default:
      fail(USAGE);
  }
}
main();
