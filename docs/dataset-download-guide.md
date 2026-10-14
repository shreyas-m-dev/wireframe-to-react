# Dataset download guide — review only

No dataset was downloaded. Review licence/data cards and sample records before use.

| Source | Primary data | Coverage | Ideal project use | Direct use decision |
|---|---|---|---|---|
| [WebSight](https://huggingface.co/datasets/HuggingFaceM4/WebSight) | synthetic website screenshots paired with HTML/CSS or HTML/Tailwind | synthetic web | screenshot-to-code references, evaluation, possible model fine-tuning | review, small streamed subset only |
| [Rico](https://huggingface.co/datasets/shunk031/Rico) | mobile screenshots/view hierarchies | mobile | hierarchy/component experiments | not primary desktop ecommerce source; check licence |
| [Google Screen Annotation](https://github.com/google-research-datasets/screen_annotation) | mobile screenshots with annotations | mobile | UI element detection research | not direct React-code data |
| [Screen2Words](https://github.com/google-research-datasets/screen2words) | mobile screen summaries | mobile | page-level description/category work | not direct layout-to-React data |
| [Enrico](https://github.com/luileito/enrico) | curated mobile UI design dataset | mobile | semantic wireframe/UI structure experiments | not primary desktop reconstruction source |

Vision/layout detection needs boxes/hierarchy labels; screenshot-to-code examples are useful for code/RAG/evaluation only after legal review. RAG records should be manually normalized into the JSONL contract, never copied as raw dataset shards.

## Later controlled acquisition

```powershell
python -m pip install -U datasets huggingface_hub
```

```python
from datasets import load_dataset
dataset = load_dataset("HuggingFaceM4/WebSight", split="train", streaming=True)
```

```powershell
python -m pip install -U "huggingface_hub[cli]"
hf download HuggingFaceM4/WebSight --repo-type dataset --local-dir ./external-datasets/websight
```

Use streaming, a reviewed subset, and file filters where supported. Do not download 31GB+ wholesale. Begin with 20–50 page examples, then sections/components, then manually approved user corrections.
