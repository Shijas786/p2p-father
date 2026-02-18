
const SOUNDS = {
    // A subtle, professional 'tick' sound
    click: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3',
    notification: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
    success: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
    error: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
};

class SoundService {
    private audios: Map<string, HTMLAudioElement> = new Map();
    private enabled: boolean = true;

    constructor() {
        // Preload sounds
        if (typeof window !== 'undefined') {
            Object.entries(SOUNDS).forEach(([key, url]) => {
                const audio = new Audio(url);
                audio.preload = 'auto';
                // Set default volume for a subtle feel
                if (key === 'click') {
                    audio.volume = 0.4; // Softer click
                } else {
                    audio.volume = 0.6;
                }
                this.audios.set(key, audio);
            });
        }
    }

    play(name: keyof typeof SOUNDS) {
        if (!this.enabled) return;

        const audio = this.audios.get(name);
        if (audio) {
            // Reset and play
            audio.currentTime = 0;
            audio.play().catch(e => {
                // Ignore Autoplay policy errors (user needs to interact first)
                if (e.name !== 'NotAllowedError') {
                    console.warn('Sound play error:', e);
                }
            });
        }
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }
}

export const sounds = new SoundService();
