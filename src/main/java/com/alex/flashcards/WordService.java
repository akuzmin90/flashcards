package com.alex.flashcards;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

/**
 * Reads the vocabulary file once at startup and keeps it in memory.
 */
@Service
public class WordService {

	private static final Logger log = LoggerFactory.getLogger(WordService.class);

	/** Byte order mark, which editors like to prepend to UTF-8 files. */
	private static final String BOM = Character.toString(0xFEFF);

	private final List<Word> words;

	public WordService(@Value("${flashcards.words-file:classpath:words.txt}") Resource wordsFile) {
		this.words = load(wordsFile);
	}

	public List<Word> getWords() {
		return words;
	}

	private List<Word> load(Resource wordsFile) {
		try (BufferedReader reader = new BufferedReader(
				new InputStreamReader(wordsFile.getInputStream(), StandardCharsets.UTF_8))) {
			List<Word> parsed = reader.lines()
					.map(WordService::clean)
					.filter(line -> !line.isEmpty() && !line.startsWith("#"))
					.map(WordService::parse)
					.filter(Objects::nonNull)
					.toList();
			log.info("Loaded {} words from {}", parsed.size(), wordsFile);
			return parsed;
		}
		catch (IOException ex) {
			throw new IllegalStateException("Cannot read words file: " + wordsFile, ex);
		}
	}

	private static String clean(String line) {
		return line.replace(BOM, "").trim();
	}

	private static Word parse(String line) {
		String[] parts = line.split("=", 3);
		if (parts.length < 3) {
			log.warn("Skipping malformed line (expected thai=transcription=english): {}", line);
			return null;
		}
		return new Word(parts[0].trim(), parts[1].trim(), parts[2].trim());
	}

}
