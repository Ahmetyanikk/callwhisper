class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / 16000;
    this._phase = 0;
    this._sum = 0;
    this._count = 0;
    this._out = [];
    console.log(`[PCMProcessor] sampleRate=${sampleRate} ratio=${this._ratio.toFixed(4)}`);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._sum += channel[i];
      this._count++;
      this._phase++;

      if (this._phase >= this._ratio) {
        this._out.push(this._sum / this._count);
        this._sum = 0;
        this._count = 0;
        this._phase -= this._ratio;
      }
    }

    if (this._out.length >= 1600) {
      const chunk = this._out.splice(0, 1600);
      const buf = new Int16Array(1600);
      for (let i = 0; i < 1600; i++) {
        buf[i] = Math.max(-32768, Math.min(32767, Math.round(chunk[i] * 32767)));
      }
      this.port.postMessage(buf.buffer, [buf.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
