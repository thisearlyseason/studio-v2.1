import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('real self-media controls render only for own player and preserve busy/status/delete accessibility',async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('../src/components/team/player-self-media-controls.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['react','react/jsx-runtime'],logLevel:'silent'}),module={exports:{}};
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const {PlayerSelfMediaControls}=module.exports,props={subject:{actorId:'adult',actorRole:'adult_player',isPlayer:true,member:{userId:'adult',playerId:'p'}},profile:{photoURL:'/api/media?path=players%2Fp%2Favatar%2Fx',photos:['/api/media?path=players%2Fp%2Fthumbnails%2Fy']},busy:false,status:'Photo saved',onUpload(){},onDelete(){}};
  const html=renderToStaticMarkup(React.createElement(PlayerSelfMediaControls,props));
  assert.match(html,/aria-label="Upload player avatar"/);assert.match(html,/aria-label="Upload gallery photo"/);assert.match(html,/Delete player avatar/);assert.match(html,/Delete gallery photo 1/);assert.match(html,/role="status"/);
  for(const subject of[{...props.subject,actorId:'other'},{...props.subject,isPlayer:false}])assert.equal(renderToStaticMarkup(React.createElement(PlayerSelfMediaControls,{...props,subject})), '');
  assert.match(renderToStaticMarkup(React.createElement(PlayerSelfMediaControls,{...props,busy:true})),/disabled=""/);
});
