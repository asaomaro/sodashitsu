import {expect,it} from 'vitest';
import {PreviewHelperStartError,previewHelperErrorMessage} from './helperStartError.js';
it('preserves actionable stages while never forwarding arbitrary peer text',()=>{
 expect(new PreviewHelperStartError('probe',{code:'not_found',message:'secret'}).message).toContain('表示許可または接続先');
 expect(new PreviewHelperStartError('local-proof',Error('secret')).message).toContain('localhost確認ページ');
 expect(new PreviewHelperStartError('start',{code:'method_not_found'}).message).toContain('自動起動APIに対応していません');
 expect(previewHelperErrorMessage(Error('secret'))).not.toContain('secret');
});
