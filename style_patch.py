import re
with open("services/codegen/template_compiler.py", "r") as f:
    content = f.read()

# Replace button classes
old_button = """def _button_classes(overrides: StyleOverrides) -> str:
    pad, corner, shadow = _padding(overrides), _corner(overrides), _shadow(overrides)
    text_mods = _text_modifiers(overrides)
    opacity = _opacity_class(overrides)
    use_filled = overrides.button_style == "filled" or (overrides.accent_color and overrides.button_style != "outline")
    if use_filled:
        c = overrides.accent_color or "gray"
        return f"{pad} {corner} bg-{c}-600 text-white hover:bg-{c}-700 transition-colors{shadow}{text_mods}{opacity}"
    border = _border_class(overrides)
    border_part = f"{border} " if border else ""
    if overrides.dark_theme:
        return f"{pad} {corner} {border_part}border-gray-600 text-gray-100 hover:bg-gray-800 transition-colors{shadow}{text_mods}".rstrip()
    return f"{pad} {corner} {border_part}hover:bg-gray-50 transition-colors{shadow}{text_mods}".rstrip()"""

new_button = """def _button_classes(overrides: StyleOverrides) -> str:
    pad, corner, shadow = _padding(overrides), _corner(overrides), _shadow(overrides)
    text_mods = _text_modifiers(overrides)
    opacity = _opacity_class(overrides)
    use_filled = overrides.button_style == "filled" or (overrides.accent_color and overrides.button_style != "outline")
    if use_filled:
        return f"{pad} {corner} bg-[var(--wf-primary)] text-[var(--wf-primaryContrast)] hover:opacity-90 transition-opacity{shadow}{text_mods}{opacity}"
    border = _border_class(overrides)
    border_part = f"{border} border-[var(--wf-primary)] " if border else ""
    return f"{pad} {corner} {border_part}text-[var(--wf-primary)] hover:bg-[var(--wf-surface)] transition-colors{shadow}{text_mods}".rstrip()"""
content = content.replace(old_button, new_button)

# Replace text classes
old_text = """def _text_classes(overrides: StyleOverrides) -> str:
    base = "text-gray-200" if overrides.dark_theme else "text-gray-700"
    return base + _text_modifiers(overrides)"""

new_text = """def _text_classes(overrides: StyleOverrides) -> str:
    return "text-[var(--wf-text)]" + _text_modifiers(overrides)"""
content = content.replace(old_text, new_text)

# Replace input classes
old_input = """def _input_classes(overrides: StyleOverrides) -> str:
    pad, corner = _padding(overrides), _corner(overrides)
    border = _border_class(overrides)
    border_part = f"{border} " if border else ""
    if overrides.dark_theme:
        return f"{border_part}border-gray-600 {corner} {pad} w-full bg-gray-800 text-gray-100 placeholder-gray-400".replace("  ", " ")
    return f"{border_part}{corner} {pad} w-full"
"""

new_input = """def _input_classes(overrides: StyleOverrides) -> str:
    pad, corner = _padding(overrides), _corner(overrides)
    border = _border_class(overrides)
    border_part = f"{border} border-[var(--wf-border)] " if border else ""
    return f"{border_part}{corner} {pad} w-full bg-[var(--wf-surface)] text-[var(--wf-text)] placeholder-[var(--wf-mutedText)]".replace("  ", " ")
"""
content = content.replace(old_input, new_input)

# Replace link classes
old_link = """def _link_classes(overrides: StyleOverrides) -> str:
    c = overrides.accent_color or "blue"
    shade = "400" if overrides.dark_theme else "600"
    return f"text-{c}-{shade} underline" + _text_modifiers(overrides)"""

new_link = """def _link_classes(overrides: StyleOverrides) -> str:
    return f"text-[var(--wf-primary)] hover:underline" + _text_modifiers(overrides)"""
content = content.replace(old_link, new_link)

# Replace neutral page classes
old_neutral = 'neutral = "relative bg-gray-900 text-gray-100" if style == "block" and overrides.dark_theme else "relative"'
new_neutral = 'neutral = "relative bg-[var(--wf-background)] text-[var(--wf-text)] w-full min-h-screen" if node.get("role") == "page" else "relative"'
content = content.replace(old_neutral, new_neutral)

# Replace specific elements hardcoded colors inside _render_node (span brand, a, form auth-form)
content = content.replace('attrs["className"] = "inline-flex items-center font-semibold tracking-wide text-gray-900"', 'attrs["className"] = "inline-flex items-center font-bold tracking-wide text-[var(--wf-primary)]"')
content = content.replace('attrs["className"] = "text-gray-600"', 'attrs["className"] = "text-[var(--wf-mutedText)] hover:text-[var(--wf-primary)] transition-colors"')
content = content.replace('attrs["className"] = "max-w-md mx-auto w-full flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"', 'attrs["className"] = "max-w-md mx-auto w-full flex flex-col gap-4 rounded-lg border border-[var(--wf-border)] bg-[var(--wf-surface)] p-6 shadow-md"')
content = content.replace('f"w-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 {_corner(overrides)}"', 'f"w-full bg-[var(--wf-surface)] border border-[var(--wf-border)] flex items-center justify-center text-[var(--wf-mutedText)] overflow-hidden {_corner(overrides)}"')

with open("services/codegen/template_compiler.py", "w") as f:
    f.write(content)
