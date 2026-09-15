from reportlab.pdfbase import pdfmetrics

from modules.reports import exports


def test_each_pdf_face_covers_its_script():
    # Both web-font subsets were named NotoSansDevanagari-*, so ReportLab's face cache handed the
    # Latin file to the Devanagari name and every Devanagari plate printed as boxes.
    exports._register_fonts()

    assert ord("B") in pdfmetrics.getFont("Bayline").face.charToGlyph
    assert ord("ब") in pdfmetrics.getFont("BaylineDeva").face.charToGlyph


def test_markup_escapes_text_and_sets_devanagari_runs_in_their_face():
    assert exports._markup("BA <1> बा २") == ('BA &lt;1&gt; <font face="BaylineDeva">बा २</font>')


def test_money_matches_the_web_format():
    assert exports.npr(12_345_678_901) == "NPR 12,34,56,789.01"
    assert exports.npr(-2_000) == "−NPR 20.00"
    assert exports.npr(5) == "NPR 0.05"
