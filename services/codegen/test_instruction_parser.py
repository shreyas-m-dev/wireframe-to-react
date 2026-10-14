import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from instruction_parser import parse_instructions

passed, failed = 0, 0


def check(name, fn):
    global passed, failed
    try:
        fn()
        print(f"PASS  {name}")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        failed += 1


def test_empty_input_returns_all_defaults():
    o = parse_instructions(None)
    assert o.accent_color is None
    assert o.dark_theme is False
    assert o.corner_style is None
    o2 = parse_instructions("")
    assert o2.accent_color is None


def test_recognizes_color():
    o = parse_instructions("make the buttons blue")
    assert o.accent_color == "blue"


def test_recognizes_color_alias():
    o = parse_instructions("use a navy color scheme")
    assert o.accent_color == "indigo"


def test_recognizes_dark_theme():
    o = parse_instructions("use a dark theme")
    assert o.dark_theme is True


def test_recognizes_dark_mode_phrase():
    o = parse_instructions("switch to dark mode please")
    assert o.dark_theme is True


def test_light_keyword_does_not_set_dark():
    o = parse_instructions("keep it light and clean")
    assert o.dark_theme is False


def test_recognizes_rounded_corners():
    o = parse_instructions("make the buttons rounded and pill-shaped")
    assert o.corner_style == "rounded"


def test_recognizes_sharp_corners():
    o = parse_instructions("use sharp corners, no rounding")
    assert o.corner_style == "sharp"


def test_recognizes_large_size():
    o = parse_instructions("make everything bigger and more spacious")
    assert o.size == "large"


def test_recognizes_small_size():
    o = parse_instructions("keep it compact and dense")
    assert o.size == "small"


def test_recognizes_shadow():
    o = parse_instructions("add some shadow for elevation")
    assert o.shadow is True


def test_combines_multiple_instructions():
    o = parse_instructions("dark theme with rounded green buttons and shadows, keep it large")
    assert o.dark_theme is True
    assert o.corner_style == "rounded"
    assert o.accent_color == "green"
    assert o.shadow is True
    assert o.size == "large"


def test_unrecognized_words_are_silently_ignored():
    o = parse_instructions("make it look like a spaceship from mars")
    assert o.accent_color is None
    assert o.dark_theme is False
    assert o.corner_style is None
    assert o.size is None
    assert o.shadow is None  # tri-state: None = unspecified, not False


def test_never_raises_on_garbage_input():
    for garbage in ["", "   ", "12345", "!!!???", "a" * 10000]:
        parse_instructions(garbage)  # must not raise


def test_recognizes_new_color_aliases():
    assert parse_instructions("make it gold").accent_color == "amber"
    assert parse_instructions("use a coral accent").accent_color == "orange"
    assert parse_instructions("charcoal buttons").accent_color == "zinc"


def test_recognizes_bold_typography():
    o = parse_instructions("make the text bold and strong")
    assert o.font_weight == "bold"


def test_recognizes_light_typography():
    o = parse_instructions("use thin text throughout")
    assert o.font_weight == "light"


def test_recognizes_center_alignment():
    o = parse_instructions("center-aligned content please")
    assert o.text_align == "center"


def test_recognizes_left_alignment():
    o = parse_instructions("everything should be left-aligned")
    assert o.text_align == "left"


def test_recognizes_no_border():
    o = parse_instructions("make it borderless")
    assert o.border_weight == "none"


def test_recognizes_thick_border():
    o = parse_instructions("use a thick border everywhere")
    assert o.border_weight == "thick"


def test_recognizes_outline_button_style():
    o = parse_instructions("use ghost buttons")
    assert o.button_style == "outline"


def test_recognizes_filled_button_style():
    o = parse_instructions("solid buttons please")
    assert o.button_style == "filled"


def test_recognizes_transparency():
    o = parse_instructions("make the background translucent")
    assert o.transparent is True


def test_extracts_addition_query_add_a():
    o = parse_instructions("add a footer")
    assert o.addition_query == "footer"


def test_extracts_addition_query_include():
    o = parse_instructions("include a search bar at the top")
    assert o.addition_query == "search bar at the top"


def test_addition_query_stops_at_clause_boundary():
    o = parse_instructions("add a footer, and make buttons blue")
    assert o.addition_query == "footer"
    assert o.accent_color == "blue"  # both instructions recognized independently


def test_no_addition_query_when_not_mentioned():
    o = parse_instructions("dark theme with rounded buttons")
    assert o.addition_query is None


if __name__ == "__main__":
    check("test_empty_input_returns_all_defaults", test_empty_input_returns_all_defaults)
    check("test_recognizes_color", test_recognizes_color)
    check("test_recognizes_color_alias", test_recognizes_color_alias)
    check("test_recognizes_dark_theme", test_recognizes_dark_theme)
    check("test_recognizes_dark_mode_phrase", test_recognizes_dark_mode_phrase)
    check("test_light_keyword_does_not_set_dark", test_light_keyword_does_not_set_dark)
    check("test_recognizes_rounded_corners", test_recognizes_rounded_corners)
    check("test_recognizes_sharp_corners", test_recognizes_sharp_corners)
    check("test_recognizes_large_size", test_recognizes_large_size)
    check("test_recognizes_small_size", test_recognizes_small_size)
    check("test_recognizes_shadow", test_recognizes_shadow)
    check("test_combines_multiple_instructions", test_combines_multiple_instructions)
    check("test_unrecognized_words_are_silently_ignored", test_unrecognized_words_are_silently_ignored)
    check("test_never_raises_on_garbage_input", test_never_raises_on_garbage_input)
    check("test_recognizes_new_color_aliases", test_recognizes_new_color_aliases)
    check("test_recognizes_bold_typography", test_recognizes_bold_typography)
    check("test_recognizes_light_typography", test_recognizes_light_typography)
    check("test_recognizes_center_alignment", test_recognizes_center_alignment)
    check("test_recognizes_left_alignment", test_recognizes_left_alignment)
    check("test_recognizes_no_border", test_recognizes_no_border)
    check("test_recognizes_thick_border", test_recognizes_thick_border)
    check("test_recognizes_outline_button_style", test_recognizes_outline_button_style)
    check("test_recognizes_filled_button_style", test_recognizes_filled_button_style)
    check("test_recognizes_transparency", test_recognizes_transparency)
    check("test_extracts_addition_query_add_a", test_extracts_addition_query_add_a)
    check("test_extracts_addition_query_include", test_extracts_addition_query_include)
    check("test_addition_query_stops_at_clause_boundary", test_addition_query_stops_at_clause_boundary)
    check("test_no_addition_query_when_not_mentioned", test_no_addition_query_when_not_mentioned)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
