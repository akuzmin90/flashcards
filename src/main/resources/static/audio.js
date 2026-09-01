/*
 * Thai pronunciation, shared by both trainers. Two sources, in order of preference:
 *   1. a recording served from the audio directory, when the item has one;
 *   2. the browser's own Thai voice, which needs no files and works offline.
 * With neither available the callers hide their speaker buttons rather than doing nothing.
 */

let enabled = true;
let voice = null;
const player = new Audio();
const voiceListeners = [];

function findThaiVoice() {
	const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
	voice = voices.filter((candidate) => /^th\b|^th-/i.test(candidate.lang))[0] || null;
}

if (window.speechSynthesis) {
	findThaiVoice();
	// Chrome fills the list asynchronously, so the first call above often comes back empty.
	speechSynthesis.addEventListener('voiceschanged', () => {
		findThaiVoice();
		voiceListeners.forEach((listener) => listener());
	});
}

/** Runs when the voice list arrives, so a view can show speaker buttons it had hidden. */
export function onVoicesChanged(listener) {
	voiceListeners.push(listener);
}

export function isSoundOn() {
	return enabled;
}

export function setSoundOn(value) {
	enabled = value;
	if (!enabled) {
		stopSpeaking();
	}
}

/** True when this item could be pronounced at all, mute aside. */
export function canSpeak(audioUrl) {
	return Boolean(audioUrl) || voice !== null;
}

export function stopSpeaking() {
	if (window.speechSynthesis) {
		speechSynthesis.cancel();
	}
	player.pause();
}

export function speak(text, audioUrl) {
	if (!enabled || !text || !canSpeak(audioUrl)) {
		return;
	}
	stopSpeaking();
	if (audioUrl) {
		player.src = audioUrl;
		// Rejects when the browser blocks playback before any user gesture; harmless.
		const started = player.play();
		if (started && started.catch) {
			started.catch(() => { });
		}
		return;
	}
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.voice = voice;
	utterance.lang = voice.lang;
	utterance.rate = 0.9;
	speechSynthesis.speak(utterance);
}
