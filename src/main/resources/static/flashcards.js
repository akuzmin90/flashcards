/* Vocabulary trainer: three modes, four kinds of card. */

import { apiUrl } from './api.js';
import { canSpeak, isSoundOn, onVoicesChanged, speak, stopSpeaking } from './audio.js';

/** Placeholder a lone combining mark is drawn on, so it is visible on its own tile. */
const DOTTED_CIRCLE = '◌';

/*
 * Which kinds of card each mode draws from. "to-thai" drops the card that shows the Thai
 * side, so the word always has to be recalled rather than recognised.
 */
const CARD_MODES = {
	easy: ['show-thai', 'show-english'],
	letters: ['show-thai', 'show-english', 'build-thai'],
	'to-thai': ['show-english'],
	hard: ['show-thai', 'show-english', 'build-thai', 'type-thai']
};

/** Card modes with an objectively right answer — no need to ask the user how they did. */
const AUTO_GRADED = ['build-thai', 'type-thai'];

const el = {
	tabs: document.getElementById('tabs'),
	deckTabs: document.getElementById('deck-tabs'),

	cardScreen: document.getElementById('card-screen'),
	resultsScreen: document.getElementById('results-screen'),
	errorScreen: document.getElementById('error-screen'),
	errorMessage: document.getElementById('error-message'),

	statCorrect: document.getElementById('stat-correct'),
	statIncorrect: document.getElementById('stat-incorrect'),
	statRemaining: document.getElementById('stat-remaining'),
	statTotal: document.getElementById('stat-total'),
	progressBar: document.getElementById('progress-bar'),

	questionThai: document.getElementById('question-thai'),
	questionTranscription: document.getElementById('question-transcription'),
	questionEnglish: document.getElementById('question-english'),
	sayQuestion: document.getElementById('say-question'),

	answer: document.getElementById('answer'),
	answerThai: document.getElementById('answer-thai'),
	answerTranscription: document.getElementById('answer-transcription'),
	answerEnglish: document.getElementById('answer-english'),
	sayAnswer: document.getElementById('say-answer'),

	builder: document.getElementById('builder'),
	slots: document.getElementById('slots'),
	pool: document.getElementById('pool'),
	typing: document.getElementById('typing'),
	input: document.getElementById('answer-input'),
	grade: document.getElementById('grade'),

	btnShow: document.getElementById('btn-show'),
	btnGiveUp: document.getElementById('btn-giveup'),
	btnNext: document.getElementById('btn-next'),
	verdict: document.getElementById('verdict'),
	btnCorrect: document.getElementById('btn-correct'),
	btnIncorrect: document.getElementById('btn-incorrect'),
	hint: document.getElementById('hint'),

	resultCorrect: document.getElementById('result-correct'),
	resultIncorrect: document.getElementById('result-incorrect'),
	resultTotal: document.getElementById('result-total'),
	resultsSubtitle: document.getElementById('results-subtitle'),
	btnRestart: document.getElementById('btn-restart')
};

const state = {
	mode: 'easy',
	decks: [],
	deckName: null,
	words: [],
	deck: [],
	current: null,
	/** The current word still counts towards "words left" until it is resolved. */
	pending: false,
	cardMode: 'show-english',
	revealed: false,
	wasCorrect: false,
	gaveUp: false,
	build: null,
	correct: 0,
	incorrect: 0
};

/* ---------- Thai script ---------- */

/**
 * True for marks that take no width of their own — vowel signs above and below,
 * tone marks, thanthakhat. They sit on top of the preceding letter rather than
 * occupying a square of their own.
 */
function isCombining(ch) {
	const code = ch.charCodeAt(0);
	return code === 0x0E31 || (code >= 0x0E34 && code <= 0x0E3A) || (code >= 0x0E47 && code <= 0x0E4E);
}

/** Splits a word into squares: every spacing character starts one, marks join the previous. */
function decompose(word) {
	const groups = [];
	Array.from(word).forEach((ch) => {
		if (isCombining(ch) && groups.length) {
			groups[groups.length - 1].push(ch);
		}
		else {
			groups.push([ch]);
		}
	});
	return groups;
}

/** Marks within one square may be placed in any order, so compare them as a set. */
function squareKey(chars) {
	return chars.slice().sort().join('');
}

function wordKey(word) {
	return decompose(word.replace(/\s+/g, '')).map(squareKey).join('|');
}

/**
 * Two spellings of the same word. Tolerates the order marks were entered in — typing
 * a tone mark before the vowel above it gives a different string but the same word.
 */
function sameWord(typed, target) {
	return wordKey(typed) === wordKey(target);
}

function canBuild(word) {
	return !/\s/.test(word.thai) && decompose(word.thai).length > 0;
}

/* ---------- helpers ---------- */

function shuffle(items) {
	const shuffled = items.slice();
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = shuffled[i];
		shuffled[i] = shuffled[j];
		shuffled[j] = tmp;
	}
	return shuffled;
}

function setText(node, text) {
	node.textContent = text || '';
	node.hidden = !text;
}

function showScreen(screen) {
	el.cardScreen.hidden = screen !== el.cardScreen;
	el.resultsScreen.hidden = screen !== el.resultsScreen;
	el.errorScreen.hidden = screen !== el.errorScreen;
	if (screen !== el.cardScreen) {
		document.body.classList.remove('is-compact');
	}
}

function updateScoreboard() {
	const total = state.words.length;
	const remaining = state.deck.length + (state.pending ? 1 : 0);
	el.statCorrect.textContent = state.correct;
	el.statIncorrect.textContent = state.incorrect;
	el.statRemaining.textContent = remaining;
	el.statTotal.textContent = total;
	el.progressBar.style.width = total ? ((total - remaining) / total * 100) + '%' : '0%';
}

/* ---------- session ---------- */

function startSession() {
	state.deck = shuffle(state.words);
	state.current = null;
	state.pending = false;
	state.correct = 0;
	state.incorrect = 0;
	showScreen(el.cardScreen);
	nextCard();
}

function pickCardMode(word) {
	const modes = CARD_MODES[state.mode] || CARD_MODES.easy;
	const picked = modes[Math.floor(Math.random() * modes.length)];
	return picked === 'build-thai' && !canBuild(word) ? 'show-english' : picked;
}

function nextCard() {
	if (!state.deck.length) {
		state.current = null;
		state.pending = false;
		updateScoreboard();
		showResults();
		return;
	}
	state.current = state.deck.shift();
	state.pending = true;
	state.cardMode = pickCardMode(state.current);
	state.revealed = false;
	state.gaveUp = false;
	state.build = state.cardMode === 'build-thai' ? createBuild(state.current.thai) : null;
	el.input.value = '';
	el.input.disabled = false;
	render();
	// A new card starts from its question, not from wherever the last answer left the page.
	window.scrollTo({ top: 0 });
	if (state.cardMode === 'type-thai') {
		el.input.focus();
	}
	updateScoreboard();
	if (state.cardMode === 'show-thai') {
		say();
	}
	else {
		stopSpeaking();
	}
}

function say() {
	if (state.current) {
		speak(state.current.thai, state.current.audio);
	}
}

/** Books the answer, but leaves the card on screen — advance() moves on. */
function resolve(isCorrect) {
	state.wasCorrect = isCorrect;
	state.pending = false;
	if (isCorrect) {
		state.correct++;
	}
	else {
		state.incorrect++;
		// Put the word back into the session, but not right away.
		const earliest = Math.min(2, state.deck.length);
		const position = earliest + Math.floor(Math.random() * (state.deck.length - earliest + 1));
		state.deck.splice(position, 0, state.current);
	}
	updateScoreboard();
}

/* ---------- the letter builder ---------- */

function createBuild(thai) {
	const squares = decompose(thai);
	const tiles = shuffle(Array.from(thai).map((ch, index) => ({
		id: index, ch: ch, combining: isCombining(ch)
	}))).map((tile, order) => {
		tile.order = order;
		return tile;
	});
	return {
		slots: squares.map(() => []),
		target: squares.map(squareKey).join('|'),
		tiles: tiles,
		cursor: null
	};
}

function isAssembled() {
	return state.build !== null && state.build.tiles.length === 0;
}

function slotChars(slot) {
	return slot.map((tile) => tile.ch);
}

function isAssemblyCorrect() {
	return state.build.slots.map((slot) => squareKey(slotChars(slot))).join('|') === state.build.target;
}

/**
 * Everything worth seeing after an answer - the revealed word, the verdict, the way forward -
 * sits at the end of the page, and revealing is what makes the page outgrow a short window.
 * So go to the bottom rather than to any one element: aiming at the button leaves the verdict
 * hidden under the pinned bar on a phone, and aiming at the verdict leaves the button off
 * screen on a desktop. A no-op when everything already fits.
 */
function scrollOutcomeIntoView() {
	window.scrollTo({ top: document.documentElement.scrollHeight });
}

/** Restarts a CSS animation that may already have played on this element. */
function replayAnimation(node, className) {
	node.classList.remove(className);
	void node.offsetWidth;
	node.classList.add(className);
}

function placeTile(tile, node) {
	const build = state.build;
	if (tile.combining) {
		// Marks have no square of their own; they land on the letter placed last.
		if (build.cursor === null || !build.slots[build.cursor].length) {
			replayAnimation(node, 'shake');
			return;
		}
		build.slots[build.cursor].push(tile);
	}
	else {
		const target = build.slots.findIndex((slot) => slot.length === 0);
		if (target === -1) {
			replayAnimation(node, 'shake');
			return;
		}
		build.slots[target].push(tile);
		build.cursor = target;
	}
	build.tiles = build.tiles.filter((candidate) => candidate.id !== tile.id);
	render();
}

function clearSlot(index) {
	const build = state.build;
	if (!build.slots[index].length) {
		return;
	}
	build.tiles = build.tiles.concat(build.slots[index]).sort((a, b) => a.order - b.order);
	build.slots[index] = [];
	render();
}

function renderBuilder() {
	const build = state.build;

	el.slots.textContent = '';
	build.slots.forEach((slot, index) => {
		const node = document.createElement('button');
		node.type = 'button';
		node.className = 'slot' + (slot.length ? ' is-filled' : '');
		node.textContent = slotChars(slot).join('');
		node.disabled = !slot.length || state.revealed;
		node.addEventListener('click', () => clearSlot(index));
		el.slots.appendChild(node);
	});
	el.slots.className = 'slots';
	if (state.revealed) {
		el.slots.classList.add(state.wasCorrect ? 'is-correct' : 'is-wrong');
	}

	el.pool.textContent = '';
	build.tiles.forEach((tile) => {
		const node = document.createElement('button');
		node.type = 'button';
		node.className = 'tile';
		node.textContent = tile.combining ? DOTTED_CIRCLE + tile.ch : tile.ch;
		node.disabled = state.revealed;
		node.addEventListener('click', () => placeTile(tile, node));
		el.pool.appendChild(node);
	});
}

/* ---------- self-graded answers ---------- */

function isAutoGraded() {
	return AUTO_GRADED.indexOf(state.cardMode) !== -1;
}

/** Whether there is enough of an answer to grade; until then the card offers Give up instead. */
function isReady() {
	if (state.cardMode === 'build-thai') {
		return isAssembled();
	}
	if (state.cardMode === 'type-thai') {
		return el.input.value.trim().length > 0;
	}
	return true;
}

function isAnswerCorrect() {
	return state.cardMode === 'build-thai'
		? isAssemblyCorrect()
		: sameWord(el.input.value, state.current.thai);
}

function renderGrade() {
	el.grade.hidden = !state.revealed || !isAutoGraded();
	el.grade.className = 'grade' + (state.wasCorrect ? ' is-correct' : ' is-wrong');
	el.grade.textContent = state.wasCorrect ? '✓ Correct' : (state.gaveUp ? '✗ Gave up' : '✗ Not quite');
}

/* ---------- rendering ---------- */

function hintText() {
	if (state.revealed) {
		return isAutoGraded() ? 'Space — next word' : '← Incorrect · Correct →';
	}
	if (isAutoGraded() && !isReady()) {
		return state.cardMode === 'build-thai'
			? 'Tap the letters to spell the word · Esc — give up'
			: 'Type the Thai spelling · Enter — check · Esc — give up';
	}
	return state.cardMode === 'type-thai' ? 'Enter — check answer' : 'Space — show answer';
}

function render() {
	const word = state.current;
	if (!word) {
		return;
	}
	const showThai = state.cardMode === 'show-thai';
	const building = state.cardMode === 'build-thai';
	const typing = state.cardMode === 'type-thai';
	const ready = isReady();

	setText(el.questionThai, showThai ? word.thai : '');
	setText(el.questionTranscription, showThai ? word.transcription : '');
	setText(el.questionEnglish, showThai ? '' : word.english);

	setText(el.answerThai, showThai ? '' : word.thai);
	setText(el.answerTranscription, showThai ? '' : word.transcription);
	setText(el.answerEnglish, showThai ? word.english : '');

	const speakable = isSoundOn() && canSpeak(word.audio);
	el.sayQuestion.hidden = !showThai || !speakable;
	el.sayAnswer.hidden = showThai || !speakable;

	el.answer.hidden = !state.revealed;
	el.builder.hidden = !building;
	el.typing.hidden = !typing;
	document.body.classList.toggle('is-compact', building || typing);
	if (building) {
		renderBuilder();
	}
	if (typing) {
		el.input.disabled = state.revealed;
		el.input.className = 'answer-input'
			+ (state.revealed ? (state.wasCorrect ? ' is-correct' : ' is-wrong') : '');
	}
	renderGrade();

	el.btnShow.textContent = typing ? 'Check answer' : 'Show answer';
	el.btnShow.hidden = state.revealed || !ready;
	el.btnGiveUp.hidden = state.revealed || !isAutoGraded() || ready;
	el.btnNext.hidden = !state.revealed || !isAutoGraded();
	el.verdict.hidden = !state.revealed || isAutoGraded();
	el.hint.textContent = hintText();
}

/* ---------- actions ---------- */

function reveal() {
	if (state.revealed || !state.current) {
		return;
	}
	if (isAutoGraded()) {
		if (!isReady()) {
			return;
		}
		// Nothing to trust the user about here — the spelling grades itself.
		state.revealed = true;
		resolve(isAnswerCorrect());
		el.input.blur();
		render();
		say();
		// The answer makes the card taller; keep the outcome on screen.
		scrollOutcomeIntoView();
		return;
	}
	state.revealed = true;
	render();
	// In show-thai mode the word was already spoken when the card came up.
	if (state.cardMode !== 'show-thai') {
		say();
	}
	// The answer grows the card here too, which can push the buttons past the fold.
	scrollOutcomeIntoView();
}

/** Bails out of an unfinished answer: counts as a mistake, so the word comes back later. */
function giveUp() {
	if (state.revealed || !isAutoGraded() || isReady()) {
		return;
	}
	state.revealed = true;
	state.gaveUp = true;
	resolve(false);
	el.input.blur();
	render();
	say();
	scrollOutcomeIntoView();
}

function answer(isCorrect) {
	if (!state.revealed || !state.current || isAutoGraded()) {
		return;
	}
	resolve(isCorrect);
	nextCard();
}

function advance() {
	if (!state.revealed || !state.current) {
		return;
	}
	nextCard();
}

function selectMode(mode) {
	if (mode === state.mode || !CARD_MODES[mode]) {
		return;
	}
	state.mode = mode;
	el.tabs.querySelectorAll('.tab').forEach((tab) => {
		tab.classList.toggle('is-active', tab.dataset.mode === mode);
	});
	startSession();
}

/* ---------- decks ---------- */

function renderDeckTabs() {
	el.deckTabs.textContent = '';
	state.decks.forEach((deck) => {
		const tab = document.createElement('button');
		tab.type = 'button';
		tab.className = 'tab' + (deck.name === state.deckName ? ' is-active' : '');
		tab.dataset.deck = deck.name;
		tab.textContent = deck.name;
		tab.title = deck.name + ' - ' + deck.words.length + ' words';
		el.deckTabs.appendChild(tab);
	});
	// With a single deck there is nothing to choose between.
	el.deckTabs.hidden = state.decks.length < 2;
}

function selectDeck(name) {
	const deck = state.decks.find((candidate) => candidate.name === name);
	if (!deck || name === state.deckName) {
		return;
	}
	state.deckName = deck.name;
	state.words = deck.words;
	renderDeckTabs();
	startSession();
}

function showResults() {
	const answers = state.correct + state.incorrect;
	const accuracy = answers ? Math.round(state.correct / answers * 100) : 0;
	el.resultCorrect.textContent = state.correct;
	el.resultIncorrect.textContent = state.incorrect;
	el.resultTotal.textContent = state.words.length;
	el.resultsSubtitle.textContent = state.incorrect === 0
		? answers + ' answers without a single mistake'
		: answers + ' answers, ' + accuracy + '% accuracy';
	showScreen(el.resultsScreen);
}

function showError(message) {
	el.errorMessage.textContent = message;
	showScreen(el.errorScreen);
}

/* ---------- the interface the shell drives ---------- */

export function handleKey(event) {
	if (!el.resultsScreen.hidden) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			startSession();
		}
		return;
	}
	if (el.cardScreen.hidden) {
		return;
	}
	// While an answer is being typed the field owns the keyboard — Space is a Thai
	// letter's neighbour, not a "show answer" shortcut. Only submit and bail stay global.
	if (event.target === el.input) {
		if (event.key === 'Enter') {
			event.preventDefault();
			reveal();
		}
		else if (event.key === 'Escape') {
			giveUp();
		}
		return;
	}
	if (event.key === ' ' || event.key === 'Enter') {
		event.preventDefault();
		if (state.revealed) {
			advance();
		}
		else {
			reveal();
		}
	}
	else if (event.key === 'Escape') {
		giveUp();
	}
	else if (event.key === 'ArrowLeft' || event.key === '1') {
		answer(false);
	}
	else if (event.key === 'ArrowRight' || event.key === '2') {
		answer(true);
	}
}

export function restart() {
	if (state.words.length) {
		startSession();
	}
}

export function activate() {
	render();
}

export function deactivate() {
	stopSpeaking();
	document.body.classList.remove('is-compact');
}

/** Speaker buttons come and go with the mute toggle and with the voice list. */
export function refresh() {
	render();
}

export function init() {
	el.btnShow.addEventListener('click', reveal);
	el.btnGiveUp.addEventListener('click', giveUp);
	// Typing the first character swaps Give up for Check answer, and vice versa.
	el.input.addEventListener('input', () => {
		if (state.current && !state.revealed) {
			render();
		}
	});
	el.btnNext.addEventListener('click', advance);
	el.btnCorrect.addEventListener('click', () => answer(true));
	el.btnIncorrect.addEventListener('click', () => answer(false));
	el.btnRestart.addEventListener('click', startSession);
	el.sayQuestion.addEventListener('click', say);
	el.sayAnswer.addEventListener('click', say);
	el.tabs.addEventListener('click', (event) => {
		const tab = event.target.closest('.tab');
		if (tab && !tab.disabled) {
			selectMode(tab.dataset.mode);
		}
	});
	el.deckTabs.addEventListener('click', (event) => {
		const tab = event.target.closest('.tab');
		if (tab && !tab.disabled) {
			selectDeck(tab.dataset.deck);
		}
	});
	onVoicesChanged(() => {
		if (state.current) {
			render();
		}
	});

	return fetch(apiUrl('api/decks'))
		.then((response) => {
			if (!response.ok) {
				throw new Error('HTTP ' + response.status);
			}
			return response.json();
		})
		.then((decks) => {
			state.decks = decks;
			if (!decks.length) {
				showError('No decks found. Put files like "แด่=dàe=to ; for" into the words directory.');
				return;
			}
			// The server puts the default deck first, so the leftmost tab is the one to open.
			state.deckName = decks[0].name;
			state.words = decks[0].words;
			renderDeckTabs();
			startSession();
		})
		.catch((error) => {
			showError('Could not load the vocabulary: ' + error.message);
		});
}
