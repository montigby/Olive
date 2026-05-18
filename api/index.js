// CJS wrapper — Vercel compiles .js to CJS; dynamic import() loads the ESM bundle correctly
let _app;

async function loadApp() {
  if (!_app) {
    const mod = await import("../artifacts/api-server/dist/handler.mjs");
    _app = mod.default;
  }
  return _app;
}

module.exports = async (req, res) => {
  const app = await loadApp();
  app(req, res);
};
