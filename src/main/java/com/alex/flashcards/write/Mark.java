package com.alex.flashcards.write;

/**
 * One word's standing in the write deck, and the moment that standing last changed.
 *
 * <p>A removal is kept as {@code marked = false} rather than dropped from the set. A device
 * that has never heard of a word and one that has deliberately removed it would otherwise
 * look identical, and every removal would be undone by the next sync from the other device.
 *
 * @param marked whether the word is in the write deck
 * @param at when it was put there or taken out, in milliseconds since the epoch
 */
public record Mark(boolean marked, long at) {
}
