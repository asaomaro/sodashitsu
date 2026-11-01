"""Read-only official character assets and morphing permissions."""
import base64
import json
import mimetypes
import re
from pathlib import Path


class Resources:
    def __init__(self,directory):
        self.root=Path(directory).resolve();self.characters={}
        parent=self.root/'character_info'
        if parent.is_dir():
            for path in sorted(parent.iterdir()):
                match=re.search(r'([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$',path.name)
                if match and path.is_dir() and not path.is_symlink():
                    if len(self.characters)>=256:raise ValueError('too many character resources')
                    self.characters[match[1]]=path

    @staticmethod
    def read(path,limit=8*1024*1024):
        if path.is_symlink() or not path.is_file() or path.stat().st_size>limit:raise LookupError('resource unavailable')
        return path.read_bytes()

    def permission(self,uid):
        path=self.characters.get(uid)
        if path is None:return 'NOTHING'
        try:
            meta=json.loads(self.read(path/'metas.json',65536))
            value=meta.get('supported_features',{}).get('permitted_synthesis_morphing','ALL')
            return value if value in ('ALL','SELF_ONLY','NOTHING') else 'NOTHING'
        except (OSError,ValueError,LookupError):return 'NOTHING'

    def public_file(self,uid,name):
        if uid not in self.characters:raise LookupError('character not found')
        if not re.fullmatch(r'(?:portrait\.png|(?:icons|portraits)/[0-9]+\.png|voice_samples/[0-9]+_[0-9]{3}\.wav)',name):raise LookupError('resource not found')
        path=(self.characters[uid]/name).resolve()
        if not path.is_relative_to(self.root):raise LookupError('resource not found')
        return self.read(path),mimetypes.guess_type(name)[0] or 'application/octet-stream'

    def info(self,speaker,resource_format,origin):
        uid=speaker['speaker_uuid']
        if uid not in self.characters:raise LookupError('character resources not installed')
        path=self.characters[uid]
        def asset(name,optional=False):
            try:
                data,mime=self.public_file(uid,name)
                encoded=base64.b64encode(data).decode()
                if resource_format!='url':return encoded
                return f'{origin}/resources/{uid}/{name}' if origin is not None else f'data:{mime};base64,{encoded}'
            except LookupError:
                if optional:return None
                raise
        rows=[]
        for s in speaker['styles']:
            sid=s['id']
            samples=[]
            for index in range(1,4):
                value=asset(f'voice_samples/{sid}_{index:03}.wav',True)
                if value is not None:samples.append(value)
            rows.append({'id':sid,'icon':asset(f'icons/{sid}.png'),'portrait':asset(f'portraits/{sid}.png',True),'voice_samples':samples})
        return {'policy':self.read(path/'policy.md',2*1024*1024).decode('utf-8'),'portrait':asset('portrait.png'),'style_infos':rows}
