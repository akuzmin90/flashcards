package com.alex.flashcards.tones;

import java.util.List;
import java.util.stream.IntStream;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tones")
public class ToneController {

	private static final int MAX_BATCH = 50;

	private final ToneQuiz quiz;

	public ToneController(ToneQuiz quiz) {
		this.quiz = quiz;
	}

	@GetMapping("/next")
	public List<Syllable> next(@RequestParam(defaultValue = "1") int count) {
		int wanted = Math.max(1, Math.min(count, MAX_BATCH));
		return IntStream.range(0, wanted).mapToObj(i -> quiz.next()).toList();
	}

}
