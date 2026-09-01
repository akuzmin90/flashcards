package com.alex.flashcards.tones;

/**
 * A generated syllable together with everything the tone rules depend on, the tone that
 * follows from them, and the rule that decided it.
 *
 * @param text          the syllable as it is written
 * @param consonantClass class of the initial consonant
 * @param vowelLength   whether the vowel is short or long
 * @param ending        what closes the syllable, if anything
 * @param mark          the tone mark written over the initial consonant, if any
 * @param tone          the tone the rules produce
 * @param rule          the rule that produced it, for the explanation
 */
public record Syllable(String text, ConsonantClass consonantClass, VowelLength vowelLength,
		Ending ending, ToneMark mark, Tone tone, String rule) {

	/** Thai consonants fall into three classes, and the class drives every tone rule. */
	public enum ConsonantClass { MIDDLE, HIGH, LOW }

	public enum VowelLength { SHORT, LONG }

	/**
	 * A syllable closed by a stop (ก ด บ) is "dead", one closed by a sonorant (ง น ม ย ว)
	 * is "live"; an open syllable is live when its vowel is long.
	 */
	public enum Ending { NONE, STOP, SONORANT }

	public enum ToneMark { NONE, MAI_EK, MAI_THO }

}
