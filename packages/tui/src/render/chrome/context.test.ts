import {expect,it} from 'vitest';
import {glyphFor} from './context.js';
it('makes only unknown child glyphs explicit and keeps parent/dots settings unchanged',()=>{
 expect(glyphFor('unknown',true,'subagent')).toBe('(?)');expect(glyphFor('unknown',true)).toBe('·');
 expect(glyphFor('unknown',false,'subagent')).toBe(glyphFor('unknown',false));
 expect(glyphFor('working',true,'subagent')).toBe(glyphFor('working',true));expect(glyphFor('idle',true,'subagent')).toBe(glyphFor('idle',true));expect(glyphFor(null,true,'subagent')).toBe('');
});
