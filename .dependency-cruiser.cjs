module.exports = {
  forbidden: [
    { name: 'domain-independent', severity: 'error', from: { path: '^src/platform/[^/]+/domain/' }, to: { path: '^src/(runtime|operations|demo|site)/|^src/platform/[^/]+/(application|infrastructure|ui)/' } },
    { name: 'application-no-concrete-adapters', severity: 'error', from: { path: '^src/platform/[^/]+/application/' }, to: { path: '^src/(runtime|site)/|^src/platform/[^/]+/(infrastructure|ui)/' } },
    { name: 'browser-no-server-imports', severity: 'error', from: { path: '^app/|^src/site/|^src/platform/[^/]+/ui/|^src/platform/form-controls/' }, to: { path: '^src/(runtime|operations)/|^src/platform/[^/]+/(infrastructure|application)/' } },
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } }
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsConfig: { fileName: 'tsconfig.json' } }
};
