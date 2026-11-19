'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=require('../package.json');
const lock=require('../package-lock.json');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/final-v1.0.0.yml'),'utf8');

test('final package and npm lockfile both use version 1.0.0',()=>{
  assert.equal(pkg.version,'1.0.0');
  assert.equal(lock.version,'1.0.0');
  assert.equal(lock.packages[''].version,'1.0.0');
});

test('all packages use the supplied ZT application icon',()=>{
  for(const system of ['win','mac','linux']){
    assert.equal(pkg.build[system].icon,'build/zt-multiapp-desktop.svg');
  }
  assert.ok(fs.statSync(path.join(root,'build/zt-multiapp-desktop.svg')).size>1000);
});

test('release workflow stages and verifies six packages before deleting old releases',()=>{
  assert.match(workflow,/gh release create "\$STAGE" --draft/);
  assert.match(workflow,/sha256sum --check "SHA256-\$os\.txt"/);
  assert.match(workflow,/\[ "\$\{#ASSETS\[@\]\}" -eq 2 \]/);
  assert.match(workflow,/\[ "\$\(wc -l < SHA256SUMS\.txt\)" -eq 6 \]/);
  const verify=workflow.indexOf('sha256sum --check');
  const replace=workflow.indexOf('gh release delete "$FINAL"');
  const removeOld=workflow.indexOf('gh release delete v1.1.0');
  assert.ok(verify>=0 && replace>verify && removeOld>replace);
  assert.match(workflow,/--target "\$SOURCE_SHA" --latest/);
  assert.match(workflow,/gh release delete "\$STAGING_TAG" --yes --cleanup-tag/);
});

test('the retired release publishing workflows are absent',()=>{
  assert.equal(fs.existsSync(path.join(root,'.github/workflows/release.yml')),false);
  assert.equal(fs.existsSync(path.join(root,'.github/workflows/finalize-v1.1.0.yml')),false);
});
