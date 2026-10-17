package com.alex.flashcards.words;

import java.util.List;

/**
 * One vocabulary file from the words directory, shown as one tab.
 *
 * @param name      the file name without its extension
 * @param aggregate true for the built-in deck that gathers every word rather than coming
 *                  from a file of its own
 * @param writing   true for a deck meant for spelling practice rather than for reading, told
 *                  apart by its file name. It keeps to itself: the aggregate deck leaves it
 *                  out, so the words in it are not counted or studied twice over there.
 */
public record Deck(String name, List<Word> words, boolean aggregate, boolean writing) {
}
