package com.alex.flashcards.tones;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;

import com.alex.flashcards.tones.Syllable.ConsonantClass;
import com.alex.flashcards.tones.Syllable.Ending;
import com.alex.flashcards.tones.Syllable.ToneMark;
import com.alex.flashcards.tones.Syllable.VowelLength;

/**
 * Makes up Thai syllables and works out the tone the spelling rules give them.
 */
@Service
public class ToneQuiz {

	private static final List<String> MIDDLE_CLASS = List.of("ก", "จ", "ด", "ต", "บ", "ป", "อ");

	private static final List<String> HIGH_CLASS = List.of("ข", "ฉ", "ฐ", "ถ", "ผ", "ฝ", "ศ", "ษ", "ส", "ห");

	private static final List<String> LOW_CLASS = List.of("ค", "ง", "ช", "ซ", "ฌ", "ญ", "ฒ", "ณ", "ท", "ธ",
			"น", "พ", "ฟ", "ภ", "ม", "ย", "ร", "ล", "ว", "ฬ", "ฮ");

	/** These hang below the line, where a vowel written underneath would collide with them. */
	private static final Set<String> DESCENDERS = Set.of("ฐ", "ญ", "ฎ", "ฏ");

	private static final Set<String> BELOW_VOWELS = Set.of("ุ", "ู");

	private static final List<String> STOPS = List.of("ก", "ด", "บ");

	private static final List<String> SONORANTS = List.of("ง", "น", "ม", "ย", "ว");

	private static final String MAI_EK = "่";

	private static final String MAI_THO = "้";

	private static final double MAI_EK_PROBABILITY = 0.1;

	private static final double MAI_THO_PROBABILITY = 0.1;

	private static final double STOP_PROBABILITY = 0.3;

	private static final double SONORANT_PROBABILITY = 0.3;

	/**
	 * How a vowel is written around its consonant: parts before it, stacked on it, and
	 * after it. A tone mark goes between the stacked part and the trailing part, which is
	 * the order Thai is encoded in.
	 */
	private record Spelling(String lead, String above, String trail) {
	}

	/**
	 * Most Thai vowels are written differently once a final consonant follows, so each
	 * vowel carries both spellings.
	 *
	 * @param markWhenClosed false for closed spellings built on ไม้ไต่คู้ (◌็), which is
	 *                       dropped whenever a tone mark is written — that would leave the
	 *                       vowel length unreadable, and length is half of what is being drilled
	 */
	private record VowelForm(VowelLength length, Spelling open, Spelling closed, boolean markWhenClosed) {
	}

	private static final List<VowelForm> VOWELS = List.of(
			// short
			vowel(VowelLength.SHORT, "", "", "ะ", "", "ั", "", true),
			vowel(VowelLength.SHORT, "", "ิ", "", "", "ิ", "", true),
			vowel(VowelLength.SHORT, "", "ึ", "", "", "ึ", "", true),
			vowel(VowelLength.SHORT, "", "ุ", "", "", "ุ", "", true),
			vowel(VowelLength.SHORT, "เ", "", "ะ", "เ", "็", "", false),
			vowel(VowelLength.SHORT, "แ", "", "ะ", "แ", "็", "", false),
			vowel(VowelLength.SHORT, "โ", "", "ะ", "", "", "", true),
			vowel(VowelLength.SHORT, "เ", "", "าะ", "", "็", "อ", false),
			// long
			vowel(VowelLength.LONG, "", "", "า", "", "", "า", true),
			vowel(VowelLength.LONG, "", "ี", "", "", "ี", "", true),
			vowel(VowelLength.LONG, "", "ื", "อ", "", "ื", "", true),
			vowel(VowelLength.LONG, "", "ู", "", "", "ู", "", true),
			vowel(VowelLength.LONG, "เ", "", "", "เ", "", "", true),
			vowel(VowelLength.LONG, "แ", "", "", "แ", "", "", true),
			vowel(VowelLength.LONG, "โ", "", "", "โ", "", "", true),
			vowel(VowelLength.LONG, "", "", "อ", "", "", "อ", true));

	private static VowelForm vowel(VowelLength length, String openLead, String openAbove, String openTrail,
			String closedLead, String closedAbove, String closedTrail, boolean markWhenClosed) {
		return new VowelForm(length, new Spelling(openLead, openAbove, openTrail),
				new Spelling(closedLead, closedAbove, closedTrail), markWhenClosed);
	}

	public Syllable next() {
		VowelForm vowel = pick(VOWELS);
		Ending ending = pickEnding();
		Spelling spelling = ending == Ending.NONE ? vowel.open() : vowel.closed();

		ConsonantClass consonantClass = pickConsonantClass();
		String consonant = pickConsonant(consonantClass, spelling);

		boolean markAllowed = ending == Ending.NONE || vowel.markWhenClosed();
		ToneMark mark = markAllowed ? pickMark() : ToneMark.NONE;

		String text = spelling.lead() + consonant + spelling.above() + written(mark) + spelling.trail()
				+ pickFinal(ending);

		Tone tone = tone(consonantClass, vowel.length(), ending, mark);
		return new Syllable(text, consonantClass, vowel.length(), ending, mark, tone,
				rule(consonantClass, vowel.length(), ending, mark));
	}

	/**
	 * The tone rules. A tone mark decides on its own; otherwise it comes down to whether the
	 * syllable is live or dead, and for dead ones how long the vowel is.
	 */
	static Tone tone(ConsonantClass consonantClass, VowelLength vowelLength, Ending ending, ToneMark mark) {
		boolean dead = ending == Ending.STOP || (ending == Ending.NONE && vowelLength == VowelLength.SHORT);
		return switch (consonantClass) {
			case MIDDLE -> switch (mark) {
				case MAI_EK -> Tone.LOW;
				case MAI_THO -> Tone.FALLING;
				case NONE -> dead ? Tone.LOW : Tone.MID;
			};
			case HIGH -> switch (mark) {
				case MAI_EK -> Tone.LOW;
				case MAI_THO -> Tone.FALLING;
				case NONE -> dead ? Tone.LOW : Tone.RISING;
			};
			case LOW -> switch (mark) {
				case MAI_EK -> Tone.FALLING;
				case MAI_THO -> Tone.HIGH;
				case NONE -> {
					if (!dead) {
						yield Tone.MID;
					}
					yield vowelLength == VowelLength.SHORT ? Tone.HIGH : Tone.FALLING;
				}
			};
		};
	}

	private static String rule(ConsonantClass consonantClass, VowelLength vowelLength, Ending ending, ToneMark mark) {
		String cls = switch (consonantClass) {
			case MIDDLE -> "Middle class";
			case HIGH -> "High class";
			case LOW -> "Low class";
		};
		if (mark != ToneMark.NONE) {
			return cls + " + " + (mark == ToneMark.MAI_EK ? "mai ek" : "mai tho");
		}
		if (ending == Ending.SONORANT) {
			return cls + " + sonorant ending (live)";
		}
		String vowelWord = vowelLength == VowelLength.SHORT ? "short vowel" : "long vowel";
		if (ending == Ending.STOP) {
			// Only low-class syllables split by vowel length once a stop closes them.
			return consonantClass == ConsonantClass.LOW
					? cls + " + " + vowelWord + " + stop ending (dead)"
					: cls + " + stop ending (dead)";
		}
		return cls + " + open " + vowelWord + (vowelLength == VowelLength.SHORT ? " (dead)" : " (live)");
	}

	private static String written(ToneMark mark) {
		return switch (mark) {
			case MAI_EK -> MAI_EK;
			case MAI_THO -> MAI_THO;
			case NONE -> "";
		};
	}

	private static ConsonantClass pickConsonantClass() {
		double roll = ThreadLocalRandom.current().nextDouble();
		if (roll < 0.3) {
			return ConsonantClass.MIDDLE;
		}
		return roll < 0.6 ? ConsonantClass.HIGH : ConsonantClass.LOW;
	}

	private static String pickConsonant(ConsonantClass consonantClass, Spelling spelling) {
		List<String> candidates = switch (consonantClass) {
			case MIDDLE -> MIDDLE_CLASS;
			case HIGH -> HIGH_CLASS;
			case LOW -> LOW_CLASS;
		};
		if (BELOW_VOWELS.contains(spelling.above())) {
			candidates = candidates.stream().filter(letter -> !DESCENDERS.contains(letter)).toList();
		}
		return pick(candidates);
	}

	private static Ending pickEnding() {
		double roll = ThreadLocalRandom.current().nextDouble();
		if (roll < STOP_PROBABILITY) {
			return Ending.STOP;
		}
		return roll < STOP_PROBABILITY + SONORANT_PROBABILITY ? Ending.SONORANT : Ending.NONE;
	}

	private static String pickFinal(Ending ending) {
		return switch (ending) {
			case STOP -> pick(STOPS);
			case SONORANT -> pick(SONORANTS);
			case NONE -> "";
		};
	}

	private static ToneMark pickMark() {
		double roll = ThreadLocalRandom.current().nextDouble();
		if (roll < MAI_EK_PROBABILITY) {
			return ToneMark.MAI_EK;
		}
		return roll < MAI_EK_PROBABILITY + MAI_THO_PROBABILITY ? ToneMark.MAI_THO : ToneMark.NONE;
	}

	private static <T> T pick(List<T> items) {
		return items.get(ThreadLocalRandom.current().nextInt(items.size()));
	}

}
