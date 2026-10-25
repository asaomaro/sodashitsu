/** Explicit trusted native helper + real product canvas. No input or screen artifacts. */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const options={width:'1280',fps:'30',frames:'180',bitrate:'2500','ack-delay-ms':'0'},args=process.argv.slice(2);
if(!process.env.SODA_DESKTOP_BENCH_COMMAND)throw Error('Set SODA_DESKTOP_BENCH_COMMAND to the trusted native Windows helper command JSON array.');
for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!Object.hasOwn(options,key)||!/^\d+$/.test(args[i+1]??''))throw Error('Use --width 640|1280|1920 --fps 5|10|20|30 --frames 30..900 --bitrate 128..12000 --ack-delay-ms 0..2000');options[key]=args[i+1];}
const child=spawn('pnpm',['--filter','@sodashitsu/e2e','exec','playwright','test','remote-desktop-native-video.spec.ts','-g','native hardware video performance'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),shell:false,stdio:'inherit',env:{...process.env,SODA_DESKTOP_NATIVE_BENCH:'1',SODA_DESKTOP_BENCH_WIDTH:options.width,SODA_DESKTOP_BENCH_FPS:options.fps,SODA_DESKTOP_BENCH_FRAMES:options.frames,SODA_DESKTOP_BENCH_BITRATE:options.bitrate,SODA_DESKTOP_BENCH_ACK_DELAY_MS:options['ack-delay-ms']}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
