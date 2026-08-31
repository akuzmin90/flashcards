package com.alex.flashcards;

/**
 * A single vocabulary entry, parsed from one {@code thai=transcription=english} line.
 *
 * @param audio URL of a recording for this word, or {@code null} when there is no file for it
 *              and the browser should fall back to speech synthesis
 */
public record Word(String thai, String transcription, String english, String audio) {
}
