"""Checks for the worker's text helpers. Run: python -m unittest tests/test_tts_worker.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "workers"))
from tts_worker import overran, prepared_text, speech_budget, text_language  # noqa: E402


class LanguageTests(unittest.TestCase):
    def test_korean_voice_reads_english_text_as_english(self):
        self.assertEqual(text_language("On the 24th of May, 1863, my uncle rushed in.", "Korean"), "English")
        self.assertEqual(text_language("Chapter 12", "Korean"), "English")

    def test_text_in_a_script_follows_that_script(self):
        self.assertEqual(text_language("그는 1863년 5월 24일에 집으로 돌아왔다.", "English"), "Korean")
        self.assertEqual(text_language("吾輩は猫である。名前はまだ無い。", "English"), "Japanese")
        self.assertEqual(text_language("我们明天去北京。", "English"), "Chinese")
        self.assertEqual(text_language("Мой дядя самых честных правил.", "English"), "Russian")

    def test_latin_voices_keep_their_language(self):
        self.assertEqual(text_language("Le comte de Monte-Cristo arriva.", "French"), "French")
        self.assertEqual(text_language("1863", "Korean"), "Korean")


class BudgetTests(unittest.TestCase):
    def test_korean_sentences_get_enough_time(self):
        sentence = "그날 저녁 우리는 오래된 서재에 앉아 창밖으로 내리는 비를 바라보며 아무 말도 하지 않았다" * 2
        seconds = speech_budget(sentence, 12.5) / 12.5
        syllables = sum(1 for c in sentence if "가" <= c <= "힣")
        # Slow narration runs near four syllables a second.
        self.assertGreater(seconds, syllables / 4.0)

    def test_short_inputs_stay_tightly_bounded(self):
        self.assertLess(speech_budget("1.", 12.5) / 12.5, 3.5)
        self.assertEqual(prepared_text("One"), "One.")
        self.assertTrue(overran(55.7, 700, 12.5))


if __name__ == "__main__":
    unittest.main()
