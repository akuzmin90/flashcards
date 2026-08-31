package com.alex.flashcards;

/**
 * A single vocabulary entry, parsed from one {@code thai=transcription=english} line.
 */
public record Word(String thai, String transcription, String english) {
}
