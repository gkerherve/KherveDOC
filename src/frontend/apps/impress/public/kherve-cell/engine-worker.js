/*
 * KherveCELL calculation worker: KherveSheet's engine (Python) running in
 * Pyodide, off the page's main thread.
 *
 * Messages in:  {id, op, payload, needs} with op one of the kherve_bridge
 *               functions (reset, set_cells, …, render_chart); needs lists the
 *               packages it must load first ("matplotlib", "pypi:lmfit"…).
 * Messages out: {type: "ready"} once the engine is loaded,
 *               {type: "scipy"} once the science functions are available,
 *               {id, ok, result | error} for each request.
 */
/* global importScripts, loadPyodide, WorkerGlobalScope */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
importScripts(PYODIDE + "pyodide.js");

/*
 * Python cells (=PY) run here with this page's origin, so they could act
 * as the signed-in user on KherveDOC's own server. Before any Python runs,
 * the worker may only reach the engine's own files on this origin; other
 * websites are reached without cookies (no one's session goes with them).
 */
(function guardNetwork() {
  const origin = self.location.origin;
  const ownFiles = new URL(".", self.location.href).pathname;
  const allowed = (url) => url.origin !== origin || url.pathname.startsWith(ownFiles);
  const refuse = (url) =>
    new TypeError("KherveCELL: Python cannot reach " + url.pathname + " on KherveDOC");
  const realFetch = self.fetch.bind(self);
  const guardedFetch = function fetch(input, init) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, self.location.href);
    if (!allowed(url)) {
      return Promise.reject(refuse(url));
    }
    const request = new Request(input, init);
    return realFetch(
      url.origin === origin ? request : new Request(request, { credentials: "omit" }),
    );
  };
  const realImport = self.importScripts.bind(self);
  const guardedImport = function importScripts(...urls) {
    for (const u of urls) {
      const url = new URL(u, self.location.href);
      if (!allowed(url)) {
        throw refuse(url);
      }
    }
    return realImport(...urls);
  };
  // Replace them wherever they are defined (the prototype too, or the
  // original could be reached through it).
  for (let o = self; o; o = Object.getPrototypeOf(o)) {
    for (const [name, value] of [["fetch", guardedFetch], ["importScripts", guardedImport]]) {
      if (Object.prototype.hasOwnProperty.call(o, name)) {
        Object.defineProperty(o, name, { value, writable: false, configurable: false });
      }
    }
  }
  // Other ways to send requests with cookies: none needed by the engine.
  for (const name of ["XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "caches", "BroadcastChannel"]) {
    try {
      Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false });
    } catch (_error) {
      /* not present in this browser */
    }
  }
})();

const base = new URL("python/", self.location.href);
let bridge = null;
let pyodideRef = null;
const loaded = new Set();

/** Load Pyodide packages (e.g. matplotlib) the first time they are needed. */
async function ensurePackages(names) {
  const missing = names.filter((n) => !loaded.has(n));
  if (!missing.length) {
    return;
  }
  const pypi = missing.filter((n) => n.startsWith("pypi:"));
  const bundled = missing.filter((n) => !n.startsWith("pypi:"));
  if (bundled.length) {
    await pyodideRef.loadPackage(bundled);
  }
  if (pypi.length) {
    await pyodideRef.loadPackage("micropip");
    const micropip = pyodideRef.pyimport("micropip");
    await micropip.install(pypi.map((n) => n.slice(5)));
  }
  missing.forEach((n) => loaded.add(n));
}

/** The Python code of the =PY cells in a request. */
function pythonSources(op, payload) {
  const isPy = (s) => typeof s === "string" && /^\s*=PY(\s|$)/i.test(s);
  if (op === "reset") {
    return payload.sheets.flatMap((s) => s.cells.map((c) => c[2])).filter(isPy);
  }
  if (op === "set_cells") {
    return payload.edits.map((e) => e[3]).filter(isPy);
  }
  return [];
}

/** Load the packages =PY code imports (pandas, scipy…) before it runs. */
async function loadPythonImports(op, payload) {
  const sources = pythonSources(op, payload);
  if (!sources.length) {
    return;
  }
  await ensurePackages(["matplotlib"]);
  for (const source of sources) {
    try {
      await pyodideRef.loadPackagesFromImports(source.replace(/^\s*=PY/i, ""));
    } catch (_error) {
      /* a syntax error: the cell will say so when it runs */
    }
  }
}

const ready = (async () => {
  const pyodide = await loadPyodide({ indexURL: PYODIDE });
  pyodideRef = pyodide;
  await pyodide.loadPackage("numpy");
  loaded.add("numpy");
  const manifest = await (await fetch(new URL("manifest.json", base))).json();
  for (const file of manifest.files) {
    const text = await (await fetch(new URL(file, base))).text();
    const dir = "/kherve/" + file.split("/").slice(0, -1).join("/");
    pyodide.FS.mkdirTree(dir);
    pyodide.FS.writeFile("/kherve/" + file, text);
  }
  pyodide.runPython("import sys; sys.path.insert(0, '/kherve')");
  bridge = pyodide.pyimport("kherve_bridge");
  self.postMessage({ type: "ready", khervesheet: manifest.khervesheet });
  // Science functions (filters, integrals…) import scipy when used; load
  // it in the background so the grid does not wait for it.
  pyodide
    .loadPackage("scipy")
    .then(() => self.postMessage({ type: "scipy" }))
    .catch(() => undefined);
})();

self.onmessage = async (event) => {
  const { id, op, payload, needs } = event.data;
  try {
    await ready;
    if (needs && needs.length) {
      await ensurePackages(needs);
    }
    await loadPythonImports(op, payload);
    if (typeof bridge[op] !== "function") {
      throw new Error("Unknown operation " + op);
    }
    const result = JSON.parse(bridge[op](JSON.stringify(payload)));
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error) });
  }
};
