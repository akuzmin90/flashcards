package com.alex.flashcards.words;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
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

	/** Kept at the head of the list, so it is the leftmost tab and the one opened on load. */
	private static final String DEFAULT_DECK = "words";

	/** The built-in deck of everything, added after the files and shown last. */
	private static final String ALL_DECK = "all";

	/**
	 * Decks named like this hold words to be practised by writing them out. They are left out
	 * of the aggregate deck, so a word put there to be spelled does not also come round in
	 * "all" to be merely recognised.
	 */
	private static final String WRITING_PREFIX = "wrt-";

	private static final String CLASSPATH_PREFIX = "classpath:";

	/** Where the build copies the decks to, so a packaged artifact carries its own vocabulary. */
	private static final String BUNDLED_DECKS = "words/";

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

		List<Map.Entry<String, Resource>> named = new ArrayList<>();
		for (Resource file : files) {
			String name = deckName(file);
			if (name != null) {
				named.add(Map.entry(name, file));
			}
		}
		// The default deck first, everything else alphabetically after it.
		named.sort(Comparator
				.comparing((Map.Entry<String, Resource> entry) -> !DEFAULT_DECK.equals(entry.getKey()))
				.thenComparing(Map.Entry::getKey));

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
			boolean writing = name.startsWith(WRITING_PREFIX);
			loaded.add(new Deck(name, words, false, writing));
			log.info("Loaded deck '{}' with {} words{}", name, words.size(),
					writing ? " (for writing practice, kept out of '" + ALL_DECK + "')" : "");
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

		// Always last, so the files keep the front of the row to themselves.
		aggregateOf(loaded).ifPresent(loaded::add);
		return List.copyOf(loaded);
	}

	/**
	 * The built-in deck holding every line from every file, in deck order and as written. A
	 * word kept in two files stays in twice, and so comes round twice in a session - which is
	 * only fair, since it was worth writing down twice.
	 *
	 * <p>Decks for writing practice are not gathered - they are studied on their own terms.
	 *
	 * <p>Absent when there is nothing to gather: fewer than two decks to draw on, or a real
	 * file already claiming the name.
	 */
	private static Optional<Deck> aggregateOf(List<Deck> decks) {
		if (decks.stream().anyMatch(deck -> ALL_DECK.equals(deck.name()))) {
			return Optional.empty();
		}
		List<Deck> gathered = decks.stream().filter(deck -> !deck.writing()).toList();
		if (gathered.size() < 2) {
			return Optional.empty();
		}
		List<Word> everything = gathered.stream().flatMap(deck -> deck.words().stream()).toList();
		int skipped = decks.size() - gathered.size();
		log.info("Deck '{}' gathers {} words from {} decks{}", ALL_DECK, everything.size(), gathered.size(),
				skipped == 0 ? "" : ", leaving out " + skipped + " for writing practice");
		return Optional.of(new Deck(ALL_DECK, everything, true, false));
	}

	/**
	 * Lists the deck files.
	 * <p>
	 * A plain path is read straight off disk, so renaming or deleting a deck takes effect on
	 * the next start - no rebuild, and no stale copies left behind in {@code target}. That
	 * path is relative to the working directory, which is the project root when running
	 * locally but something else entirely under a standalone servlet container, so the decks
	 * packaged into the artifact stand in whenever the directory is not there.
	 */
	private static List<Resource> listFiles(String wordsDir, ResourcePatternResolver resolver) {
		if (wordsDir.startsWith(CLASSPATH_PREFIX)) {
			return fromClasspath(wordsDir, resolver);
		}
		Path dir = Paths.get(wordsDir.startsWith(FILE_PREFIX) ? wordsDir.substring(FILE_PREFIX.length()) : wordsDir);
		if (!Files.isDirectory(dir)) {
			log.info("No words directory at {} - falling back to the decks bundled in the app",
					dir.toAbsolutePath());
			return fromClasspath(CLASSPATH_PREFIX + BUNDLED_DECKS, resolver);
		}
		try (Stream<Path> entries = Files.list(dir)) {
			return entries.filter(Files::isRegularFile).map(path -> (Resource) new FileSystemResource(path)).toList();
		}
		catch (IOException ex) {
			throw new IllegalStateException("Cannot list the words directory: " + dir.toAbsolutePath(), ex);
		}
	}

	private static List<Resource> fromClasspath(String location, ResourcePatternResolver resolver) {
		String pattern = (location.endsWith("/") ? location : location + "/") + "*";
		try {
			return List.of(resolver.getResources(pattern));
		}
		catch (IOException ex) {
			log.warn("Cannot list {}", pattern, ex);
			return List.of();
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
			// Relative to the app, not to the server root - the app may sit under a context path.
			String url = file == null ? null : "api/audio/" + recordings.size();
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
