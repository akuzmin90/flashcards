/*
 * The vocabulary, fetched once and handed to whoever asks. Both the cards and the search
 * work from the same list, and a second request for it would be wasted.
 */

import { apiUrl } from './api.js';

let pending = null;

/** @returns a promise for the decks, in the order the server put them. */
export function loadDecks() {
	if (!pending) {
		pending = fetch(apiUrl('api/decks')).then((response) => {
			if (!response.ok) {
				throw new Error('HTTP ' + response.status);
			}
			return response.json();
		});
	}
	return pending;
}

/**
 * Every word once. The aggregate deck is skipped - it repeats what the files already hold,
 * and counting it would show each word twice.
 */
export function everyWord(decks) {
	const words = [];
	decks.filter((deck) => !deck.aggregate).forEach((deck) => {
		deck.words.forEach((word) => words.push({ ...word, deck: deck.name }));
	});
	return words;
}
