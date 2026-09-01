package com.alex.flashcards.words;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

/**
 * Reads the vocabulary file once at startup and keeps it in memory, together with any
 * recordings found in the audio directory.
 */
@Service
public class WordService {

	private static final Logger log = LoggerFactory.getLogger(WordService.class);

	/** Byte order mark, which editors like to prepend to UTF-8 files. */
	private static final String BOM = Character.toString(0xFEFF);

	/** Tried in order; the first file named after the Thai word wins. */
	private static final List<String> AUDIO_EXTENSIONS = List.of(".mp3", ".ogg", ".m4a", ".wav");

	private final List<Word> words;

	/** Recording for the word at the same index, or {@code null}. */
	private final List<Path> recordings;

	public WordService(@Value("${flashcards.words-file:classpath:words.txt}") Resource wordsFile,
			@Value("${flashcards.audio-dir:audio}") String audioDir) {
		List<Word> parsed = load(wordsFile);
		this.recordings = findRecordings(parsed, Paths.get(audioDir));
		this.words = attachAudio(parsed);
	}

	public List<Word> getWords() {
		return words;
	}

	/** The recording for a word, or {@code null} when the index is unknown or has no file. */
	public Path recording(int index) {
		return index >= 0 && index < recordings.size() ? recordings.get(index) : null;
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

	/**
	 * Looks for {@code <audio-dir>/<thai word>.<ext>}. The directory is optional — without it
	 * the browser simply speaks the words with its own Thai voice.
	 */
	private List<Path> findRecordings(List<Word> parsed, Path audioDir) {
		List<Path> found = new ArrayList<>(parsed.size());
		int count = 0;
		for (Word word : parsed) {
			Path file = null;
			for (String extension : AUDIO_EXTENSIONS) {
				Path candidate = audioDir.resolve(word.thai() + extension);
				if (Files.isReadable(candidate)) {
					file = candidate;
					break;
				}
			}
			found.add(file);
			count += file == null ? 0 : 1;
		}
		Path absolute = audioDir.toAbsolutePath();
		if (count == 0) {
			log.info("No recordings in {} - the browser will speak the words itself", absolute);
		}
		else {
			log.info("Found {} of {} recordings in {}", count, parsed.size(), absolute);
		}
		return found;
	}

	private List<Word> attachAudio(List<Word> parsed) {
		List<Word> withAudio = new ArrayList<>(parsed.size());
		for (int i = 0; i < parsed.size(); i++) {
			Word word = parsed.get(i);
			String audio = recordings.get(i) == null ? null : "/api/audio/" + i;
			withAudio.add(new Word(word.thai(), word.transcription(), word.english(), audio));
		}
		return List.copyOf(withAudio);
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
		return new Word(parts[0].trim(), parts[1].trim(), parts[2].trim(), null);
	}

}
