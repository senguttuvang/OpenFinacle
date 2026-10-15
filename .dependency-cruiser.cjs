module.exports = { forbidden: [
  { name: 'domain-independent', severity: 'error', from: { path: '^src/domain' }, to: { path: '^src/(adapters|worker|application)' } },
  { name: 'frontend-no-server-imports', severity: 'error', from: { path: '^app' }, to: { path: '^src/(adapters|application|worker)' } },
  { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } }
], options: { doNotFollow: { path: 'node_modules' }, tsConfig: { fileName: 'tsconfig.json' } } };
