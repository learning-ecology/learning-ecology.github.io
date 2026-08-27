# Chinese dictionary data — sources & licences

The reading app's Chinese dictionary is built from the files in this folder.

## `zh-hsk.json` — HSK 1–5 core (primary source)
Every HSK 1–5 word with `[pinyin (tone marks), English, level, traditional, part-of-speech]`.
Extracted from the **New HSK Vocabulary** lists (`New-HSK-Vocabulary-Level-1..5.pdf`,
compiled by MandarinBean, https://mandarinbean.com/new-hsk-vocabulary-list/) and
cross-checked against CC-CEDICT for pinyin/definitions. Loaded eagerly and cached
on-device; guarantees every common HSK 1–5 word resolves offline and instantly.

## `zh-cedict.txt` — long-tail fallback (words beyond HSK 1–5)
Tab-separated `simplified<TAB>pinyin<TAB>English`, ~121k entries. Derived from
**CC-CEDICT** (https://www.mdbg.net/chinese/dictionary?page=cc-cedict), the community
Chinese–English dictionary, which is licensed **Creative Commons Attribution-ShareAlike
4.0 (CC BY-SA 4.0)**. This derived file is redistributed under the same licence.
Only fetched (and then cached) the first time a reader taps a word that is not in HSK 1–5.

## Vietnamese meanings
Short Vietnamese glosses are fetched on demand from MyMemory (zh-CN→vi), tidied to a
short natural phrase, and cached on-device (`crh-zhvi`). Teacher-supplied Vietnamese
from the dashboard dictionary always takes priority.

## Lookup order (see `reading.html`)
on-device cache → teacher dictionary → HSK 1–5 (`zh-hsk.json`) → CC-CEDICT
(`zh-cedict.txt`) → MyMemory translation → pinyin only (never an empty panel).

The PDFs are kept as build inputs only; they are not downloaded by the app.
