package com.alex.flashcards.tones;

/**
 * Which tone marks the generated syllables may carry - the three ways of drilling the rules.
 */
public enum MarkPolicy {

	/** Never marked, so the tone has to come from the letters alone. */
	NONE,

	/** Always mai ek or mai tho, so the mark rules get all the practice. */
	ALWAYS,

	/** Mostly bare, with a mark turning up now and then. */
	MIXED

}
