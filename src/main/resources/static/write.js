/*
 * The "write" deck: the handful of words you want to be able to spell on a keyboard,
 * rather than only recognise. It is not a file like the other decks - it is a set of
 * marks you put on words wherever you meet them, kept in the browser so that it
 * survives closing the tab and restarting the device.
 */

const STORAGE_KEY = 'flashcards.write';

export const WRITE_DECK = 'write';

/**
 * Thai spellings, which is what this deck is about: the same word met twice in two files
 * is one thing to learn to write, so the marks live on the spelling rather than on the
 * card. A spelling whose word later leaves the files simply stops appearing - the mark
 * costs nothing and comes back with the word.
 */
const marked = load();

function load() {
	try {
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
		return new Set(Array.isArray(stored) ? stored : []);
	}
	catch (error) {
		// Private windows and blocked site data throw rather than return nothing.
		return new Set();
	}
}

function save() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(marked)));
	}
	catch (error) {
		// Storage can be full or forbidden; the deck still works for this session.
	}
}

export function isMarked(word) {
	return marked.has(word.thai);
}

/** @returns whether the word is in the deck afterwards. */
export function toggleMark(word) {
	if (marked.has(word.thai)) {
		marked.delete(word.thai);
	}
	else {
		marked.add(word.thai);
	}
	save();
	return marked.has(word.thai);
}

/** The marked words, each spelling once, in the order the decks hold them. */
export function writeWords(words) {
	const seen = new Set();
	return words.filter((word) => {
		if (!marked.has(word.thai) || seen.has(word.thai)) {
			return false;
		}
		seen.add(word.thai);
		return true;
	});
}
