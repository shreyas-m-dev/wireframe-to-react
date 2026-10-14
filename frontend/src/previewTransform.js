export function stripGeneratedImports(rawCode) {
  return String(rawCode || '').replace(/^\s*import\s+.*?;\s*$/gm, '').replace(/export\s+default\s+/, '');
}

export function compileGeneratedPreview(rawCode, babel, React, Icon) {
  const stripped = stripGeneratedImports(rawCode);
  const transformed = babel.transform(stripped, { presets: ['react'] }).code;
  const factory = new Function('React', 'Icon', 'useState', `${transformed}\nreturn GeneratedComponent;`); // eslint-disable-line no-new-func
  return factory(React, Icon, React.useState);
}
