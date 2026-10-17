package com.alex.flashcards.write;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/write")
public class WriteController {

	/**
	 * Far more words than anyone will mark by hand. Not a guard against anybody - only against
	 * a confused client turning a stray request into a file that fills the disk.
	 */
	private static final int MAX_MARKS = 20_000;

	private final WriteService writeService;

	public WriteController(WriteService writeService) {
		this.writeService = writeService;
	}

	@GetMapping
	public Map<String, Mark> marks() {
		return writeService.all();
	}

	/**
	 * Takes everything one device knows and answers with the merged deck, which is what that
	 * device should then show. Sending the whole set each time means a request that never
	 * arrives costs nothing - the next one carries the same news.
	 */
	@PostMapping
	public ResponseEntity<Map<String, Mark>> sync(@RequestBody(required = false) Map<String, Mark> marks) {
		if (marks == null || marks.isEmpty()) {
			return ResponseEntity.ok(writeService.all());
		}
		if (marks.size() > MAX_MARKS) {
			return ResponseEntity.status(413).build();
		}
		return ResponseEntity.ok(writeService.merge(marks));
	}

}
