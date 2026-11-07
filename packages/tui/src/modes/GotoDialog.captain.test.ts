import {expect,it} from "vitest";
import type {MachineStatus,Workspace} from "@sodashitsu/protocol";
import {gotoRows} from "./GotoDialog.js";
import {SessionModel} from "../model/SessionModel.js";
import {MachinesModel} from "../model/MachinesModel.js";
import {snapshot,workspace,tab,pane,leaf,split} from "../testing/fixtures.js";
const owner={paneId:'captain'} as NonNullable<Workspace['assistant']>;
it('uses normal tabs/layout/panes throughout a mixed captain and worker tab',()=>{
 const model=new SessionModel();model.applySnapshot(snapshot({workspaces:[workspace('w',['t'],{assistant:owner})],tabs:[tab('t','w',split('right',leaf('captain'),leaf('worker')))],panes:[pane('captain','t',{label:'hidden-captain'}),pane('worker','t',{label:'visible-worker'})],focus:null}),'client');
 const rows=gotoRows(model,'',null,new Set(['w']));expect(rows.filter(r=>r.target.kind==='pane').map(r=>r.target)).toEqual([{kind:'pane',paneId:'worker'}]);expect(rows.some(r=>r.label==='hidden-captain')).toBe(false);expect(model.panes.has('captain')).toBe(true);
});
it('omits the captain-only tab but preserves a separate worker tab in the same workspace',()=>{
 const model=new SessionModel();model.applySnapshot(snapshot({workspaces:[workspace('w',['captab','worktab'],{assistant:owner})],tabs:[tab('captab','w',leaf('captain')),tab('worktab','w',leaf('worker'))],panes:[pane('captain','captab'),pane('worker','worktab')],focus:null}),'client');
 const rows=gotoRows(model,'',null,new Set(['w']));expect(rows.filter(r=>r.target.kind==='tab').map(r=>r.target)).toEqual([{kind:'tab',tabId:'worktab'}]);expect(rows.filter(r=>r.target.kind==='pane').map(r=>r.target)).toEqual([{kind:'pane',paneId:'worker'}]);
});
it('uses normal remote summaries and retains an old peer without exact ownership proof',()=>{
 const machines=new MachinesModel();machines.machines=[{id:'remote',label:'remote',state:'online'} as MachineStatus];const ws=workspace('w',['t'],{assistant:owner});machines.applySummarySnapshot('remote',snapshot({workspaces:[ws],tabs:[tab('t','w',leaf('captain'))],panes:[pane('captain','t')],focus:null}));const model=new SessionModel();expect(gotoRows(model,'',null,new Set(),machines).filter(r=>r.target.kind==='remote')).toEqual([]);
 const old={...ws};delete old.assistant;machines.applySummaryEvent('remote',{event:'workspace.updated',data:{workspace:old}});expect(gotoRows(model,'',null,new Set(),machines).filter(r=>r.target.kind==='remote')).toHaveLength(1);
});
