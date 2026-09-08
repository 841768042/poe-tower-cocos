export type FeedbackCue = 'LootDrop' | 'LootCollect' | 'WaveLootSummary' | 'SpecialMonster' | 'Equip' | 'Unequip';

/** Browser feedback synth matching the Godot tone recipes and four-voice bound. */
export class FeedbackAudio {
    readonly voiceCapacity = 4;
    playRequestCount = 0;
    lastCue: FeedbackCue | null = null;
    private nextVoice = 0;
    private voices: any[] = new Array(4).fill(null);
    private context: any = null;

    play(cue: FeedbackCue): void {
        this.playRequestCount++;
        this.lastCue = cue;
        const root = globalThis as any;
        const Context = root.AudioContext || root.webkitAudioContext;
        if (!Context) return;
        try {
            this.context ||= new Context();
            if (this.context.state === 'suspended') void this.context.resume();
            const previous = this.voices[this.nextVoice];
            if (previous) { try { previous.stop(); } catch { /* already stopped */ } }
            const recipe = RECIPES[cue];
            const now = this.context.currentTime;
            const gain = this.context.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(recipe.volume, now + recipe.seconds * .07);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + recipe.seconds);
            gain.connect(this.context.destination);
            const oscillators = recipe.frequencies.map((frequency, index) => {
                const oscillator = this.context.createOscillator();
                oscillator.type = recipe.squareMix && index === recipe.frequencies.length - 1 ? 'square' : 'sine';
                oscillator.frequency.setValueAtTime(frequency, now);
                oscillator.frequency.exponentialRampToValueAtTime(frequency * recipe.endRatio, now + recipe.seconds);
                oscillator.connect(gain); oscillator.start(now); oscillator.stop(now + recipe.seconds); return oscillator;
            });
            const voice = { stop: () => oscillators.forEach(oscillator => { try { oscillator.stop(); } catch { /* ended */ } }) };
            this.voices[this.nextVoice] = voice;
            this.nextVoice = (this.nextVoice + 1) % this.voiceCapacity;
        } catch { /* audio is optional on locked/headless platforms */ }
    }
}

const RECIPES: Record<FeedbackCue, { frequencies: number[]; seconds: number; volume: number; endRatio: number; squareMix?: number }> = {
    LootDrop: { frequencies: [510], seconds: .12, volume: .26, endRatio: 280 / 510, squareMix: .18 },
    LootCollect: { frequencies: [620], seconds: .16, volume: .24, endRatio: 1040 / 620, squareMix: .08 },
    WaveLootSummary: { frequencies: [392, 523.25, 659.25], seconds: .34, volume: .2, endRatio: 1 },
    SpecialMonster: { frequencies: [146.83, 220], seconds: .28, volume: .22, endRatio: Math.pow(2, -2 / 12) },
    Equip: { frequencies: [440, 659.25], seconds: .18, volume: .2, endRatio: 1 },
    Unequip: { frequencies: [520], seconds: .16, volume: .18, endRatio: 330 / 520, squareMix: .1 },
};
