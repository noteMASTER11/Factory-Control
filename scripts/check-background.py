"""Measure the delivered, decoded Opus bed, including its actual loop boundary."""
from pathlib import Path
import json
import wave
import numpy as np

root=Path(__file__).resolve().parents[1]
temp=Path('D:/ChatGPT/Temp/FactorioMonitor')
with wave.open(str(temp/'background-decoded.wav'),'rb') as stream:
    rate=stream.getframerate()
    audio=np.frombuffer(stream.readframes(stream.getnframes()),dtype='<i2').astype(float)/32768
start=round(.75*rate)
bed=audio[start:round(29.75*rate)]
seam=np.concatenate((bed[-2*rate:],bed[:2*rate]))
with wave.open(str(temp/'background-decoded-seam.wav'),'wb') as stream:
    stream.setnchannels(1)
    stream.setsampwidth(2)
    stream.setframerate(rate)
    stream.writeframes(np.round(seam*32768).astype('<i2').tobytes())

def rms(values):
    return float(np.sqrt(np.mean(values**2)))

def db(value):
    return float(20*np.log10(max(value,1e-12)))

block=round(.1*rate)
levels=np.array([rms(bed[i:i+block]) for i in range(0,len(bed)-block+1,block)])
step=abs(bed[-1]-bed[0])
# Compare each seam-adjacent 100 ms spectrum with ordinary windows. Noise has
# random short-term variation; a seam should not create an exceptional band dip.
window=np.hanning(block)
frequencies=np.fft.rfftfreq(block,1/rate)
bands=[]
for low,high in [(0,200),(200,1000),(1000,5000),(5000,20000)]:
    mask=(frequencies>=low)&(frequencies<high)
    def power(values):
        return float(np.mean(np.abs(np.fft.rfft(values*window))[mask]**2))
    ordinary=np.array([power(bed[i:i+block]) for i in range(0,len(bed)-block+1,block)])
    edge=[power(bed[-block:]),power(bed[:block])]
    bands.append({'hz':[low,high],'ordinaryPowerP01P99':np.percentile(ordinary,[1,99]).tolist(),'seamBeforeAfterPower':edge})
report={'seconds':len(audio)/rate,'sampleRate':rate,'loopStartSeconds':.75,
    'loopEndSeconds':29.75,'loopBoundaryStep':float(step),
    'ordinaryStepP99':float(np.percentile(np.abs(np.diff(bed)),99)),
    'steady100msRmsDbP00P01P50P99P100':[db(v) for v in np.percentile(levels,[0,1,50,99,100])],
    'seam100msRmsDb':[db(rms(bed[-block:])),db(rms(bed[:block]))],
    'silent100msBlocks':int(np.count_nonzero(levels<1e-5)),
    'initial100msRmsDb':db(rms(audio[:block])),'bands':bands}
assert len(audio)==30*rate
assert levels.min()>levels.mean()*.6
assert step<report['ordinaryStepP99']
assert report['silent100msBlocks']==0
(root/'docs/evidence/background-decoded-analysis.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
