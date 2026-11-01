"""PCM conversion, resampling and WORLD spectral morphing. No shell/audio device access."""
import base64
import io
import wave
from validation import number,integer,array,MAX_SECONDS


def unpack(data):
    import soundfile as sf
    samples,rate=sf.read(io.BytesIO(data),dtype='float64',always_2d=True)
    integer(rate,1,2147483647)
    return samples,rate


def pack(samples,rate,stereo=False):
    import numpy as np
    import soundfile as sf
    if samples.ndim==1:samples=samples[:,None]
    if stereo is True and samples.shape[1]==1:samples=np.repeat(samples,2,axis=1)
    if stereo is False and samples.shape[1]!=1:samples=samples.mean(axis=1,keepdims=True)
    result=io.BytesIO();sf.write(result,samples,rate,format='WAV',subtype='PCM_16')
    return result.getvalue()


def convert(data,rate,stereo):
    samples,old=unpack(data)
    if old!=rate:
        import soxr
        samples=soxr.resample(samples,old,rate)
    return pack(samples,rate,stereo)


def connect(data):
    import numpy as np
    rows=array(data,64)
    if not rows:raise ValueError('no waves')
    output=[];rate=None;channels=None;count=0
    for row in rows:
        if not isinstance(row,str):raise ValueError('invalid base64 wave')
        samples,sr=unpack(base64.b64decode(row,validate=True))
        if rate is None:rate=sr;channels=samples.shape[1]
        if sr!=rate or channels!=samples.shape[1]:raise ValueError('wave formats must match')
        count+=len(samples)
        if count/rate>MAX_SECONDS:raise ValueError('connected audio too long')
        output.append(samples)
    return pack(np.concatenate(output),rate,None)


def morph(base,target,ratio,rate,stereo):
    # WORLD follows the same spectral-envelope interpolation as VOICEVOX ENGINE:
    # keep base F0/aperiodicity and interpolate the two spectral envelopes.
    import numpy as np
    import pyworld as pw
    import soxr
    number(ratio,0,1)
    a,sr=unpack(base);b,other=unpack(target)
    if sr!=other:raise ValueError('incompatible morphing rates')
    a=np.ascontiguousarray(a.mean(axis=1),dtype=np.float64)
    b=np.ascontiguousarray(b.mean(axis=1),dtype=np.float64)
    f0,t=pw.harvest(a,sr,frame_period=1.0)
    spec=pw.cheaptrick(a,f0,t,sr);aper=pw.d4c(a,f0,t,sr)
    f1,t1=pw.harvest(b,sr,frame_period=1.0)
    target_spec=pw.cheaptrick(b,f1,t1,sr)
    # ENGINE extends/truncates to the base spectral frame shape.
    resized=np.zeros_like(spec);n=min(len(spec),len(target_spec));resized[:n]=target_spec[:n]
    result=pw.synthesize(f0,np.ascontiguousarray(spec*(1-ratio)+resized*ratio),aper,sr,1.0)
    if rate!=sr:result=soxr.resample(result,sr,rate)
    return pack(result,rate,stereo)
