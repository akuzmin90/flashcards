/*
 * Tone-rule trainer: a made-up but well-formed Thai syllable is shown, and the tone has to
 * be worked out from the consonant class, the vowel length, the ending and the tone mark.
 */

import { apiUrl } from './api.js';
import { canSpeak, isSoundOn, onVoicesChanged, speak, stopSpeaking } from './audio.js';

/** Traditional order — สามัญ, เอก, โท, ตรี, จัตวา — with the pitch contour of each. */
const TONES = [
	{ id: 'MID', label: 'Mid', path: 'M8,20 H52' },
	{ id: 'LOW', label: 'Low', path: 'M8,15 L52,30' },
	{ id: 'FALLING', label: 'Falling', path: 'M8,26 C16,10 24,8 30,14 C38,22 44,29 52,32' },
	{ id: 'HIGH', label: 'High', path: 'M8,29 L52,12' },
	{ id: 'RISING', label: 'Rising', path: 'M8,15 C16,30 24,32 30,28 C38,23 44,13 52,10' }
];

const LABELS = {
	consonantClass: { MIDDLE: 'Middle class', HIGH: 'High class', LOW: 'Low class' },
	vowelLength: { SHORT: 'Short vowel', LONG: 'Long vowel' },
	ending: { NONE: 'Open syllable', STOP: 'Stop ending', SONORANT: 'Sonorant ending' },
	mark: { NONE: 'No tone mark', MAI_EK: 'Mai ek ◌่', MAI_THO: 'Mai tho ◌้' }
};

const BATCH = 20;

/** Top up in the background once the queue gets this short, so a card never waits. */
const LOW_WATER = 5;

const el = {
	root: document.getElementById('tones-app'),
	screen: document.getElementById('tones-screen'),
	errorScreen: document.getElementById('tones-error'),
	errorMessage: document.getElementById('tones-error-message'),

	statStreak: document.getElementById('tone-streak'),
	statBest: document.getElementById('tone-best'),
	statCorrect: document.getElementById('tone-correct'),
	statTotal: document.getElementById('tone-total'),

	syllable: document.getElementById('syllable'),
	saySyllable: document.getElementById('say-syllable'),
	grid: document.getElementById('tone-grid'),

	result: document.getElementById('tone-result'),
	grade: document.getElementById('tone-grade'),
	rule: document.getElementById('tone-rule'),
	chips: document.getElementById('tone-chips'),

	btnNext: document.getElementById('tone-next'),
	hint: document.getElementById('tone-hint')
};

const state = {
	queue: [],
	current: null,
	chosen: null,
	answered: false,
	streak: 0,
	best: 0,
	correct: 0,
	total: 0
};

let inflight = null;

function refill() {
	if (!inflight) {
		inflight = fetch(apiUrl('api/tones/next?count=' + BATCH))
			.then((response) => {
				if (!response.ok) {
					throw new Error('HTTP ' + response.status);
				}
				return response.json();
			})
			.then((batch) => {
				state.queue.push(...batch);
			})
			.finally(() => {
				inflight = null;
			});
	}
	return inflight;
}

async function nextSyllable() {
	if (!state.queue.length) {
		// Only reachable if the background top-up has not landed yet; say so rather
		// than leaving an empty card.
		state.current = null;
		state.answered = false;
		render();
		await refill();
	}
	else if (state.queue.length <= LOW_WATER) {
		refill();
	}
	state.current = state.queue.shift() || null;
	state.chosen = null;
	state.answered = false;
	stopSpeaking();
	render();
	// A new syllable starts from the top, not from wherever the last answer left the page.
	window.scrollTo({ top: 0 });
}

function choose(tone) {
	if (state.answered || !state.current) {
		return;
	}
	state.answered = true;
	state.chosen = tone;
	state.total++;
	if (tone === state.current.tone) {
		state.correct++;
		state.streak++;
		state.best = Math.max(state.best, state.streak);
	}
	else {
		// The original trainer made this a streak game: one slip and you start over.
		state.streak = 0;
	}
	render();
	say();
	// The explanation and the button both appear at the end of the page; go there rather than
	// to either one, or the other ends up off screen. A no-op when everything already fits.
	window.scrollTo({ top: document.documentElement.scrollHeight });
}

function say() {
	// Only ever after answering — hearing the syllable first would give the tone away.
	if (state.current && state.answered) {
		speak(state.current.text);
	}
}

function updateScoreboard() {
	el.statStreak.textContent = state.streak;
	el.statBest.textContent = state.best;
	el.statCorrect.textContent = state.correct;
	el.statTotal.textContent = state.total;
}

function renderChips() {
	const syllable = state.current;
	const parts = [
		LABELS.consonantClass[syllable.consonantClass],
		LABELS.vowelLength[syllable.vowelLength],
		LABELS.ending[syllable.ending],
		LABELS.mark[syllable.mark]
	];
	el.chips.textContent = '';
	parts.forEach((text) => {
		const chip = document.createElement('span');
		chip.className = 'chip';
		chip.textContent = text;
		el.chips.appendChild(chip);
	});
}

function render() {
	const syllable = state.current;
	el.syllable.textContent = syllable ? syllable.text : '…';
	el.syllable.classList.toggle('is-waiting', !syllable);

	const speakable = state.answered && isSoundOn() && canSpeak(null);
	el.saySyllable.hidden = !speakable;

	el.grid.querySelectorAll('.tone-btn').forEach((button) => {
		button.classList.remove('is-correct', 'is-wrong');
		button.disabled = state.answered || !syllable;
		if (state.answered) {
			if (button.dataset.tone === syllable.tone) {
				button.classList.add('is-correct');
			}
			else if (button.dataset.tone === state.chosen) {
				button.classList.add('is-wrong');
			}
		}
	});

	el.result.hidden = !state.answered;
	if (state.answered) {
		const right = state.chosen === syllable.tone;
		el.grade.className = 'grade' + (right ? ' is-correct' : ' is-wrong');
		el.grade.textContent = right ? '✓ Correct' : '✗ Not quite';
		el.rule.textContent = syllable.rule;
		renderChips();
	}

	el.btnNext.hidden = !state.answered;
	el.hint.textContent = state.answered ? 'Space — next syllable' : 'Which tone is it? · keys 1–5';
	updateScoreboard();
}

function showError(message) {
	el.screen.hidden = true;
	el.errorScreen.hidden = false;
	el.errorMessage.textContent = message;
}

function buildToneButtons() {
	el.grid.textContent = '';
	TONES.forEach((tone, index) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'tone-btn';
		button.dataset.tone = tone.id;
		button.title = tone.label;

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 60 40');
		svg.setAttribute('aria-hidden', 'true');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', tone.path);
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '4');
		path.setAttribute('stroke-linecap', 'round');
		svg.appendChild(path);

		const label = document.createElement('span');
		label.className = 'tone-label';
		label.textContent = tone.label;

		const key = document.createElement('span');
		key.className = 'tone-key';
		key.textContent = index + 1;

		button.append(svg, label, key);
		button.addEventListener('click', () => choose(tone.id));
		el.grid.appendChild(button);
	});
}

/* ---------- the interface the shell drives ---------- */

export function handleKey(event) {
	if (!el.errorScreen.hidden) {
		return;
	}
	if (event.key === ' ' || event.key === 'Enter') {
		event.preventDefault();
		if (state.answered) {
			nextSyllable();
		}
		return;
	}
	const index = TONES.findIndex((tone, i) => String(i + 1) === event.key);
	if (index !== -1) {
		choose(TONES[index].id);
	}
}

export function restart() {
	state.streak = 0;
	state.best = 0;
	state.correct = 0;
	state.total = 0;
	// Show the cleared counters at once; the next syllable may have to wait for the network.
	updateScoreboard();
	nextSyllable();
}

export function activate() {
	if (!state.current) {
		nextSyllable();
	}
	else {
		render();
	}
}

export function deactivate() {
	stopSpeaking();
}

export function refresh() {
	render();
}

export function init() {
	buildToneButtons();
	el.btnNext.addEventListener('click', nextSyllable);
	el.saySyllable.addEventListener('click', say);
	onVoicesChanged(render);
	render();
	return refill().catch((error) => showError('Could not reach the syllable generator: ' + error.message));
}
