package com.alex.flashcards.words;

import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class WordController {

	private final WordService wordService;

	public WordController(WordService wordService) {
		this.wordService = wordService;
	}

	@GetMapping("/decks")
	public List<Deck> decks() {
		return wordService.getDecks();
	}

	/**
	 * Recordings are addressed by word index rather than by name: nothing from the request
	 * reaches the file system, so there is no path to traverse.
	 */
	@GetMapping("/audio/{index}")
	public ResponseEntity<Resource> audio(@PathVariable int index) {
		Path file = wordService.recording(index);
		if (file == null) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok()
				.header("Content-Type", contentType(file))
				// The URL stays the same when a recording is replaced, so caching would hide the new one.
				.header("Cache-Control", "no-store")
				.body(new FileSystemResource(file));
	}

	private static String contentType(Path file) {
		String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
		if (name.endsWith(".ogg")) {
			return "audio/ogg";
		}
		if (name.endsWith(".wav")) {
			return "audio/wav";
		}
		if (name.endsWith(".m4a")) {
			return "audio/mp4";
		}
		return "audio/mpeg";
	}

}
