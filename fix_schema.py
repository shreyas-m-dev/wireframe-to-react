import re
with open("services/schema/schema.js", "r") as f:
    content = f.read()

def replace(pattern, repl):
    global content
    if pattern in content:
        content = content.replace(pattern, repl)
        print("Replaced:", pattern[:30], "...")
    else:
        print("Could not find:", pattern[:30], "...")

old_cards = """  if(services) { const cards=services.children.filter(node=>node.type==='container'||node.role==='feature-card').filter(node=>node.bbox.width>bounds.width*.12&&node.bbox.width<bounds.width*.45); if(cards.length>=3) {"""
new_cards = """  if(services) { const cards=services.children.filter(node=>node.type==='container'||node.role==='feature-card'||node.type==='card'||node.type==='region').filter(node=>node.bbox.width>bounds.width*.12&&node.bbox.width<bounds.width*.45); if(cards.length>=3) {"""

replace(old_cards, new_cards)

with open("services/schema/schema.js", "w") as f:
    f.write(content)
