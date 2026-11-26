import assert from 'node:assert/strict';
import { employeeOptions, hasEmployeePosition } from '../shared/employeePositions.ts';
const rows = [
 {id:1,name:'樂姐',phone:'0911',position:'行政、會計、業務',status:'在職'},
 {id:2,name:'林凱炫',position:'業務',status:'配合'},
 {id:3,name:'樂樂',position:'業務',status:'離職'},
 {id:4,name:'洪至佑',position:'業務、師傅技師',status:'在職'},
 {id:5,name:'風哥',position:'師傅技師、業務、老闆',status:'在職'},
 {id:6,name:'樂姐',phone:'0911',position:'業務',status:'離職'},
 {id:7,name:'行政',position:'行政',status:'在職'},
 {id:8,name:'樂姐',phone:'0911',position:'業務',status:'配合'},
];
assert.deepEqual(employeeOptions(rows,'業務').map(e=>e.id),[1,2,4,5]);
assert.deepEqual(employeeOptions(rows,'師傅技師').map(e=>e.id),[4,5]);
assert.equal(hasEmployeePosition('行政, 會計／業務'.replace('／','/'),'業務'),true);
assert.equal(hasEmployeePosition('非業務','業務'),false);
assert.equal(employeeOptions([{id:1,name:'同名',position:'業務',status:'在職'},{id:2,name:'同名',position:'業務',status:'在職'}],'業務').length,2);
console.log('PASS: multi-role, active/partner, inactive, dedup, exact matching');
