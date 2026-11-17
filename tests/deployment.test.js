import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultSetup as defaults, validateSetup as validate } from '../src/settings.js';
import { attachPlayerBridge } from '../src/player-bridge.js';
import { validateManifest, siteEntry, resolveEntry } from '../scripts/manifest.js';
import { withSocialMetadata } from '../scripts/social-metadata.js';

async function client(production) {
  const url = new URL('../src/persistence.js', import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replace(/from\s+(['"])(\.\/[^'"]+)\1/g, (_all, _quote, relative) => `from ${JSON.stringify(new URL(relative, url).href)}`)
    .replaceAll('import.meta.env?.PROD', String(production))
    .replaceAll('import.meta.env.PROD', String(production))
    .replaceAll('import.meta.env.DEV', String(!production))
    .replaceAll('import.meta.env.BASE_URL', "'./'");
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${production}`)).requestSetup;
}

test('production client loads the published preset, saves locally, migrates old saves and never calls the dev API', async () => {
  const previous = Object.fromEntries(['fetch','localStorage','location','__BUNDLED_SETUP__'].map(key => [key, globalThis[key]]));
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.location = { href: 'https://larsberg.github.io/2026-codevember-11-rust/?embed=1', origin: 'https://larsberg.github.io', pathname: '/2026-codevember-11-rust/' };
  const baseline = defaults(); globalThis.__BUNDLED_SETUP__ = structuredClone(baseline);
  globalThis.fetch = () => assert.fail('Production must not request /api/setup.');
  try {
    const request = await client(true);
    assert.deepEqual(await request(), baseline);
    const edited = defaults(); edited.camera.yaw = 28;
    await request('PUT', edited);
    assert.deepEqual(await request(), validate(edited));
    assert.deepEqual(globalThis.__BUNDLED_SETUP__, baseline);
    assert.equal(values.size, 1);
    const key = [...values.keys()][0];
    assert.ok(key.includes('/2026-codevember-11-rust/'));
    const old = structuredClone(edited); old.version = Math.max(1, old.version - 1); old.shape.construction=true; old.drafting={ink:true,guides:true,paper:true};
    values.set(key, JSON.stringify(old));
    assert.deepEqual(await request(), validate(old));
    values.set(key, 'invalid json');
    assert.deepEqual(await request(), baseline);
    globalThis.localStorage = undefined;
    assert.deepEqual(await request(), baseline);
    await assert.rejects(request('PUT', edited), /storage|browser|Saving/i);
    // Local API errors must remain errors, rather than switching to device saves.
    const devRequest = await client(false);
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    await assert.rejects(devRequest());
  } finally {
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('gallery bridge accepts only the declared parent and returns setup results', async () => {
  const oldWindow=globalThis.window, oldLocation=globalThis.location;
  const sent=[], listeners=new Map(), parent={postMessage:(value,origin)=>sent.push({value,origin})};
  globalThis.location={origin:'https://larsberg.github.io',search:'?embed=1&parentOrigin=https%3A%2F%2Fwww.larsberg.net'};
  globalThis.window={parent,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};
  let playing=true, saved=0;
  const api={getState:()=>({playing}),play:()=>{playing=true;},pause:()=>{playing=false;},reset:()=>{},getSetup:()=>({camera:28}),setup:value=>value,saveSetup:async()=>{saved++;return {camera:28};},loadSetup:async()=>({camera:28})};
  try {
    const detach=attachPlayerBridge(api), receive=listeners.get('message');
    const command=(origin,source,command)=>receive({origin,source,data:{channel:'sketch-player:v1',command,requestId:'test'}});
    await command('https://untrusted.example',parent,'pause'); assert.equal(playing,true);
    await command('https://www.larsberg.net',{},'pause'); assert.equal(playing,true);
    await command('https://www.larsberg.net',parent,'pause'); assert.equal(playing,false);
    await command('https://www.larsberg.net',parent,'save-setup'); assert.equal(saved,1);
    assert.deepEqual(sent.at(-1).value.setup,{camera:28});
    assert.ok(sent.every(message=>message.origin==='https://www.larsberg.net'));
    detach(); assert.equal(listeners.has('message'),false);
  } finally {globalThis.window=oldWindow;globalThis.location=oldLocation;}
});

test('release metadata points to this repository and keeps the unpublished gallery entry hidden', async () => {
  const manifest=validateManifest(JSON.parse(await readFile(new URL('../public/sketch.json',import.meta.url),'utf8')));
  assert.equal(manifest.id,'2026-codevember-11-rust');
  assert.equal(manifest.repository,'https://github.com/larsberg/2026-codevember-11-rust');
  const entry=siteEntry(manifest); assert.equal(entry.hidden,true);
  assert.equal(entry.runtimeUrl,manifest.url+'?embed=1');
  assert.equal(resolveEntry(manifest,manifest.url+'sketch.json').thumbnail.src,new URL(manifest.thumbnail.src, manifest.url).href);
  const html=withSocialMetadata('<html><head><title>old</title></head><body></body></html>',manifest);
  assert.equal((html.match(/<title>/g)||[]).length,1);
  assert.ok(html.includes(new URL(manifest.thumbnail.src, manifest.url).href));
});
