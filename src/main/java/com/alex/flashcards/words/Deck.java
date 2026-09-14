package com.alex.flashcards.words;

import java.util.List;

/**
 * One vocabulary file from the words directory, shown as one tab.
 *
 * @param name the file name without its extension
 */
public record Deck(String name, List<Word> words) {
}
