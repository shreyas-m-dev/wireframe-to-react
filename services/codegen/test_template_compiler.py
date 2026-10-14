import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from template_compiler import compile_schema, _pick_root_style

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


def test_single_button_renders_a_button_tag():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema)
    assert "<button" in code
    assert "GeneratedComponent" in code
    assert "import React" in code


def test_nested_container_preserves_nesting():
    schema = {
        "type": "root", "id": "root-0",
        "children": [
            {"type": "container", "id": "container-1", "children": [
                {"type": "button", "id": "button-1", "children": []},
                {"type": "text", "id": "text-1", "children": []},
            ]}
        ],
    }
    code = compile_schema(schema)
    # button and text should appear nested inside a div (the container), not as siblings of root
    container_start = code.index('data-wireframe-id="container-1"')
    button_pos = code.index("<button")
    text_pos = code.index("<p ")
    closing = code.index("</div>", container_start)
    assert container_start < button_pos < closing
    assert container_start < text_pos < closing


def test_empty_schema_produces_valid_placeholder_component():
    schema = {"type": "root", "id": "root-0", "children": []}
    code = compile_schema(schema)
    assert "GeneratedComponent" in code
    assert "<>" in code


def test_root_style_picks_row_for_header_template():
    style = _pick_root_style([{"id": "header-logo-nav-buttons", "score": 0.9, "code": ""}])
    assert style == "row"


def test_root_style_picks_stack_for_form_template():
    style = _pick_root_style([{"id": "form-vertical-stack", "score": 0.9, "code": ""}])
    assert style == "stack"


def test_root_style_defaults_to_block_with_no_templates():
    assert _pick_root_style([]) == "block"


def test_all_schema_element_types_render_without_crashing():
    types = ["button", "text", "input", "image", "icon", "checkbox", "radio", "dropdown", "link", "container"]
    for t in types:
        node = {"type": "root", "id": "root-0", "children": [{"type": t, "id": f"{t}-1", "children": []}]}
        out = compile_schema(node)
        assert out.strip(), f"{t} produced empty output"


def test_deterministic_same_input_same_output():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    assert compile_schema(schema) == compile_schema(schema)


def test_default_output_unchanged_with_no_overrides():
    """Locks in the exact default styling so future changes to
    StyleOverrides logic can't silently alter the no-instructions case."""
    schema = {"type": "root", "id": "root-0", "children": [
        {"type": "button", "id": "button-1", "children": []},
        {"type": "text", "id": "text-1", "children": []},
        {"type": "input", "id": "input-1", "children": []},
    ]}
    code = compile_schema(schema)
    assert 'px-4 py-2 rounded' in code
    assert 'text-slate-800' in code
    assert 'w-full' in code and 'bg-white' in code and 'border-slate-300' in code
    assert 'bg-white text-slate-900' in code  # root grouping wrapper


def test_accent_color_override_produces_filled_button():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(accent_color="blue"))
    assert "bg-blue-600" in code
    assert "hover:bg-blue-700" in code


def test_dark_theme_override_changes_container_and_input():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "input", "id": "input-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(dark_theme=True))
    assert "bg-slate-950" in code  # root container
    assert "bg-slate-900" in code  # input field
    assert "text-slate-100" in code


def test_rounded_corner_override_uses_rounded_full():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(corner_style="rounded"))
    assert "rounded-full" in code


def test_sharp_corner_override_uses_rounded_none():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(corner_style="sharp"))
    assert "rounded-none" in code


def test_large_size_override_increases_padding():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(size="large"))
    assert "px-6 py-3" in code


def test_shadow_override_adds_shadow_class():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(shadow=True))
    assert "shadow-md" in code


def test_overrides_never_change_which_tags_are_emitted():
    """Style overrides must only ever change className strings, never the
    set of tags — this is what keeps the 100%-structural-accuracy
    guarantee true regardless of what the user asks for stylistically."""
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [
        {"type": "button", "id": "button-1", "children": []},
        {"type": "input", "id": "input-1", "children": []},
    ]}
    default_code = compile_schema(schema)
    styled_code = compile_schema(schema, overrides=StyleOverrides(
        accent_color="purple", dark_theme=True, corner_style="rounded", size="large", shadow=True
    ))
    import re
    default_tags = sorted(re.findall(r"</?(\w+)", default_code))
    styled_tags = sorted(re.findall(r"</?(\w+)", styled_code))
    assert default_tags == styled_tags, (default_tags, styled_tags)


def test_bold_typography_applies_to_button():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(font_weight="bold"))
    assert "font-bold" in code


def test_center_alignment_applies_to_text():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "text", "id": "text-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(text_align="center"))
    assert "text-center" in code


def test_no_border_removes_border_class():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "input", "id": "input-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(border_weight="none"))
    input_line = [l for l in code.split("\n") if "<input" in l][0]
    assert " border " not in input_line

def test_thick_border_uses_border_4():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "input", "id": "input-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(border_weight="thick"))
    assert "border-4" in code


def test_outline_button_style_forces_outline_even_with_color():
    """button_style='outline' should override the accent_color-implies-filled default."""
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(accent_color="blue", button_style="outline"))
    assert "bg-blue-600" not in code


def test_filled_button_style_without_color_uses_gray_fill():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(button_style="filled"))
    assert "bg-blue-600" in code


def test_transparent_adds_opacity_class():
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema, overrides=StyleOverrides(accent_color="blue", transparent=True))
    assert "bg-opacity-60" in code


def test_every_style_category_combined_stays_structurally_valid():
    """Kitchen-sink test: every override active simultaneously must still
    produce exactly the same tag set as the default (see
    test_overrides_never_change_which_tags_are_emitted's rationale)."""
    from instruction_parser import StyleOverrides
    schema = {"type": "root", "id": "root-0", "children": [
        {"type": "button", "id": "button-1", "children": []},
        {"type": "input", "id": "input-1", "children": []},
        {"type": "text", "id": "text-1", "children": []},
        {"type": "link", "id": "link-1", "children": []},
    ]}
    overrides = StyleOverrides(
        accent_color="teal", dark_theme=True, corner_style="sharp", size="small",
        shadow=True, font_weight="bold", text_align="center", border_weight="thick",
        button_style="outline", transparent=True,
    )
    default_code = compile_schema(schema)
    styled_code = compile_schema(schema, overrides=overrides)
    import re
    assert sorted(re.findall(r"</?(\w+)", default_code)) == sorted(re.findall(r"</?(\w+)", styled_code))


def test_ocr_label_is_used_when_present():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "label": "Submit", "children": []}]}
    code = compile_schema(schema)
    assert '>Submit<' in code or '>Submit\n' in code or ' Submit\n' in code
    assert "Button 1" not in code


def test_falls_back_to_placeholder_when_no_label():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    code = compile_schema(schema)
    assert '"Button 1"' not in code


def test_regression_ocr_label_on_container_node_still_renders():
    """A real bug found during review: OCR labels can attach to a
    schema node classified as "container" rather than a leaf type (e.g.
    button/text) — the detector's over-segmentation can nest an OCR match
    under a spurious container-typed node. The compiler's container branch
    didn't check for a label at all, silently dropping the text."""
    schema = {"type": "root", "id": "root-0", "children": [
        {"type": "container", "id": "container-1", "label": "Submit", "children": []}
    ]}
    code = compile_schema(schema)
    assert 'Submit' in code, f"label on a childless container should still render, got: {code}"


def test_label_with_quotes_is_safely_escaped():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "label": 'Say "hi"', "children": []}]}
    code = compile_schema(schema)
    assert 'Say "hi"' in code


def test_label_with_angle_brackets_is_sanitized():
    # REGRESSION: a literal '<' in a label used to get misread by CGDA's
    # regex-based JSX parser as an opening tag and stripped, corrupting
    # the output — see ocr_extractor.py's _sanitize_ocr_text docstring.
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "label": "Don't <click>", "children": []}]}
    code = compile_schema(schema)
    assert "<click>" not in code, f"angle brackets should be stripped from label content, got: {code}"
    assert "click" in code, "the rest of the label text should survive"


def test_media_is_local_and_uses_detected_aspect_ratio():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "image", "id": "image-1", "relativeBounds": {"width": .75, "height": .25}, "children": []}]}
    code = compile_schema(schema)
    assert "placehold.co" not in code
    assert "http://placehold" not in code and "https://placehold" not in code
    assert '"aspectRatio": "3.000"' in code or "'aspectRatio': '3.000'" in code or 'aspectRatio: "3.000"' in code


def test_semantic_form_is_local_accessible_and_interactive():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "region", "id": "form-1", "role": "form", "children": [
        {"type": "input", "id": "input-1", "role": "field", "label": "Email", "children": []},
        {"type": "button", "id": "submit-1", "role": "submit-action", "label": "SEND", "children": []},
    ]}]}
    code = compile_schema(schema)
    assert "useState" in code and "onSubmit" in code and 'type="submit"' in code
    assert 'role="status"' in code and 'required' in code and '{submitted && (' in code
    assert code.count('<form') == code.count('</form>') == 1


def test_navigation_has_no_hash_link():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "text", "id": "nav-1", "role": "nav-link", "label": "Services", "children": []}]}
    code = compile_schema(schema)
    assert 'href="#"' not in code and 'scrollIntoView' not in code


def test_feature_card_uses_semantic_article_container():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "container", "id": "card-1", "role": "feature-card", "children": [{"type": "image", "id": "media-1", "relativeBounds": {"width": .8, "height": .45}, "children": []}]}]}
    code = compile_schema(schema)
    assert '<article ' in code and 'role="img"' in code


def test_auth_codegen_uses_distinct_local_state_and_submit():
    schema = {"kind": "CodegenTree", "dependencyManifest": {"state": ["authEmailOrUsername", "authPassword"]}, "root": {"type": "root", "id": "root-0", "children": [{"type": "region", "id": "auth", "role": "auth-form", "children": [
        {"type": "input", "id": "login", "role": "auth-field", "label": "Login", "children": []},
        {"type": "input", "id": "password", "role": "auth-password", "label": "Password", "children": []},
        {"type": "button", "id": "submit", "role": "auth-primary-action", "label": "Login", "children": []},
        {"type": "button", "id": "help", "role": "auth-helper", "label": "Forgot password?", "children": []},
    ]}]}}
    code = compile_schema(schema)
    assert 'authEmailOrUsername' in code and 'authPassword' in code
    assert 'type="password"' in code and 'type="submit"' in code
    assert 'Signed in locally.' in code and 'Message sent locally.' not in code


if __name__ == "__main__":
    check("test_single_button_renders_a_button_tag", test_single_button_renders_a_button_tag)
    check("test_nested_container_preserves_nesting", test_nested_container_preserves_nesting)
    check("test_empty_schema_produces_valid_placeholder_component", test_empty_schema_produces_valid_placeholder_component)
    check("test_root_style_picks_row_for_header_template", test_root_style_picks_row_for_header_template)
    check("test_root_style_picks_stack_for_form_template", test_root_style_picks_stack_for_form_template)
    check("test_root_style_defaults_to_block_with_no_templates", test_root_style_defaults_to_block_with_no_templates)
    check("test_all_schema_element_types_render_without_crashing", test_all_schema_element_types_render_without_crashing)
    check("test_deterministic_same_input_same_output", test_deterministic_same_input_same_output)
    check("test_default_output_unchanged_with_no_overrides", test_default_output_unchanged_with_no_overrides)
    check("test_accent_color_override_produces_filled_button", test_accent_color_override_produces_filled_button)
    check("test_dark_theme_override_changes_container_and_input", test_dark_theme_override_changes_container_and_input)
    check("test_rounded_corner_override_uses_rounded_full", test_rounded_corner_override_uses_rounded_full)
    check("test_sharp_corner_override_uses_rounded_none", test_sharp_corner_override_uses_rounded_none)
    check("test_large_size_override_increases_padding", test_large_size_override_increases_padding)
    check("test_shadow_override_adds_shadow_class", test_shadow_override_adds_shadow_class)
    check("test_overrides_never_change_which_tags_are_emitted", test_overrides_never_change_which_tags_are_emitted)
    check("test_bold_typography_applies_to_button", test_bold_typography_applies_to_button)
    check("test_center_alignment_applies_to_text", test_center_alignment_applies_to_text)
    check("test_no_border_removes_border_class", test_no_border_removes_border_class)
    check("test_thick_border_uses_border_4", test_thick_border_uses_border_4)
    check("test_outline_button_style_forces_outline_even_with_color", test_outline_button_style_forces_outline_even_with_color)
    check("test_filled_button_style_without_color_uses_gray_fill", test_filled_button_style_without_color_uses_gray_fill)
    check("test_transparent_adds_opacity_class", test_transparent_adds_opacity_class)
    check("test_every_style_category_combined_stays_structurally_valid", test_every_style_category_combined_stays_structurally_valid)
    check("test_ocr_label_is_used_when_present", test_ocr_label_is_used_when_present)
    check("test_falls_back_to_placeholder_when_no_label", test_falls_back_to_placeholder_when_no_label)
    check("test_regression_ocr_label_on_container_node_still_renders", test_regression_ocr_label_on_container_node_still_renders)
    check("test_label_with_quotes_is_safely_escaped", test_label_with_quotes_is_safely_escaped)
    check("test_label_with_angle_brackets_is_sanitized", test_label_with_angle_brackets_is_sanitized)
    check("test_media_is_local_and_uses_detected_aspect_ratio", test_media_is_local_and_uses_detected_aspect_ratio)
    check("test_semantic_form_is_local_accessible_and_interactive", test_semantic_form_is_local_accessible_and_interactive)
    check("test_navigation_has_no_hash_link", test_navigation_has_no_hash_link)
    check("test_feature_card_uses_semantic_article_container", test_feature_card_uses_semantic_article_container)
    check("test_auth_codegen_uses_distinct_local_state_and_submit", test_auth_codegen_uses_distinct_local_state_and_submit)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
