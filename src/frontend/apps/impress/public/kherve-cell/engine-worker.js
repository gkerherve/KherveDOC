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
/* global importScripts, loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
importScripts(PYODIDE + "pyodide.js");

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
    if (typeof bridge[op] !== "function") {
      throw new Error("Unknown operation " + op);
    }
    const result = JSON.parse(bridge[op](JSON.stringify(payload)));
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error) });
  }
};
