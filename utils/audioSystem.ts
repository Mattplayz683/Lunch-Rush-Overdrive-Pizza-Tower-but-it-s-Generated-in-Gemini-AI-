
class AudioSystem {
  ctx: AudioContext | null = null;
  isPlaying: boolean = false;
  currentTrack: 'level' | 'escape' | 'lap2' | 'lap3' | 'none' = 'none';
  
  // Scheduling
  nextNoteTime: number = 0;
  timerID: number | null = null;
  beatCount: number = 0;
  tempo: number = 120;

  // Mach Loop State
  machOsc: OscillatorNode | null = null;
  machGain: GainNode | null = null;
  machNoise: AudioBufferSourceNode | null = null;
  machNoiseGain: GainNode | null = null;
  currentMachLevel: number = 0;

  constructor() {
    // Lazy init to comply with browser autoplay policies until interaction
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

 async resume() {
  if (this.ctx && this.ctx.state === 'suspended') {
     await this.ctx.resume();
   }
}

 updateMachLoop(level: number) {
  if (!this.ctx) return;
    
    // Start if not playing
    if (!this.machOsc) {
        const t = this.ctx.currentTime;
        
        // 1. Noise Layer (Wind)
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        this.machNoise = this.ctx.createBufferSource();
        this.machNoise.buffer = buffer;
        this.machNoise.loop = true;
        
        // Filter noise to sound like wind (Lowpass)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, t);

        this.machNoiseGain = this.ctx.createGain();
        this.machNoiseGain.gain.setValueAtTime(0, t); // Start silent

        this.machNoise.connect(filter);
        filter.connect(this.machNoiseGain);
        this.machNoiseGain.connect(this.ctx.destination);
        this.machNoise.start(t);

        // 2. Tonal Layer (Engine/Speed)
        this.machOsc = this.ctx.createOscillator();
        this.machOsc.type = 'sawtooth';
        this.machOsc.frequency.setValueAtTime(100, t);
        
        this.machGain = this.ctx.createGain();
        this.machGain.gain.setValueAtTime(0, t); // Start silent

        this.machOsc.connect(this.machGain);
        this.machGain.connect(this.ctx.destination);
        this.machOsc.start(t);
    }

    if (this.currentMachLevel === level) return;
    this.currentMachLevel = level;

    const t = this.ctx.currentTime;
    const rampTime = 0.1;

    if (this.machNoiseGain && this.machGain && this.machOsc) {
        if (level === 1) {
            this.machNoiseGain.gain.linearRampToValueAtTime(0.1, t + rampTime);
            this.machGain.gain.linearRampToValueAtTime(0.05, t + rampTime);
            this.machOsc.frequency.exponentialRampToValueAtTime(150, t + rampTime);
        } else if (level === 2) {
            this.machNoiseGain.gain.linearRampToValueAtTime(0.2, t + rampTime);
            this.machGain.gain.linearRampToValueAtTime(0.1, t + rampTime);
            this.machOsc.frequency.exponentialRampToValueAtTime(300, t + rampTime);
        } else if (level >= 3) {
            this.machNoiseGain.gain.linearRampToValueAtTime(0.4, t + rampTime);
            this.machGain.gain.linearRampToValueAtTime(0.2, t + rampTime);
            this.machOsc.frequency.exponentialRampToValueAtTime(600, t + rampTime);
        }
    }
  }

  stopMachLoop() {
      if (this.machOsc) {
          const t = this.ctx?.currentTime || 0;
          const rampTime = 0.1;
          
          if (this.machGain) {
              this.machGain.gain.cancelScheduledValues(t);
              this.machGain.gain.setValueAtTime(this.machGain.gain.value, t);
              this.machGain.gain.linearRampToValueAtTime(0, t + rampTime);
          }
          if (this.machNoiseGain) {
              this.machNoiseGain.gain.cancelScheduledValues(t);
              this.machNoiseGain.gain.setValueAtTime(this.machNoiseGain.gain.value, t);
              this.machNoiseGain.gain.linearRampToValueAtTime(0, t + rampTime);
          }
          
          this.currentMachLevel = 0;

          // Actually stop and disconnect after fade out
          setTimeout(() => {
              if (this.currentMachLevel === 0) { // Check if we haven't restarted
                  if (this.machOsc) { try { this.machOsc.stop(); this.machOsc.disconnect(); } catch(e){} this.machOsc = null; }
                  if (this.machGain) { this.machGain.disconnect(); this.machGain = null; }
                  if (this.machNoise) { try { this.machNoise.stop(); this.machNoise.disconnect(); } catch(e){} this.machNoise = null; }
                  if (this.machNoiseGain) { this.machNoiseGain.disconnect(); this.machNoiseGain = null; }
              }
          }, rampTime * 1000 + 50);
      }
  }

  playTheme(track: 'level' | 'escape' | 'lap2' | 'lap3') {
    if (this.currentTrack === track && this.isPlaying) return;

    this.init();
    this.resume();
    this.currentTrack = track;
    this.isPlaying = true;
    this.beatCount = 0;
    
    // Set tempo based on track
    if (track === 'level') this.tempo = 110;
    else if (track === 'escape') this.tempo = 150;
    else if (track === 'lap2') this.tempo = 180;
    else if (track === 'lap3') this.tempo = 210; // Extreme speed

    // Reset scheduler
    if (this.ctx) {
      this.nextNoteTime = this.ctx.currentTime + 0.1;
    }
    
    if (this.timerID === null) {
      this.timerID = window.setInterval(() => this.scheduler(), 25);
    }
  }

  stop() {
    this.isPlaying = false;
    this.currentTrack = 'none';
    if (this.timerID !== null) {
      clearInterval(this.timerID);
      this.timerID = null;
    }
  }

  scheduler() {
    if (!this.ctx) return;
    // Lookahead
    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      this.scheduleNote(this.beatCount, this.nextNoteTime);
      this.nextStep();
    }
  }

  nextStep() {
    const secondsPerBeat = 60.0 / this.tempo;
    this.nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
    this.beatCount++;
  }

  scheduleNote(beatIndex: number, time: number) {
    if (!this.ctx) return;
    
    // 16 steps per measure
    const step = beatIndex % 16;
    const measure = Math.floor(beatIndex / 16) % 4; // 4 bar loops

    if (this.currentTrack === 'level') {
      this.playLevelMusic(step, measure, time);
    } else if (this.currentTrack === 'escape') {
      this.playEscapeMusic(step, measure, time);
    } else if (this.currentTrack === 'lap2') {
      this.playLap2Music(step, measure, time);
    } else if (this.currentTrack === 'lap3') {
      this.playLap3Music(step, measure, time);
    }
  }

  // --- SOUND EFFECTS ---

  playSFX(type: 'jump' | 'land' | 'dash' | 'break' | 'collect' | 'kill' | 'hurt' | 'taunt' | 'secret' | 'escape' | 'superjump' | 'bump') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // Inline Helpers for specific SFX needs
    const playTone = (wave: OscillatorType, freqStart: number, freqEnd: number, duration: number, vol: number) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freqStart, t);
        if (freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
        }
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(t);
        osc.stop(t + duration);
    };

    const playNoiseBurst = (duration: number, vol: number, filterFreq: number = 1000, filterType: BiquadFilterType = 'lowpass') => {
        const bufferSize = this.ctx!.sampleRate * duration;
        const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const src = this.ctx!.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx!.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(filterFreq, t);
        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx!.destination);
        src.start(t);
    };

    switch (type) {
      case 'jump': 
        playTone('square', 150, 400, 0.15, 0.1); // Classic springy jump
        break;
      case 'land': 
        playNoiseBurst(0.1, 0.3, 300, 'lowpass'); // Heavy thud
        break;
      case 'dash': 
        playNoiseBurst(0.25, 0.2, 2000, 'highpass'); // Air slice
        playTone('sawtooth', 800, 300, 0.2, 0.1); 
        break;
      case 'break': 
        playNoiseBurst(0.2, 0.4, 800, 'lowpass'); // Crunch
        playTone('square', 80, 40, 0.15, 0.3);
        break;
      case 'collect': 
        // Ding!
        playTone('sine', 1046, 1046, 0.1, 0.1); // C6
        setTimeout(() => { if(this.ctx) {
            const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(1318, this.ctx.currentTime); // E6
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + 0.15);
        }}, 50);
        break;
      case 'kill': 
        playTone('triangle', 200, 50, 0.1, 0.4); // Punch
        playNoiseBurst(0.1, 0.3, 1000, 'bandpass'); // Smack
        break;
      case 'hurt': 
        playTone('sawtooth', 400, 100, 0.4, 0.3); // Power down
        playTone('sawtooth', 420, 110, 0.4, 0.3); // Discordant
        break;
      case 'taunt': 
        playTone('sine', 800, 1200, 0.15, 0.2); // Slide up
        setTimeout(() => { if(this.ctx) {
             const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
             osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
             osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
             gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
             gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
             osc.connect(gain); gain.connect(this.ctx.destination);
             osc.start(); osc.stop(this.ctx.currentTime + 0.1);
        }}, 150);
        break;
      case 'secret': 
        // Sparkle Arpeggio
        [0, 80, 160, 240, 320].forEach((d, i) => {
             setTimeout(() => { if(this.ctx) {
                 const freq = 440 + (i * 110);
                 const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                 osc.type = 'sine'; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                 gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
                 gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
                 osc.connect(gain); gain.connect(this.ctx.destination);
                 osc.start(); osc.stop(this.ctx.currentTime + 0.3);
             }}, d);
        });
        break;
      case 'escape': 
        playTone('sawtooth', 700, 1000, 0.6, 0.2); // Siren
        break;
      case 'superjump': 
        playNoiseBurst(0.6, 0.2, 400, 'bandpass'); // Jet engine
        playTone('square', 200, 1200, 0.6, 0.15); // Charge
        break;
      case 'bump': 
        playTone('square', 100, 80, 0.1, 0.2); // Bonk
        break;
    }
  }

  // --- INSTRUMENTS ---

  playOsc(freq: number, time: number, duration: number, type: OscillatorType, vol: number, decay: boolean = true) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    
    gain.gain.setValueAtTime(vol, time);
    if (decay) {
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
    } else {
      gain.gain.setValueAtTime(vol, time + duration - 0.05);
      gain.gain.linearRampToValueAtTime(0, time + duration);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + duration);
  }

  playNoise(time: number, duration: number, vol: number) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
    
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(time);
  }

  // --- THEMES ---

  playLevelMusic(step: number, measure: number, time: number) {
    // Funky Bass (Square) - Pentatonic E minor ish
    const bassRhythm = [1, 0, 1, 0,  1, 0, 0, 1,  0, 1, 1, 0,  1, 0, 1, 0];
    const bassNotes = [82.41, 0, 82.41, 0,  98.00, 0, 0, 82.41,  0, 110.00, 123.47, 0,  98.00, 0, 82.41, 0]; // E2, G2, A2, B2
    
    if (bassRhythm[step]) {
       // Variation every 4th bar
       let note = bassNotes[step];
       if (measure === 3 && step > 8) note = 73.42; // D2 drop
       this.playOsc(note, time, 0.2, 'square', 0.15);
    }

    // Hi-hats (Noise)
    if (step % 4 === 2) this.playNoise(time, 0.05, 0.05); // Closed hat
    if (step % 8 === 0) this.playOsc(150, time, 0.1, 'triangle', 0.1); // Kick ish

    // Melody (Sawtooth)
    if (measure % 2 === 0) {
      if (step === 0) this.playOsc(329.63, time, 0.1, 'sawtooth', 0.05); // E4
      if (step === 3) this.playOsc(392.00, time, 0.1, 'sawtooth', 0.05); // G4
      if (step === 6) this.playOsc(440.00, time, 0.1, 'sawtooth', 0.05); // A4
    } else {
      if (step === 0) this.playOsc(392.00, time, 0.1, 'sawtooth', 0.05); // G4
      if (step === 2) this.playOsc(329.63, time, 0.1, 'sawtooth', 0.05); // E4
      if (step === 4) this.playOsc(293.66, time, 0.1, 'sawtooth', 0.05); // D4
    }
  }

  playEscapeMusic(step: number, measure: number, time: number) {
    // Urgent Siren (High Sine)
    if (step % 8 === 0) {
      // Alternating high pitch alarm
      const freq = (Math.floor(this.beatCount / 8) % 2 === 0) ? 880 : 622.25; // A5 vs D#5 (Tritone alarm)
      this.playOsc(freq, time, 0.3, 'sine', 0.1, false);
    }

    // Fast Bass (Sawtooth) - Chromatic ascending
    const root = 110.00; // A2
    const offset = measure * 2; // Ascend pitch every bar
    if (step % 2 === 0) {
      this.playOsc(root + offset, time, 0.1, 'sawtooth', 0.15);
    }

    // Snare/Kick
    if (step % 4 === 0) this.playOsc(100, time, 0.1, 'square', 0.1); // Kick
    if (step % 4 === 2) this.playNoise(time, 0.1, 0.1); // Snare
  }

  playLap2Music(step: number, measure: number, time: number) {
    // Chaos Arpeggios
    // Randomize notes within a scale slightly or simple crazy patterns
    const scale = [440, 466.16, 493.88, 523.25, 587.33, 622.25]; // Diminished-ish
    const noteIdx = (step * 3 + measure) % scale.length;
    const freq = scale[noteIdx] * (step % 2 === 0 ? 1 : 2); // Octave jumps

    this.playOsc(freq, time, 0.08, 'square', 0.08);

    // Constant Drumming
    if (step % 2 === 0) this.playOsc(150, time, 0.05, 'triangle', 0.15);
    if (step % 2 === 1) this.playNoise(time, 0.05, 0.1);
    
    // Periodic Scream/Sweep
    if (step === 0 && measure === 0) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(800, time);
      osc.frequency.exponentialRampToValueAtTime(100, time + 0.5);
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.5);
    }
  }

  playLap3Music(step: number, measure: number, time: number) {
    // LAP 3: PURE CHAOS
    // Very fast, dissonant, heavy drums
    
    // Distorted Bass
    if (step % 2 === 0) {
        // Tritone interval bass
        const freq = (measure % 2 === 0) ? 55 : 77.78; // A1 vs D#2
        this.playOsc(freq, time, 0.1, 'sawtooth', 0.3);
    }

    // Drums (Machine Gun)
    this.playNoise(time, 0.05, 0.15); // Constant snare/hi-hat
    if (step % 4 === 0) this.playOsc(100, time, 0.1, 'square', 0.2); // Kick

    // Lead (Siren-like arpeggio)
    const arp = [880, 1174.66, 880, 1244.51];
    const note = arp[step % 4];
    this.playOsc(note, time, 0.1, 'sawtooth', 0.1);
  }
}

export const audioSystem = new AudioSystem();
    