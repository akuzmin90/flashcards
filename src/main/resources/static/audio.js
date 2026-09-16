/*
 * Pronunciation, shared by both trainers. Thai has two sources, in order of preference:
 *   1. a recording served from the audio directory, when the item has one;
 *   2. the browser's own Thai voice, which needs no files and works offline.
 * With neither available the callers hide their speaker buttons rather than doing nothing.
 *
 * Every speak call resolves when the sound has finished, so Auto mode can chain Thai, then
 * the translation, then a pause. A timeout backs that up: a lost "end" event would otherwise
 * stall the sequence for good.
 */

import { apiUrl } from './api.js';

let enabled = true;
let thaiVoice = null;
let englishVoice = null;
let russianVoice = null;
const player = new Audio();
const voiceListeners = [];

/** Speech that never reports finishing is cut loose after this long. */
const SPEECH_TIMEOUT_MS = 12000;

/** Translations are written in either English or Russian, and each needs its own voice. */
const CYRILLIC = /[Ѐ-ӿ]/;

function pick(voices, pattern) {
	return voices.filter((candidate) => pattern.test(candidate.lang))[0] || null;
}

function findVoices() {
	const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
	thaiVoice = pick(voices, /^th\b|^th-/i);
	englishVoice = pick(voices, /^en\b|^en-/i);
	russianVoice = pick(voices, /^ru\b|^ru-/i);
}

if (window.speechSynthesis) {
	findVoices();
	// Chrome fills the list asynchronously, so the first call above often comes back empty.
	speechSynthesis.addEventListener('voiceschanged', () => {
		findVoices();
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
	return Boolean(audioUrl) || thaiVoice !== null;
}

export function stopSpeaking() {
	if (window.speechSynthesis) {
		speechSynthesis.cancel();
	}
	player.pause();
}

function say(text, voice) {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				resolve();
			}
		};
		const timer = setTimeout(finish, SPEECH_TIMEOUT_MS);
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.voice = voice;
		utterance.lang = voice.lang;
		utterance.rate = 0.9;
		utterance.onend = finish;
		utterance.onerror = finish;
		speechSynthesis.speak(utterance);
	});
}

function play(audioUrl) {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				resolve();
			}
		};
		const timer = setTimeout(finish, SPEECH_TIMEOUT_MS);
		player.onended = finish;
		player.onerror = finish;
		// The server hands out a path relative to the app, not to the server root.
		player.src = apiUrl(audioUrl);
		// Rejects when the browser blocks playback before any user gesture; harmless.
		const started = player.play();
		if (started && started.catch) {
			started.catch(finish);
		}
	});
}

/** @returns a promise that settles once the word has been said (at once if it cannot be). */
export function speak(text, audioUrl) {
	if (!enabled || !text || !canSpeak(audioUrl)) {
		return Promise.resolve();
	}
	stopSpeaking();
	return audioUrl ? play(audioUrl) : say(text, thaiVoice);
}

/**
 * Reads the translation side, which may be written in English or in Russian - the script it
 * is in picks the voice. Any Cyrillic at all counts as Russian; an entry mixing both is rare
 * enough not to be worth reading in two voices.
 *
 * The text is written for the eye - "[to be] hurt ; bruised" - so the brackets go and the
 * separators become commas before a voice sees it.
 */
export function speakTranslation(text) {
	if (!enabled || !text) {
		return Promise.resolve();
	}
	const voice = CYRILLIC.test(text) ? russianVoice : englishVoice;
	if (!voice) {
		return Promise.resolve();
	}
	stopSpeaking();
	const spoken = text.replace(/[[\]]/g, '').replace(/\s*;\s*/g, ', ').trim();
	return spoken ? say(spoken, voice) : Promise.resolve();
}
