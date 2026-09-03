/* node test/steps.js — день по шагам, без браузера */
const fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.join(__dirname,'..');
const store={ 'momroute.v1': fs.readFileSync(path.join(root,'schedule.json'),'utf8') };
const ctx={console,structuredClone,localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v,removeItem:k=>delete store[k]},fetch:async()=>{throw 0}};
vm.createContext(ctx);
for(const f of ['js/state.js','js/travel.js','js/planner.js'])
  vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
vm.runInContext(`
const d = new Date(2026, 8, 3);
const p = planDay(d, {});
console.log('выездов:', p.trips.length, '| шагов:', daySteps(p, d).length);
for (const s of daySteps(p, d)) {
  const who = s.kidIds.map(i => (kid(i).icon||'') + kid(i).name).join(', ');
  console.log('  ' + m2hm(s.leave) + '  ' + (place(s.from).name+'').padEnd(16) + ' -> ' +
    (place(s.to).name+'').padEnd(16) + ' ' + m2hm(s.arrive) + '  ' +
    (s.kind==='home' ? 'домой' : s.kind==='drop' ? 'отвезти '+who : 'забрать '+who) +
    (s.teacher ? '  ['+s.teacher+']' : '') + '  ' + Math.round(stepMinutes(s,d)) + ' мин');
}
for (const at of [13*60, 15*60+30, 15*60+50, 16*60+20]) {
  const st = nextStep(p, at, d);
  console.log('в ' + m2hm(at) + ' ближайший шаг: ' +
    (st ? m2hm(st.leave)+' '+place(st.from).name+' -> '+place(st.to).name : 'нет'));
}
`, ctx);
