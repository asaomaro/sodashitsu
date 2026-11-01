"""Validated native input conversions for the official CORE dataclasses."""
import dataclasses
import math
import re

MAX_SECONDS = float("inf")
MAX_FRAMES = 2147483647


def camel(key):
    return re.sub(r"_([a-z])", lambda m: m[1].upper(), key)


def field_name(cls, name):
    return camel(name) if cls.__name__ in ("AudioQuery", "FrameAudioQuery") and name != "accent_phrases" else name


def encode(value):
    if dataclasses.is_dataclass(value):
        return {field_name(type(value), f.name): encode(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, list): return [encode(v) for v in value]
    if isinstance(value, dict): return {str(k): encode(v) for k, v in value.items()}
    return value


def decode(cls, value):
    obj(value)
    fields = {field_name(cls, f.name): f.name for f in dataclasses.fields(cls)}
    if set(value) - fields.keys(): raise ValueError("unknown field")
    return cls(**{fields[k]: v for k, v in value.items()})


def obj(value):
    if not isinstance(value, dict): raise ValueError("JSON object required")
    return value


def array(value, maximum=None):
    if not isinstance(value, list): raise ValueError("invalid array")
    return value


def number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high: raise ValueError("number out of range")
    return value


def integer(value, low=0, high=2147483647):
    if type(value) is not int: raise ValueError("integer required")
    return number(value, low, high)


def text(value, maximum=None, empty=False):
    if not isinstance(value, str) or (maximum is not None and len(value) > maximum) or (not value and not empty) or '\x00' in value: raise ValueError("invalid text")
    return value


def boolean(value):
    if type(value) is not bool: raise ValueError("boolean required")
    return value


def output(data):
    rate = integer(data.get("outputSamplingRate", 24000), 1, 2147483647)
    stereo = boolean(data.get("outputStereo", False))
    number(data.get("volumeScale", 1), 0, float("inf"))
    return rate, stereo


def phrases(value):
    from voicevox_core import Mora, AccentPhrase
    result, count = [], 0
    for row in array(value, 500):
        row = dict(obj(row)); moras = array(row.get("moras"))
        count += len(moras)
        converted = []
        for m in moras:
            obj(m);text(m.get("text"), 16, True);text(m.get("vowel"), 8)
            if m.get("consonant") is not None:text(m["consonant"], 8)
            number(m.get("vowel_length"), 0, float("inf"));number(m.get("consonant_length") or 0, 0, float("inf"));number(m.get("pitch"), 0, float("inf"))
            converted.append(decode(Mora, m))
        row["moras"] = converted
        integer(row.get("accent"), 0, max(1, len(converted)))
        boolean(row.get("is_interrogative", False))
        if row.get("pause_mora") is not None:
            m=obj(row["pause_mora"]);text(m.get("text"),16,True);text(m.get("vowel"),8)
            if m.get("consonant") is not None:text(m["consonant"],8)
            number(m.get("vowel_length"),0,float("inf"));number(m.get("consonant_length") or 0,0,float("inf"));number(m.get("pitch"),0,float("inf"))
            row["pause_mora"]=decode(Mora,m)
        result.append(decode(AccentPhrase,row))
    return result


def audio_query(value):
    from voicevox_core import AudioQuery
    data=dict(obj(value));output(data)
    speed=number(data.get("speedScale",1),0,float("inf"))
    if speed==0:raise ValueError("speed must be positive")
    pre=number(data.get("prePhonemeLength",.1),0,float("inf"));post=number(data.get("postPhonemeLength",.1),0,float("inf"))
    number(data.get("pitchScale",0),-float("inf"),float("inf"));number(data.get("intonationScale",1),-float("inf"),float("inf"))
    pause=data.pop("pauseLength",None);scale=number(data.pop("pauseLengthScale",1),0,float("inf"))
    if pause is not None:number(pause,0,float("inf"))
    rows=phrases(data.get("accent_phrases"))
    duration=pre+post
    for row in rows:
        for mora in row.moras:duration+=mora.vowel_length+(mora.consonant_length or 0)
        if row.pause_mora is not None:
            # ENGINE pause replacement is divided by speed with the remaining phonemes.
            row.pause_mora.vowel_length=(pause if pause is not None else row.pause_mora.vowel_length)*scale
            duration+=row.pause_mora.vowel_length+(row.pause_mora.consonant_length or 0)
    data["accent_phrases"]=rows
    if "kana" in data and data["kana"] is not None:text(data["kana"],empty=True)
    query=decode(AudioQuery,data)
    rate=query.output_sampling_rate;query.output_sampling_rate=24000
    try:
        query.validate()
        if hasattr(query,"frame_length") and query.frame_length(enable_interrogative_upspeak=True)>MAX_FRAMES:raise ValueError("audio too long for CORE")
    finally:query.output_sampling_rate=rate
    return query


def score(value):
    from voicevox_core import Score,Note
    data=obj(value);rows=[];total=0
    if set(data)!={"notes"}:raise ValueError("invalid score")
    for n in array(data["notes"],2000):
        n=dict(obj(n))
        if n.get("id") is not None:text(n["id"],128,True)
        total+=integer(n.get("frame_length"),0,MAX_FRAMES)
        text(n.get("lyric"),32,True)
        if n.get("key") is not None:integer(n["key"],0,127)
        rows.append(decode(Note,n))
    if not 0<total<=MAX_FRAMES:raise ValueError("invalid song frame count")
    return Score(rows)


def frame_query(value):
    from voicevox_core import FrameAudioQuery,FramePhoneme
    data=dict(obj(value));output(data)
    f0=array(data.get("f0"),MAX_FRAMES);volume=array(data.get("volume"),MAX_FRAMES)
    if not f0 or len(f0)!=len(volume):raise ValueError("inconsistent frames")
    for v in f0:number(v,0,float("inf"))
    for v in volume:number(v,-float("inf"),float("inf"))
    phonemes=[];frames=0
    for p in array(data.get("phonemes"),4000):
        obj(p);text(p.get("phoneme"),16);frames+=integer(p.get("frame_length"),0,MAX_FRAMES)
        if p.get("note_id") is not None:text(p["note_id"],128,True)
        phonemes.append(decode(FramePhoneme,p))
    if frames!=len(f0):raise ValueError("inconsistent phoneme frames")
    data["phonemes"]=phonemes
    return decode(FrameAudioQuery,data)
