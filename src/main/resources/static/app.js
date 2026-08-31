(function () {
	'use strict';

	/** Placeholder a lone combining mark is drawn on, so it is visible on its own tile. */
	var DOTTED_CIRCLE = '◌';

	var CARD_MODES = {
		easy: ['show-thai', 'show-english'],
		medium: ['show-thai', 'show-english', 'build-thai']
	};

	var el = {
		tabs: document.getElementById('tabs'),
		btnReset: document.getElementById('btn-reset'),

		cardScreen: document.getElementById('card-screen'),
		resultsScreen: document.getElementById('results-screen'),
		errorScreen: document.getElementById('error-screen'),
		errorMessage: document.getElementById('error-message'),

		statCorrect: document.getElementById('stat-correct'),
		statIncorrect: document.getElementById('stat-incorrect'),
		statRemaining: document.getElementById('stat-remaining'),
		statTotal: document.getElementById('stat-total'),
		progressBar: document.getElementById('progress-bar'),

		btnSound: document.getElementById('btn-sound'),

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
		buildVerdict: document.getElementById('build-verdict'),

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

	var state = {
		mode: 'medium',
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

	/* ---------- pronunciation ---------- */

	/*
	 * Two sources, in order of preference:
	 *   1. a recording served from the audio directory, when the word has one;
	 *   2. the browser's own Thai voice, which needs no files and works offline.
	 * With neither available the speaker buttons stay hidden rather than doing nothing.
	 */
	var audio = {
		on: true,
		voice: null,
		player: new Audio()
	};

	function findThaiVoice() {
		var voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
		audio.voice = voices.filter(function (voice) { return /^th\b|^th-/i.test(voice.lang); })[0] || null;
	}

	if (window.speechSynthesis) {
		findThaiVoice();
		// Chrome fills the list asynchronously, so the first call above often comes back empty.
		speechSynthesis.addEventListener('voiceschanged', function () {
			findThaiVoice();
			if (state.current) {
				render();
			}
		});
	}

	function canSpeak(word) {
		return Boolean(word) && (Boolean(word.audio) || audio.voice !== null);
	}

	function stopSpeaking() {
		if (window.speechSynthesis) {
			speechSynthesis.cancel();
		}
		audio.player.pause();
	}

	function speak(word) {
		if (!audio.on || !canSpeak(word)) {
			return;
		}
		stopSpeaking();
		if (word.audio) {
			audio.player.src = word.audio;
			// Rejects when the browser blocks playback before any user gesture; harmless.
			var started = audio.player.play();
			if (started && started.catch) {
				started.catch(function () { });
			}
			return;
		}
		var utterance = new SpeechSynthesisUtterance(word.thai);
		utterance.voice = audio.voice;
		utterance.lang = audio.voice.lang;
		utterance.rate = 0.9;
		speechSynthesis.speak(utterance);
	}

	function toggleSound() {
		audio.on = !audio.on;
		if (!audio.on) {
			stopSpeaking();
		}
		el.btnSound.title = audio.on ? 'Mute pronunciation' : 'Unmute pronunciation';
		el.btnSound.setAttribute('aria-label', el.btnSound.title);
		el.btnSound.classList.toggle('is-off', !audio.on);
	}

	/* ---------- Thai script ---------- */

	/**
	 * True for marks that take no width of their own — vowel signs above and below,
	 * tone marks, thanthakhat. They sit on top of the preceding letter rather than
	 * occupying a square of their own.
	 */
	function isCombining(ch) {
		var code = ch.charCodeAt(0);
		return code === 0x0E31 || (code >= 0x0E34 && code <= 0x0E3A) || (code >= 0x0E47 && code <= 0x0E4E);
	}

	/** Splits a word into squares: every spacing character starts one, marks join the previous. */
	function decompose(word) {
		var groups = [];
		Array.from(word).forEach(function (ch) {
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

	function canBuild(word) {
		return !/\s/.test(word.thai) && decompose(word.thai).length > 0;
	}

	/* ---------- helpers ---------- */

	function shuffle(items) {
		var shuffled = items.slice();
		for (var i = shuffled.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var tmp = shuffled[i];
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
			document.body.classList.remove('is-building');
		}
	}

	function updateScoreboard() {
		var total = state.words.length;
		var remaining = state.deck.length + (state.pending ? 1 : 0);
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
		var modes = CARD_MODES[state.mode] || CARD_MODES.easy;
		var picked = modes[Math.floor(Math.random() * modes.length)];
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
		render();
		updateScoreboard();
		if (state.cardMode === 'show-thai') {
			speak(state.current);
		}
		else {
			stopSpeaking();
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
			var earliest = Math.min(2, state.deck.length);
			var position = earliest + Math.floor(Math.random() * (state.deck.length - earliest + 1));
			state.deck.splice(position, 0, state.current);
		}
		updateScoreboard();
	}

	/* ---------- the letter builder ---------- */

	function createBuild(thai) {
		var squares = decompose(thai);
		var tiles = shuffle(Array.from(thai).map(function (ch, index) {
			return { id: index, ch: ch, combining: isCombining(ch) };
		})).map(function (tile, order) {
			tile.order = order;
			return tile;
		});
		return {
			slots: squares.map(function () { return []; }),
			target: squares.map(squareKey).join('|'),
			tiles: tiles,
			cursor: null
		};
	}

	function isAssembled() {
		return state.build !== null && state.build.tiles.length === 0;
	}

	function slotChars(slot) {
		return slot.map(function (tile) { return tile.ch; });
	}

	function isAssemblyCorrect() {
		return state.build.slots.map(function (slot) {
			return squareKey(slotChars(slot));
		}).join('|') === state.build.target;
	}

	/** Restarts a CSS animation that may already have played on this element. */
	function replayAnimation(node, className) {
		node.classList.remove(className);
		void node.offsetWidth;
		node.classList.add(className);
	}

	function reject(node) {
		replayAnimation(node, 'shake');
	}

	function placeTile(tile, node) {
		var build = state.build;
		if (tile.combining) {
			// Marks have no square of their own; they land on the letter placed last.
			if (build.cursor === null || !build.slots[build.cursor].length) {
				reject(node);
				return;
			}
			build.slots[build.cursor].push(tile);
		}
		else {
			var target = build.slots.findIndex(function (slot) { return slot.length === 0; });
			if (target === -1) {
				reject(node);
				return;
			}
			build.slots[target].push(tile);
			build.cursor = target;
		}
		build.tiles = build.tiles.filter(function (candidate) { return candidate.id !== tile.id; });
		render();
	}

	function clearSlot(index) {
		var build = state.build;
		if (!build.slots[index].length) {
			return;
		}
		build.tiles = build.tiles.concat(build.slots[index]).sort(function (a, b) { return a.order - b.order; });
		build.slots[index] = [];
		render();
	}

	function renderBuilder() {
		var build = state.build;

		el.slots.textContent = '';
		build.slots.forEach(function (slot, index) {
			var node = document.createElement('button');
			node.type = 'button';
			node.className = 'slot' + (slot.length ? ' is-filled' : '');
			node.textContent = slotChars(slot).join('');
			node.disabled = !slot.length || state.revealed;
			node.addEventListener('click', function () { clearSlot(index); });
			el.slots.appendChild(node);
		});
		el.slots.className = 'slots';
		if (state.revealed) {
			el.slots.classList.add(state.wasCorrect ? 'is-correct' : 'is-wrong');
		}

		el.pool.textContent = '';
		build.tiles.forEach(function (tile) {
			var node = document.createElement('button');
			node.type = 'button';
			node.className = 'tile';
			node.textContent = tile.combining ? DOTTED_CIRCLE + tile.ch : tile.ch;
			node.disabled = state.revealed;
			node.addEventListener('click', function () { placeTile(tile, node); });
			el.pool.appendChild(node);
		});

		el.buildVerdict.hidden = !state.revealed;
		el.buildVerdict.className = 'build-verdict' + (state.wasCorrect ? ' is-correct' : ' is-wrong');
		el.buildVerdict.textContent = state.wasCorrect ? '✓ Correct' : (state.gaveUp ? '✗ Gave up' : '✗ Not quite');
	}

	/* ---------- rendering ---------- */

	function hintText() {
		if (state.revealed) {
			return state.cardMode === 'build-thai' ? 'Space — next word' : '← Incorrect · Correct →';
		}
		if (state.cardMode === 'build-thai' && !isAssembled()) {
			return 'Tap the letters to spell the word · Esc — give up';
		}
		return 'Space — show answer';
	}

	function render() {
		var word = state.current;
		var showThai = state.cardMode === 'show-thai';
		var building = state.cardMode === 'build-thai';

		setText(el.questionThai, showThai ? word.thai : '');
		setText(el.questionTranscription, showThai ? word.transcription : '');
		setText(el.questionEnglish, showThai ? '' : word.english);

		setText(el.answerThai, showThai ? '' : word.thai);
		setText(el.answerTranscription, showThai ? '' : word.transcription);
		setText(el.answerEnglish, showThai ? word.english : '');

		var speakable = audio.on && canSpeak(word);
		el.sayQuestion.hidden = !showThai || !speakable;
		el.sayAnswer.hidden = showThai || !speakable;

		el.answer.hidden = !state.revealed;
		el.builder.hidden = !building;
		document.body.classList.toggle('is-building', building);
		if (building) {
			renderBuilder();
		}

		el.btnShow.hidden = state.revealed || (building && !isAssembled());
		el.btnGiveUp.hidden = !building || state.revealed || isAssembled();
		el.btnNext.hidden = !state.revealed || !building;
		el.verdict.hidden = !state.revealed || building;
		el.hint.textContent = hintText();
	}

	/* ---------- actions ---------- */

	function reveal() {
		if (state.revealed || !state.current) {
			return;
		}
		if (state.cardMode === 'build-thai') {
			if (!isAssembled()) {
				return;
			}
			// Nothing to trust the user about here — the spelling grades itself.
			state.revealed = true;
			resolve(isAssemblyCorrect());
			render();
			speak(state.current);
			// The answer makes the card taller; keep the way forward on screen.
			el.btnNext.scrollIntoView({ block: 'nearest' });
			return;
		}
		state.revealed = true;
		render();
		// In show-thai mode the word was already spoken when the card came up.
		if (state.cardMode !== 'show-thai') {
			speak(state.current);
		}
	}

	/** Bails out of a half-built word: counts as a mistake, so the word comes back later. */
	function giveUp() {
		if (state.revealed || state.cardMode !== 'build-thai' || isAssembled()) {
			return;
		}
		state.revealed = true;
		state.gaveUp = true;
		resolve(false);
		render();
		speak(state.current);
		el.btnNext.scrollIntoView({ block: 'nearest' });
	}

	function answer(isCorrect) {
		if (!state.revealed || !state.current || state.cardMode === 'build-thai') {
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
		Array.prototype.forEach.call(el.tabs.querySelectorAll('.tab'), function (tab) {
			tab.classList.toggle('is-active', tab.dataset.mode === mode);
		});
		startSession();
	}

	function showResults() {
		var answers = state.correct + state.incorrect;
		var accuracy = answers ? Math.round(state.correct / answers * 100) : 0;
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

	function onKeyDown(event) {
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

	el.btnShow.addEventListener('click', reveal);
	el.btnGiveUp.addEventListener('click', giveUp);
	el.btnNext.addEventListener('click', advance);
	el.btnCorrect.addEventListener('click', function () { answer(true); });
	el.btnIncorrect.addEventListener('click', function () { answer(false); });
	el.btnRestart.addEventListener('click', startSession);
	el.sayQuestion.addEventListener('click', function () { speak(state.current); });
	el.sayAnswer.addEventListener('click', function () { speak(state.current); });
	el.btnSound.addEventListener('click', function () {
		toggleSound();
		if (state.current) {
			render();
		}
	});
	el.btnReset.addEventListener('click', function () {
		replayAnimation(el.btnReset, 'is-spinning');
		if (state.words.length) {
			startSession();
		}
	});
	el.tabs.addEventListener('click', function (event) {
		var tab = event.target.closest('.tab');
		if (tab && !tab.disabled) {
			selectMode(tab.dataset.mode);
		}
	});
	document.addEventListener('keydown', onKeyDown);

	fetch('/api/words')
		.then(function (response) {
			if (!response.ok) {
				throw new Error('HTTP ' + response.status);
			}
			return response.json();
		})
		.then(function (words) {
			state.words = words;
			if (!words.length) {
				showError('The vocabulary file is empty. Add lines like "แด่=dàe=to ; for" to words.txt.');
				return;
			}
			startSession();
		})
		.catch(function (error) {
			showError('Could not load the vocabulary: ' + error.message);
		});
})();
