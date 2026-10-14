import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from retrieve import build_index, describe_schema_node, retrieve_templates
from vector_db import VectorDB

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


def fresh_db():
    """Each test gets its own throwaway SQLite file so tests don't interfere."""
    tmp = Path(tempfile.mkdtemp()) / "test_vectors.sqlite3"
    return build_index(db_path=tmp, force_rebuild=True)


def test_index_builds_with_all_templates():
    db = fresh_db()
    assert db.size() == 20
    db.close()


def test_db_is_a_real_persistent_sqlite_file():
    tmp = Path(tempfile.mkdtemp()) / "persist_test.sqlite3"
    db1 = build_index(db_path=tmp)
    db1.close()
    assert tmp.exists(), "expected a real .sqlite3 file on disk"
    # reopen without rebuilding — data should persist across connections
    db2 = VectorDB(tmp)
    assert db2.size() == 20
    db2.close()


def test_describe_schema_node_leaf():
    node = {"type": "button", "children": []}
    assert describe_schema_node(node) == "button"


def test_describe_schema_node_with_children():
    node = {"type": "header", "children": [{"type": "text"}, {"type": "button"}, {"type": "button"}]}
    assert describe_schema_node(node) == "header with text, button, button"


def test_retrieve_exact_pattern_text_returns_itself_top_ranked():
    db = fresh_db()
    results = db.search("checkbox next to a text label", k=1)
    assert results[0][1]["id"] == "checkbox-with-label"
    db.close()


def test_retrieve_returns_requested_k():
    db = fresh_db()
    node = {"type": "button", "children": []}
    results = retrieve_templates(node, db, k=5)
    assert len(results) == 5
    db.close()


def test_retrieve_card_grid_for_repeated_cards():
    db = fresh_db()
    node = {
        "type": "container",
        "children": [
            {"type": "card", "children": []},
            {"type": "card", "children": []},
            {"type": "card", "children": []},
        ],
    }
    results = retrieve_templates(node, db, k=3)
    ids = [r["id"] for r in results]
    assert "card-grid" in ids
    db.close()


def test_add_then_search_roundtrip():
    db = fresh_db()
    db.add("custom-1", "a very specific custom widget pattern", "<CustomWidget />")
    results = db.search("a very specific custom widget pattern", k=1)
    assert results[0][1]["id"] == "custom-1"
    assert results[0][1]["code"] == "<CustomWidget />"
    db.close()


if __name__ == "__main__":
    check("test_index_builds_with_all_templates", test_index_builds_with_all_templates)
    check("test_db_is_a_real_persistent_sqlite_file", test_db_is_a_real_persistent_sqlite_file)
    check("test_describe_schema_node_leaf", test_describe_schema_node_leaf)
    check("test_describe_schema_node_with_children", test_describe_schema_node_with_children)
    check("test_retrieve_exact_pattern_text_returns_itself_top_ranked", test_retrieve_exact_pattern_text_returns_itself_top_ranked)
    check("test_retrieve_returns_requested_k", test_retrieve_returns_requested_k)
    check("test_retrieve_card_grid_for_repeated_cards", test_retrieve_card_grid_for_repeated_cards)
    check("test_add_then_search_roundtrip", test_add_then_search_roundtrip)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
