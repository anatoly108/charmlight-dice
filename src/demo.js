import DiceBox from './index.js';
import { COLORSETS } from './const/colorsets.js';

const notationInput = document.getElementById('notation-input');
const rollBtn = document.getElementById('roll-btn');
const addBtn = document.getElementById('add-btn');
const rerollBtn = document.getElementById('reroll-btn');
const colorsetSelect = document.getElementById('colorset-select');
const rollMultiBtn = document.getElementById('rollmulti-btn');

const resultTotal = document.getElementById('result-total');
const resultDetail = document.getElementById('result-detail');
const resultError = document.getElementById('result-error');

const DEFAULT_COLORSET = 'fire';

// Tracks the die `id`s currently on the table, sourced from the results
// payloads handed to onRollComplete/onAddDiceComplete rather than reaching
// into box.diceList - keeps the demo working off the public results API
// instead of DiceBox internals.
let lastKnownDiceIds = [];

// onRollComplete's `results` has a `sets[]` array of per-set rolls; onAddDiceComplete's
// is already a flat array of per-die results - both list entries carry an `id`.
function collectIds(results) {
	if (Array.isArray(results)) return results.map(r => r.id);
	return results.sets.flatMap(set => set.rolls.map(r => r.id));
}

function showError(message) {
	resultError.textContent = message;
}

function clearError() {
	resultError.textContent = '';
}

function showResults(results) {
	clearError();
	resultTotal.textContent = `Total: ${results.total}`;
	resultDetail.textContent = results.sets
		.map(set => `${set.label ?? set.type}: [${set.rolls.map(r => r.value).join(', ')}] = ${set.total}`)
		.join('  |  ');
}

// Populate the colorset <select>, grouped by category, in declaration order.
function populateColorsetSelect() {
	const groups = new Map();
	for (const [key, set] of Object.entries(COLORSETS)) {
		const category = set.category || 'Other';
		if (!groups.has(category)) groups.set(category, []);
		groups.get(category).push({ key, name: set.name || key });
	}

	for (const [category, sets] of groups) {
		const optgroup = document.createElement('optgroup');
		optgroup.label = category;
		for (const { key, name } of sets) {
			const option = document.createElement('option');
			option.value = key;
			option.textContent = name;
			if (key === DEFAULT_COLORSET) option.selected = true;
			optgroup.appendChild(option);
		}
		colorsetSelect.appendChild(optgroup);
	}
}

populateColorsetSelect();

const box = new DiceBox('#dice-box', {
	assetPath: './',
	sounds: true,
	volume: 100,
	theme_colorset: DEFAULT_COLORSET,
	onRollComplete: (results) => {
		lastKnownDiceIds = collectIds(results);
		showResults(results);
	},
	onAddDiceComplete: (results) => {
		lastKnownDiceIds = lastKnownDiceIds.concat(collectIds(results));
		clearError();
		resultDetail.textContent = `Added: [${results.map(r => r.value).join(', ')}]`;
	},
	onRerollComplete: (results) => {
		clearError();
		resultDetail.textContent = `Rerolled: [${results.map(r => r.value).join(', ')}]`;
	},
});

// exposed globally for convenience when poking at the demo from devtools
window.diceBox = box;

// All thirteen "Damage Types" colorsets, one d20 thrown per colorset in a
// single combined physics throw via rollMulti().
const DAMAGE_TYPE_COLORSETS = Object.entries(COLORSETS)
	.filter(([, set]) => set.category === 'Damage Types')
	.map(([key]) => key);

async function init() {
	await box.initialize();

	rollBtn.addEventListener('click', () => {
		clearError();
		box.roll(notationInput.value).catch(err => showError(err.message));
	});

	addBtn.addEventListener('click', () => {
		clearError();
		box.add('2d8').catch(err => showError(err.message));
	});

	rerollBtn.addEventListener('click', () => {
		clearError();
		if (!lastKnownDiceIds.length) {
			showError('Nothing on the table to reroll yet - roll first.');
			return;
		}
		box.reroll(lastKnownDiceIds).catch(err => showError(err.message));
	});

	colorsetSelect.addEventListener('change', () => {
		box.loadTheme({ colorset: colorsetSelect.value }).catch(err => showError(err.message));
	});

	rollMultiBtn.addEventListener('click', () => {
		clearError();
		const specs = DAMAGE_TYPE_COLORSETS.map(colorset => ({
			notation: '1d20',
			colorset,
			label: colorset,
		}));
		box.rollMulti(specs).catch(err => showError(err.message));
	});
}

init();
