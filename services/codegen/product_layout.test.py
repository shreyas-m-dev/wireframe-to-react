import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from template_compiler import compile_schema

schema = {"type":"root","id":"root-0","children":[{"type":"container","id":"page-1","role":"page","children":[{"type":"container","id":"header-1","role":"header","children":[{"type":"text","id":"text-1","parentRole":"header","children":[]}]},{"type":"container","id":"main-1","role":"main","layout":{"direction":"row"},"children":[{"type":"container","id":"gallery-1","role":"gallery","children":[{"type":"image","id":"image-1","parentRole":"gallery","children":[]}]},{"type":"container","id":"detail-1","role":"product-detail","children":[{"type":"text","id":"text-2","parentRole":"product-detail","children":[]},{"type":"button","id":"button-1","role":"primary-action","parentRole":"product-detail","children":[]}]}]},{"type":"container","id":"related-1","role":"related-products","children":[{"type":"container","id":"card-1","children":[]},{"type":"container","id":"card-2","children":[]}]}]}]}
code = compile_schema(schema, templates=[{"id":"product-detail-gallery-page","score":.9,"code":""}])
assert "Add to cart" in code
assert "grid grid-cols-1 md:grid-cols-2" in code
assert "Product image" in code
print("product-layout compiler test passed")
