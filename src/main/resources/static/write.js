/*
 * The "write" deck: the handful of words you want to be able to spell on a keyboard,
 * rather than only recognise. It is not a file like the other decks - it is a set of
 * marks you put on words wherever you meet them.
 *
 * The marks live in the browser and on the server at once. The browser's copy is what the
 * screen is drawn from, so the deck works with no network at all; the server's copy is what
 * makes the phone and the desktop agree. Neither is the truth on its own - see sync().
 */

import { apiUrl } from './api.js';

const STORAGE_KEY = 'flashcards.write';

export const WRITE_DECK = 'write';

/**
 * Thai spelling -> { marked, at }. The marks live on the spelling rather than on the card,
 * because the same word met in two files is one thing to learn to write. A removal stays
 * here as marked: false; dropping it would make it indistinguishable from a word this
 * device has never seen, and the next sync would bring it back.
 */
let marks = load();

const listeners = [];

function load() {
	try {
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
		if (Array.isArray(stored)) {
			// The first version kept a plain list of spellings and no history to merge on.
			const now = Date.now();
			const migrated = {};
			stored.forEach((thai) => {
				migrated[thai] = { marked: true, at: now };
			});
			return migrated;
		}
		return stored && typeof stored === 'object' ? stored : {};
	}
	catch (error) {
		// Private windows and blocked site data throw rather than return nothing.
		return {};
	}
}

function save() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
	}
	catch (error) {
		// Storage can be full or forbidden; the deck still works for this session.
	}
}

/** What the deck actually holds, as a string, for telling one state of it from another. */
function fingerprint(of) {
	return Object.keys(of).filter((thai) => of[thai] && of[thai].marked).sort().join('\n');
}

export function isMarked(word) {
	const mark = marks[word.thai];
	return Boolean(mark && mark.marked);
}

/** @returns whether the word is in the deck afterwards. */
export function toggleMark(word) {
	const wanted = !isMarked(word);
	marks[word.thai] = { marked: wanted, at: Date.now() };
	save();
	syncWrite();
	return wanted;
}

/** The marked words, each spelling once, in the order the decks hold them. */
export function writeWords(words) {
	const seen = new Set();
	return words.filter((word) => {
		if (!isMarked(word) || seen.has(word.thai)) {
			return false;
		}
		seen.add(word.thai);
		return true;
	});
}

/** Called when a sync brought news - the deck now holds something else than it did. */
export function onWriteChanged(listener) {
	listeners.push(listener);
}

/* ---------- keeping the devices together ---------- */

/** Syncs run one at a time: two at once would race to tell the server the same thing. */
let queue = Promise.resolve();

function request() {
	return fetch(apiUrl('api/write'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(marks)
	}).then((response) => {
		if (!response.ok) {
			throw new Error('HTTP ' + response.status);
		}
		return response.json();
	}).then((merged) => {
		if (!merged || typeof merged !== 'object') {
			return;
		}
		const before = fingerprint(marks);
		marks = merged;
		save();
		if (fingerprint(marks) !== before) {
			listeners.forEach((listener) => listener());
		}
	}).catch(() => {
		// Offline, or the server is down, or it has no write deck at all. The marks stay
		// where they are and go up with the next sync; nothing here is lost by waiting.
	});
}

/**
 * Trades this device's marks for the shared set: everything known here goes up, the server
 * settles each word in favour of whichever side changed it last, and the answer replaces
 * what is held here. Sending the whole set every time is what makes it safe to lose a
 * request - the next one says the same thing again.
 */
export function syncWrite() {
	queue = queue.then(request);
	return queue;
}

// Picking the phone up after marking words on the desktop should be enough to catch up.
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) {
		syncWrite();
	}
});
