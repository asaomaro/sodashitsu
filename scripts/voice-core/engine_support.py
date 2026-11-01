#!/usr/bin/env python3
"""Install official resources, song models and Python support for direct CORE parity."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
REQ=ROOT/'packages/server/assets/voice-core/requirements.txt'


def fetch(url,path,digest=None):
    req=urllib.request.Request(url,headers={'User-Agent':'Sodashitsu-CORE'})
    h=hashlib.sha256();size=0
    with urllib.request.urlopen(req,timeout=120) as response,open(path,'xb') as output:
        while data:=response.read(1024*1024):
            size+=len(data)
            if size>768*1024*1024:raise ValueError('download exceeds limit')
            output.write(data);h.update(data)
    if digest and digest!='sha256:'+h.hexdigest():raise ValueError('release digest mismatch')
    return h.hexdigest()


def resources(runtime,version):
    if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise ValueError('invalid resource version')
    target=runtime/'resources'
    if target.exists():
        manifest=target/'sodashitsu-resource.json'
        if not manifest.is_file() or json.loads(manifest.read_text())['version']!=version:raise ValueError('resource directory already exists; use a new runtime for a different resource version')
        return
    with tempfile.TemporaryDirectory(prefix='.resources-',dir=runtime) as temp:
        stage=Path(temp);archive=stage/'resources.tar.gz'
        digest=fetch(f'https://codeload.github.com/VOICEVOX/voicevox_resource/tar.gz/refs/tags/{version}',archive)
        dest=stage/'files';dest.mkdir();size=0;count=0
        with tarfile.open(archive,'r:gz') as tar:
            for entry in tar:
                parts=Path(entry.name).parts[1:]
                if not parts or any(p in ('.','..') for p in parts):continue
                if parts[0]=='voicevox_nemo':
                    if len(parts)>1 and parts[1]=='character_info':parts=parts[1:]
                    elif len(parts)>1:parts=('nemo-notices',)+parts[1:]
                if parts[0] not in ('character_info','nemo-notices','LICENSE','README.md'):continue
                if parts[-1].endswith('.png_large'):continue
                if not entry.isfile():continue
                size+=entry.size;count+=1
                if entry.size>16*1024*1024 or size>512*1024*1024 or count>10000:raise ValueError('resource archive exceeds limits')
                path=dest.joinpath(*parts);path.parent.mkdir(parents=True,exist_ok=True)
                stream=tar.extractfile(entry)
                if stream is None:raise ValueError('invalid resource archive')
                with stream,open(path,'xb') as output:shutil.copyfileobj(stream,output)
        (dest/'sodashitsu-resource.json').write_text(json.dumps({'version':version,'sha256':digest,'source':'VOICEVOX/voicevox_resource'})+'\n')
        os.rename(dest,target)


def song_models(runtime,version):
    if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise ValueError('invalid models version')
    req=urllib.request.Request(f'https://api.github.com/repos/VOICEVOX/voicevox_vvm/releases/tags/{version}',headers={'User-Agent':'Sodashitsu-CORE'})
    with urllib.request.urlopen(req,timeout=30) as response:release=json.load(response)
    target=runtime/'models/vvms';target.mkdir(parents=True,exist_ok=True)
    for asset in release['assets']:
        if not re.fullmatch(r'[ns]\d+\.vvm',asset['name']):continue
        path=target/asset['name']
        if path.exists():continue
        with tempfile.TemporaryDirectory(prefix='.song-',dir=target) as temp:
            stage=Path(temp)/asset['name'];fetch(asset['browser_download_url'],stage,asset.get('digest'))
            with zipfile.ZipFile(stage) as archive:
                for name in ('metas.json','manifest.json'):
                    info=archive.getinfo(name)
                    if info.file_size>2*1024*1024:raise ValueError('model metadata too large')
                    json.loads(archive.read(info))
            os.rename(stage,path)


def install(runtime,python_path,resources_version='0.26.0',models_version='0.17.0',include_song=True):
    runtime=Path(runtime).resolve();python_path=Path(python_path).resolve()
    if not runtime.is_dir():raise ValueError('CORE runtime must already be installed')
    subprocess.run([sys.executable,'-m','pip','install','--target',str(python_path),'--upgrade','-r',str(REQ)],check=True)
    resources(runtime,resources_version)
    if include_song:song_models(runtime,models_version)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--runtime-dir',required=True);p.add_argument('--python-path',required=True)
    p.add_argument('--resources-version',default='0.26.0');p.add_argument('--models-version',default='0.17.0')
    args=p.parse_args();install(args.runtime_dir,args.python_path,args.resources_version,args.models_version)
    print('Direct CORE engine support installed. Restart the managed voice worker to load the new models.')


if __name__=='__main__':main()
