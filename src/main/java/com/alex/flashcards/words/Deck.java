package com.alex.flashcards.words;

import java.util.List;

/**
 * One vocabulary file from the words directory, shown as one tab.
 *
 * @param name      the file name without its extension
 * @param aggregate true for the built-in deck that gathers every word rather than coming
 *                  from a file of its own
 */
public record Deck(String name, List<Word> words, boolean aggregate) {
}
