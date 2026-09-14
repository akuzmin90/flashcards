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
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Service;

/**
 * Reads every vocabulary file in the words directory once at startup. Each file becomes a
 * deck; recordings found in the audio directory are attached to the words they belong to.
 */
@Service
public class WordService {

	private static final Logger log = LoggerFactory.getLogger(WordService.class);

	/** Byte order mark, which editors like to prepend to UTF-8 files. */
	private static final String BOM = Character.toString(0xFEFF);

	/** Tried in order; the first file named after the Thai word wins. */
	private static final List<String> AUDIO_EXTENSIONS = List.of(".mp3", ".ogg", ".m4a", ".wav");

	private static final String CLASSPATH_PREFIX = "classpath:";

	private static final String FILE_PREFIX = "file:";

	private final List<Deck> decks;

	/** Recordings, indexed the way {@code /api/audio/{index}} addresses them. */
	private final List<Path> recordings = new ArrayList<>();

	public WordService(@Value("${flashcards.words-dir:words}") String wordsDir,
			@Value("${flashcards.audio-dir:audio}") String audioDir, ResourcePatternResolver resolver) {
		this.decks = load(wordsDir, Paths.get(audioDir), resolver);
	}

	public List<Deck> getDecks() {
		return decks;
	}

	/** The recording for a word, or {@code null} when the index is unknown or has no file. */
	public Path recording(int index) {
		return index >= 0 && index < recordings.size() ? recordings.get(index) : null;
	}

	private List<Deck> load(String wordsDir, Path audioDir, ResourcePatternResolver resolver) {
		List<Resource> files = listFiles(wordsDir, resolver);

		// Sorted by the name shown on the tab, so "words" leads the plainer "words-..." files.
		List<Map.Entry<String, Resource>> named = new ArrayList<>();
		for (Resource file : files) {
			String name = deckName(file);
			if (name != null) {
				named.add(Map.entry(name, file));
			}
		}
		named.sort(Map.Entry.comparingByKey());

		List<Deck> loaded = new ArrayList<>();
		int withAudio = 0;
		for (Map.Entry<String, Resource> entry : named) {
			String name = entry.getKey();
			Resource file = entry.getValue();
			List<Word> words = attachAudio(parse(file, name), audioDir);
			if (words.isEmpty()) {
				log.warn("Skipping deck '{}' - no usable lines in it", name);
				continue;
			}
			withAudio += (int) words.stream().filter(word -> word.audio() != null).count();
			loaded.add(new Deck(name, words));
			log.info("Loaded deck '{}' with {} words", name, words.size());
		}

		if (loaded.isEmpty()) {
			log.warn("No vocabulary files found in {}", wordsDir);
		}
		int total = loaded.stream().mapToInt(deck -> deck.words().size()).sum();
		if (withAudio == 0) {
			log.info("No recordings in {} - the browser will speak the words itself", audioDir.toAbsolutePath());
		}
		else {
			log.info("Found {} of {} recordings in {}", withAudio, total, audioDir.toAbsolutePath());
		}
		return List.copyOf(loaded);
	}

	/**
	 * Lists the deck files. A plain path is read straight off disk, so renaming or deleting a
	 * deck takes effect on the next start; only an explicit {@code classpath:} location goes
	 * through the build, where stale copies of removed files would linger in {@code target}.
	 */
	private static List<Resource> listFiles(String wordsDir, ResourcePatternResolver resolver) {
		if (wordsDir.startsWith(CLASSPATH_PREFIX)) {
			String pattern = (wordsDir.endsWith("/") ? wordsDir : wordsDir + "/") + "*";
			try {
				return List.of(resolver.getResources(pattern));
			}
			catch (IOException ex) {
				throw new IllegalStateException("Cannot list the words directory: " + pattern, ex);
			}
		}
		Path dir = Paths.get(wordsDir.startsWith(FILE_PREFIX) ? wordsDir.substring(FILE_PREFIX.length()) : wordsDir);
		if (!Files.isDirectory(dir)) {
			log.warn("Words directory {} does not exist", dir.toAbsolutePath());
			return List.of();
		}
		try (Stream<Path> entries = Files.list(dir)) {
			return entries.filter(Files::isRegularFile).map(path -> (Resource) new FileSystemResource(path)).toList();
		}
		catch (IOException ex) {
			throw new IllegalStateException("Cannot list the words directory: " + dir.toAbsolutePath(), ex);
		}
	}

	/** Deck name is the file name without its extension; hidden and helper files are skipped. */
	private static String deckName(Resource file) {
		String filename = file.getFilename();
		if (filename == null || filename.isBlank() || filename.startsWith(".") || filename.startsWith("_")
				|| !file.isReadable()) {
			return null;
		}
		int dot = filename.lastIndexOf('.');
		return dot > 0 ? filename.substring(0, dot) : filename;
	}

	private static List<Word> parse(Resource file, String deck) {
		try (BufferedReader reader = new BufferedReader(
				new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
			return reader.lines()
					.map(WordService::clean)
					.filter(line -> !line.isEmpty() && !line.startsWith("#"))
					.map(line -> parseLine(line, deck))
					.filter(Objects::nonNull)
					.toList();
		}
		catch (IOException ex) {
			throw new IllegalStateException("Cannot read vocabulary file: " + file, ex);
		}
	}

	/**
	 * Looks for {@code <audio-dir>/<thai word>.<ext>} and hands each word the URL of its
	 * recording. The directory is optional - without it the browser speaks the words itself.
	 */
	private List<Word> attachAudio(List<Word> words, Path audioDir) {
		List<Word> withAudio = new ArrayList<>(words.size());
		for (Word word : words) {
			Path file = null;
			for (String extension : AUDIO_EXTENSIONS) {
				Path candidate = audioDir.resolve(word.thai() + extension);
				if (Files.isReadable(candidate)) {
					file = candidate;
					break;
				}
			}
			// The index is global across decks, so one flat list can serve every recording.
			String url = file == null ? null : "/api/audio/" + recordings.size();
			recordings.add(file);
			withAudio.add(new Word(word.thai(), word.transcription(), word.english(), url));
		}
		return List.copyOf(withAudio);
	}

	private static String clean(String line) {
		return line.replace(BOM, "").trim();
	}

	private static Word parseLine(String line, String deck) {
		String[] parts = line.split("=", 3);
		if (parts.length < 3) {
			log.warn("Skipping line in deck '{}' (expected thai=transcription=english): {}", deck, line);
			return null;
		}
		return new Word(parts[0].trim(), parts[1].trim(), parts[2].trim(), null);
	}

}
