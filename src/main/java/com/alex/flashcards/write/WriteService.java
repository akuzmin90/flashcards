package com.alex.flashcards.write;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * The write deck, shared between devices through a JSON file on disk.
 *
 * <p>There is no central truth about what the deck holds, because each device goes on
 * working while it is offline. So a device does not send what the deck should now be - it
 * sends what it knows, and every word is settled on its own by whichever side changed it
 * last. Two devices that have both been used apart end up agreeing, with no change lost
 * except one that was overwritten on purpose elsewhere.
 *
 * <p>This leans on the devices' clocks agreeing roughly, which for one person's phone and
 * laptop they do.
 */
@Service
public class WriteService {

	private static final Logger log = LoggerFactory.getLogger(WriteService.class);

	private static final String FILE_NAME = "write.json";

	private static final TypeReference<Map<String, Mark>> MARKS = new TypeReference<>() {
	};

	private final ObjectMapper mapper;

	private final Path file;

	private final Map<String, Mark> marks = new HashMap<>();

	public WriteService(@Value("${flashcards.data-dir:data}") String dataDir, ObjectMapper mapper) {
		this.mapper = mapper;
		this.file = Paths.get(dataDir).resolve(FILE_NAME).toAbsolutePath();
		this.marks.putAll(read());
		log.info("Write deck: {} words marked, kept in {}", marked(), file);
	}

	public synchronized Map<String, Mark> all() {
		return Map.copyOf(marks);
	}

	/**
	 * Folds one device's marks into the shared set and hands back the result, which is what
	 * that device should now show.
	 */
	public synchronized Map<String, Mark> merge(Map<String, Mark> incoming) {
		int changed = 0;
		for (Map.Entry<String, Mark> entry : incoming.entrySet()) {
			String thai = entry.getKey();
			Mark theirs = entry.getValue();
			if (theirs == null || thai == null || thai.isBlank()) {
				continue;
			}
			Mark mine = marks.get(thai);
			// Ties go to what is already here. Whichever way they fall, the answer below is
			// what both devices adopt, so they still agree afterwards.
			if (mine == null || theirs.at() > mine.at()) {
				marks.put(thai, theirs);
				changed++;
			}
		}
		if (changed > 0) {
			write();
			log.info("Write deck: {} marks changed, {} words marked in all", changed, marked());
		}
		return Map.copyOf(marks);
	}

	private long marked() {
		return marks.values().stream().filter(Mark::marked).count();
	}

	private Map<String, Mark> read() {
		if (!Files.isReadable(file)) {
			return Map.of();
		}
		try {
			return mapper.readValue(Files.readString(file, StandardCharsets.UTF_8), MARKS);
		}
		catch (IOException | JacksonException ex) {
			// Starting empty would quietly overwrite whatever is in there on the next save,
			// so put it out of harm's way instead and let it be looked at.
			Path aside = file.resolveSibling(FILE_NAME + ".unreadable");
			log.error("Cannot read the write deck from {} - keeping it as {} and starting empty", file,
					aside.getFileName(), ex);
			try {
				Files.move(file, aside, StandardCopyOption.REPLACE_EXISTING);
			}
			catch (IOException moveFailed) {
				log.error("Could not move {} aside either", file, moveFailed);
			}
			return Map.of();
		}
	}

	/**
	 * Writes beside the real file and renames it into place, so that a crash half way through
	 * leaves the previous deck intact rather than a half-written one.
	 */
	private void write() {
		Path dir = file.getParent();
		Path temp = null;
		try {
			String json = mapper.writeValueAsString(marks);
			Files.createDirectories(dir);
			temp = Files.createTempFile(dir, FILE_NAME, ".tmp");
			Files.writeString(temp, json, StandardCharsets.UTF_8);
			try {
				Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			}
			catch (AtomicMoveNotSupportedException ex) {
				Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
			}
			temp = null;
		}
		catch (IOException | JacksonException ex) {
			log.error("Cannot save the write deck to {}", file, ex);
		}
		finally {
			if (temp != null) {
				try {
					Files.deleteIfExists(temp);
				}
				catch (IOException ignored) {
					// Nothing more to do about a leftover temporary file.
				}
			}
		}
	}

}
