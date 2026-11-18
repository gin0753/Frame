const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../apps/web/node_modules/typescript');
const dir = path.resolve(
  __dirname,
  '../../apps/web/src/components/visual/gallery-vendor',
);
const hash = (source) =>
  crypto.createHash('sha256').update(source).digest('hex');
test('pinned vendor source: exact GLSL templates, full license and no rendering dependencies', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'source-hashes.json'), 'utf8'),
  );
  assert.equal(Object.keys(manifest.files).length, 24);
  for (const [file, record] of Object.entries(manifest.files)) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.equal(
      hash(source),
      record.vendoredSha256,
      file + ': reviewed source hash',
    );
    if (!file.endsWith('.tsx')) continue;
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const shaders = [];
    function visit(node) {
      if (
        (ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateExpression(node)) &&
        /gl_Position|void main\(|#version 300/.test(node.getText(ast))
      )
        shaders.push(hash(node.getText(ast)));
      if (ts.isImportDeclaration(node))
        assert.match(node.moduleSpecifier.text, /^(react|\.\/.+\.css)$/);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.deepEqual(
      shaders,
      record.shaderHashes,
      file + ': upstream shader algorithm',
    );
  }
  const license = fs.readFileSync(path.join(dir, 'LICENSE.md'), 'utf8');
  assert.match(license, /Copyright \(c\) 2026 David Haz/);
  assert.match(license, /Commons Clause Restriction/);
  assert.equal(hash(license), manifest.licenseSha256);
});
