/* Shell: switches between the two trainers and owns the controls they share. */

import { isSoundOn, setSoundOn } from './audio.js';
import * as flashcards from './flashcards.js';
import * as tones from './tones.js';

const APPS = {
	flashcards: {
		module: flashcards,
		root: document.getElementById('flashcards-app'),
		bar: document.getElementById('flashcards-bar'),
		showsProgress: true
	},
	tones: {
		module: tones,
		root: document.getElementById('tones-app'),
		bar: document.getElementById('tones-bar'),
		showsProgress: false
	}
};

const el = {
	tabs: document.getElementById('app-tabs'),
	btnSound: document.getElementById('btn-sound'),
	btnReset: document.getElementById('btn-reset'),
	progress: document.getElementById('progress')
};

let active = 'flashcards';

/** Restarts a CSS animation that may already have played on this element. */
function replayAnimation(node, className) {
	node.classList.remove(className);
	void node.offsetWidth;
	node.classList.add(className);
}

function select(name) {
	if (name === active || !APPS[name]) {
		return;
	}
	APPS[active].module.deactivate();
	active = name;
	Object.entries(APPS).forEach(([key, app]) => {
		app.root.hidden = key !== name;
		app.bar.hidden = key !== name;
	});
	el.progress.hidden = !APPS[name].showsProgress;
	el.tabs.querySelectorAll('.tab').forEach((tab) => {
		tab.classList.toggle('is-active', tab.dataset.app === name);
	});
	APPS[name].module.activate();
}

function toggleSound() {
	setSoundOn(!isSoundOn());
	el.btnSound.title = isSoundOn() ? 'Mute pronunciation' : 'Unmute pronunciation';
	el.btnSound.setAttribute('aria-label', el.btnSound.title);
	el.btnSound.classList.toggle('is-off', !isSoundOn());
	Object.values(APPS).forEach((app) => app.module.refresh());
}

el.tabs.addEventListener('click', (event) => {
	const tab = event.target.closest('.tab');
	if (tab && !tab.disabled) {
		select(tab.dataset.app);
	}
});

el.btnSound.addEventListener('click', toggleSound);

el.btnReset.addEventListener('click', () => {
	replayAnimation(el.btnReset, 'is-spinning');
	APPS[active].module.restart();
});

document.addEventListener('keydown', (event) => APPS[active].module.handleKey(event));

Object.values(APPS).forEach((app) => app.module.init());
