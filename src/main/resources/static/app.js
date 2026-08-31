(function () {
	'use strict';

	var el = {
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

		answer: document.getElementById('answer'),
		answerThai: document.getElementById('answer-thai'),
		answerTranscription: document.getElementById('answer-transcription'),
		answerEnglish: document.getElementById('answer-english'),

		btnShow: document.getElementById('btn-show'),
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
		words: [],
		pool: [],
		current: null,
		askThai: true,
		revealed: false,
		correct: 0,
		incorrect: 0
	};

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
	}

	function updateScoreboard() {
		var total = state.words.length;
		var remaining = state.pool.length + (state.current ? 1 : 0);
		el.statCorrect.textContent = state.correct;
		el.statIncorrect.textContent = state.incorrect;
		el.statRemaining.textContent = remaining;
		el.statTotal.textContent = total;
		el.progressBar.style.width = total ? ((total - remaining) / total * 100) + '%' : '0%';
	}

	function startSession() {
		state.pool = shuffle(state.words);
		state.current = null;
		state.correct = 0;
		state.incorrect = 0;
		showScreen(el.cardScreen);
		nextCard();
	}

	function nextCard() {
		if (!state.pool.length) {
			state.current = null;
			updateScoreboard();
			showResults();
			return;
		}
		state.current = state.pool.shift();
		state.askThai = Math.random() < 0.5;
		state.revealed = false;
		render();
		updateScoreboard();
	}

	function render() {
		var word = state.current;

		setText(el.questionThai, state.askThai ? word.thai : '');
		setText(el.questionTranscription, state.askThai ? word.transcription : '');
		setText(el.questionEnglish, state.askThai ? '' : word.english);

		setText(el.answerThai, state.askThai ? '' : word.thai);
		setText(el.answerTranscription, state.askThai ? '' : word.transcription);
		setText(el.answerEnglish, state.askThai ? word.english : '');

		el.answer.hidden = !state.revealed;
		el.btnShow.hidden = state.revealed;
		el.verdict.hidden = !state.revealed;
		el.hint.textContent = state.revealed
			? '← Incorrect · Correct →'
			: 'Space — show answer';
	}

	function reveal() {
		if (state.revealed || !state.current) {
			return;
		}
		state.revealed = true;
		render();
	}

	function answer(isCorrect) {
		if (!state.revealed || !state.current) {
			return;
		}
		if (isCorrect) {
			state.correct++;
		}
		else {
			state.incorrect++;
			// Put the word back into the session, but not right away.
			var earliest = Math.min(2, state.pool.length);
			var position = earliest + Math.floor(Math.random() * (state.pool.length - earliest + 1));
			state.pool.splice(position, 0, state.current);
		}
		nextCard();
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
		if (!el.cardScreen.hidden) {
			if (event.key === ' ' || event.key === 'Enter') {
				event.preventDefault();
				reveal();
			}
			else if (event.key === 'ArrowLeft' || event.key === '1') {
				answer(false);
			}
			else if (event.key === 'ArrowRight' || event.key === '2') {
				answer(true);
			}
		}
	}

	el.btnShow.addEventListener('click', reveal);
	el.btnCorrect.addEventListener('click', function () { answer(true); });
	el.btnIncorrect.addEventListener('click', function () { answer(false); });
	el.btnRestart.addEventListener('click', startSession);
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
