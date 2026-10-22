"""Build a continuous bed using only the stationary noise inside the first 1.5 s."""
from pathlib import Path
import json
import wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
TEMP=Path('D:/ChatGPT/Temp/FactorioMonitor')
with wave.open(str(TEMP/'background-head.wav'),'rb') as stream:
    rate=stream.getframerate()
    source=np.frombuffer(stream.readframes(stream.getnframes()),dtype='<i2').astype(np.float64)/32768
assert rate==48000 and len(source)==72000
# Spectrogram: silence until ~0.15 s; bass swell starts near 1.2 s.
usable=source[round(.18*rate):round(1.15*rate)]
usable-=usable.mean()
intro=round(.75*rate)
period=round(29*rate)
guard=round(.25*rate)
grain_size=round(.65*rate)
hop=round(.25*rate)
window=np.hanning(grain_size)
bed=np.zeros(period)
weights=np.zeros(period)
rng=np.random.default_rng(22741)
starts=[]
for position in range(0,period,hop):
    start=int(rng.integers(0,len(usable)-grain_size+1))
    # Avoid aligning neighboring copies of exactly the same waveform.
    for _ in range(30):
        if not starts or abs(start-starts[-1]-hop)>round(.045*rate):
            break
        start=int(rng.integers(0,len(usable)-grain_size+1))
    starts.append(start)
    grain=usable[start:start+grain_size]
    indices=(position+np.arange(grain_size))%period
    bed[indices]+=grain*window
    weights[indices]+=window**2
bed/=np.sqrt(np.maximum(weights,1e-12))
# Slow circular envelope correction preserves the spectral color, without holes.
span=round(.30*rate)
power=bed**2
padded=np.concatenate((power[-span//2:],power,power[:span-span//2]))
integral=np.concatenate(([0.0],np.cumsum(padded)))
moving=(integral[span:]-integral[:-span])[:period]/span
correction=np.sqrt(np.mean(power)/np.maximum(moving,1e-12))
bed*=np.clip(correction,.55,1.8)
bed-=bed.mean()
gain=min(.12/max(1e-12,np.sqrt(np.mean(bed**2))),.75/max(1e-12,np.max(np.abs(bed))))
bed*=gain
# Fade is a one-time intro. LoopStart skips it on subsequent laps.
fade=np.sin(np.linspace(0,np.pi/2,intro))**2
result=np.concatenate((bed[-intro:]*fade,bed,bed[:guard]))
assert len(result)==rate*30

def save(path,values):
    with wave.open(str(path),'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(np.round(np.clip(values,-.999,.999)*32767).astype('<i2').tobytes())

save(TEMP/'background-loop.wav',result)
save(TEMP/'background-seam.wav',np.concatenate((bed[-2*rate:],bed[:2*rate])))
block=round(.02*rate)
rms=np.sqrt(np.mean(bed[:len(bed)//block*block].reshape(-1,block)**2,axis=1))
steps=np.abs(np.diff(bed))
report={
    'sourceExcerptSeconds':1.5,'usableSourceSeconds':[.18,1.15],
    'fileSeconds':30,'introFadeSeconds':.75,'loopStartSeconds':.75,'loopEndSeconds':29.75,
    'loopSeconds':29,'codecGuardSeconds':.25,'grainSeconds':.65,'hopSeconds':.25,
    'steadyRmsDb':float(20*np.log10(np.sqrt(np.mean(bed**2)))),
    'steady20msRmsDbPercentiles':np.percentile(20*np.log10(rms),[0,1,50,99,100]).tolist(),
    'boundaryStep':float(abs(bed[-1]-bed[0])),
    'interiorStepP99':float(np.percentile(steps,99)),
    'peak':float(np.max(np.abs(result)))
}
assert rms.min()>rms.mean()*.35,'An audible energy hole remains'
assert abs(bed[-1]-bed[0])<np.percentile(steps,99),'Loop boundary has an exceptional jump'
(ROOT/'docs/evidence/background-conversion.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
