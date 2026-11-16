import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS_FFT_SIZE, analysisFrame, createAudioAnalysis, measureAudio, silentAnalysis } from '../src/audio-analysis.js';


test('analysis reports calibrated stereo RMS, peak, spectral centroid and phase without fabricating silence', () => {
  const frame = analysisFrame(), rate = 48000, bin = 16, hz = bin * rate / ANALYSIS_FFT_SIZE;
  for (let i = 0; i < frame.wave.length; i++) frame.wave[i] = frame.left[i] = frame.right[i] = .5 * Math.sin(i * bin * 2 * Math.PI / ANALYSIS_FFT_SIZE);
  frame.spectrum[bin] = -12;
  measureAudio(frame, rate);
  assert.ok(Math.abs(frame.rms - .5 / Math.sqrt(2)) < 1e-7); assert.equal(frame.peak, .5);
  assert.ok(Math.abs(frame.correlation - 1) < 1e-10); assert.equal(frame.peakHz, hz); assert.ok(Math.abs(frame.centroid - hz) < 1e-10);
  for (let i = 0; i < frame.right.length; i++) { frame.right[i] *= -1; frame.wave[i] = 0; }
  measureAudio(frame, rate); assert.equal(frame.correlation, -1);
  assert.ok(frame.rms > .35, 'out-of-phase stereo still has output energy');
  const silent = measureAudio(analysisFrame(), rate);
  for (const key of ['rms', 'peak', 'leftRms', 'rightRms', 'correlation', 'centroid', 'peakHz']) assert.equal(silent[key], 0);
});

test('read-only taps measure both Strudel orbits after effects and disconnect without touching the audible path', () => {
  const makeNode = () => ({ connections: new Set(), connect(target) { this.connections.add(target); }, disconnect(target) { if (target) this.connections.delete(target); else this.connections.clear(); } });
  const audible = makeNode(), outputs = [makeNode(), makeNode()]; outputs.forEach(node => node.connect(audible));
  const analysers = [], context = { sampleRate: 48000, currentTime: 1, state: 'running',
    createChannelSplitter: makeNode, createAnalyser() {
      const node = { ...makeNode(), calls: 0, getFloatFrequencyData(values) { this.calls++; values.fill(-Infinity); values[10] = -20; }, getFloatTimeDomainData(values) { values.fill(.25); } };
      analysers.push(node); return node;
    } };
  const orbits = [], api = { getSuperdoughAudioController: () => ({ getOrbit(id, channels) { orbits.push([id, channels]); return { output: outputs[id - 1] }; } }) };
  const analysis = createAudioAnalysis(api, context);
  assert.deepEqual(orbits, [[1, [0, 1]], [2, [0, 1]]]);
  let result = analysis.read(); assert.equal(result.active, true); assert.equal(result.voices[0].rms, .25);
  assert.equal(result.voices[1].peakHz, 10 * 48000 / ANALYSIS_FFT_SIZE);
  analysis.read(); assert.equal(analysers[0].calls, 1, 'reads reuse buffers until the next 30 Hz sample');
  context.currentTime += .1; analysis.read(); assert.equal(analysers[0].calls, 2);
  context.state = 'suspended'; assert.equal(analysis.read().active, false);
  analysis.dispose(); analysis.dispose();
  outputs.forEach(node => assert.deepEqual([...node.connections], [audible]));
  assert.equal(analysis.read().active, false);
});

