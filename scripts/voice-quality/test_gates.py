"""Regression cases: intelligibility and audio faults must not pass silently."""
import unittest
from gates import words,edit_distance,failures

class Gates(unittest.TestCase):
    def test_punctuation_is_not_a_pronunciation_error(self):
        self.assertEqual(words("She said, ‘don't go.’"),words("She said don't go"))

    def test_lost_final_word_fails_even_below_average_error_limit(self):
        expected=words('The story '+ 'continued '*50 +'until midnight')
        actual=expected[:-1]
        result=failures(expected,actual,edit_distance(expected,actual)/len(expected),0,0,170,.4)
        self.assertIn('ending_words',result)

    def test_repetition_cannot_pass(self):
        a=words('She found the letter beside the window')
        b=words('She found the letter the letter beside the window')
        self.assertIn('word_errors',failures(a,b,edit_distance(a,b)/len(a),0,0,170,.4))

    def test_clean_words_do_not_hide_clipping_or_silence(self):
        a=words('The rain had stopped')
        result=failures(a,a,0,.001,0,170,3.0)
        self.assertIn('clipping',result);self.assertIn('long_internal_silence',result)

    def test_normal_narration_passes(self):
        a=words('The rain had stopped')
        self.assertEqual(failures(a,a,0,0,.001,160,.7),[])

    def test_asr_numeric_format_is_equivalent_but_wrong_count_is_not(self):
        a=words('At nine thirty she counted seventeen coins')
        self.assertEqual(a,words('At 9:30 she counted 17 coins'))
        self.assertNotEqual(a,words('At 9:30 she counted 70 coins'))

if __name__=='__main__':unittest.main()
