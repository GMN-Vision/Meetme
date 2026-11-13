// Mono PCM16 in 50 ms packets, using the actual AudioContext sample rate.
// Shorter packets cut the delay between speech and the first transcript.
class CaptionAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(Math.round(sampleRate / 20));
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const value of channel) {
      const sample = Math.max(-1, Math.min(1, value));
      this.samples[this.offset++] = sample < 0 ? sample * 32768 : sample * 32767;
      if (this.offset === this.samples.length) {
        this.port.postMessage(this.samples.buffer, [this.samples.buffer]);
        this.samples = new Int16Array(Math.round(sampleRate / 20));
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('caption-audio', CaptionAudioProcessor);
