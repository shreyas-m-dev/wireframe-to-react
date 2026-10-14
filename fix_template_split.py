import re
with open("services/codegen/template_compiler.py", "r") as f:
    content = f.read()

def replace(pattern, repl):
    global content
    if pattern in content:
        content = content.replace(pattern, repl)
        print("Replaced:", pattern[:30], "...")
    else:
        print("Could not find:", pattern[:30], "...")

old_ret = """    if node.get("role") == "form":
        attrs["onSubmit"] = {"kind": "expression", "value": "(event) => { event.preventDefault(); setSubmitted(true); setFormData({ message: '' }); }"}
        status_msg = {"kind": "conditional", "condition": {"kind": "expression", "value": "submitted"}, "trueBranch": {"kind": "element", "tag": "p", "attributes": {"role": "status", "className": "text-sm text-green-700"}, "children": [{"kind": "text", "value": "Message sent locally."}]}}
        return {"kind": "element", "tag": "form", "attributes": attrs, "children": children_ast + [status_msg]}
        
    return {"kind": "element", "tag": tag, "attributes": attrs, "children": children_ast}"""


new_ret = """    if node.get("role") == "form":
        attrs["onSubmit"] = {"kind": "expression", "value": "(event) => { event.preventDefault(); setSubmitted(true); setFormData({ message: '' }); }"}
        status_msg = {"kind": "conditional", "condition": {"kind": "expression", "value": "submitted"}, "trueBranch": {"kind": "element", "tag": "p", "attributes": {"role": "status", "className": "text-sm text-green-700"}, "children": [{"kind": "text", "value": "Message sent locally."}]}}
        return {"kind": "element", "tag": "form", "attributes": attrs, "children": children_ast + [status_msg]}
        
    if style == "split" and len(children_ast) > 2:
        left_items = []
        right_items = []
        for c, c_ast in zip(node.get("children", []), children_ast):
            bounds = c.get("relativeBounds") or {}
            try: x = float(bounds.get("x", 0))
            except: x = 0
            if x < 0.4:
                left_items.append(c_ast)
            else:
                right_items.append(c_ast)
        if left_items and right_items:
            left_col = {"kind": "element", "tag": "div", "attributes": {"className": "flex flex-col gap-4"}, "children": left_items}
            right_col = {"kind": "element", "tag": "div", "attributes": {"className": "flex flex-col gap-4"}, "children": right_items}
            return {"kind": "element", "tag": tag, "attributes": attrs, "children": [left_col, right_col]}

    return {"kind": "element", "tag": tag, "attributes": attrs, "children": children_ast}"""

replace(old_ret, new_ret)

with open("services/codegen/template_compiler.py", "w") as f:
    f.write(content)
