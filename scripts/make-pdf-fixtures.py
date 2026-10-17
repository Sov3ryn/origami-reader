"""Builds the small PDFs used by the import tests (e2e/fixtures). Needs fpdf2:
   python -m pip install fpdf2
   python scripts/make-pdf-fixtures.py
The Korean sample uses Malgun Gothic from Windows; it is skipped elsewhere."""
from pathlib import Path
from fpdf import FPDF

out = Path(__file__).resolve().parent.parent / "e2e" / "fixtures"
out.mkdir(parents=True, exist_ok=True)

paragraph = ("The mist rose slowly over the water while the old ferryman checked his "
             "ropes, counted the passengers twice and listened to the gulls arguing "
             "above the pier. Nobody spoke until the bell rang across the harbour.")


class Book(FPDF):
    def header(self):
        self.set_font("Helvetica", size=9)
        self.cell(0, 8, "THE QUIET LAKE", align="C")
        self.ln(14)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", size=9)
        self.cell(0, 10, str(self.page_no()), align="C")


pdf = Book()
pdf.set_title("The Quiet Lake")
pdf.set_author("Mara Field")
for chapter in range(1, 4):
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 14, f"Chapter {chapter}")
    pdf.ln(20)
    pdf.set_font("Helvetica", size=11)
    for n in range(4):
        pdf.multi_cell(0, 6, f"{paragraph} (Part {chapter}.{n + 1})")
        pdf.ln(4)
pdf.output(str(out / "quiet-lake.pdf"))

font = Path("C:/Windows/Fonts/malgun.ttf")
if font.exists():
    ko = FPDF()
    ko.add_font("Malgun", fname=str(font))
    ko.set_title("호수 이야기")
    ko.add_page()
    ko.set_font("Malgun", size=20)
    ko.cell(0, 14, "제1장 호숫가")
    ko.ln(20)
    ko.set_font("Malgun", size=11)
    text = ("그날 저녁 우리는 오래된 서재에 앉아 창밖으로 내리는 비를 바라보며 아무 말도 하지 않았다. "
            "삼촌은 갑자기 책상 위에 놓인 낡은 양피지를 집어 들고 그 안에 숨겨진 비밀을 풀기 시작했다.")
    ko.multi_cell(0, 7, text)
    ko.ln(4)
    ko.multi_cell(0, 7, "다음 날 아침, 호수는 고요했다.")
    ko.output(str(out / "korean-lake.pdf"))
print("written to", out)
