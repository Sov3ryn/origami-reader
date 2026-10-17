"""Generated references are merged without changing the bundled catalog."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent / "workers"))
from tts_worker import read_config


class CreatedVoiceTests(unittest.TestCase):
    def test_created_profiles_require_audio_and_keep_bundled_profiles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "worker.json"
            config.write_text(json.dumps({"voices": {"existing": {"name": "Existing"}}}), encoding="utf-8")
            before = config.read_bytes()
            (root / "designed-vd-1.json").write_text(json.dumps({"name": "Created", "reference": "old-location.wav"}), encoding="utf-8")
            (root / "designed-vd-1.wav").write_bytes(b"reference")
            (root / "designed-vd-2.json").write_text('{"name":"Missing audio"}', encoding="utf-8")
            with patch.dict(os.environ, {"ORIGAMI_CREATED_VOICES": str(root)}):
                voices = read_config(config)["voices"]
            self.assertEqual(voices["existing"]["name"], "Existing")
            self.assertEqual(Path(voices["designed-vd-1"]["reference"]), root / "designed-vd-1.wav")
            self.assertNotIn("designed-vd-2", voices)
            self.assertEqual(config.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
