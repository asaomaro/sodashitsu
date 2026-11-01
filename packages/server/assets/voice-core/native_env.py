"""Add only the selected installation's native library directories before loading CORE."""
import os,sys
from pathlib import Path
_handles=[]
def library_environment(directory):
 root=Path(directory).resolve();paths=set()
 for folder in ('onnxruntime','additional_libraries'):
  base=root/folder
  if base.exists():
   for path in base.rglob('*'):
    if path.is_file() and ('.so' in path.name or path.suffix.lower() in ('.dll','.dylib')):paths.add(str(path.parent))
 values=sorted(paths);env=dict(os.environ)
 key='PATH' if sys.platform=='win32' else 'DYLD_LIBRARY_PATH' if sys.platform=='darwin' else 'LD_LIBRARY_PATH'
 previous=env.get(key,'').split(os.pathsep)
 env[key]=os.pathsep.join(dict.fromkeys(values+[v for v in previous if v]))
 return env,values
def configure(directory):
 env,paths=library_environment(directory)
 if sys.platform=='win32':
  for path in paths:_handles.append(os.add_dll_directory(path))
  os.environ['PATH']=env['PATH']
 elif sys.platform!='darwin' and env.get('LD_LIBRARY_PATH','')!=os.environ.get('LD_LIBRARY_PATH',''):
  os.execve(sys.executable,[sys.executable,*sys.argv],env)
