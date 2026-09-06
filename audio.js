/**
 * 空間生成式空靈音景 (Generative Ethereal Soundscape)
 * 配合虹光流動與滑鼠漩渦，以 Web Audio API 生成動態雙耳低頻吟詠、晶瑩泛音與五度微光
 */

class AmbientAudioEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.filter = null;
    this.delayNode = null;
    this.delayGain = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.panner = null;
    this.lastChimeTime = 0;

    // 東方五聲羽調式與空靈泛音頻率 (Hz)
    this.scaleFrequencies = [
      130.81, // C3 (宮)
      146.83, // D3 (商)
      164.81, // E3 (角)
      196.00, // G3 (徵)
      220.00, // A3 (羽)
      261.63, // C4
      293.66, // D4
      329.63, // E4
      392.00, // G4
      440.00, // A4
      523.25, // C5
      659.25, // E5
      783.99, // G5
      880.00, // A5
      1046.50 // C6
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // 主音量與平滑淡入
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    // 空間立體聲聲相
    this.panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    // 低通濾波器（受滑鼠移動與漩渦動能調製）
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(380, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    // 回聲延遲反饋網絡 (Ethereal Delay)
    this.delayNode = this.ctx.createDelay();
    this.delayNode.delayTime.setValueAtTime(0.42, this.ctx.currentTime);

    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.setValueAtTime(0.45, this.ctx.currentTime);

    const delayDampFilter = this.ctx.createBiquadFilter();
    delayDampFilter.type = 'lowpass';
    delayDampFilter.frequency.setValueAtTime(1600, this.ctx.currentTime);

    // 連接反饋循環
    this.delayNode.connect(delayDampFilter);
    delayDampFilter.connect(this.delayGain);
    this.delayGain.connect(this.delayNode);
    this.delayGain.connect(this.masterGain);

    // 主管線連接
    if (this.panner) {
      this.filter.connect(this.panner);
      this.panner.connect(this.masterGain);
    } else {
      this.filter.connect(this.masterGain);
    }
    this.filter.connect(this.delayNode);
    this.masterGain.connect(this.ctx.destination);

    // 啟動溫暖底噪無人機 (Drone)
    this.startDrone();
  }

  startDrone() {
    // 基礎正弦音 (C3)
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2

    // 細微失諧的五度和弦 (G2)
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.setValueAtTime(98.15, this.ctx.currentTime); // G2

    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.22, this.ctx.currentTime);

    this.droneOsc1.connect(droneGain);
    this.droneOsc2.connect(droneGain);
    droneGain.connect(this.filter);

    this.droneOsc1.start();
    this.droneOsc2.start();
  }

  triggerChime(freq, velocity = 0.5) {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 晶瑩水靈泛音 (Sine + Overtones)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // 輕微音高滑移
    osc.frequency.exponentialRampToValueAtTime(freq * 1.002, now + 1.8);

    const attack = 0.04;
    const decay = 2.4;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.18, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc.connect(gain);
    gain.connect(this.filter);
    gain.connect(this.delayNode);

    osc.start(now);
    osc.stop(now + decay);
  }

  updateInteraction(mouseX, mouseY, velocity, vortexPower) {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 聲相隨滑鼠橫向移動
    if (this.panner) {
      const panVal = Math.max(-1, Math.min(1, (mouseX - 0.5) * 1.8));
      this.panner.pan.setTargetAtTime(panVal, now, 0.1);
    }

    // 濾波器明亮度隨速度與縱向位置調製
    const targetCutoff = 250 + (1.0 - mouseY) * 900 + velocity * 1200 + vortexPower * 500;
    this.filter.frequency.setTargetAtTime(Math.min(3600, Math.max(180, targetCutoff)), now, 0.12);

    // 隨漩渦擾動或高速度激發隨機空靈晶鈴
    if (velocity > 0.08 && now - this.lastChimeTime > 0.35) {
      const idx = Math.floor(Math.random() * this.scaleFrequencies.length);
      const freq = this.scaleFrequencies[idx];
      this.triggerChime(freq, Math.min(1.0, velocity * 1.5));
      this.lastChimeTime = now;
    }
  }

  toggle() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPlaying = !this.isPlaying;
    const now = this.ctx.currentTime;
    if (this.isPlaying) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.5, now + 1.2);
    } else {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
    }

    return this.isPlaying;
  }
}

export const soundEngine = new AmbientAudioEngine();
