import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare_signing", Path(__file__).with_name("prepare-signing.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SubmissionChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / "package"
        self.package.mkdir()
        self.symbols = self.package / "SodaVirtualDisplay.pdb"
        self.symbols.write_bytes(b"fixture symbols")
        self.inf = self.package / "SodaVirtualDisplay.inf"
        self.inf.write_text("[Standard.NTamd64.10.0...22000]\n%DeviceName%=MyDevice_Install, Sodashitsu\\VirtualDisplayV1\n")
        self.dll = self.package / "SodaVirtualDisplay.dll"
        image = bytearray(96)
        image[:2] = b"MZ"
        struct.pack_into("<I", image, 60, 64)
        image[64:68] = b"PE\0\0"
        struct.pack_into("<H", image, 68, 0x8664)
        self.dll.write_bytes(image)
        (self.package / "sodavirtualdisplay.cat").write_bytes(b"unsigned fixture")
        self.output = self.root / "submission"

    def prepare(self):
        return module.prepare(self.package, self.symbols, self.output, "a" * 40)

    def test_material_and_manifest_keep_bytes_and_no_installable_claim(self):
        result = self.prepare()
        self.assertEqual(result["state"], "unsigned-submission-only")
        self.assertEqual(json.loads((self.output / "submission.json").read_text()), result)
        for name in module.NAMES:
            self.assertEqual(module.sha256(self.output / "SodaVirtualDisplay" / name), result["files"][name])
        ddf = (self.output / "submission.ddf").read_text()
        self.assertEqual(ddf.count('"SodaVirtualDisplay/'), 4)
        self.assertNotIn(str(self.root), ddf)
        with self.assertRaises(FileExistsError):
            self.prepare()

    def test_reject_template_and_foreign_hardware_before_creating_output(self):
        for text in ["$ARCH$", "[Standard.NTamd64.10.0...22000]\n%DeviceName%=MyDevice_Install, Foreign\\Display\n"]:
            self.inf.write_text(text)
            with self.assertRaises(ValueError):
                self.prepare()
            self.assertFalse(self.output.exists())

    def test_wrong_binary_or_missing_symbols_cannot_prepare(self):
        original = self.dll.read_bytes()
        arm64 = bytearray(original)
        struct.pack_into("<H", arm64, 68, 0xAA64)
        for image in (b"not an x64 PE", bytes(arm64)):
            self.dll.write_bytes(image)
            with self.assertRaises(ValueError):
                self.prepare()
            self.assertFalse(self.output.exists())
        self.dll.write_bytes(original)
        self.symbols.unlink()
        with self.assertRaises(ValueError):
            self.prepare()

    def test_reject_redirected_inputs_and_outputs(self):
        alias = self.root / "alias"
        alias.symlink_to(self.package, target_is_directory=True)
        with self.assertRaises(ValueError):
            module.prepare(alias, self.symbols, self.output, "a" * 40)
        with self.assertRaises(ValueError):
            module.prepare(self.package, self.symbols, alias / "output", "a" * 40)
        self.assertFalse((self.package / "output").exists())

    def test_reject_ambiguous_revision(self):
        with self.assertRaises(ValueError):
            module.prepare(self.package, self.symbols, self.output, "main")
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
