'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('all platform installers use the exact supplied branded vector icon',()=>{
  const root=path.resolve(__dirname,'..');
  const pkg=require('../package.json');
  const icon='build/zt-multiapp-desktop.svg';
  for(const platform of ['win','mac','linux']){
    assert.equal(pkg.build[platform].icon,icon,platform+' should use branded icon');
  }
  const original=fs.readFileSync(path.join(root,icon),'utf8');
  assert.match(original,/<svg\b/);
  assert.match(original,/viewBox="0 0 270\.93333 270\.93333"/);
  assert.match(original,/width="1024"/);
  assert.match(original,/height="1024"/);
  assert.match(original,/fill:#e8a317/);
  assert.ok((original.match(/<path\b/g)||[]).length>5);
});
