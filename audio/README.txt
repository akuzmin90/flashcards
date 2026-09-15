Optional recordings for the flashcards.

Name each file after the Thai word exactly as it is spelled in words.txt:

    audio/แด่.mp3
    audio/หลุมดำ.mp3

Recognised extensions, in the order they are tried: .mp3, .ogg, .m4a, .wav

The folder may stay empty. Words without a file are pronounced by the browser's
own Thai voice (on Windows that is "Microsoft Pattara", which works offline),
so audio already works with nothing here. Drop files in only to override that
with real recordings or with a better text-to-speech engine.

Files are picked up at startup, so restart the app after adding any.

This folder is found relative to the working directory, which is the project root when the
app is run locally. Deployed to a servlet container it is not, so set an absolute path in
flashcards.audio-dir there - or leave it, and the browser voice takes over.
