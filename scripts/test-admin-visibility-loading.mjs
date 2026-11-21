import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('var BAKERZIN_PAGE_VISIBILITY_LOADING'),html.indexOf('function setNewsImageSource'));
assert(source.includes('function loadPageVisibility'));
const nodes={
 pageVisibilityMatrix:{className:'',textContent:'',innerHTML:'',children:[],appendChild(node){this.children.push(node);}},
 savePageVisibility:{disabled:true,textContent:'Simpan Pengaturan'}
};
const requests=[],messages=[];let inputs=[];
const context={
 BAKERZIN_STATE:{token:'test',pages:[],adminPageVisibility:{revision:'stale'}},
 bakerzinById:id=>nodes[id],
 document:{
  querySelectorAll(){return inputs;},
  createElement(tag){return {tag,style:{},addEventListener(type,fn){this[type]=fn;}};}
 },
 call(action,args,ok,fail){requests.push({action,args,ok,fail});},
 toast(message){messages.push(message);},esc:v=>String(v),escAttr:v=>String(v),labelFreq:v=>String(v)
};
vm.createContext(context);vm.runInContext(source,context);
context.loadPageVisibility();
assert.equal(nodes.savePageVisibility.disabled,true);
assert.equal(context.BAKERZIN_STATE.adminPageVisibility,null,'Loading clears stale revision.');
context.loadPageVisibility();
assert.equal(requests.length,1,'Tab re-entry must not launch overlapping reads.');
requests[0].fail('Simulated loading error');
assert.equal(nodes.savePageVisibility.disabled,true);
context.savePageVisibility();assert.equal(requests.length,1,'Failure must not submit an empty matrix.');
assert.equal(nodes.pageVisibilityMatrix.children.at(-1).textContent,'Muat Ulang Pengaturan');
nodes.pageVisibilityMatrix.children.at(-1).click();
assert.equal(requests.length,2,'Retry must reload.');
requests[1].ok({matrixSource:'APP_TASKS',subpages:[{id:'task-a',title:'Stock Card',type:'FORM',frequency:'DAILY'}],positions:[{position:'CASHIER',grade:'1'}],checked:{'task-a':{CASHIER:true}},revision:'r1'});
assert.equal(nodes.savePageVisibility.disabled,false);
assert.match(nodes.pageVisibilityMatrix.innerHTML,/data-visibility-task="task-a"/);
inputs=[{dataset:{visibilityTask:'task-a',visibilityPosition:'CASHIER'},checked:true,disabled:false}];
context.savePageVisibility();assert.equal(requests.length,3);
assert.equal(requests[2].args[1].revision,'r1');
assert.equal(requests[2].args[1].selected['task-a'][0],'CASHIER');
context.savePageVisibility();assert.equal(requests.length,3,'Duplicate Save must be ignored.');
requests[2].fail('Simulated save error');
assert.equal(nodes.savePageVisibility.disabled,false);
assert.equal(inputs[0].disabled,false);
context.loadPageVisibility();assert.equal(nodes.savePageVisibility.disabled,true);
requests[3].ok({matrixSource:'APP_TASKS',subpages:[],positions:[],revision:'empty'});
assert.equal(nodes.savePageVisibility.disabled,true,'No checkbox matrix means no Save.');
console.log('OK: settings loading, retry, ready-only Save and duplicate request guards.');
