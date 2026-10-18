/*
 * Look a word up across every deck, as you type.
 *
 * Thai is matched three ways, strictest first, and the results keep that order:
 *   1. the query appears in the word as written;
 *   2. it appears once both sides are loosened - tone marks dropped and the letters that
 *      sound alike to a learner folded together;
 *   3. it appears in the transcription or the translation - English or Russian - with case
 *      and accents ignored, for looking a word up by how it sounds or by what it means.
 */

import { canSpeak, isSoundOn, onVoicesChanged, speak, stopSpeaking } from './audio.js';
import { everyWord, loadDecks } from './decks.js';

/** ไม้เอก ไม้โท ไม้ตรี ไม้จัตวา - dropped before a loose comparison. */
const TONE_MARKS = /[่-๋]/g;

/**
 * The accents a decomposed letter leaves behind: the tone marks the transcription carries
 * (chii-wá-phâap) and the Russian hooks over й and ё. Nobody types those into a search box,
 * so both sides lose them before they are compared.
 */
const ACCENTS = /[̀-ͯ]/g;

/**
 * Letters near enough to each other that a half-remembered spelling should still find them.
 *
 * <p>ะ, ั and า are one vowel written three ways - short, short before a final consonant,
 * and long - so บาง finds บังเอิญ. The rest are the long and short pairs, which a learner
 * hears as the same sound, and ง against น.
 */
const ALIKE = {
	'ง': 'น',
	'ะ': 'า',
	'ั': 'า',
	'ี': 'ิ',
	'ู': 'ุ',
	'ื': 'ึ'
};

const EXACT = 0;
const LOOSE = 1;
const MEANING = 2;

/** Long lists are slow to read and slower to render; the rest stay behind a count. */
const MAX_SHOWN = 200;

const el = {
	input: document.getElementById('search-input'),
	note: document.getElementById('search-note'),
	results: document.getElementById('search-results')
};

let corpus = [];
let failed = false;

function loosen(text) {
	let out = '';
	for (const ch of text.replace(TONE_MARKS, '')) {
		out += ALIKE[ch] || ch;
	}
	return out;
}

/** Case and accents off, so a plainly typed "chii-wa" still reaches "chii-wá-phâap". */
function flatten(text) {
	return text.normalize('NFD').replace(ACCENTS, '').toLowerCase();
}

function matchOf(word, query, loose, lower) {
	let at = word.thai.indexOf(query);
	if (at !== -1) {
		return { tier: EXACT, at: at };
	}
	at = word.loose.indexOf(loose);
	if (at !== -1) {
		return { tier: LOOSE, at: at };
	}
	at = word.meaning.indexOf(lower);
	return at === -1 ? null : { tier: MEANING, at: at };
}

function search(query) {
	const loose = loosen(query);
	const lower = flatten(query);
	const hits = [];
	corpus.forEach((word) => {
		const match = matchOf(word, query, loose, lower);
		if (match) {
			hits.push({ word: word, tier: match.tier, at: match.at });
		}
	});
	// Closest kind of match first, then the earliest position, then the shortest word -
	// a query that is the whole word beats one buried in a longer phrase.
	hits.sort((a, b) => a.tier - b.tier || a.at - b.at || a.word.thai.length - b.word.thai.length);
	return hits;
}

function row(hit) {
	const item = document.createElement('li');
	item.className = 'search-hit' + (hit.tier === EXACT ? ' is-exact' : '');

	const main = document.createElement('div');
	main.className = 'search-hit-main';

	const thai = document.createElement('span');
	thai.className = 'search-thai';
	thai.textContent = hit.word.thai;

	const transcription = document.createElement('span');
	transcription.className = 'search-transcription';
	transcription.textContent = hit.word.transcription;

	main.append(thai, transcription);

	const english = document.createElement('div');
	english.className = 'search-english';
	english.textContent = hit.word.english;

	const deck = document.createElement('span');
	deck.className = 'search-deck';
	deck.textContent = hit.word.deck;

	item.append(main, english, deck);

	if (isSoundOn() && canSpeak(hit.word.audio)) {
		const say = document.createElement('button');
		say.type = 'button';
		say.className = 'say search-say';
		say.title = 'Play pronunciation';
		say.setAttribute('aria-label', 'Play pronunciation');
		say.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" '
			+ 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" '
			+ 'stroke-linejoin="round" aria-hidden="true">'
			+ '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>'
			+ '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>'
			+ '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';
		say.addEventListener('click', () => speak(hit.word.thai, hit.word.audio));
		item.appendChild(say);
	}
	return item;
}

function render() {
	const query = el.input.value.trim();
	el.results.textContent = '';

	if (failed) {
		el.note.textContent = 'Could not load the vocabulary.';
		return;
	}
	if (!query) {
		el.note.textContent = corpus.length
			? 'Type to look through ' + corpus.length + ' words.'
			: 'Loading the vocabulary...';
		return;
	}

	const hits = search(query);
	if (!hits.length) {
		el.note.textContent = 'Nothing matches "' + query + '".';
		return;
	}

	const exact = hits.filter((hit) => hit.tier === EXACT).length;
	const shown = hits.slice(0, MAX_SHOWN);
	el.note.textContent = hits.length + (hits.length === 1 ? ' match' : ' matches')
		+ (exact ? ', ' + exact + ' written exactly like that' : '')
		+ (hits.length > shown.length ? ' - showing the first ' + shown.length : '');

	const list = document.createDocumentFragment();
	shown.forEach((hit) => list.appendChild(row(hit)));
	el.results.appendChild(list);
}

/* ---------- the interface the shell drives ---------- */

export function handleKey(event) {
	if (event.key === 'Escape' && el.input.value) {
		el.input.value = '';
		render();
	}
}

export function restart() {
	el.input.value = '';
	render();
	el.input.focus();
}

export function activate() {
	document.body.classList.add('is-searching');
	render();
	el.input.focus();
}

export function deactivate() {
	document.body.classList.remove('is-searching');
	stopSpeaking();
}

/** The speaker buttons come and go with the mute toggle and with the voice list. */
export function refresh() {
	if (!document.getElementById('search-app').hidden) {
		render();
	}
}

export function init() {
	el.input.addEventListener('input', render);
	onVoicesChanged(refresh);

	return loadDecks()
		.then((decks) => {
			corpus = everyWord(decks).map((word) => ({
				...word,
				loose: loosen(word.thai),
				meaning: flatten(word.transcription + ' ' + word.english)
			}));
			render();
		})
		.catch(() => {
			failed = true;
			render();
		});
}
