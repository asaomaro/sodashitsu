"""Managed local VOICEVOX CORE worker; no container or ENGINE subprocess."""
import argparse
import json
import os
import sys
sys.dont_write_bytecode=True
import threading


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--runtime-dir',required=True)
    parser.add_argument('--data-dir')
    parser.add_argument('--managed',action='store_true')
    parser.add_argument('--port',type=int,default=50022)
    parser.add_argument('--acceleration-mode',choices=('CPU','GPU','AUTO'),default='CPU')
    parser.add_argument('--expected-version')
    parser.add_argument('--threads',type=int,default=2)
    args=parser.parse_args()
    if not 0<=args.port<=65535 or not 1<=args.threads<=16:parser.error('invalid port/threads')
    from native_env import configure
    configure(args.runtime_dir)
    from runtime import Runtime
    from api import Server
    if args.managed:
        def parent_watch():
            sys.stdin.buffer.read();os._exit(0)
        threading.Thread(target=parent_watch,daemon=True).start()
    runtime=Runtime(args.runtime_dir,args.threads,args.data_dir,args.acceleration_mode)
    if args.expected_version and runtime.version!=args.expected_version:raise ValueError("installed CORE version does not match selection")
    with Server(('127.0.0.1',args.port),runtime) as server:
        print(json.dumps({'ready':True,'port':server.server_port,'version':runtime.version,'gpu':runtime.synth.is_gpu_mode}),flush=True)
        server.serve_forever()


if __name__=='__main__':main()
