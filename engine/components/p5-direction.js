// Opt-in Scene IR v1. Apply before any animation script captures the DOM.
// Geometry remains authored HTML. This layer owns direction and compiles to existing data-*.
(() => {
  const compositions = ['hero','editorial','product','diagram','data','code','interface','comparison','cinematic','spatial','process','metaphor'];
  const patterns = ['reveal','masked-reveal','draw','number','width','exit'];
  const transitions = ['cut','down','up','dots','radial','grow','shrink','meme','dissolve','defocus','whip'];
  const id = x => typeof x === 'string' && /^[A-Za-z][\w-]*$/.test(x);
  const text = x => typeof x === 'string' && x.trim().length > 0;
  const finite = Number.isFinite;
  function validate(doc, {words} = {}) {
    const errors = [], warnings = [];
    const add = (code, path, message) => errors.push({code,path,message});
    const warn = (code, path, message) => warnings.push({code,path,message});
    if (!doc || doc.version !== 1 || !['demo','narration'].includes(doc.timing) || !Array.isArray(doc.scenes) || !doc.scenes.length)
      return {ok:false,errors:[{code:'schema',path:'$',message:'Expected version:1, timing:demo|narration and nonempty scenes'}],warnings};
    const ids = new Set(); let end = 0, whip = 0;
    doc.scenes.forEach((s, i) => {
      const p = `scenes[${i}]`;
      if (!s || typeof s !== 'object') { add('schema',p,'Expected scene'); return; }
      if (!id(s.id) || ids.has(s.id)) add('id',p+'.id','Unique simple HTML id required'); ids.add(s.id);
      if (!finite(s.start) || !finite(s.end) || s.start < 0 || s.end <= s.start || s.start < end) add('scene-interval',p,'Invalid or overlapping scene interval');
      if (s.start > end + .034) add('scene-gap',p,'Timeline must be continuous'); end = s.end;
      for (const key of ['concept','visualMetaphor']) if (!text(s[key])) add('meaning',p+'.'+key,'Describe what the scene communicates');
      if (!compositions.includes(s.composition)) add('composition',p,'Unknown composition');
      if (i && doc.scenes[i-1]?.composition === s.composition) warn('composition-repeat',p,'Adjacent scenes use the same composition; explain or vary it');
      if (!id(s.focalPoint)) add('id',p+'.focalPoint','Expected focal element id');
      if (!transitions.includes(s.transition?.type) || !text(s.transition?.reason)) add('transition',p,'Existing transition and narrative reason required');
      if (s.transition?.type === 'whip' && ++whip > 1) warn('whip-frequency',p,'Use whip at most once');
      if (i > 1 && s.transition?.type === doc.scenes[i-1]?.transition?.type && s.transition?.type === doc.scenes[i-2]?.transition?.type) warn('transition-repeat',p,'Three identical transitions');
      for (const key of ['motion','camera']) if (!Array.isArray(s[key])) add('schema',p+'.'+key,'Expected array');
      const motion = Array.isArray(s.motion) ? s.motion : [], camera = Array.isArray(s.camera) ? s.camera : [];
      const assigned = new Set();
      motion.forEach((m,j) => {
        const q = `${p}.motion[${j}]`;
        if (!m || typeof m !== 'object') { add('schema',q,'Expected motion'); return; }
        if (!id(m.target)) add('id',q,'Simple target id required');
        if (!text(m.purpose)) add('purpose',q,'Motion needs a narrative purpose');
        if (!patterns.includes(m.pattern)) add('pattern',q,'Unsupported pattern; use existing runtime for custom graphics');
        if (!finite(m.startsAt) || !finite(m.duration) || m.duration <= 0 || m.startsAt < s.start || m.startsAt + m.duration > s.end + 1e-8) add('motion-interval',q,'Animation must finish inside its scene');
        const channel = ['reveal','masked-reveal'].includes(m.pattern) ? 'entry' : m.pattern;
        const assignment = `${m.target}:${channel}`;
        if (assigned.has(assignment)) add('motion-conflict',q,'One action per target/channel; use a custom seekable timeline for multiple actions'); assigned.add(assignment);
        if (['number','width'].includes(m.pattern) && (!finite(m.from) || !finite(m.to))) add('range',q,'Finite from and to required');
        if (m.pattern === 'width' && (m.from < 0 || m.to < 0 || m.from > 100 || m.to > 100)) add('range',q,'Width is a percentage between 0 and 100');
        if (doc.timing === 'narration') {
          if (!Number.isInteger(m.wordIndex) || m.wordIndex < 0) add('word-cue',q,'Narrated motion requires a wordIndex from words.json');
          else if (words !== undefined && (!Array.isArray(words?.[m.wordIndex]) || !finite(words[m.wordIndex][1]) || Math.abs(words[m.wordIndex][1]-m.startsAt) > .06)) add('word-sync',q,'Motion differs from referenced word onset by more than 60ms');
        }
      });
      let cameraEnd = s.start;
      camera.forEach((k,j) => {
        const q = `${p}.camera[${j}]`;
        if (!k || typeof k !== 'object') { add('schema',q,'Expected camera key'); return; }
        if (k.target !== 'c' && !id(k.target)) add('id',q,'Camera target must be c or a simple id');
        if (!text(k.purpose)) add('purpose',q,'Camera needs a narrative purpose');
        if (!['wide','medium','closeup','detail'].includes(k.shot)) add('shot',q,'Unknown shot');
        if (!finite(k.scale) || k.scale < 1 || k.scale > 1.2 || k.target === 'c' && k.scale !== 1) add('camera-scale',q,'Scale 1..1.2; wide return to c uses 1');
        if (!finite(k.startsAt) || !finite(k.duration) || k.duration < .5 || k.duration > 1.4 || k.startsAt < s.start || k.startsAt+k.duration > s.end) add('camera-interval',q,'Camera duration .5..1.4s and complete inside scene');
        if (k.startsAt < cameraEnd - 1e-8) add('camera-overlap',q,'Camera moves overlap or are out of order'); cameraEnd = k.startsAt+k.duration;
        const entry = motion.find(m=>m?.target===k.target && ['reveal','masked-reveal'].includes(m.pattern));
        if (entry && k.startsAt < entry.startsAt+entry.duration) warn('camera-entry-conflict',q,'Camera moves before target finishes entering');
      });
      if (s.cameraFit !== undefined && !['safe','legacy'].includes(s.cameraFit)) add('camera-fit',p,'cameraFit must be safe or legacy');
      if (s.camdim !== undefined && (!finite(s.camdim) || s.camdim < 0 || s.camdim > 1)) add('camera-dim',p,'camdim must be 0..1');
    });
    if (doc.timing === 'narration' && words === undefined) warn('word-source','$','Run pipeline with words.json to verify narration cues');
    return {ok:errors.length===0,errors,warnings};
  }
  function attributes(s) {
    return {'data-s':s.start,'data-e':s.end,'data-composition':s.composition,'data-focal':s.focalPoint,
      'data-tr':s.transition.type,'data-camdim':s.camdim ?? .45,'data-camfit':s.cameraFit ?? 'legacy',
      'data-camk':s.camera.map(k=>`${k.startsAt} ${k.target==='c'?'c':'#'+k.target} ${k.scale} ${k.duration}`).join('; ')};
  }
  function motionAttributes(m) {
    const end = +(m.startsAt+m.duration).toFixed(6);
    switch(m.pattern) {
      case 'reveal': case 'masked-reveal': return {'data-in':m.startsAt,'data-d':m.duration,'data-a':m.pattern==='reveal'?'rise':'stamp'};
      case 'draw':return {'data-draw':`${m.startsAt},${end}`};
      case 'number':return {'data-cnt':`${m.startsAt},${end},${m.from},${m.to}`};
      case 'width':return {'data-w':`${m.startsAt},${end},${m.from},${m.to}`};
      case 'exit':return {'data-exit':`${m.startsAt},${m.duration}`};
    }
  }
  // Transactional: resolve and validate ALL references before changing any DOM attributes.
  function bindings(doc, root) {
    const result = [];
    const find = name => { const matches = root.querySelectorAll(`[id="${name}"]`); if (matches.length !== 1) throw new Error(`P5Direction: expected one #${name}, found ${matches.length}`); return matches[0]; };
    for (const s of doc.scenes) {
      if(s.cameraFit==='safe' && !globalThis.P5Camera) throw new Error('P5Direction: load runtime/p5-camera.js for safe camera');
      const sec = find(s.id); if (sec.tagName !== 'SECTION') throw new Error(`P5Direction: #${s.id} must be a section`);
      const child = name => { const el=find(name); if (el===sec || !sec.contains(el)) throw new Error(`P5Direction: #${name} must belong to #${s.id}`); return el; };
      child(s.focalPoint);
      for (const k of s.camera) if(k.target!=='c') child(k.target);
      result.push([sec, attributes(s)]);
      for (const m of s.motion) {
        const el=child(m.target);
        if(m.pattern==='draw' && (el.tagName.toLowerCase()!=='path' || typeof el.getTotalLength!=='function')) throw new Error(`P5Direction: draw target #${m.target} must be an SVG path`);
        if(m.pattern==='exit' && (el.hasAttribute('data-float') || el.hasAttribute('data-shake'))) throw new Error(`P5Direction: exit conflicts with float/shake on #${m.target}`);
        result.push([el,motionAttributes(m)]);
      }
    }
    return result;
  }
  function assert(doc) {const r=validate(doc); if(!r.ok) throw new Error('P5Direction: '+r.errors.map(x=>`${x.path}: ${x.message}`).join('; '));return r;}
  function apply(doc, root=document) {
    assert(doc);
    if(typeof globalThis.p5cues==='function') throw new Error('P5Direction: apply before animation presets');
    const list=bindings(doc,root);
    for(const [el,attrs] of list) for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
    return doc;
  }
  function verify(doc,root=document) {
    const r=validate(doc); if(!r.ok)return r;
    try { for(const [el,attrs] of bindings(doc,root)) for(const [key,value] of Object.entries(attrs)) if(el.getAttribute(key)!==String(value)) r.errors.push({code:'direction-drift',path:`#${el.id}`,message:`${key} differs from Scene IR`}); }
    catch(e){r.errors.push({code:'direction-target',path:'DOM',message:e.message})}
    r.ok=r.errors.length===0;return r;
  }
  globalThis.P5Direction=Object.freeze({validate,apply,verify,compositions:Object.freeze(compositions),patterns:Object.freeze(patterns)});
})();
